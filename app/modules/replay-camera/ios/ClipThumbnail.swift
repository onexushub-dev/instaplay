import AVFoundation
import UIKit

/// A JPEG frame of a saved clip, written next to it (<clip>.jpg) and reused when it already exists.
enum ClipThumbnail {
  static func path(for clipPath: String) -> String {
    (clipPath as NSString).deletingPathExtension + ".jpg"
  }

  static func make(clipPath: String, atMs: Double) async throws -> String {
    let out = path(for: clipPath)
    if FileManager.default.fileExists(atPath: out) { return out }

    let generator = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: clipPath)))
    generator.appliesPreferredTrackTransform = true // upright, whatever way the phone was mounted
    generator.maximumSize = CGSize(width: 640, height: 640)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)
    let (image, _) = try await generator.image(at: CMTime(seconds: atMs / 1000, preferredTimescale: 600))

    guard let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.75) else {
      throw CocoaError(.fileWriteUnknown)
    }
    try jpeg.write(to: URL(fileURLWithPath: out), options: .atomic) // never a half-written file to reuse
    return out
  }
}
