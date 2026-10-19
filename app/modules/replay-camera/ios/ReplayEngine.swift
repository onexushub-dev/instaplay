import AVFoundation

/// Ties capture, segment writing, the ring, gesture and thermal handling together.
/// One per app; the preview view reads its session.
///
/// Threading: engine state (writer, generation, pending saves) lives on `capture.queue`.
/// Clip copies run on `saveQueue`, so a save never blocks sample delivery.
final class ReplayEngine {
  static let shared = ReplayEngine()

  /// The rolling window of the current session (60s court, 120s gym).
  private(set) var windowSeconds = 60.0
  /// A save that hasn't seen its segment close by then is failed instead of hanging.
  static let saveTimeout = 5.0

  let capture = CaptureController()
  let gesture = GestureDetector()
  let feedback = ReplayFeedback()
  let voice = VoiceTrigger()
  var emit: ((String, [String: Any]) -> Void)?

  typealias SaveResult = Result<(path: String, durationMs: Int), Failure>

  private struct PendingSave {
    let id: UUID
    let run: (SegmentWriter) -> Void
    let fail: (Failure) -> Void
  }

  private let fileOps = LocalFileOps()
  private let saveQueue = DispatchQueue(label: "replay.save", qos: .utility)
  private lazy var ring = SegmentRing(capacity: 60, fileOps: fileOps)
  private var writer: SegmentWriter?
  private var generation = 0
  private var pendingSaves: [PendingSave] = []
  private var lens = "ultraWide"
  private var degraded = false
  private var observers: [NSObjectProtocol] = []
  private(set) var running = false
  let watchPreview = WatchPreview()

  enum Failure: Error { case lowStorage, permission, unavailable(Error), noSession, encoder(Error?) }

  init() {
    capture.onVideo = { [weak self] buffer in
      self?.writer?.appendVideo(buffer)
      self?.gesture.consider(buffer)
      self?.watchPreview.offer(buffer) { [weak self] in GestureDetector.orientation(for: self?.gesture.currentUpright() ?? .landscapeLeft) }
    }
    capture.onAudio = { [weak self] buffer in
      self?.writer?.appendAudio(buffer)
      self?.voice.consider(buffer)
    }
    voice.onCommand = { [weak self] in
      self?.emit?("onTrigger", ["source": "voice", "at": Date().timeIntervalSince1970 * 1000])
    }
    gesture.onDebug = { [weak self] in self?.emit?("onGestureDebug", $0) }
    gesture.onGesture = { [weak self] in
      self?.emit?("onTrigger", ["source": "gesture", "at": Date().timeIntervalSince1970 * 1000])
    }
  }

  static func requestPermissions(completion: @escaping (Bool) -> Void) {
    AVCaptureDevice.requestAccess(for: .video) { video in
      AVCaptureDevice.requestAccess(for: .audio) { _ in completion(video) }
    }
  }

  /// No-op when a session is already running.
  func start(lens: String, maxQuality: String, bufferSeconds: Double = 60) throws {
    guard !running else { return }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { throw Failure.permission }
    let free = (try? ReplayPaths.buffer.deletingLastPathComponent()
      .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage) ?? 0
    do { try StorageGuard.check(freeBytes: free) } catch { throw Failure.lowStorage }

    ReplayPaths.ensure(ReplayPaths.buffer)
    ReplayPaths.ensure(ReplayPaths.clips)
    ring.clear()
    windowSeconds = bufferSeconds > 0 ? bufferSeconds : 60
    ring = SegmentRing(capacity: BufferPlan.segments(forSeconds: windowSeconds, segmentSeconds: SegmentWriter.segmentSeconds), fileOps: fileOps)
    SegmentRing.purgeOrphans(dir: ReplayPaths.buffer, fileOps: fileOps)

    self.lens = lens
    let hot = ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue
    degraded = hot
    gesture.degraded = hot
    do { try capture.configure(lens: lens, maxQuality: hot ? "720p30" : maxQuality) } catch { throw Failure.unavailable(error) }
    capture.queue.sync { startWriter() }
    gesture.start()
    capture.start()
    running = true
    observe()
    if hot { thermalChanged() }
  }

  func stop(completion: @escaping () -> Void = {}) {
    guard running else { return completion() }
    running = false
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
    gesture.stop()
    voice.stop()
    capture.stop()
    capture.queue.async {
      self.failPendingSaves(.noSession)
      self.finishWriter {
        SegmentRing.purgeOrphans(dir: ReplayPaths.buffer, fileOps: self.fileOps)
        completion()
      }
    }
  }

