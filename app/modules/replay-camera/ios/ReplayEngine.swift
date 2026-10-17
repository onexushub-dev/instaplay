import AVFoundation

/// Ties capture, segment writing and the ring together. One per app; the preview view reads its session.
final class ReplayEngine {
  static let shared = ReplayEngine()

  /// Ring capacity for a 60s window of 1s segments.
  static let windowSeconds = 60.0

  let capture = CaptureController()
  var emit: ((String, [String: Any]) -> Void)?

  private let fileOps = LocalFileOps()
  private lazy var ring = SegmentRing(capacity: Int(Self.windowSeconds / SegmentWriter.segmentSeconds), fileOps: fileOps)
  private var writer: SegmentWriter?
  private var pendingSaves: [() -> Void] = []
  private(set) var running = false

  enum Failure: Error { case lowStorage, permission, unavailable(Error), noSession, encoder(Error?) }

  func start(lens: String, maxQuality: String) throws {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { throw Failure.permission }
    let free = (try? ReplayPaths.buffer.deletingLastPathComponent()
      .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage) ?? 0
    do { try StorageGuard.check(freeBytes: free) } catch { throw Failure.lowStorage }

    ReplayPaths.ensure(ReplayPaths.buffer)
    ReplayPaths.ensure(ReplayPaths.clips)
    SegmentRing.purgeOrphans(dir: ReplayPaths.buffer, fileOps: fileOps)

    do { try capture.configure(lens: lens, maxQuality: maxQuality) } catch { throw Failure.unavailable(error) }
    capture.queue.sync { startWriter() }
    capture.onVideo = { [weak self] in self?.writer?.appendVideo($0) }
    capture.onAudio = { [weak self] in self?.writer?.appendAudio($0) }
    capture.start()
    running = true
  }

  func stop(completion: @escaping () -> Void = {}) {
    guard running else { return completion() }
    running = false
    capture.stop()
    capture.queue.async {
      let writer = self.writer
      self.writer = nil
      self.pendingSaves.removeAll()
      writer?.finish {
        self.ring.clear()
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
}
