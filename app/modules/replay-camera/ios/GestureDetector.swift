import AVFoundation
import CoreMotion
import Vision

/// Samples camera frames at ~5 fps, runs body-pose detection and fires `onGesture` when the X is held.
/// Frame orientation follows the phone's physical position (accelerometer), not the UI, which is portrait-locked.
final class GestureDetector {
  static let sampleInterval = 0.2

  var onGesture: (() -> Void)?
  /// Diagnostic: about once a second, what the detector saw (Etapa 0 spike only).
  var onDebug: (([String: Any]) -> Void)?
  private var samples = 0
  private var lastDebug = -Double.infinity

  private let queue = DispatchQueue(label: "replay.gesture", qos: .userInitiated)
  private let motion = CMMotionManager()
  private let tracker = HoldTracker()
  private let lock = NSLock()
  private var _enabled = true
  private var busy = false
  private var lastSample = -Double.infinity
  private var upright: DeviceUpright = .landscapeLeft

  var enabled: Bool {
    get { lock.withLock { _enabled } }
    set { lock.withLock { _enabled = newValue } }
  }

  func start() {
    motion.accelerometerUpdateInterval = Self.sampleInterval
    motion.startAccelerometerUpdates()
  }

  func stop() { motion.stopAccelerometerUpdates() }

  /// Call from the capture queue with every video frame; most are skipped.
  func consider(_ buffer: CMSampleBuffer) {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    let take: Bool = lock.withLock {
      guard _enabled, !busy, t - lastSample >= Self.sampleInterval else { return false }
      busy = true
      lastSample = t
      return true
    }
    guard take, let pixels = CMSampleBufferGetImageBuffer(buffer) else {
      if take { lock.withLock { busy = false } }
      return
    }
    let orientation = Self.orientation(for: currentUpright())
    queue.async {
      defer { self.lock.withLock { self.busy = false } }
      let request = VNDetectHumanBodyPoseRequest()
      try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation).perform([request])
      let poses = (request.results ?? []).map(Self.pose(from:))
      let isX = poses.contains { XGesture.isX($0) }
      if self.tracker.update(isX: isX, at: t) { self.onGesture?() }
      self.samples += 1
      if t - self.lastDebug >= 1 {
        self.lastDebug = t
        self.onDebug?(Self.debugInfo(poses: poses, isX: isX, orientation: orientation, samples: self.samples))
        self.samples = 0
      }
    }
  }

  /// The phone's physical position from the latest accelerometer reading; the last known one while it lies flat.
  func currentUpright() -> DeviceUpright {
    lock.withLock {
      if let g = motion.accelerometerData?.acceleration, let now = DeviceUpright.from(gravityX: g.x, gravityY: g.y) {
        upright = now
      }
      return upright
    }
  }

  private static func debugInfo(poses: [Pose], isX: Bool, orientation: CGImagePropertyOrientation, samples: Int) -> [String: Any] {
    var info: [String: Any] = ["people": poses.count, "isX": isX, "orientation": Int(orientation.rawValue), "samples": samples]
    guard let p = poses.first else { return info }
    let points: [(String, Point?)] = [("lw", p.leftWrist), ("rw", p.rightWrist), ("ls", p.leftShoulder), ("rs", p.rightShoulder), ("nose", p.nose)]
    info["missing"] = points.filter { $0.1 == nil }.map(\.0).joined(separator: ",")
    info["minConf"] = points.compactMap { $0.1?.confidence }.min() ?? 0
    if let lw = p.leftWrist, let rw = p.rightWrist, let nose = p.nose {
      info["wristsUp"] = lw.y < nose.y && rw.y < nose.y
    }
    if let lw = p.leftWrist, let rw = p.rightWrist, let ls = p.leftShoulder, let rs = p.rightShoulder {
      info["crossed"] = (lw.x - rw.x).sign != (ls.x - rs.x).sign
      let shoulders = abs(ls.x - rs.x)
      if shoulders > 0 {
        // Signed: positive = wrists on their own side (uncrossed), negative = crossed; 1.0 = one shoulder width apart.
        info["wristGap"] = ((lw.x - rw.x) / (ls.x - rs.x) * 100).rounded() / 100
      }
    }
    return info
  }

  /// Vision points are normalized with y growing upward; XGesture expects y growing downward.
  private static func pose(from observation: VNHumanBodyPoseObservation) -> Pose {
    func point(_ name: VNHumanBodyPoseObservation.JointName) -> Point? {
      guard let p = try? observation.recognizedPoint(name) else { return nil }
      return Point(x: Double(p.location.x), y: 1 - Double(p.location.y), confidence: Double(p.confidence))
    }
    return Pose(leftWrist: point(.leftWrist), rightWrist: point(.rightWrist),
                leftShoulder: point(.leftShoulder), rightShoulder: point(.rightShoulder), nose: point(.nose))
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
