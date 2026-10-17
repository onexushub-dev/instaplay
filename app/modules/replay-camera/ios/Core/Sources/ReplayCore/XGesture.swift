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
  public let leftWrist, rightWrist, leftShoulder, rightShoulder, nose: Point?

  public init(leftWrist: Point?, rightWrist: Point?, leftShoulder: Point?, rightShoulder: Point?, nose: Point?) {
    self.leftWrist = leftWrist
    self.rightWrist = rightWrist
    self.leftShoulder = leftShoulder
    self.rightShoulder = rightShoulder
    self.nose = nose
  }
}

public enum XGesture {
  /// Both wrists above the nose and forearms crossed. Comparing the wrists' order with the
  /// shoulders' order makes the check independent of camera mirroring.
  public static func isX(_ p: Pose, minConfidence: Double = 0.3) -> Bool {
    guard let lw = p.leftWrist, let rw = p.rightWrist,
          let ls = p.leftShoulder, let rs = p.rightShoulder, let nose = p.nose,
          [lw, rw, ls, rs, nose].allSatisfy({ $0.confidence >= minConfidence })
    else { return false }

    let wristsUp = lw.y < nose.y && rw.y < nose.y
    let crossed = (lw.x - rw.x).sign != (ls.x - rs.x).sign
    return wristsUp && crossed
  }
}

/// Fires once when the X is held for `holdSeconds`. After firing, the arms must drop
/// and `cooldownSeconds` must pass before it can fire again.
public final class HoldTracker {
  private let holdSeconds: Double
  private let cooldownSeconds: Double
  private var holdStart: Double?
  private var cooldownUntil = -Double.infinity
  private var awaitingRelease = false

  public init(holdSeconds: Double = 1.0, cooldownSeconds: Double = 3.0) {
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
