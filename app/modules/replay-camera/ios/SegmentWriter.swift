import AVFoundation
import UniformTypeIdentifiers

/// Encodes camera samples into 1s fragmented-MP4 segments and hands each finished one to `onSegment`.
/// The initialization segment is written once per writer to `ReplayPaths.buffer/init.mp4`.
final class SegmentWriter: NSObject, AVAssetWriterDelegate {
  static let segmentSeconds = 1.0

  var onSegment: ((Segment) -> Void)?

  private let writer: AVAssetWriter
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput
  private var sessionStart: CMTime?
  private var segmentIndex = 0
  let initSegmentURL = ReplayPaths.buffer.appendingPathComponent("init.mp4")

  init(width: Int, height: Int, fps: Int) {
    writer = AVAssetWriter(contentType: UTType(AVFileType.mp4.rawValue)!)
    writer.outputFileTypeProfile = .mpeg4AppleHLS
    writer.preferredOutputSegmentInterval = CMTime(seconds: Self.segmentSeconds, preferredTimescale: 600)

    videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: fps >= 60 ? 12_000_000 : 6_000_000,
        AVVideoMaxKeyFrameIntervalDurationKey: Self.segmentSeconds,
        AVVideoAllowFrameReorderingKey: false,
        AVVideoExpectedSourceFrameRateKey: fps,
      ],
    ])
    videoInput.expectsMediaDataInRealTime = true

    audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44_100,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 96_000,
    ])
    audioInput.expectsMediaDataInRealTime = true

    super.init()
    writer.add(videoInput)
    writer.add(audioInput)
    writer.delegate = self
  }

  /// Call from the capture queue only.
  func appendVideo(_ buffer: CMSampleBuffer) {
    let time = CMSampleBufferGetPresentationTimeStamp(buffer)
    if sessionStart == nil {
      writer.initialSegmentStartTime = time
      guard writer.startWriting() else { return }
      writer.startSession(atSourceTime: time)
      sessionStart = time
    }
    if videoInput.isReadyForMoreMediaData { videoInput.append(buffer) }
  }

  /// Call from the capture queue only. Audio before the first video frame is dropped.
  func appendAudio(_ buffer: CMSampleBuffer) {
    guard sessionStart != nil, audioInput.isReadyForMoreMediaData else { return }
    audioInput.append(buffer)
  }

  func finish(completion: @escaping () -> Void) {
    guard sessionStart != nil, writer.status == .writing else { return completion() }
    videoInput.markAsFinished()
    audioInput.markAsFinished()
    writer.finishWriting(completionHandler: completion)
  }

  var failed: Error? { writer.status == .failed ? writer.error : nil }

  func assetWriter(_ writer: AVAssetWriter, didOutputSegmentData segmentData: Data,
                   segmentType: AVAssetSegmentType, segmentReport: AVAssetSegmentReport?) {
    switch segmentType {
    case .initialization:
      try? segmentData.write(to: initSegmentURL)
    case .separable:
      let url = ReplayPaths.buffer.appendingPathComponent("\(segmentIndex).m4s")
      segmentIndex += 1
      guard (try? segmentData.write(to: url)) != nil else { return }
      let video = segmentReport?.trackReports.first { $0.mediaType == .video }
      let start = (video?.earliestPresentationTimeStamp ?? .zero) - (sessionStart ?? .zero)
      let duration = video?.duration.seconds ?? Self.segmentSeconds
      onSegment?(Segment(url: url, startTime: start.seconds, duration: duration))
    @unknown default:
      break
    }
  }
}
