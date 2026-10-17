/// Which edge of the phone points up, from the gravity vector in device axes
/// (x toward the right edge, y toward the top edge, in portrait). UIDeviceOrientation naming.
public enum DeviceUpright: Equatable {
  case portrait, portraitUpsideDown, landscapeLeft, landscapeRight

  /// nil when the phone lies too flat to tell; keep the previous value then.
  public static func from(gravityX x: Double, gravityY y: Double) -> DeviceUpright? {
    guard max(abs(x), abs(y)) >= 0.5 else { return nil }
    if abs(y) >= abs(x) { return y < 0 ? .portrait : .portraitUpsideDown }
    return x < 0 ? .landscapeLeft : .landscapeRight
  }
}
