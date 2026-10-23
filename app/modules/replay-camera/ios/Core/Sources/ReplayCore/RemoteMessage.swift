import Foundation

/// What the camera phone and the remote phone say to each other once they are connected. The state and result
/// keys match `WatchMessage` on purpose. RemoteMessageTests pins the key names.
public enum RemoteMessage: Equatable {
  /// Why the camera phone refused a pairing attempt.
  /// `expired` is only about time. `used`: another remote is pairing with this code right now. `closed`: the camera phone
  /// is not offering a pairing (the sheet was closed, or this code was replaced).
  public enum Reason: String { case expired, locked, wrong, used, closed }

  /// Remote → camera: save a clip now.
  case save
  /// Remote → camera: end the recording (the remote asks for it by holding a button, like the camera phone's own).
  case stop
  /// Remote → camera: start a new recording (only does something when the camera phone is not recording).
  case start
  /// Remote → camera: send pictures of the camera view (`true`, repeated every second while the view is open) or stop.
  case preview(on: Bool)
  /// Remote → camera: this remote is being unpaired from its side; drop it from the trusted list.
  case forget
  /// Camera → remote: the recording as it is; `startedAt` is ms since 1970, nil when idle.
  case state(recording: Bool, clipCount: Int, startedAt: Double?)
  /// Camera → remote: how the last save ended.
  case result(saved: Bool)
  /// Camera → remote, only while pairing: who the camera phone is and the key to reconnect with (32 bytes).
  case paired(hostId: String, hostName: String, pairKey: Data)
  /// Camera → remote: this camera phone does not know you (any more).
  case unpaired
  /// Camera → remote: the pairing attempt failed, and why.
  case refused(reason: Reason)
  /// Camera → remote: "are you there?" The token comes back in the `pong`.
  case ping(token: String)
  /// Remote → camera: the answer to a `ping`.
  case pong(token: String)

  public var payload: [String: Any] {
    switch self {
    case .save:
      return ["cmd": "save"]
    case .stop:
      return ["cmd": "stop"]
    case .forget:
      return ["cmd": "forget"]
    case .start:
      return ["cmd": "start"]
    case let .preview(on):
      return ["cmd": "preview", "on": on]
    case let .state(recording, clipCount, startedAt):
      var out: [String: Any] = ["recording": recording, "clipCount": clipCount]
      if let startedAt { out["startedAt"] = startedAt }
      return out
    case let .result(saved):
      return ["result": saved ? "saved" : "failed"]
    case let .paired(hostId, hostName, pairKey):
      return ["paired": ["hostId": hostId, "hostName": hostName, "key": pairKey.base64EncodedString()]]
    case .unpaired:
      return ["unpaired": true]
    case let .refused(reason):
      return ["refused": reason.rawValue]
    case let .ping(token):
      return ["ping": token]
    case let .pong(token):
      return ["pong": token]
    }
  }

  public var data: Data { (try? JSONSerialization.data(withJSONObject: payload)) ?? Data() }

  /// nil for anything unknown or malformed: a stray message must never crash or save a clip.
  public static func decode(_ payload: [String: Any]) -> RemoteMessage? {
    if let cmd = payload["cmd"] as? String {
      switch cmd {
      case "save": return .save
      case "stop": return .stop
      case "forget": return .forget
      case "start": return .start
      case "preview":
        guard let on = payload["on"] as? Bool else { return nil }
        return .preview(on: on)
      default: return nil
      }
    }
    if let token = payload["ping"] as? String, !token.isEmpty, token.count <= 64 { return .ping(token: token) }
    if let token = payload["pong"] as? String, !token.isEmpty, token.count <= 64 { return .pong(token: token) }
    if let unpaired = payload["unpaired"] { return (unpaired as? Bool) == true ? .unpaired : nil }
    if let refused = payload["refused"] {
      guard let raw = refused as? String, let reason = Reason(rawValue: raw) else { return nil }
      return .refused(reason: reason)
    }
    if let paired = payload["paired"] {
      guard let dict = paired as? [String: Any],
            let hostId = dict["hostId"] as? String,
            let hostName = dict["hostName"] as? String,
            let encoded = dict["key"] as? String,
            let key = Data(base64Encoded: encoded), key.count == 32 else { return nil }
      return .paired(hostId: hostId, hostName: hostName, pairKey: key)
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

  public static func decode(data: Data) -> RemoteMessage? {
    guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
    return decode(object)
  }
}

/// The first thing a remote phone sends: it rides in the Multipeer invitation, so the camera phone can check the
/// proof before it accepts anybody. `at` is ms since 1970.
public struct RemoteHello: Equatable {
  public enum Kind: String { case pair, reconnect }

  public let kind: Kind
  public let remoteId: String
  public let remoteName: String
  public let proof: String
  public let at: Double

  public init(kind: Kind, remoteId: String, remoteName: String, proof: String, at: Double) {
    self.kind = kind
    self.remoteId = remoteId
    self.remoteName = remoteName
    self.proof = proof
    self.at = at
  }

  public var data: Data {
    let object: [String: Any] = [
      "kind": kind.rawValue, "remoteId": remoteId, "remoteName": remoteName, "proof": proof, "at": at,
    ]
    return (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
  }

  public static func decode(data: Data) -> RemoteHello? {
    guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let rawKind = object["kind"] as? String, let kind = Kind(rawValue: rawKind),
          let remoteId = object["remoteId"] as? String,
          let remoteName = object["remoteName"] as? String,
          let proof = object["proof"] as? String,
          let at = object["at"] as? Double else { return nil }
    return RemoteHello(kind: kind, remoteId: remoteId, remoteName: remoteName, proof: proof, at: at)
  }
}
