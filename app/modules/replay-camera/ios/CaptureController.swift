import AVFoundation

/// Owns the AVCaptureSession: lens, format and the video/audio sample outputs.
/// Samples arrive on `queue`, the one queue all writing happens on.
final class CaptureController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate,
  AVCaptureAudioDataOutputSampleBufferDelegate
{
  let session = AVCaptureSession()
  let queue = DispatchQueue(label: "replay.capture")
  var onVideo: ((CMSampleBuffer) -> Void)?
  var onAudio: ((CMSampleBuffer) -> Void)?

  private let videoOutput = AVCaptureVideoDataOutput()
  private let audioOutput = AVCaptureAudioDataOutput()
  private(set) var dimensions = (width: 1920, height: 1080)
  private(set) var fps = 30
  private(set) var hasAudio = false
  private(set) var camera: AVCaptureDevice?

  enum Failure: Error { case noCamera, cannotAddInput, cannotAddOutput }

  func configure(lens: String, maxQuality: String) throws {
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }
    session.sessionPreset = .inputPriority

    guard let camera = Self.camera(lens: lens) else { throw Failure.noCamera }
    self.camera = camera
    let input = try AVCaptureDeviceInput(device: camera)
    guard session.canAddInput(input) else { throw Failure.cannotAddInput }
    session.addInput(input)
    try applyFormat(camera, wantHigh: maxQuality == "1080p60")

    hasAudio = false
    if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
       let mic = AVCaptureDevice.default(for: .audio), let micInput = try? AVCaptureDeviceInput(device: mic),
       session.canAddInput(micInput)
    {
      session.addInput(micInput)
      hasAudio = true
    }

    videoOutput.alwaysDiscardsLateVideoFrames = false
    videoOutput.setSampleBufferDelegate(self, queue: queue)
    audioOutput.setSampleBufferDelegate(self, queue: queue)
    guard session.canAddOutput(videoOutput), session.canAddOutput(audioOutput) else { throw Failure.cannotAddOutput }
    session.addOutput(videoOutput)
    session.addOutput(audioOutput)
  }

  func start() { queue.async { self.session.startRunning() } }
  func stop() { queue.async { self.session.stopRunning() } }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                     from connection: AVCaptureConnection) {
    if output === videoOutput { onVideo?(sampleBuffer) } else { onAudio?(sampleBuffer) }
  }

  private static func camera(lens: String) -> AVCaptureDevice? {
    if lens == "ultraWide", let ultra = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) {
      return ultra
    }
    return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  /// 1920x1080 at 60fps when `wantHigh` and supported, else 30fps (1280x720 when not `wantHigh`).
  private func applyFormat(_ device: AVCaptureDevice, wantHigh: Bool) throws {
    let targetWidth: Int32 = wantHigh ? 1920 : 1280
    let candidates = device.formats.filter {
      let d = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
      return d.width == targetWidth && d.height == targetWidth * 9 / 16
    }
    let wantedFps = wantHigh ? 60.0 : 30.0
    let chosen = candidates.first { f in f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= wantedFps } }
      ?? candidates.first
    guard let format = chosen else { return }

    let maxFps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 30
    let frameRate = Int(min(wantedFps, maxFps))
    try device.lockForConfiguration()
    device.activeFormat = format
    let duration = CMTime(value: 1, timescale: CMTimeScale(frameRate))
    device.activeVideoMinFrameDuration = duration
    device.activeVideoMaxFrameDuration = duration
    device.unlockForConfiguration()

    let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    dimensions = (Int(d.width), Int(d.height))
    fps = frameRate
  }
}
