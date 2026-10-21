import Foundation

/// The camera's zoom as the player sees it (0.5x, 1x, 2x…) against the device's own `videoZoomFactor`.
/// The virtual dual-wide camera starts on the ultra-wide at factor 1 and hands over to the wide at `wideFactor`
/// (normally 2): the player's 1x. A phone without an ultra-wide has `wideFactor` 1 and both scales are the same.
public enum ZoomMath {
  /// Past this the picture is a digital crop too soft to be worth it.
  public static let maxUserZoom = 5.0

  /// The zoom range the player can use on a device whose factors go from `minFactor` to `maxFactor`.
  public static func userRange(minFactor: Double, maxFactor: Double, wideFactor: Double) -> (min: Double, max: Double) {
    let wide = wideFactor > 0 ? wideFactor : 1
    let low = minFactor / wide
    let high = min(maxUserZoom, maxFactor / wide)
    return (low, max(low, high))
  }

  /// The device factor for a zoom the player asked for, kept inside what the device allows.
  public static func deviceFactor(forUserZoom zoom: Double, wideFactor: Double, minFactor: Double, maxFactor: Double) -> Double {
    let wide = wideFactor > 0 ? wideFactor : 1
    return min(max(zoom * wide, minFactor), maxFactor)
  }
}
