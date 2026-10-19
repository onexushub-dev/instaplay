import Foundation

/// What the watch shows. Platform-free on purpose: the same file is compiled into the watch app and into
/// the ReplayCore tests (symlinked there), so the rules below are covered by `swift test`.
enum WatchScreen: Equatable {
  case idle
  case offline
  case recording(clipCount: Int, startedAt: Date?)
}

enum WatchModel {
  /// A recording whose phone cannot be reached is `offline` (the button would go nowhere); with no recording
  /// the watch is `idle`, whatever the connection (the last state it heard may be old).
  static func screen(recording: Bool, reachable: Bool, clipCount: Int, startedAtMs: Double?) -> WatchScreen {
    guard recording else { return .idle }
    guard reachable else { return .offline }
    return .recording(clipCount: clipCount, startedAt: startedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) })
  }

  /// "mm:ss", or "h:mm:ss" from one hour on.
  static func elapsed(since start: Date, now: Date) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60)
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  static func countLabel(_ count: Int) -> String { count == 1 ? "1 clipe" : "\(count) clipes" }
}
