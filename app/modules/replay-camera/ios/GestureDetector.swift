import AVFoundation
import CoreImage
import CoreMotion
import Vision

/// Samples camera frames at ~4 fps and fires `onGesture` when a player holds both arms up or waves both hands above the head.
/// Frame orientation follows the phone's physical position (accelerometer), not the UI, which is portrait-locked.
///
/// Far from the phone a player is only ~100 px tall, too small for body pose on the whole frame. So each
/// sample first finds the people (works at a distance), then runs pose on an enlarged crop around each one.
final class GestureDetector {
  static let sampleInterval = 0.25
  static let maxPeople = 4
  /// Waving is quick: while somebody has their hands up, sample twice as fast for a couple of seconds.
  static let armedSampleInterval = 0.125
  static let armedSeconds = 2.0
  /// When the phone is hot (720p30 mode), sample less and look at fewer people.
  static let hotSampleInterval = 0.5
  static let hotArmedSampleInterval = 0.25
  static let hotMaxPeople = 2

  var onGesture: (() -> Void)?
  /// Diagnostic: about once a second, what the detector saw (Etapa 0 spike only).
  var onDebug: (([String: Any]) -> Void)?

  private let queue = DispatchQueue(label: "replay.gesture", qos: .userInitiated)
  private let motion = CMMotionManager()
  private let tracker = HoldTracker()
  private let wave = WaveTracker()
  private let lock = NSLock()
  private var _enabled = true
  private var _degraded = false
  private var _armedUntil = -Double.infinity
  private var busy = false
  private var lastSample = -Double.infinity
  private var upright: DeviceUpright = .landscapeLeft
  private var samples = 0
  private var lastDebug = -Double.infinity

  var enabled: Bool {
    get { lock.withLock { _enabled } }
    set { lock.withLock { _enabled = newValue } }
  }

  var degraded: Bool {
    get { lock.withLock { _degraded } }
    set { lock.withLock { _degraded = newValue } }
  }

  func start() {
    motion.accelerometerUpdateInterval = Self.sampleInterval
    motion.startAccelerometerUpdates()
  }

  func stop() { motion.stopAccelerometerUpdates() }

  /// The phone's physical position from the latest accelerometer reading; the last known one while it lies flat.
  func currentUpright() -> DeviceUpright {
    lock.withLock {
      if let g = motion.accelerometerData?.acceleration, let now = DeviceUpright.from(gravityX: g.x, gravityY: g.y) {
        upright = now
      }
      return upright
    }
  }

  /// Call from the capture queue with every video frame; most are skipped.
  func consider(_ buffer: CMSampleBuffer) {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    let take: Bool = lock.withLock {
      let armed = t < _armedUntil
      let interval = _degraded ? (armed ? Self.hotArmedSampleInterval : Self.hotSampleInterval)
                               : (armed ? Self.armedSampleInterval : Self.sampleInterval)
      guard _enabled, !busy, t - lastSample >= interval else { return false }
      busy = true
      lastSample = t
      return true
    }
    guard take, let pixels = CMSampleBufferGetImageBuffer(buffer) else {
      if take { lock.withLock { busy = false } }
      return
    }
    let image = CIImage(cvPixelBuffer: pixels).oriented(Self.orientation(for: currentUpright()))
    let maxPeople = degraded ? Self.hotMaxPeople : Self.maxPeople
    queue.async {
      defer { self.lock.withLock { self.busy = false } }
      let sightings = Self.sightings(in: image, maxPeople: maxPeople)
      let isUp = sightings.contains { ArmsUp.isUp($0.pose) }
      let raised = sightings.contains { WaveTracker.armsRaised($0.pose) }
      if raised { self.lock.withLock { self._armedUntil = t + Self.armedSeconds } }
      let held = self.tracker.update(isX: isUp, at: t)
      let waved = self.wave.update(sightings, at: t) // both trackers see every sample, so run both before deciding
      if held || waved { self.onGesture?() }
      self.samples += 1
      if t - self.lastDebug >= 1 {
        self.lastDebug = t
        self.onDebug?(Self.debugInfo(poses: sightings.map { $0.pose }, isUp: isUp, raised: raised, waved: waved,
                                     samples: self.samples))
        self.samples = 0
      }
    }
  }

