import Foundation

/// What the iPhone and the Apple Watch say to each other. The watch app repeats these key names
/// (`targets/watch/WatchLink.swift`); WatchMessageTests pins them so both sides change together.
public enum WatchMessage: Equatable {
  /// Watch → phone: save a clip now.
  case save
  /// Watch → phone: start a new recording (ignored by the phone while one is running).
  case start
  /// Watch → phone: end the current recording.
  case stop
  /// Phone → watch: the recording as it is; `startedAt` is ms since 1970, nil when idle.
  case state(recording: Bool, clipCount: Int, startedAt: Double?)
  /// Phone → watch: how the last save ended.
  case result(saved: Bool)
  /// Watch → phone: show (true) or stop (false) the camera view. Sent again every second while it is open.
  /// The pictures themselves travel as raw data (`sendMessageData`), not as messages.
  case preview(on: Bool)

  public var payload: [String: Any] {
    switch self {
    case .save:
      return ["cmd": "save"]
    case .start:
      return ["cmd": "start"]
    case .stop:
      return ["cmd": "stop"]
    case let .state(recording, clipCount, startedAt):
      var out: [String: Any] = ["recording": recording, "clipCount": clipCount]
      if let startedAt { out["startedAt"] = startedAt }
      return out
    case let .result(saved):
      return ["result": saved ? "saved" : "failed"]
    case let .preview(on):
      return ["preview": on]
    }
  }

  /// nil for anything unknown or malformed: a stray message must never crash or save a clip.
  public static func decode(_ payload: [String: Any]) -> WatchMessage? {
    if let cmd = payload["cmd"] as? String {
      switch cmd {
      case "save": return .save
      case "start": return .start
      case "stop": return .stop
      default: return nil
      }
    }
    if payload["preview"] != nil {
      guard let on = payload["preview"] as? Bool else { return nil }
      return .preview(on: on)
    }
    if let result = payload["result"] as? String {
      switch result {
      case "saved": return .result(saved: true)
      case "failed": return .result(saved: false)
      default: return nil
      }
    }
    guard let recording = payload["recording"] as? Bool,
          let count = payload["clipCount"] as? Int, count >= 0 else { return nil }
    return .state(recording: recording, clipCount: count, startedAt: payload["startedAt"] as? Double)
  }
}
