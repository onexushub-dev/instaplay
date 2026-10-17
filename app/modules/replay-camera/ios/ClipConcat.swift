import Foundation

/// Joins the fMP4 initialization segment and media segments into one playable file, without re-encoding.
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
}
