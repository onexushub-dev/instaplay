import AVFoundation
import UIKit
import Vision

/// Samples camera frames at ~5 fps, runs body-pose detection and fires `onGesture` when the X is held.
final class GestureDetector {
  static let sampleInterval = 0.2

  var enabled = true
  var onGesture: (() -> Void)?
  /// Orientation of the buffer relative to upright, set when the session starts.
  var orientation: CGImagePropertyOrientation = .up

  private let queue = DispatchQueue(label: "replay.gesture", qos: .userInitiated)
  private let tracker = HoldTracker()
  private var lastSample = -Double.infinity
  private var busy = false

  /// Call from the capture queue with every video frame; most are skipped.
  func consider(_ buffer: CMSampleBuffer) {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    guard enabled, !busy, t - lastSample >= Self.sampleInterval,
          let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
    lastSample = t
    busy = true
    let orientation = self.orientation
    queue.async {
      defer { self.busy = false }
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

  static func orientation(for device: UIDeviceOrientation) -> CGImagePropertyOrientation {
    switch device {
    case .landscapeLeft: return .up
    case .landscapeRight: return .down
    case .portraitUpsideDown: return .left
    default: return .right
    }
  }
}
