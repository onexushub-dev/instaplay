import AppIntents
import WatchConnectivity
import WatchKit

/// The Smart Stack button: asks the iPhone to save a clip without opening the watch app. It runs in the widget
/// extension, so it brings up its own WatchConnectivity session and gives up quickly if the phone is out of reach.
struct SaveClipIntent: AppIntent {
  static var title: LocalizedStringResource = "Salvar clipe"
  static var openAppWhenRun = false

  func perform() async throws -> some IntentResult {
    let sent = await SaveSender.shared.send()
    WKInterfaceDevice.current().play(sent ? .click : .failure)
    return .result()
  }
}

final class SaveSender: NSObject, WCSessionDelegate {
  static let shared = SaveSender()
  private var activation: CheckedContinuation<Void, Never>?

  /// True when the phone took the message.
  func send() async -> Bool {
    guard WCSession.isSupported() else { return false }
    let session = WCSession.default
    session.delegate = self
    if session.activationState != .activated {
      await withCheckedContinuation { continuation in
        activation = continuation
        session.activate()
        // Never hang the button: continue after 3 s whatever happens.
        DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [weak self] in self?.finishActivation() }
      }
    }
    guard session.activationState == .activated, session.isReachable else { return false }
    return await withCheckedContinuation { continuation in
      session.sendMessage(WatchMessage.save.payload, replyHandler: nil, errorHandler: { _ in continuation.resume(returning: false) })
      // sendMessage without a reply handler gives no success callback: reaching here with a reachable phone is the best signal.
      DispatchQueue.global().asyncAfter(deadline: .now() + 0.4) { continuation.resume(returning: true) }
    }
  }

  private func finishActivation() {
    activation?.resume()
    activation = nil
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    finishActivation()
  }
}
