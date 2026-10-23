import AVFoundation

/// Builds a saved clip from buffer segments: joins the fMP4 init + media segments, then remuxes
/// (passthrough, no re-encode) to a regular MP4 whose timeline starts at 0. Without the remux, a clip
/// saved minutes into a game keeps the fragments' session-relative times and shows an empty lead-in.
enum ClipConcat {
  static func concat(initSegment: URL, segments: [Segment], to dest: URL) throws {
    FileManager.default.createFile(atPath: dest.path, contents: nil)
    let out = try FileHandle(forWritingTo: dest)
    defer { try? out.close() }
    try out.write(contentsOf: Data(contentsOf: initSegment))
    for segment in segments {
      try out.write(contentsOf: Data(contentsOf: segment.url))
    }
  }

  enum Failure: Error { case noVideo, export(Error?) }

  /// Blocks the calling (utility) thread until the remux ends.
  /// `rotationDegrees` is the phone's position when the clip was saved (see `DeviceUpright.videoRotationDegrees`).
  /// The writer stamps the position it saw at its first frame on the whole session, so a phone started upright and
  /// then laid on its side would save every clip sideways; the saved clip is re-stamped here instead. The new
  /// transform goes on a composition track, which the passthrough export keeps without re-encoding.
  static func normalize(_ source: URL, to dest: URL, rotationDegrees: Int? = nil) throws {
    let asset = AVURLAsset(url: source)
    guard let video = asset.tracks(withMediaType: .video).first else { throw Failure.noVideo }
    var input: AVAsset = asset
    if let degrees = rotationDegrees {
      let composition = AVMutableComposition()
      guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
      else { throw Failure.noVideo }
      try track.insertTimeRange(video.timeRange, of: video, at: .zero)
      track.preferredTransform = CGAffineTransform(rotationAngle: CGFloat(degrees) * .pi / 180)
      // The sound goes along, on the same timeline as the picture (without it the clip was saved silent).
      for audio in asset.tracks(withMediaType: .audio) {
        guard let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { continue }
        let range = CMTimeRangeGetIntersection(audio.timeRange, otherRange: video.timeRange)
        guard range.duration > .zero else { continue }
        try audioTrack.insertTimeRange(range, of: audio, at: CMTimeSubtract(range.start, video.timeRange.start))
      }
      input = composition
    }
    guard let export = AVAssetExportSession(asset: input, presetName: AVAssetExportPresetPassthrough)
    else { throw Failure.noVideo }
    export.outputURL = dest
    export.outputFileType = .mp4
    export.timeRange = CMTimeRange(start: .zero, duration: video.timeRange.duration)
    let done = DispatchSemaphore(value: 0)
    export.exportAsynchronously { done.signal() }
    done.wait()
    guard export.status == .completed else { throw Failure.export(export.error) }
  }
}
