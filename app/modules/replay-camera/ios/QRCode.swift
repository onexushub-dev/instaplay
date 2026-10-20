import CoreImage
import UIKit

enum QRCode {
  private static var lastPath: String?

  /// Draws `text` as a QR code (sharp, black on white, with a quiet border) into a PNG in the temp folder and
  /// returns its path. Every call writes a new file, so the picture on screen never shows a stale code.
  static func png(for text: String) -> String? {
    guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
    filter.setValue(Data(text.utf8), forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let output = filter.outputImage else { return nil }
    let scaled = output.samplingNearest().transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    let border: CGFloat = 40
    let canvas = scaled.extent.insetBy(dx: -border, dy: -border)
    let white = CIImage(color: .white).cropped(to: canvas)
    let composed = scaled.composited(over: white)
    guard let cgImage = CIContext().createCGImage(composed, from: canvas),
          let data = UIImage(cgImage: cgImage).pngData() else { return nil }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("lance-pair-\(UUID().uuidString).png")
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      return nil
    }
    if let old = lastPath { try? FileManager.default.removeItem(atPath: old) }
    lastPath = url.path
    return url.path
  }
}
