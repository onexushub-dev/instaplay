import AVFoundation
import CoreGraphics

/// Finds where a clip's picture begins: the camera can deliver black for a while (lens covered, still starting).
enum ClipContent {
  /// Frames this dark on average (0..255) count as black; a dim real scene is well above it.
  static let blackBelow = 8.0
  static let step = 0.5

  /// Time in ms of the first frame that is not black, 0 when the clip starts with a picture or is black throughout.
  static func firstPictureMs(clipPath: String) async -> Double {
    let asset = AVURLAsset(url: URL(fileURLWithPath: clipPath))
    guard let duration = try? await asset.load(.duration).seconds, duration > 0 else { return 0 }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 32, height: 32)
    generator.requestedTimeToleranceBefore = CMTime(seconds: step / 2, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: step / 2, preferredTimescale: 600)

    var t = 0.0
    while t < duration {
      if let (image, _) = try? await generator.image(at: CMTime(seconds: t, preferredTimescale: 600)),
         brightness(of: image) >= blackBelow
      {
        return t == 0 ? 0 : t * 1000
      }
      t += step
    }
    return 0 // black all the way: nothing to skip to
  }

  /// Mean grey level of the frame, 0 (black) to 255.
  private static func brightness(of image: CGImage) -> Double {
    let w = 16, h = 16
    var pixels = [UInt8](repeating: 0, count: w * h)
    guard let context = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return 255 }
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return Double(pixels.reduce(0) { $0 + Int($1) }) / Double(pixels.count)
  }
}
