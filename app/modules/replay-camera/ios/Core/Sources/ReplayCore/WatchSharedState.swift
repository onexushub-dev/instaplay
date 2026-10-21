import Foundation

/// What the watch app leaves for its widget to draw: the widget runs in another process, so the two meet in a shared
/// app group. Platform-free on purpose, like `WatchMessage`: the same file is compiled into the watch app and the
/// widget (symlinked), and covered by `swift test`.
public struct WatchSharedState: Equatable {
  public var recording: Bool
  public var clipCount: Int
  /// Ms since 1970 of the game's start; the widget's timer counts from it.
  public var startedAtMs: Double?

  public init(recording: Bool, clipCount: Int, startedAtMs: Double?) {
    self.recording = recording
    self.clipCount = clipCount
    self.startedAtMs = startedAtMs
  }

  /// The widget's bundle id is the watch app's plus `.widget`; both use the group named after the watch app's.
  public static func groupID(forBundleID id: String) -> String {
    let suffix = ".widget"
    return "group." + (id.hasSuffix(suffix) ? String(id.dropLast(suffix.count)) : id)
  }

  public static let key = "watchSharedState"

  public var dictionary: [String: Any] {
    var out: [String: Any] = ["recording": recording, "clipCount": clipCount]
    if let startedAtMs { out["startedAt"] = startedAtMs }
    return out
  }

  /// Nothing stored, or anything unreadable, is "not recording". A recording needs a start for the timer to count from.
  public init(dictionary: [String: Any]?) {
    let count = dictionary?["clipCount"] as? Int ?? 0
    let start = dictionary?["startedAt"] as? Double
    let recording = dictionary?["recording"] as? Bool ?? false
    if recording, let start {
      self.init(recording: true, clipCount: max(0, count), startedAtMs: start)
    } else {
      self.init(recording: false, clipCount: 0, startedAtMs: nil)
    }
  }

  public static func clipLabel(_ count: Int) -> String { count == 1 ? "1 clipe" : "\(count) clipes" }
}
