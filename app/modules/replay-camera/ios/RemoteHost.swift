import Foundation
import MultipeerConnectivity

/// Camera-phone side of the phone remote: advertises over Multipeer, checks who is asking in, and turns a tap on a
/// remote into `onTrigger('phone')`. The recording state and the save results go back to every connected remote.
/// Rules and message formats live in Core (`PairingOffer`, `RemoteProof`, `RemoteMessage`, `TrustedPeers`).
final class RemoteHost: NSObject {
  static let shared = RemoteHost()
  static let serviceType = "lance-remote"

  /// Same shape as WatchBridge.emit: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?

  /// What to do with a peer once its connection is up, decided when its invitation was checked.
  private enum Pending {
    case trusted(remoteId: String)
    case pairing(remoteId: String, name: String)
    case refuse(RemoteMessage.Reason)
    case unpaired
  }

  private let peerID: MCPeerID
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var advertisedMode: String?
  private let trusted = TrustedPeers(store: KeychainPeerStore(account: "lance.remote.controllers"))
  private var offer: PairingOffer?
  private var wanted = false
  private var denied = false
  private var pending: [MCPeerID: Pending] = [:]
  /// Connected remotes that proved who they are → their remote id.
  private var authenticated: [MCPeerID: String] = [:]
  private var lastState: RemoteMessage = .state(recording: false, clipCount: 0, startedAt: nil)
  private var heartbeat: DispatchSourceTimer?
  /// Pending shutdown of the session; see `scheduleTeardown`.
  private var teardown: DispatchWorkItem?
  /// How long the host stays up after nothing wants it any more.
  private static let teardownGrace: TimeInterval = 3

  private override init() {
    peerID = MCPeerID(displayName: DeviceIdentity.name)
    super.init()
  }

  private func onMain<T>(_ work: () -> T) -> T {
    Thread.isMainThread ? work() : DispatchQueue.main.sync(execute: work)
  }

  private var nowMs: Double { Date().timeIntervalSince1970 * 1000 }

  // MARK: JS API

  /// The setup screen is in front: wait for the paired remotes.
  /// Asked again while already running (the app came back to the front), it also starts advertising over: iOS may have
  /// dropped the old advertiser while the app was away.
  func start() {
    onMain {
      if wanted { advertisedMode = nil }
      wanted = true
      refresh()
    }
  }

  func stop() { onMain { wanted = false; refresh() } }

  var peers: [TrustedPeer] { onMain { trusted.all } }

  /// How many remotes are connected right now (a screen that opens later cannot have heard the status events).
  var controllers: Int { onMain { authenticated.count } }

  func remove(id: String) {
    onMain {
      trusted.remove(id: id)
      for (peer, remoteId) in authenticated where remoteId == id { session?.cancelConnectPeer(peer) }
      refresh()
    }
  }

  /// Opens a pairing (QR + code). Nil when the list of remotes is already full.
  func beginPairing() -> (url: String, code: String, expiresAt: Double, qrPath: String)? {
    onMain {
      guard trusted.all.count < TrustedPeers.limit else { return nil }
      let fresh = PairingOffer.make(hostId: DeviceIdentity.id, hostName: DeviceIdentity.name, now: nowMs)
      guard let qrPath = QRCode.png(for: fresh.qrURL) else { return nil }
      offer = fresh
      refresh()
      return (fresh.qrURL, fresh.code, fresh.createdAt + PairingOffer.validFor * 1000, qrPath)
    }
  }

  func endPairing() { onMain { offer = nil; refresh() } }