  /// Poses in pixel units (y down) of their own crop: ArmsUp only compares lengths within one body.
  /// Each comes with where its person was in the frame, so the wave tracker can follow people between samples.
  private static func sightings(in image: CIImage, maxPeople: Int) -> [Sighting] {
    let people = VNDetectHumanRectanglesRequest()
    people.upperBodyOnly = false
    try? VNImageRequestHandler(ciImage: image).perform([people])
    let boxes = (people.results ?? [])
      .map(\.boundingBox)
      .sorted { $0.width * $0.height > $1.width * $1.height }
      .prefix(maxPeople)

    // Nobody found (e.g. very close, partly out of frame): fall back to the whole frame.
    let crops = boxes.isEmpty ? [image.extent] : boxes.map { PersonCrop.rect(person: $0, in: image.extent) }
    return crops.compactMap { rect in
      let crop = image.cropped(to: rect).transformed(by: CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
      let request = VNDetectHumanBodyPoseRequest()
      try? VNImageRequestHandler(ciImage: crop).perform([request])
      guard let observation = request.results?.first else { return nil }
      let extent = image.extent
      return Sighting(pose: pose(from: observation, size: rect.size),
                      x: (rect.midX - extent.minX) / extent.width,
                      y: (rect.midY - extent.minY) / extent.height)
    }
  }

  private static func pose(from observation: VNHumanBodyPoseObservation, size: CGSize) -> Pose {
    func point(_ name: VNHumanBodyPoseObservation.JointName) -> Point? {
      guard let p = try? observation.recognizedPoint(name) else { return nil }
      return Point(x: Double(p.location.x * size.width), y: Double((1 - p.location.y) * size.height),
                   confidence: Double(p.confidence))
    }
    return Pose(leftWrist: point(.leftWrist), rightWrist: point(.rightWrist),
                leftElbow: point(.leftElbow), rightElbow: point(.rightElbow),
                leftShoulder: point(.leftShoulder), rightShoulder: point(.rightShoulder), nose: point(.nose))
  }

  private static func debugInfo(poses: [Pose], isUp: Bool, raised: Bool, waved: Bool, samples: Int) -> [String: Any] {
    var info: [String: Any] = ["people": poses.count, "isX": isUp, "raised": raised, "waved": waved,
                               "orientation": 0, "samples": samples]
    guard let p = poses.first else { return info }
    let points: [(String, Point?)] = [("lw", p.leftWrist), ("rw", p.rightWrist), ("le", p.leftElbow),
                                      ("re", p.rightElbow), ("ls", p.leftShoulder), ("rs", p.rightShoulder),
                                      ("nose", p.nose)]
    info["missing"] = points.filter { $0.1 == nil }.map(\.0).joined(separator: ",")
    info["minConf"] = points.compactMap { $0.1?.confidence }.min() ?? 0
    if let lw = p.leftWrist, let rw = p.rightWrist, let nose = p.nose, let ls = p.leftShoulder, let rs = p.rightShoulder {
      let width = abs(ls.x - rs.x)
      if width > 0 {
        // How far the lower wrist is above the nose, in shoulder widths (needs > ArmsUp.minWristRise).
        info["wristGap"] = ((nose.y - max(lw.y, rw.y)) / width * 100).rounded() / 100
      }
    }
    if let le = p.leftElbow, let re = p.rightElbow, let ls = p.leftShoulder, let rs = p.rightShoulder {
      info["elbowsUp"] = le.y < ls.y && re.y < rs.y
    }
    return info
  }

  /// Back-camera buffers are natively upright with the home button on the right (landscapeLeft).
  static func orientation(for upright: DeviceUpright) -> CGImagePropertyOrientation {
    switch upright {
    case .landscapeLeft: return .up
    case .landscapeRight: return .down
    case .portraitUpsideDown: return .left
    case .portrait: return .right
    }
  }
}
