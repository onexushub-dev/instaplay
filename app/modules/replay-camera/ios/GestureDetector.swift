import AVFoundation
import CoreMotion
import Vision

/// Samples camera frames at ~5 fps, runs body-pose detection and fires `onGesture` when the X is held.
/// Frame orientation follows the phone's physical position (accelerometer), not the UI, which is portrait-locked.
final class GestureDetector {
  static let sampleInterval = 0.2

  var onGesture: (() -> Void)?

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
    if let g = motion.accelerometerData?.acceleration, let now = DeviceUpright.from(gravityX: g.x, gravityY: g.y) {
      upright = now
    }
    let orientation = Self.orientation(for: upright)
    queue.async {
      defer { self.lock.withLock { self.busy = false } }
      let request = VNDetectHumanBodyPoseRequest()
      try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation).perform([request])
      let isX = (request.results ?? []).contains { XGesture.isX(Self.pose(from: $0)) }
      if self.tracker.update(isX: isX, at: t) { self.onGesture?() }
    }
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
