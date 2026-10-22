import Foundation
import MultipeerConnectivity

/// Remote-phone side of the phone remote: finds the paired camera phone, proves who it is, and sends `save`.
/// It also pairs: from the `lance://pair` link the Camera app opened (the QR secret) or from the 6 digits typed.
/// Rules and message formats live in Core (`RemoteProof`, `RemoteMessage`, `TrustedPeers`).
final class RemoteController: NSObject {
  static let shared = RemoteController()

  /// Same shape as WatchBridge.emit: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?

  private enum PairMode {
    case link(hostId: String, secret: Data)
    case code(String)
  }

  private let peerID: MCPeerID
  private var session: MCSession?
  private var browser: MCNearbyServiceBrowser?
  private var retryTimer: DispatchSourceTimer?
  private let hosts = TrustedPeers(store: KeychainPeerStore(account: "lance.remote.hosts"))
  private var wanted = false
  private var denied = false
  private var pairMode: PairMode?
  private var pairTimeout: DispatchWorkItem?
  /// The camera phone we are talking to right now.
  private var connectedHost: MCPeerID?
  /// Camera phones the browser has seen, by their host id, and when we last invited each.
  private var seen: [String: (peer: MCPeerID, mode: String)] = [:]
  private var lastInvite: [MCPeerID: Date] = [:]

  private override init() {
    peerID = MCPeerID(displayName: DeviceIdentity.name)
    super.init()
  }

  private func onMain<T>(_ work: () -> T) -> T {
    Thread.isMainThread ? work() : DispatchQueue.main.sync(execute: work)
  }

  private var nowMs: Double { Date().timeIntervalSince1970 * 1000 }

  // MARK: JS API

  /// The remote screen is in front: look for the paired camera phone and keep the link up.
  func start() { onMain { wanted = true; refresh() } }

  func stop() { onMain { wanted = false; refresh() } }

  var host: TrustedPeer? { onMain { hosts.all.first } }

  /// Unpairs from this side. When the camera phone is in reach it is told first, so it drops this remote too.
  func forget() {
    onMain {
      for item in hosts.all { hosts.remove(id: item.id) }
      if let peer = connectedHost {
        if let session { try? session.send(RemoteMessage.forget.data, toPeers: [peer], with: .reliable) }
        // Give the message a moment to leave before the link is cut.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.session?.cancelConnectPeer(peer) }
      }
      connectedHost = nil
      emitStatus()
    }
  }

  /// `secret` is the base64url text of the `lance://pair` link. The result arrives as `onRemotePairing`.
  func pair(hostId: String, secret: String, hostName: String) {
    onMain {
      guard let key = Self.decodeSecret(secret) else { return fail("notFound") }
      beginPairing(.link(hostId: hostId, secret: key))
    }
  }

  func pair(code: String) { onMain { beginPairing(.code(code)) } }

  func save() { send(.save) }

  /// Asks the camera phone to end the recording.
  func endRecording() { send(.stop) }

  /// Asks the camera phone to start a new recording.
  func startRecording() { send(.start) }

  /// The camera view is open (`true`, said again every second) or closed.
  func preview(_ on: Bool) { send(.preview(on: on)) }

  private func send(_ message: RemoteMessage) {
    onMain {
      guard let session, let peer = connectedHost else { return }
      try? session.send(message.data, toPeers: [peer], with: .reliable)
    }
  }

  // MARK: Lifecycle

  private var active: Bool { wanted || pairMode != nil }

