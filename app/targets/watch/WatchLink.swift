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
  /// A short confirmation drawn over the screen when the phone says a save ended (true = saved).
  @Published private(set) var confirmation: Bool?

  private var confirmationReset: DispatchWorkItem?

  private var keepAlive: Timer?

  // All of this is read and written on the main thread (WatchConnectivity callbacks hop to it first).
  private var recording = false
  private var clipCount = 0
  private var startedAtMs: Double?
  private var lastStateAt = Date.distantPast
  private var lastSaveAt: Double?
  private var aging: Timer?

  override init() {
    super.init()
    // The phone repeats its state while recording; a state that stops being repeated means the phone app
    // is gone even though the link still says reachable, so the screen is re-evaluated as it ages.
    aging = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.refresh() }
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// The phone does the saving; the watch only asks. A send that fails buzzes the failure pattern.
  func sendSave() {
    // Full-screen target: a sleeve or a ball must not save a clip every few seconds.
    let now = Date().timeIntervalSince1970
    guard WatchModel.canSave(now: now, lastSave: lastSaveAt) else { return }
    lastSaveAt = now
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
      var recordingShown = false
      if case .recording = self.screen { recordingShown = true }
      let wanted = WatchModel.previewWanted(
        viewOn: self.previewOn, reachable: WCSession.default.isReachable, recording: recordingShown)
      if wanted { self.sendPreview(true) }
    }
  }

  private func sendPreview(_ on: Bool) {
    let session = WCSession.default
    guard session.isReachable else { return }
    session.sendMessage(WatchMessage.preview(on: on).payload, replyHandler: nil, errorHandler: nil)
  }

  /// WatchConnectivity calls back off the main thread: hop first, so state, haptics and the banner share one thread.
  private func apply(_ payload: [String: Any]) {
    DispatchQueue.main.async {
      switch WatchMessage.decode(payload) {
      case let .state(recording, clipCount, startedAt)?:
        self.recording = recording
        self.clipCount = clipCount
        self.startedAtMs = startedAt
        self.lastStateAt = Date()
        self.refresh()
      case let .result(saved)?:
        // The confirmation comes from the phone, once the clip is really saved (or the save failed).
        self.confirm(saved)
      default:
        break
      }
    }
  }

  private func confirm(_ saved: Bool) {
    WKInterfaceDevice.current().play(saved ? .success : .failure)
    confirmation = saved
    confirmationReset?.cancel()
    let reset = DispatchWorkItem { [weak self] in self?.confirmation = nil }
    confirmationReset = reset
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: reset)
  }

  /// Main thread only.
  private func refresh() {
    let reachable = WCSession.default.isReachable
    let next = WatchModel.screen(
      recording: recording, reachable: reachable, clipCount: clipCount, startedAtMs: startedAtMs,
      stateAge: Date().timeIntervalSince(lastStateAt))
    if screen != next { screen = next }
    // Nothing to look at once the recording is over or the phone is gone.
    var recordingShown = false
    if case .recording = next { recordingShown = true }
    if previewOn, !WatchModel.previewWanted(viewOn: true, reachable: reachable, recording: recordingShown) { setPreview(false) }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    // A watch app opened later still reads the last state the phone left as application context.
    apply(session.receivedApplicationContext)
  }

  func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
    guard let image = UIImage(data: messageData) else { return }
    DispatchQueue.main.async { if self.previewOn { self.picture = image } }
  }

  func sessionReachabilityDidChange(_ session: WCSession) { DispatchQueue.main.async { self.refresh() } }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { apply(message) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
}
