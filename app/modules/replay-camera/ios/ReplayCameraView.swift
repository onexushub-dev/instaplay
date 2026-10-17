import AVFoundation
import ExpoModulesCore

/// Live preview of the replay session's camera.
class ReplayCameraView: ExpoView {
  private let previewLayer = AVCaptureVideoPreviewLayer(session: ReplayEngine.shared.capture.session)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }
}