  private func refresh() {
    if active {
      if session == nil {
        let created = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        created.delegate = self
        session = created
      }
      if browser == nil {
        let created = MCNearbyServiceBrowser(peer: peerID, serviceType: RemoteHost.serviceType)
        created.delegate = self
        created.startBrowsingForPeers()
        browser = created
      }
      if retryTimer == nil {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 2, repeating: 3)
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        retryTimer = timer
      }
    } else {
      browser?.stopBrowsingForPeers()
      browser = nil
      retryTimer?.cancel()
      retryTimer = nil
      session?.disconnect()
      session = nil
      connectedHost = nil
      seen.removeAll()
      lastInvite.removeAll()
    }
    emitStatus()
  }

  private func beginPairing(_ mode: PairMode) {
    pairMode = mode
    pairTimeout?.cancel()
    let timeout = DispatchWorkItem { [weak self] in
      guard let self, self.pairMode != nil else { return }
      self.fail("notFound")
    }
    pairTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
    refresh()
    tryReconnect()
  }

  private func fail(_ reason: String) {
    pairMode = nil
    pairTimeout?.cancel()
    emit?("onRemotePairing", ["phase": "failed", "reason": reason])
    refresh()
  }

  private func emitStatus() {
    let link: String
    if denied { link = "denied" } else if connectedHost != nil && pairMode == nil { link = "connected" } else {
      link = active ? "searching" : "idle"
    }
    var body: [String: Any] = ["link": link]
    if let name = hosts.all.first?.name { body["peerName"] = name }
    emit?("onRemoteStatus", body)
  }

  // MARK: Inviting

  private static func decodeSecret(_ text: String) -> Data? {
    var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64 += "=" }
    guard let data = Data(base64Encoded: base64), data.count == 16 else { return nil }
    return data
  }

  private func invite(_ peer: MCPeerID, as hello: RemoteHello) {
    guard let session, let browser else { return }
    lastInvite[peer] = Date()
    browser.invitePeer(peer, to: session, withContext: hello.data, timeout: 8)
  }

  private func hello(_ kind: RemoteHello.Kind, key: Data) -> RemoteHello {
    let at = nowMs
    let id = DeviceIdentity.id
    return RemoteHello(kind: kind, remoteId: id, remoteName: DeviceIdentity.name,
                       proof: RemoteProof.make(key: key, purpose: kind == .pair ? .pair : .reconnect, remoteId: id, at: at),
                       at: at)
  }

  /// Invites the camera phone(s) we want, unless one was invited in the last 5 s or we are already connected.
  private func tryReconnect() {
    if let mode = pairMode {
      for (hostId, found) in seen where found.mode == "pairing" && !recentlyInvited(found.peer) {
        switch mode {
        case let .link(wantedHost, secret) where hostId == wantedHost:
          invite(found.peer, as: hello(.pair, key: secret))
        case let .code(code):
          invite(found.peer, as: hello(.pair, key: Data(code.utf8)))
        default:
          break
        }
      }
    } else if connectedHost == nil, let paired = hosts.all.first, let found = seen[paired.id], !recentlyInvited(found.peer) {
      invite(found.peer, as: hello(.reconnect, key: paired.key))
    }
  }

  /// Without a link for this long the search starts over: a browser that has been looking for a while may never
  /// notice a camera phone that went away and came back.
  private static let restartAfter: TimeInterval = 8
  private var lastBrowserRestart = Date()

  /// Every 3 s: restart a search that found nothing for too long, then invite whoever we should.
  private func tick() {
    if wanted, pairMode == nil, connectedHost == nil, Date().timeIntervalSince(lastBrowserRestart) > Self.restartAfter {
      restartBrowser()
    }
    tryReconnect()
  }

  private func restartBrowser() {
    lastBrowserRestart = Date()
    browser?.stopBrowsingForPeers()
    seen.removeAll()
    lastInvite.removeAll()
    let created = MCNearbyServiceBrowser(peer: peerID, serviceType: RemoteHost.serviceType)
    created.delegate = self
    created.startBrowsingForPeers()
    browser = created
  }

  private func recentlyInvited(_ peer: MCPeerID) -> Bool {
    if let last = lastInvite[peer] { return Date().timeIntervalSince(last) < 5 }
    return false
  }

  private func received(_ message: RemoteMessage, from peer: MCPeerID) {
    switch message {
    case let .paired(hostId, hostName, pairKey):
      guard pairMode != nil else { return }
      for item in hosts.all { hosts.remove(id: item.id) }  // a remote has one camera phone
      hosts.add(TrustedPeer(id: hostId, name: hostName, key: pairKey))
      pairMode = nil
      pairTimeout?.cancel()
      connectedHost = peer
      emit?("onRemotePairing", ["phase": "paired", "peer": ["id": hostId, "name": hostName]])
      emitStatus()
    case let .refused(reason):
      fail(reason.rawValue)
    case .unpaired:
      forget()
      emit?("onRemotePairing", ["phase": "failed", "reason": "denied"])
    case let .state(recording, clipCount, startedAt):
      var body: [String: Any] = ["recording": recording, "clipCount": clipCount]
      if let startedAt { body["startedAt"] = startedAt }
      emit?("onRemoteState", body)
    case let .result(saved):
      emit?("onRemoteResult", ["saved": saved])
    case let .ping(token):
      // The camera phone asks "are you there?" (its Verificar button): answer at once.
      send(.pong(token: token))
    case .save, .stop, .forget, .start, .preview, .pong:
      break
    }
  }
}

extension RemoteController: MCNearbyServiceBrowserDelegate {
  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    DispatchQueue.main.async {
      guard let info, let hostId = info["host"], let mode = info["mode"] else { return }
      self.seen[hostId] = (peerID, mode)
      self.tryReconnect()
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    DispatchQueue.main.async {
      // When it comes back (a restarted advertiser) it is a new chance to connect, not a repeat of an old invite.
      self.lastInvite.removeValue(forKey: peerID)
      for (hostId, found) in self.seen where found.peer == peerID { self.seen.removeValue(forKey: hostId) }
    }
  }

  /// Most often: the person refused the Local Network permission.
  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    DispatchQueue.main.async {
      self.denied = true
      self.emitStatus()
    }
  }
}

extension RemoteController: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    DispatchQueue.main.async {
      switch state {
      case .connected:
        self.denied = false
        // While pairing, the link counts as up only once the camera phone has answered (`paired`).
        if self.pairMode == nil { self.connectedHost = peerID }
        self.emitStatus()
      case .notConnected:
        if self.connectedHost == peerID {
          self.connectedHost = nil
          self.lastBrowserRestart = Date()  // give the quick retry below a few seconds before starting the search over
          // A working link was lost: forget the last invite so the next try is not held back by its 5 s window,
          // and try again right away instead of waiting for the next tick of the retry timer.
          self.lastInvite.removeValue(forKey: peerID)
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.tryReconnect() }
        }
        self.emitStatus()
      default:
        break
      }
    }
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    DispatchQueue.main.async {
      // A JPEG (a picture of the camera view) starts with FF D8; every other message is JSON.
      if data.count > 2, data[data.startIndex] == 0xFF, data[data.startIndex + 1] == 0xD8 {
        self.emit?("onRemoteFrame", ["jpeg": data.base64EncodedString()])
        return
      }
      guard let message = RemoteMessage.decode(data: data) else { return }
      self.received(message, from: peerID)
    }
  }

  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID,
               with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID,
               at localURL: URL?, withError error: Error?) {}
}
