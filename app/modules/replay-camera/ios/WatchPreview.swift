import CoreImage
import CoreMedia
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Turns a few capture frames a second into small JPEGs for the watch, so the player can check the framing
/// from the court. It only reads frames the recording already produces and never holds them back: a frame that
/// arrives while the previous one is still being encoded is dropped.
final class WatchPreview {
  /// Called with the JPEG bytes, off the capture queue.
  var onFrame: ((Data) -> Void)?

  private let queue = DispatchQueue(label: "replay.watch-preview", qos: .utility)
  private let context = CIContext()
  private let lock = NSLock()
  private var lastAsk: Double?
  private var lastFrame = -Double.infinity
  private var busy = false

  private let longSide: Int
  private let interval: Double
  private let quality: Double

  /// The defaults are the watch's (small, 3 a second); the remote phone's view is bigger and quicker.
  init(longSide: Int = 360, interval: Double = WatchPreviewGate.frameInterval, quality: Double = 0.6) {
    self.longSide = longSide
    self.interval = interval
    self.quality = quality
  }

  private static var now: Double { ProcessInfo.processInfo.systemUptime }

  /// The watch asked (again) for pictures; `false` ends it right away.
  func ask(_ on: Bool) {
    lock.withLock { lastAsk = on ? Self.now : nil }
  }

  /// Call from the capture queue with every video frame; nearly all are skipped without touching the pixels.
  func offer(_ buffer: CMSampleBuffer, orientation: () -> CGImagePropertyOrientation) {
    let now = Self.now
    let take = lock.withLock { () -> Bool in
      guard WatchPreviewGate.shouldEncode(now: now, lastFrame: lastFrame, lastAsk: lastAsk, busy: busy, interval: interval) else { return false }
      busy = true
      lastFrame = now
      return true
    }
    guard take else { return }
    guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { return lock.withLock { busy = false } }
    let image = CIImage(cvPixelBuffer: pixels).oriented(orientation())
    queue.async {
      defer { self.lock.withLock { self.busy = false } }
      let size = WatchPreviewGate.targetSize(width: Int(image.extent.width), height: Int(image.extent.height), longSide: self.longSide)
      let scale = CGFloat(size.width) / image.extent.width
      let small = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let jpeg = self.context.jpegRepresentation(
              of: small, colorSpace: space, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: self.quality])
      else { return }
      self.onFrame?(jpeg)
    }
  }
}
