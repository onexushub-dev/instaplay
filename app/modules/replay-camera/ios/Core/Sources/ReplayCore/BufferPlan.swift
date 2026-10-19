import Foundation

public enum BufferPlan {
  /// How many segments keep `seconds` of video; a missing or bad length means the default minute.
  public static func segments(forSeconds seconds: Double, segmentSeconds: Double) -> Int {
    let window = seconds > 0 ? seconds : 60
    return Int((window / segmentSeconds).rounded(.up))
  }
}
