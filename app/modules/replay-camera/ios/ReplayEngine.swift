import AVFoundation
import UIKit

/// Ties capture, segment writing, the ring, gesture and thermal handling together.
/// One per app; the preview view reads its session.
final class ReplayEngine {
  static let shared = ReplayEngine()

  static let windowSeconds = 60.0

  let capture = CaptureController()
  let gesture = GestureDetector()
  var emit: ((String, [String: Any]) -> Void)?

  private let fileOps = LocalFileOps()
  private lazy var ring = SegmentRing(capacity: Int(Self.windowSeconds / SegmentWriter.segmentSeconds), fileOps: fileOps)
  private var writer: SegmentWriter?
  private var pendingSaves: [() -> Void] = []
  private var lens = "ultraWide"
  private var degraded = false
  private var observers: [NSObjectProtocol] = []
  private(set) var running = false

  enum Failure: Error { case lowStorage, permission, unavailable(Error), noSession, encoder(Error?) }

  init() {
    capture.onVideo = { [weak self] buffer in
      self?.writer?.appendVideo(buffer)
      self?.gesture.consider(buffer)
    }
    capture.onAudio = { [weak self] in self?.writer?.appendAudio($0) }
    gesture.onGesture = { [weak self] in
      self?.emit?("onTrigger", ["source": "gesture", "at": Date().timeIntervalSince1970 * 1000])
    }
  }

  static func requestPermissions(completion: @escaping (Bool) -> Void) {
    AVCaptureDevice.requestAccess(for: .video) { video in
      AVCaptureDevice.requestAccess(for: .audio) { _ in completion(video) }
    }
  }

  func start(lens: String, maxQuality: String) throws {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { throw Failure.permission }
    let free = (try? ReplayPaths.buffer.deletingLastPathComponent()
      .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage) ?? 0
    do { try StorageGuard.check(freeBytes: free) } catch { throw Failure.lowStorage }

    ReplayPaths.ensure(ReplayPaths.buffer)
    ReplayPaths.ensure(ReplayPaths.clips)
    SegmentRing.purgeOrphans(dir: ReplayPaths.buffer, fileOps: fileOps)

    self.lens = lens
    degraded = false
    gesture.orientation = GestureDetector.orientation(for: UIDevice.current.orientation)
    do { try capture.configure(lens: lens, maxQuality: maxQuality) } catch { throw Failure.unavailable(error) }
    capture.queue.sync { startWriter() }
    capture.start()
    running = true
    observe()
  }

  func stop(completion: @escaping () -> Void = {}) {
    guard running else { return completion() }
    running = false
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
    capture.stop()
    capture.queue.async {
      self.pendingSaves.removeAll()
      self.finishWriter {
        SegmentRing.purgeOrphans(dir: ReplayPaths.buffer, fileOps: self.fileOps)
        completion()
      }
    }
  }

  /// Waits for the in-progress segment (the one holding the trigger) to close, then copies the window.
  func saveClip(completion: @escaping (Result<(path: String, durationMs: Int), Failure>) -> Void) {
    guard running, let writer else { return completion(.failure(.noSession)) }
    if let error = writer.failed { return completion(.failure(.encoder(error))) }
    capture.queue.async {
      self.pendingSaves.append {
        let dest = ReplayPaths.clips.appendingPathComponent("\(UUID().uuidString).mp4")
        do {
          let seconds = try self.ring.copyClip(lastSeconds: Self.windowSeconds, to: dest) { segments, dest in
            try ClipConcat.concat(initSegment: writer.initSegmentURL, segments: segments, to: dest)
          }
          completion(.success((dest.path, Int(seconds * 1000))))
        } catch {
          try? FileManager.default.removeItem(at: dest)
          completion(.failure(.encoder(error)))
        }
      }
    }
  }

  /// Must run on `capture.queue`.
  private func startWriter() {
    let writer = SegmentWriter(width: capture.dimensions.width, height: capture.dimensions.height, fps: capture.fps)
    writer.onSegment = { [weak self] segment in
      guard let self else { return }
      self.capture.queue.async {
        self.ring.append(segment)
        let saves = self.pendingSaves
        self.pendingSaves.removeAll()
        saves.forEach { $0() }
      }
    }
    self.writer = writer
  }

  /// Must run on `capture.queue`. Ends the writer and empties the ring: its segments belong to that writer's init segment.
  private func finishWriter(then next: @escaping () -> Void) {
    let old = writer
    writer = nil
    let finish = { self.ring.clear(); next() }
    if let old { old.finish(completion: finish) } else { finish() }
  }

  private func observe() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: nil) {
      [weak self] _ in self?.thermalChanged()
    })
    observers.append(center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: capture.session, queue: nil) {
      [weak self] _ in
      guard let self else { return }
      self.capture.queue.async { self.finishWriter { self.capture.queue.async { self.startWriter() } } }
      self.emit?("onInterrupted", [:])
    })
    observers.append(center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: capture.session, queue: nil) {
      [weak self] _ in self?.emit?("onResumed", [:])
    })
  }

  private func thermalChanged() {
    let state = ProcessInfo.processInfo.thermalState
    let level: String
    switch state {
    case .nominal: level = "nominal"
    case .fair: level = "fair"
    case .serious: level = "serious"
    case .critical: level = "critical"
    @unknown default: level = "nominal"
    }

    if state == .critical {
      emit?("onThermalChange", ["level": level, "degraded": true])
      emit?("onError", ["code": "ENCODER_FAILED", "message": "thermal"])
      stop()
      return
    }
    if state == .serious && !degraded {
      degraded = true
      capture.stop()
      capture.queue.async {
        self.finishWriter {
          try? self.capture.configure(lens: self.lens, maxQuality: "720p30")
          self.capture.queue.async { self.startWriter() }
          self.capture.start()
        }
      }
    }
    emit?("onThermalChange", ["level": level, "degraded": degraded])
  }
}
