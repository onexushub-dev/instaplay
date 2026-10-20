import Foundation

/// What the watch shows. Platform-free on purpose: the same file is compiled into the watch app and into
/// the ReplayCore tests (symlinked there), so the rules below are covered by `swift test`.
enum WatchScreen: Equatable {
  case idle
  case offline
  case recording(clipCount: Int, startedAt: Date?)
}

enum WatchModel {
  /// The phone repeats its state this often while recording (WatchBridge).
  static let heartbeat = 5.0
  /// A recording state older than this is not believed: the phone app is gone even if the link says reachable.
  static let staleAfter = 12.0
  /// One save per this many seconds from the watch: a sleeve or a ball on a full-screen target saves nothing more.
  static let saveCooldown = 3.0

  /// A recording whose phone cannot be reached, or has stopped reporting (`stateAge` in seconds), is `offline`
  /// (the button would go nowhere); with no recording the watch is `idle`, whatever the connection.
  static func screen(recording: Bool, reachable: Bool, clipCount: Int, startedAtMs: Double?, stateAge: Double) -> WatchScreen {
    guard recording else { return .idle }
    guard reachable, stateAge <= staleAfter else { return .offline }
    return .recording(clipCount: clipCount, startedAt: startedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) })
  }

  /// "mm:ss", or "h:mm:ss" from one hour on.
  static func elapsed(since start: Date, now: Date) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60)
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  /// The watch keeps asking for pictures only while its view is open, the phone is reachable and a recording runs.
  static func previewWanted(viewOn: Bool, reachable: Bool, recording: Bool) -> Bool {
    viewOn && reachable && recording
  }

  static func canSave(now: Double, lastSave: Double?) -> Bool {
    guard let lastSave else { return true }
    return now - lastSave >= saveCooldown
  }

}
