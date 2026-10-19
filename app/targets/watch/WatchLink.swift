import Foundation
import WatchConnectivity
import UIKit
import WatchKit

/// The watch's side of the link to the iPhone app (messages are `WatchMessage`, shared with the phone).
final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var screen: WatchScreen = .idle
  /// The camera view: the last picture the phone sent, while the view is open.
  @Published private(set) var picture: UIImage?
  @Published private(set) var previewOn = false

  private var keepAlive: Timer?

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

  /// Opens or closes the camera view. While it is open the watch asks again every second, so the phone
  /// stops on its own if the watch screen goes to sleep before it can say so.
  func setPreview(_ on: Bool) {
    guard on != previewOn else { return }
    previewOn = on
    if !on { picture = nil }
    keepAlive?.invalidate()
    keepAlive = nil
    guard on else { return sendPreview(false) }
    sendPreview(true)
    keepAlive = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self else { return }
      let wanted = WatchModel.previewWanted(
        viewOn: self.previewOn, reachable: WCSession.default.isReachable, recording: self.recording)
      if wanted { self.sendPreview(true) }
    }
  }

  private func sendPreview(_ on: Bool) {
    let session = WCSession.default
    guard session.isReachable else { return }
    session.sendMessage(WatchMessage.preview(on: on).payload, replyHandler: nil, errorHandler: nil)
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
    // Nothing to look at once the recording is over or the phone is gone.
    if previewOn, !WatchModel.previewWanted(viewOn: true, reachable: WCSession.default.isReachable, recording: recording) {
      DispatchQueue.main.async { self.setPreview(false) }
    }
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

  func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
    guard let image = UIImage(data: messageData) else { return }
    DispatchQueue.main.async { if self.previewOn { self.picture = image } }
  }

  func sessionReachabilityDidChange(_ session: WCSession) { refresh() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { apply(message) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
}
