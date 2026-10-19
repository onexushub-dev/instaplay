import Foundation
import WatchConnectivity

/// iPhone side of the Apple Watch link: a tap on the watch becomes `onTrigger('watch')`, and the recording
/// state and save results go back to the watch. The message format is `WatchMessage` (Core).
final class WatchBridge: NSObject, WCSessionDelegate {
  static let shared = WatchBridge()

  /// Same shape as ReplayEngine.emit: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?
  private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

  /// "unsupported": no paired watch · "notInstalled": paired but without the LANCE app · "ready".
  var status: String {
    guard let session, session.isPaired else { return "unsupported" }
    return session.isWatchAppInstalled ? "ready" : "notInstalled"
  }

  func activate() {
    guard let session, session.delegate == nil else { return }
    session.delegate = self
    session.activate()
  }

  /// The latest state is also kept as application context, so a watch app opened later still reads it.
  func sync(recording: Bool, clipCount: Int, startedAt: Double?) {
    guard let session, session.activationState == .activated, session.isWatchAppInstalled else { return }
    let payload = WatchMessage.state(recording: recording, clipCount: clipCount, startedAt: startedAt).payload
    try? session.updateApplicationContext(payload)
    if session.isReachable { session.sendMessage(payload, replyHandler: nil, errorHandler: nil) }
  }

  /// Only when the watch is reachable now: a vibration for an old save would just be noise.
  func signal(saved: Bool) {
    guard let session, session.activationState == .activated, session.isReachable else { return }
    session.sendMessage(WatchMessage.result(saved: saved).payload, replyHandler: nil, errorHandler: nil)
  }

  private func emitStatus() { emit?("onWatchStatus", ["status": status]) }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) { emitStatus() }
  func sessionWatchStateDidChange(_ session: WCSession) { emitStatus() }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard case .save? = WatchMessage.decode(message) else { return }
    emit?("onTrigger", ["source": "watch", "at": Date().timeIntervalSince1970 * 1000])
  }
}
