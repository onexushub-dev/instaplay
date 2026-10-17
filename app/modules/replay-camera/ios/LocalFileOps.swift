import Foundation

/// FileOps backed by FileManager. Errors are ignored: a file that is already gone is the goal.
struct LocalFileOps: FileOps {
  func delete(_ url: URL) { try? FileManager.default.removeItem(at: url) }

  func list(_ dir: URL) -> [URL] {
    (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
  }

  func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }
}

enum ReplayPaths {
  static var buffer: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("replay-buffer")
  }

  static var clips: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("clips")
  }

  static func ensure(_ dir: URL) {
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  }
}
