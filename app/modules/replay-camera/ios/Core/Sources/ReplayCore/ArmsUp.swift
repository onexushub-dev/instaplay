/// Image coordinates, y grows downward.
public struct Point: Equatable {
  public let x: Double
  public let y: Double
  public let confidence: Double

  public init(x: Double, y: Double, confidence: Double) {
    self.x = x
    self.y = y
    self.confidence = confidence
  }
}

public struct Pose: Equatable {
  public let leftWrist, rightWrist, leftElbow, rightElbow, leftShoulder, rightShoulder, nose: Point?

  public init(leftWrist: Point?, rightWrist: Point?, leftElbow: Point?, rightElbow: Point?,
              leftShoulder: Point?, rightShoulder: Point?, nose: Point?) {
    self.leftWrist = leftWrist
    self.rightWrist = rightWrist
    self.leftElbow = leftElbow
    self.rightElbow = rightElbow
    self.leftShoulder = leftShoulder
    self.rightShoulder = rightShoulder
    self.nose = nose
  }
}

/// The save gesture: both arms raised straight up. Big body geometry, so it stays readable when the
/// player is small in the frame; HoldTracker requires it held still, which filters blocks and celebrations.
public enum ArmsUp {
  /// How far above the nose both wrists must be, in shoulder widths.
  public static let minWristRise = 0.5

  public static func isUp(_ p: Pose, minConfidence: Double = 0.3) -> Bool {
    guard let lw = p.leftWrist, let rw = p.rightWrist, let le = p.leftElbow, let re = p.rightElbow,
          let ls = p.leftShoulder, let rs = p.rightShoulder, let nose = p.nose,
          [lw, rw, le, re, ls, rs, nose].allSatisfy({ $0.confidence >= minConfidence })
    else { return false }

    let shoulderWidth = abs(ls.x - rs.x)
    guard shoulderWidth > 0 else { return false }
    let wristLine = nose.y - minWristRise * shoulderWidth
    let wristsHigh = lw.y < wristLine && rw.y < wristLine
    let elbowsUp = le.y < ls.y && re.y < rs.y
    return wristsHigh && elbowsUp
  }
}

/// Fires once when the gesture is held for `holdSeconds`. After firing, the arms must drop
/// and `cooldownSeconds` must pass before it can fire again.
public final class HoldTracker {
  private let holdSeconds: Double
  private let cooldownSeconds: Double
  private var holdStart: Double?
  private var cooldownUntil = -Double.infinity
  private var awaitingRelease = false

  public init(holdSeconds: Double = 1.5, cooldownSeconds: Double = 3.0) {
    self.holdSeconds = holdSeconds
    self.cooldownSeconds = cooldownSeconds
  }

  public func update(isX: Bool, at t: Double) -> Bool {
    guard isX else {
      holdStart = nil
      awaitingRelease = false
      return false
    }
    if awaitingRelease { return false }
    let start = holdStart ?? t
    holdStart = start
    guard t - start >= holdSeconds - 1e-9, t >= cooldownUntil else { return false }
    holdStart = nil
    awaitingRelease = true
    cooldownUntil = t + cooldownSeconds
    return true
  }
}