  /// Waits for the in-progress segment (the one holding the trigger) to close, then copies the window.
  /// `completion` is called exactly once.
  func saveClip(completion: @escaping (SaveResult) -> Void) {
    guard running else { return completion(.failure(.noSession)) }
    let id = UUID()
    let pending = PendingSave(id: id, run: { [weak self] writer in
      guard let self else { return }
      self.saveQueue.async { completion(self.copyClip(using: writer)) }
    }, fail: { completion(.failure($0)) })

    capture.queue.async {
      guard self.writer != nil else { return completion(.failure(.noSession)) }
      self.pendingSaves.append(pending)
    }
    capture.queue.asyncAfter(deadline: .now() + Self.saveTimeout) {
      guard let index = self.pendingSaves.firstIndex(where: { $0.id == id }) else { return }
      self.pendingSaves.remove(at: index).fail(.encoder(nil))
    }
  }

  /// Runs on `saveQueue`; the ring pins the copied segments, so capture keeps going meanwhile.
  private func copyClip(using writer: SegmentWriter) -> SaveResult {
    // Outside the buffer dir, so the buffer's disk size measures the ring alone.
    let joined = FileManager.default.temporaryDirectory.appendingPathComponent("save-\(UUID().uuidString).mp4")
    let dest = ReplayPaths.clips.appendingPathComponent("\(UUID().uuidString).mp4")
    defer { try? FileManager.default.removeItem(at: joined) }
    do {
      let seconds = try ring.copyClip(lastSeconds: self.windowSeconds, to: joined) { segments, joined in
        try ClipConcat.concat(initSegment: writer.initSegmentURL, segments: segments, to: joined)
      }
      try ClipConcat.normalize(joined, to: dest)
      return .success((dest.path, Int(seconds * 1000)))
    } catch {
      try? FileManager.default.removeItem(at: dest)
      return .failure(.encoder(error))
    }
  }

  /// Must run on `capture.queue`.
  private func startWriter() {
    generation += 1
    let writer = SegmentWriter(width: capture.dimensions.width, height: capture.dimensions.height, fps: capture.fps,
                               withAudio: capture.hasAudio, generation: generation)
    writer.onSegment = { [weak self] segment, generation in
      guard let self else { return }
      self.capture.queue.async {
        // A late segment from a replaced writer belongs to another init segment: drop it.
        guard generation == self.generation, let current = self.writer else {
          return self.fileOps.delete(segment.url)
        }
        self.ring.append(segment)
        let saves = self.pendingSaves
        self.pendingSaves.removeAll()
        saves.forEach { $0.run(current) }
      }
    }
    writer.rotationDegrees = { [weak self] in self?.gesture.currentUpright().videoRotationDegrees ?? 0 }
    writer.onFailure = { [weak self] error in self?.fail(code: "ENCODER_FAILED", "\(error.map { "\($0)" } ?? "writer failed")") }
    self.writer = writer
  }

  /// Must run on `capture.queue`. Ends the writer and empties the ring: its segments belong to that writer's init segment.
  private func finishWriter(then next: @escaping () -> Void) {
    let old = writer
    writer = nil
    generation += 1
    let finish = {
      self.capture.queue.async {
        self.ring.clear()
        next()
      }
    }
    if let old { old.finish(completion: finish) } else { finish() }
  }

  /// Must run on `capture.queue`.
  private func failPendingSaves(_ failure: Failure) {
    let saves = pendingSaves
    pendingSaves.removeAll()
    saves.forEach { $0.fail(failure) }
  }

  /// A runtime failure after start: tell JS and stop, so the UI never shows a dead session as recording.
  private func fail(code: String, _ message: String) {
    NSLog("[replay] stopped: %@ — %@ (thermal state %ld)", code, message, ProcessInfo.processInfo.thermalState.rawValue)
    emit?("onError", ["code": code, "message": message])
    stop()
  }

  private func observe() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: nil) {
      [weak self] _ in self?.thermalChanged()
    })
    observers.append(center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: capture.session, queue: nil) {
      [weak self] note in
      let error = note.userInfo?[AVCaptureSessionErrorKey] as? Error
      self?.fail(code: "CAMERA_UNAVAILABLE", "\(error.map { "\($0)" } ?? "capture runtime error")")
    })
    observers.append(center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: capture.session, queue: nil) {
      [weak self] _ in
      guard let self else { return }
      self.capture.queue.async {
        self.failPendingSaves(.noSession)
        self.finishWriter { self.startWriter() }
      }
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
      fail(code: "ENCODER_FAILED", "thermal")
      return
    }
    if state == .serious && !degraded {
      degraded = true
      gesture.degraded = true
      capture.stop()
      capture.queue.async {
        self.failPendingSaves(.noSession)
        self.finishWriter {
          do {
            try self.capture.configure(lens: self.lens, maxQuality: "720p30")
          } catch {
            return self.fail(code: "CAMERA_UNAVAILABLE", "\(error)")
          }
          self.startWriter()
          self.capture.start()
        }
      }
    }
    emit?("onThermalChange", ["level": level, "degraded": degraded])
  }
}
