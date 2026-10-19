import Foundation

/// When the phone may spend time turning a camera frame into a picture for the watch.
public enum WatchPreviewGate {
  /// About three frames a second: enough to check the framing, little enough to leave the recording alone.
  public static let frameInterval = 1.0 / 3.0
  /// The watch asks again every second while its view is open; silence for this long means it is closed or asleep.
  public static let askTimeout = 2.5

  /// `lastAsk` is nil until the watch has asked at all. Times are seconds on one clock.
  public static func shouldEncode(now: Double, lastFrame: Double, lastAsk: Double?, busy: Bool) -> Bool {
    guard let lastAsk, now - lastAsk < askTimeout, !busy else { return false }
    return now - lastFrame >= frameInterval
  }

  /// The picture's size: `longSide` on the long edge, same shape, never bigger than the source.
  public static func targetSize(width: Int, height: Int, longSide: Int = 360) -> (width: Int, height: Int) {
    let long = max(width, height)
    guard long > longSide else { return (width, height) }
    let k = Double(longSide) / Double(long)
    return (Int((Double(width) * k).rounded()), Int((Double(height) * k).rounded()))
  }
}
