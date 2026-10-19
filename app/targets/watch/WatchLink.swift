import Foundation
import WatchConnectivity
import WatchKit

/// The watch's side of the link to the iPhone app (messages are `WatchMessage`, shared with the phone).
final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var screen: WatchScreen = .idle

  private var recording = false
  private var clipCount = 0
  private var startedAtMs: Double?

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// The phone does the saving; the watch only asks. A send that fails buzzes the failure pattern.
  func sendSave() {
    WKInterfaceDevice.current().play(.click)
    let session = WCSession.default
    guard session.isReachable else { return WKInterfaceDevice.current().play(.failure) }
    session.sendMessage(WatchMessage.save.payload, replyHandler: nil) { _ in
      WKInterfaceDevice.current().play(.failure)
    }
  }

  private func apply(_ payload: [String: Any]) {
    switch WatchMessage.decode(payload) {
    case let .state(recording, clipCount, startedAt)?:
      self.recording = recording
      self.clipCount = clipCount
      startedAtMs = startedAt
      refresh()
    case let .result(saved)?:
      // The confirmation comes from the phone, once the clip is really saved (or the save failed).
      WKInterfaceDevice.current().play(saved ? .success : .failure)
    default:
      break
    }
  }

  private func refresh() {
    let next = WatchModel.screen(
      recording: recording, reachable: WCSession.default.isReachable, clipCount: clipCount, startedAtMs: startedAtMs)
    DispatchQueue.main.async { self.screen = next }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    // A watch app opened later still reads the last state the phone left as application context.
    apply(session.receivedApplicationContext)
    refresh()
  }

  func sessionReachabilityDidChange(_ session: WCSession) { refresh() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { apply(message) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
}
