import CoreGraphics

public enum PersonCrop {
  /// The person's box widened for outstretched arms and extended upward for raised hands, in image pixels.
  /// `box` is normalized with the origin at the bottom-left (Vision), as CIImage extents are.
  public static func rect(person box: CGRect, in extent: CGRect) -> CGRect {
    let w = box.width * extent.width, h = box.height * extent.height
    let x = extent.minX + box.minX * extent.width, y = extent.minY + box.minY * extent.height
    let grown = CGRect(x: x - w * 0.6, y: y - h * 0.1, width: w * 2.2, height: h * 1.8)
    return grown.intersection(extent).integral
  }
}