  /// Called by JS whenever the recording changes. Repeated every 5 s while recording: if the app dies the beats stop
  /// and the remote notices (see `STALE_AFTER` in remoteScreen.ts).
  func sync(recording: Bool, clipCount: Int, startedAt: Double?) {
    onMain {
      lastState = .state(recording: recording, clipCount: clipCount, startedAt: startedAt)
      heartbeat?.cancel()
      heartbeat = nil
      if recording {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 5, repeating: 5)
        timer.setEventHandler { [weak self] in self?.pushState() }
        timer.resume()
        heartbeat = timer
      }
      pushState()
    }
  }

  /// Only to remotes that are connected now: a vibration for an old save would just be noise.
  func signal(saved: Bool) {
    onMain { send(.result(saved: saved), to: Array(authenticated.keys)) }
  }

  // MARK: Lifecycle

  /// Runs while a game screen wants remotes, or while a pairing is open.
  private func refresh() {
    let active = wanted || offer != nil
    if active {
      teardown?.cancel()
      teardown = nil
      if session == nil {
        let created = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        created.delegate = self
        session = created
      }
      updateAdvertising()
    } else {
      scheduleTeardown()
    }
    emitStatus()
  }

  /// The setup screen and the pairing sheet hand the host over to each other (`endPairing()` just before `start()`,
  /// or `stop()` just before `beginPairing()`), so for a moment nothing wants it. Dropping the session right then cut
  /// the remote off every time the pairing sheet was opened or closed, and the remote needed ~10 s to find us again.
  /// Wait a little: if something wants the host back in time, the session is never touched.
  private func scheduleTeardown() {
    guard teardown == nil else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.teardown = nil
      guard !(self.wanted || self.offer != nil) else { return }
      self.tearDownNow()
    }
    teardown = work
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.teardownGrace, execute: work)
  }

  private func tearDownNow() {
    advertiser?.stopAdvertisingPeer()
    advertiser = nil
    advertisedMode = nil
    session?.disconnect()
    session = nil
    pending.removeAll()
    authenticated.removeAll()
    heartbeat?.cancel()
    heartbeat = nil
    emitStatus()
  }

  /// Advertise only when there is something to answer: an open pairing or at least one trusted remote.
  private func updateAdvertising() {
    let mode: String? = offer != nil ? "pairing" : (trusted.all.isEmpty ? nil : "trusted")
    guard mode != advertisedMode else { return }
    advertiser?.stopAdvertisingPeer()
    advertiser = nil
    advertisedMode = mode
    guard let mode else { return }
    let created = MCNearbyServiceAdvertiser(
      peer: peerID, discoveryInfo: ["host": DeviceIdentity.id, "mode": mode], serviceType: Self.serviceType)
    created.delegate = self
    created.startAdvertisingPeer()
    advertiser = created
  }

  private func emitStatus() {
    let active = wanted || offer != nil
    let link: String
    if denied { link = "denied" } else if !authenticated.isEmpty { link = "connected" } else { link = active ? "searching" : "idle" }
    emit?("onRemoteStatus", ["link": link, "controllers": authenticated.count])
  }

  private func pushState() {
    send(lastState, to: Array(authenticated.keys))
  }

  private func send(_ message: RemoteMessage, to peers: [MCPeerID]) {
    guard let session, !peers.isEmpty else { return }
    try? session.send(message.data, toPeers: peers, with: .reliable)
  }

  private func disconnectSoon(_ peer: MCPeerID) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.session?.cancelConnectPeer(peer) }
  }

  // MARK: Checking who asks in

  private func handleInvitation(from peer: MCPeerID, context: Data?, reply: @escaping (Bool, MCSession?) -> Void) {
    guard let session, let context, let hello = RemoteHello.decode(data: context) else { return reply(false, nil) }
    switch hello.kind {
    case .reconnect:
      guard let known = trusted.peer(id: hello.remoteId) else {
        // Unknown to this phone (removed here, or never paired): let it in just long enough to say so.
        pending[peer] = .unpaired
        return reply(true, session)
      }
      // A wrong proof (a wrong clock, say) is declined silently: it must never make the remote forget this phone.
      guard RemoteProof.verify(hello.proof, key: known.key, purpose: .reconnect, remoteId: hello.remoteId,
                               at: hello.at, now: nowMs) else { return reply(false, nil) }
      pending[peer] = .trusted(remoteId: hello.remoteId)
      reply(true, session)
    case .pair:
      guard var current = offer else {
        pending[peer] = .refuse(.expired)
        return reply(true, session)
      }
      let verdict = current.check(proof: hello.proof, remoteId: hello.remoteId, at: hello.at, now: nowMs)
      offer = current
      switch verdict {
      case .accepted:
        offer = nil  // one remote per code; the advertising mode is refreshed once the connection is up
        pending[peer] = .pairing(remoteId: hello.remoteId, name: hello.remoteName)
      case .wrongProof: pending[peer] = .refuse(.wrong)
      case .expired: pending[peer] = .refuse(.expired)
      case .locked: pending[peer] = .refuse(.locked)
      }
      reply(true, session)
    }
  }

  private func peerConnected(_ peer: MCPeerID) {
    guard let what = pending.removeValue(forKey: peer) else { return }
    switch what {
    case let .trusted(remoteId):
      authenticated[peer] = remoteId
      send(lastState, to: [peer])
    case let .pairing(remoteId, name):
      let key = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
      if trusted.add(TrustedPeer(id: remoteId, name: name, key: key)) {
        send(.paired(hostId: DeviceIdentity.id, hostName: DeviceIdentity.name, pairKey: key), to: [peer])
        emit?("onRemotePairing", ["phase": "paired", "peer": ["id": remoteId, "name": name]])
        authenticated[peer] = remoteId
        send(lastState, to: [peer])
      } else {
        send(.refused(reason: .wrong), to: [peer])
        disconnectSoon(peer)
      }
      refresh()
    case let .refuse(reason):
      send(.refused(reason: reason), to: [peer])
      disconnectSoon(peer)
    case .unpaired:
      send(.unpaired, to: [peer])
      disconnectSoon(peer)
    }
    emitStatus()
  }
}

extension RemoteHost: MCNearbyServiceAdvertiserDelegate {
  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                  withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    DispatchQueue.main.async { self.handleInvitation(from: peerID, context: context, reply: invitationHandler) }
  }

  /// Most often: the person refused the Local Network permission.
  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    DispatchQueue.main.async {
      self.denied = true
      self.emitStatus()
    }
  }
}

extension RemoteHost: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    DispatchQueue.main.async {
      switch state {
      case .connected:
        self.denied = false
        self.peerConnected(peerID)
      case .notConnected:
        self.pending.removeValue(forKey: peerID)
        self.authenticated.removeValue(forKey: peerID)
        self.emitStatus()
      default:
        break
      }
    }
  }

  /// Only `save` and `stop` from a remote that proved who it is count; anything else is dropped. JS decides whether the
  /// game is in a state where each one makes sense (a `save` outside a recording must not use up the debounce).
  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    DispatchQueue.main.async {
      guard self.authenticated[peerID] != nil, let message = RemoteMessage.decode(data: data) else { return }
      switch message {
      case .save: self.emit?("onTrigger", ["source": "phone", "at": self.nowMs])
      case .stop: self.emit?("onRemoteStop", [:])
      default: break
      }
    }
  }

  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID,
               with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID,
               at localURL: URL?, withError error: Error?) {}
}
