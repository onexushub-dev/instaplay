import AVFoundation
import UIKit

/// Renders a Story/share video from a saved clip: the cut, optional half speed and mute, the whole video
/// aspect-fit in a `width`×`height` frame, and a full-frame PNG overlay (the template bands) on top.
enum ClipExporter {
  struct Options {
    let clipPath: String
    let startMs: Double
    let endMs: Double
    let speed: Double
    let muted: Bool
    let width: Int
    let height: Int
    let overlayPngPath: String?
    let background: UIColor
  }

  enum Failure: Error { case noVideo, export(Error?) }

  static var exportsDir: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("exports")
  }

  static func export(_ o: Options) async throws -> (path: String, durationMs: Int) {
    let asset = AVURLAsset(url: URL(fileURLWithPath: o.clipPath))
    guard let source = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.noVideo }
    let assetDuration = try await asset.load(.duration)
    let start = CMTime(seconds: o.startMs / 1000, preferredTimescale: 600)
    let end = CMTimeMinimum(CMTime(seconds: o.endMs / 1000, preferredTimescale: 600), assetDuration)
    let range = CMTimeRange(start: start, end: end)

    let composition = AVMutableComposition()
    guard let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { throw Failure.noVideo }
    try video.insertTimeRange(range, of: source, at: .zero)
    let slow = o.speed < 1
    if !o.muted, !slow, let audio = try await asset.loadTracks(withMediaType: .audio).first,
       let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    {
      try track.insertTimeRange(range, of: audio, at: .zero)
    }
    if slow {
      let cut = CMTimeRange(start: .zero, duration: range.duration)
      composition.scaleTimeRange(cut, toDuration: CMTimeMultiplyByFloat64(range.duration, multiplier: 1 / o.speed))
    }

    // Place the (possibly rotated) video in the middle of the frame, whole, never cropped.
    let render = CGSize(width: o.width, height: o.height)
    let transform = try await source.load(.preferredTransform)
    let natural = try await source.load(.naturalSize)
    let rotated = CGRect(origin: .zero, size: natural).applying(transform)
    let target = FitRect.fit(rotated.size, into: render)
    let scale = target.width / rotated.width
    let placement = transform
      .concatenating(CGAffineTransform(translationX: -rotated.minX, y: -rotated.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(translationX: target.minX, y: target.minY))

    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
    layer.setTransform(placement, at: .zero)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    instruction.backgroundColor = o.background.cgColor
    instruction.layerInstructions = [layer]

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = render
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = [instruction]

    if let png = o.overlayPngPath, let image = UIImage(contentsOfFile: png)?.cgImage {
      let frame = CGRect(origin: .zero, size: render)
      let parent = CALayer(), videoLayer = CALayer(), overlay = CALayer()
      [parent, videoLayer, overlay].forEach { $0.frame = frame }
      overlay.contents = image
      overlay.contentsGravity = .resize
      parent.addSublayer(videoLayer)
      parent.addSublayer(overlay)
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)
    }

    try FileManager.default.createDirectory(at: exportsDir, withIntermediateDirectories: true)
    let out = exportsDir.appendingPathComponent("\(UUID().uuidString).mp4")
    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw Failure.export(nil)
    }
    session.outputURL = out
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.shouldOptimizeForNetworkUse = true
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { done.resume() }
    }
    guard session.status == .completed else {
      try? FileManager.default.removeItem(at: out) // never leave a partial file behind
      throw Failure.export(session.error)
    }
    return (out.path, Int(composition.duration.seconds * 1000))
  }
}

extension UIColor {
  /// "#RRGGBB" → color; anything else → black.
  convenience init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
              blue: CGFloat(value & 0xFF) / 255, alpha: 1)
  }
}
