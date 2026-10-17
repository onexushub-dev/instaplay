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
  static func normalize(_ source: URL, to dest: URL) throws {
    let asset = AVURLAsset(url: source)
    guard let video = asset.tracks(withMediaType: .video).first,
          let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough)
    else { throw Failure.noVideo }
    export.outputURL = dest
    export.outputFileType = .mp4
    export.timeRange = video.timeRange
    let done = DispatchSemaphore(value: 0)
    export.exportAsynchronously { done.signal() }
    done.wait()
    guard export.status == .completed else { throw Failure.export(export.error) }
  }
}
