import AVFoundation
import UIKit

/// A JPEG frame of a saved clip, written next to it (<clip>.thumb.jpg) and reused when it already exists.
enum ClipThumbnail {
  /// The name changed from <clip>.jpg: pictures made before could be black, and an existing file is never redone.
  static func path(for clipPath: String) -> String {
    (clipPath as NSString).deletingPathExtension + ".thumb.jpg"
  }

  static func make(clipPath: String, atMs: Double) async throws -> String {
    let out = path(for: clipPath)
    if FileManager.default.fileExists(atPath: out) { return out }

    let asset = AVURLAsset(url: URL(fileURLWithPath: clipPath))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true // upright, whatever way the phone was mounted
    generator.maximumSize = CGSize(width: 640, height: 640)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

    // The camera can deliver black for a while, so the wanted instant is only the first try: when that frame is
    // black, look a little later, in the middle and near the end, and keep the first real picture (or the brightest).
    let duration = (try? await asset.load(.duration).seconds) ?? 0
    let wanted = atMs / 1000
    var times = [wanted, wanted + 1, wanted + 2, (wanted + duration) / 2, duration - 1, 0]
    times = times.filter { $0 >= 0 && (duration <= 0 || $0 <= duration) }
    var best: (image: CGImage, level: Double)?
    for t in times {
      guard let (image, _) = try? await generator.image(at: CMTime(seconds: t, preferredTimescale: 600)) else { continue }
      let level = ClipContent.brightness(of: image)
      if best == nil || level > best!.level { best = (image, level) }
      if level >= ClipContent.blackBelow { break }
    }
    guard let picked = best else { throw CocoaError(.fileReadCorruptFile) }

    guard let jpeg = UIImage(cgImage: picked.image).jpegData(compressionQuality: 0.75) else {
      throw CocoaError(.fileWriteUnknown)
    }
    try jpeg.write(to: URL(fileURLWithPath: out), options: .atomic) // never a half-written file to reuse
    return out
  }
}
