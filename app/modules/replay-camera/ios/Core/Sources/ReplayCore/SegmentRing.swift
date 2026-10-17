import Foundation

public struct Segment: Equatable {
  public let url: URL
  /// Seconds since the session started.
  public let startTime: Double
  public let duration: Double

  public init(url: URL, startTime: Double, duration: Double) {
    self.url = url
    self.startTime = startTime
    self.duration = duration
  }

  var end: Double { startTime + duration }
}

public protocol FileOps {
  func delete(_ url: URL)
  func list(_ dir: URL) -> [URL]
  func exists(_ url: URL) -> Bool
}

/// Rolling window of encoded segments. Evicted segments are deleted immediately,
/// so disk usage stays bounded by `capacity` segments — except segments a copy is reading,
/// whose deletion waits until that copy ends.
public final class SegmentRing {
  private let capacity: Int
  private let fileOps: FileOps
  private var segments: [Segment] = []
  private var pins: [URL: Int] = [:]
  private var doomed: Set<URL> = []
  private let queue = DispatchQueue(label: "replay.segment-ring")

  public init(capacity: Int = 30, fileOps: FileOps) {
    self.capacity = capacity
    self.fileOps = fileOps
  }

  public func append(_ segment: Segment) {
    queue.sync {
      segments.append(segment)
      while segments.count > capacity {
        discard(segments.removeFirst().url)
      }
    }
  }

  /// Segments overlapping `[newestEnd - lastSeconds, newestEnd]`, oldest first.
  public func snapshot(lastSeconds: Double = 60) -> [Segment] {
    queue.sync { window(lastSeconds) }
  }

  /// Copies the window into `dest` through `concat` and returns its duration in seconds.
  /// `concat` runs outside the ring's lock, so capture keeps appending meanwhile; the window's
  /// files are pinned and survive eviction or `clear()` until the copy ends.
  public func copyClip(lastSeconds: Double, to dest: URL, concat: ([Segment], URL) throws -> Void) throws -> Double {
    let picked: [Segment] = queue.sync {
      let w = window(lastSeconds)
      w.forEach { pins[$0.url, default: 0] += 1 }
      return w
    }
    defer { queue.sync { picked.forEach { unpin($0.url) } } }
    try concat(picked, dest)
    return picked.reduce(0) { $0 + $1.duration }
  }

  public func clear() {
    queue.sync {
      segments.forEach { discard($0.url) }
      segments.removeAll()
    }
  }

  public static func purgeOrphans(dir: URL, fileOps: FileOps) {
    fileOps.list(dir).forEach { fileOps.delete($0) }
  }

  private func discard(_ url: URL) {
    if pins[url] != nil { doomed.insert(url) } else { fileOps.delete(url) }
  }

  private func unpin(_ url: URL) {
    let left = (pins[url] ?? 1) - 1
    pins[url] = left > 0 ? left : nil
    if left <= 0, doomed.remove(url) != nil { fileOps.delete(url) }
  }

  private func window(_ lastSeconds: Double) -> [Segment] {
    guard let newestEnd = segments.last?.end else { return [] }
    let from = newestEnd - lastSeconds
    return segments.filter { $0.end > from }
  }
}
