import CoreGraphics

public enum FitRect {
  /// Aspect-fit `size` inside `frame`, centred (y measured from the top, as in the Story layout).
  public static func fit(_ size: CGSize, into frame: CGSize) -> CGRect {
    let scale = min(frame.width / size.width, frame.height / size.height)
    let w = size.width * scale, h = size.height * scale
    return CGRect(x: (frame.width - w) / 2, y: (frame.height - h) / 2, width: w, height: h)
  }
}
