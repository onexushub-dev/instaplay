import CryptoKit
import Foundation

/// How a BLE link starts, in four steps (spec 2026-10-23-ble-remote-design.md, section 5):
///
///     remote → hello      { kind, remoteId, remoteName, nonce, pub (pairing only) }
///     host   → challenge  { hostId, hostName, nonce, pub (pairing only), hostProof (reconnect only) }
///     remote → proof      { proof }
///     host   → accept     { hostProof + sealed `paired` (pairing only) }   or  refused / unpaired
///
/// Every proof is an HMAC over the transcript (both ids, both nonces, both public keys), so nothing can be replayed
/// and no clock is involved.
/// - Pairing: the key is the QR secret or the 6-digit code. The session key comes from an ephemeral Curve25519 agreement,
///   so someone who only listens learns neither the code nor the new pair key. The camera also proves it knows the code,
///   so a fake camera cannot hand out a key.
/// - Reconnect: the key is the stored pair key, and both sides prove they hold it (the camera first).
///
/// The structs are pure state machines: the BLE glue moves bytes, these decide.
enum BleHandshakeMessage {
  case hello(kind: RemoteHello.Kind, remoteId: String, remoteName: String, nonce: Data, pub: Data?)
  case challenge(hostId: String, hostName: String, nonce: Data, pub: Data?, hostProof: Data?)
  case proof(Data)
  case accept(hostProof: Data?, paired: Data?)
  case refused(RemoteMessage.Reason)
  case unpaired

  var wire: Data {
    var object: [String: Any]
    switch self {
    case let .hello(kind, remoteId, remoteName, nonce, pub):
      object = ["t": "hello", "kind": kind.rawValue, "remoteId": remoteId, "remoteName": remoteName,
                "nonce": nonce.base64EncodedString()]
      if let pub { object["pub"] = pub.base64EncodedString() }
    case let .challenge(hostId, hostName, nonce, pub, hostProof):
      object = ["t": "challenge", "hostId": hostId, "hostName": hostName, "nonce": nonce.base64EncodedString()]
      if let pub { object["pub"] = pub.base64EncodedString() }
      if let hostProof { object["hostProof"] = hostProof.base64EncodedString() }
    case let .proof(proof):
      object = ["t": "proof", "proof": proof.base64EncodedString()]
    case let .accept(hostProof, paired):
      object = ["t": "accept"]
      if let hostProof { object["hostProof"] = hostProof.base64EncodedString() }
      if let paired { object["paired"] = paired.base64EncodedString() }
    case let .refused(reason):
      object = ["t": "refused", "reason": reason.rawValue]
    case .unpaired:
      object = ["t": "unpaired"]
    }
    var out = Data([BleWire.handshake])
    out.append((try? JSONSerialization.data(withJSONObject: object)) ?? Data())
    return out
  }

  static func decode(_ wire: Data) -> BleHandshakeMessage? {
    let bytes = [UInt8](wire)
    guard bytes.count > 1, bytes[0] == BleWire.handshake,
          let object = (try? JSONSerialization.jsonObject(with: Data(bytes[1...]))) as? [String: Any],
          let type = object["t"] as? String else { return nil }
    func bytesOf(_ key: String) -> Data? {
      guard let text = object[key] as? String else { return nil }
      return Data(base64Encoded: text)
    }
    switch type {
    case "hello":
      guard let raw = object["kind"] as? String, let kind = RemoteHello.Kind(rawValue: raw),
            let remoteId = object["remoteId"] as? String, !remoteId.isEmpty,
            let remoteName = object["remoteName"] as? String,
            let nonce = bytesOf("nonce"), nonce.count == BleWire.nonceSize else { return nil }
      return .hello(kind: kind, remoteId: remoteId, remoteName: remoteName, nonce: nonce, pub: bytesOf("pub"))
    case "challenge":
      guard let hostId = object["hostId"] as? String, !hostId.isEmpty,
            let hostName = object["hostName"] as? String,
            let nonce = bytesOf("nonce"), nonce.count == BleWire.nonceSize else { return nil }
      return .challenge(hostId: hostId, hostName: hostName, nonce: nonce, pub: bytesOf("pub"), hostProof: bytesOf("hostProof"))
    case "proof":
      guard let proof = bytesOf("proof") else { return nil }
      return .proof(proof)
    case "accept":
      return .accept(hostProof: bytesOf("hostProof"), paired: bytesOf("paired"))
    case "refused":
      guard let raw = object["reason"] as? String, let reason = RemoteMessage.Reason(rawValue: raw) else { return nil }
      return .refused(reason)
    case "unpaired":
      return .unpaired
    default:
      return nil
    }
  }

  static func transcript(kind: RemoteHello.Kind, remoteId: String, hostId: String, remoteNonce: Data, hostNonce: Data,
                         remotePub: Data, hostPub: Data) -> Data {
    var out = Data("lance-ble-1|\(kind.rawValue)|\(remoteId)|\(hostId)|".utf8)
    out.append(remoteNonce)
    out.append(hostNonce)
    out.append(remotePub)
    out.append(hostPub)
    return out
  }
}

/// Why the remote side gave up.
public enum BleHandshakeFailure: Equatable {
  /// A message that does not fit the handshake.
  case malformed
  /// The camera could not prove it is the paired one (or the pairing code): never trust it, never forget for it.
  case wrongHost
  /// The camera does not know this remote (any more).
  case unpaired
  /// The camera refused the pairing, and why.
  case refused(RemoteMessage.Reason)
}

// MARK: - Remote phone

public struct BleRemoteHandshake {
  public enum Mode {
    /// Pairing: `key` is the QR secret or the UTF-8 bytes of the 6-digit code.
    case pair(key: Data)
    /// Reconnecting to the paired camera phone.
    case reconnect(host: TrustedPeer)
  }

  public enum Outcome {
    case send(Data)
    /// Pairing done: store `host` (its id, name and the new pair key) and keep using `session`.
    case paired(host: TrustedPeer, session: BleSession)
    case connected(session: BleSession)
    case failed(BleHandshakeFailure)
  }

  private let mode: Mode
  private let remoteId: String
  private let remoteName: String
  private let nonce: Data
  private let privateKey: Curve25519.KeyAgreement.PrivateKey
  private var transcript: Data?
  private var sessionKey: SymmetricKey?
  private var hostId = ""

  public init(mode: Mode, remoteId: String, remoteName: String,
              nonce: Data = BleCrypto.randomBytes(BleWire.nonceSize),
              privateKey: Curve25519.KeyAgreement.PrivateKey = Curve25519.KeyAgreement.PrivateKey()) {
    self.mode = mode
    self.remoteId = remoteId
    self.remoteName = remoteName
    self.nonce = nonce
    self.privateKey = privateKey
  }

  private var kind: RemoteHello.Kind {
    if case .pair = mode { return .pair }
    return .reconnect
  }

  /// The first message, sent as soon as the link is up.
  public func hello() -> Data {
    let pub: Data? = kind == .pair ? privateKey.publicKey.rawRepresentation : nil
    return BleHandshakeMessage.hello(kind: kind, remoteId: remoteId, remoteName: remoteName, nonce: nonce, pub: pub).wire
  }

  public mutating func receive(_ wire: Data) -> Outcome {
    guard let message = BleHandshakeMessage.decode(wire) else { return .failed(.malformed) }
    switch message {
    case let .refused(reason):
      return .failed(.refused(reason))
    case .unpaired:
      return .failed(.unpaired)
    case let .challenge(hostId, _, hostNonce, hostPub, hostProof):
      guard transcript == nil else { return .failed(.malformed) }
      switch mode {
      case let .pair(key):
        guard let hostPub, let theirs = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: hostPub),
              let shared = try? privateKey.sharedSecretFromKeyAgreement(with: theirs) else { return .failed(.malformed) }
        let text = BleHandshakeMessage.transcript(
          kind: .pair, remoteId: remoteId, hostId: hostId, remoteNonce: nonce, hostNonce: hostNonce,
          remotePub: privateKey.publicKey.rawRepresentation, hostPub: hostPub)
        transcript = text
        self.hostId = hostId
        sessionKey = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: text, sharedInfo: Data("lance-pair".utf8),
                                                    outputByteCount: 32)
        return .send(BleHandshakeMessage.proof(BleCrypto.mac(key: key, label: "remote|", transcript: text)).wire)
      case let .reconnect(host):
        guard hostId == host.id, let hostProof else { return .failed(.wrongHost) }
        let text = BleHandshakeMessage.transcript(
          kind: .reconnect, remoteId: remoteId, hostId: hostId, remoteNonce: nonce, hostNonce: hostNonce,
          remotePub: Data(), hostPub: Data())
        guard BleCrypto.equal(hostProof, BleCrypto.mac(key: host.key, label: "host|", transcript: text)) else {
          return .failed(.wrongHost)
        }
        transcript = text
        self.hostId = hostId
        sessionKey = BleCrypto.sessionKey(secret: SymmetricKey(data: host.key), transcript: text, info: "lance-session")
        return .send(BleHandshakeMessage.proof(BleCrypto.mac(key: host.key, label: "remote|", transcript: text)).wire)
      }
    case let .accept(hostProof, paired):
      guard let text = transcript, let key = sessionKey else { return .failed(.malformed) }
      var session = BleSession(key: key, side: .remote)
      switch mode {
      case .reconnect:
        return .connected(session: session)
      case let .pair(pairingKey):
        guard let hostProof, BleCrypto.equal(hostProof, BleCrypto.mac(key: pairingKey, label: "host|", transcript: text)) else {
          return .failed(.wrongHost)
        }
        guard let paired, let plain = session.open(paired),
              case let .paired(id, name, pairKey)? = RemoteMessage.decode(data: plain), id == hostId else {
          return .failed(.malformed)
        }
        return .paired(host: TrustedPeer(id: id, name: name, key: pairKey), session: session)
      }
    case .hello, .proof:
      return .failed(.malformed)
    }
  }
}

// MARK: - Camera phone

public struct BleHostHandshake {
  public enum Outcome {
    case send(Data)
    /// Pairing proof accepted: store `remote`, spend the offer, send `send`, then keep using `session`.
    case paired(remote: TrustedPeer, send: Data, session: BleSession)
    /// A paired remote proved who it is: send `send`, then keep using `session`.
    case connected(remoteId: String, send: Data, session: BleSession)
    /// Tell the remote why (`refused` / `unpaired`), then drop the link.
    case refuse(send: Data)
    /// Drop the link without a word (malformed, or a wrong reconnect proof: never a reason for the remote to forget).
    case drop
  }

  private struct Remote {
    let kind: RemoteHello.Kind
    let id: String
    let name: String
    let nonce: Data
    let pub: Data
  }

  private let hostId: String
  private let hostName: String
  private let nonce: Data
  private let privateKey: Curve25519.KeyAgreement.PrivateKey
  private var remote: Remote?
  private var transcript: Data?

  public init(hostId: String, hostName: String,
              nonce: Data = BleCrypto.randomBytes(BleWire.nonceSize),
              privateKey: Curve25519.KeyAgreement.PrivateKey = Curve25519.KeyAgreement.PrivateKey()) {
    self.hostId = hostId
    self.hostName = hostName
    self.nonce = nonce
    self.privateKey = privateKey
  }

  /// The id of the remote that said hello (for logs and for releasing a reserved offer when the link drops).
  public var remoteId: String? { remote.map { $0.id } }

  /// `offer` is the open pairing, if any (its attempt counter and reservation change here); `trusted` finds a paired
  /// remote by id; `now` is ms since 1970; `newPairKey` makes the key a new remote gets.
  public mutating func receive(_ wire: Data, offer: inout PairingOffer?, trusted: (String) -> TrustedPeer?, now: Double,
                               newPairKey: () -> Data = { BleCrypto.randomBytes(32) }) -> Outcome {
    guard let message = BleHandshakeMessage.decode(wire) else { return .drop }
    switch message {
    case let .hello(kind, remoteId, remoteName, remoteNonce, pub):
      guard remote == nil else { return .drop }
      switch kind {
      case .pair:
        guard offer != nil else { return .refuse(send: BleHandshakeMessage.refused(.closed).wire) }
        guard let pub, (try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: pub)) != nil else { return .drop }
        let hostPub = privateKey.publicKey.rawRepresentation
        remote = Remote(kind: .pair, id: remoteId, name: remoteName, nonce: remoteNonce, pub: pub)
        transcript = BleHandshakeMessage.transcript(
          kind: .pair, remoteId: remoteId, hostId: hostId, remoteNonce: remoteNonce, hostNonce: nonce,
          remotePub: pub, hostPub: hostPub)
        return .send(BleHandshakeMessage.challenge(hostId: hostId, hostName: hostName, nonce: nonce, pub: hostPub,
                                                   hostProof: nil).wire)
      case .reconnect:
        guard let peer = trusted(remoteId) else { return .refuse(send: BleHandshakeMessage.unpaired.wire) }
        remote = Remote(kind: .reconnect, id: remoteId, name: remoteName, nonce: remoteNonce, pub: Data())
        let text = BleHandshakeMessage.transcript(
          kind: .reconnect, remoteId: remoteId, hostId: hostId, remoteNonce: remoteNonce, hostNonce: nonce,
          remotePub: Data(), hostPub: Data())
        transcript = text
        let hostProof = BleCrypto.mac(key: peer.key, label: "host|", transcript: text)
        return .send(BleHandshakeMessage.challenge(hostId: hostId, hostName: hostName, nonce: nonce, pub: nil,
                                                   hostProof: hostProof).wire)
      }
    case let .proof(proof):
      guard let asker = remote, let text = transcript else { return .drop }
      switch asker.kind {
      case .reconnect:
        guard let peer = trusted(asker.id),
              BleCrypto.equal(proof, BleCrypto.mac(key: peer.key, label: "remote|", transcript: text)) else { return .drop }
        let key = BleCrypto.sessionKey(secret: SymmetricKey(data: peer.key), transcript: text, info: "lance-session")
        return .connected(remoteId: asker.id, send: BleHandshakeMessage.accept(hostProof: nil, paired: nil).wire,
                          session: BleSession(key: key, side: .host))
      case .pair:
        guard var current = offer else { return .refuse(send: BleHandshakeMessage.refused(.closed).wire) }
        var matched: Data?
        let verdict = current.check(remoteId: asker.id, now: now) { key in
          let ok = BleCrypto.equal(proof, BleCrypto.mac(key: key, label: "remote|", transcript: text))
          if ok { matched = key }
          return ok
        }
        offer = current
        switch verdict {
        case .accepted:
          guard let pairingKey = matched,
                let theirs = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: asker.pub),
                let shared = try? privateKey.sharedSecretFromKeyAgreement(with: theirs) else { return .drop }
          let key = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: text, sharedInfo: Data("lance-pair".utf8),
                                                   outputByteCount: 32)
          var session = BleSession(key: key, side: .host)
          let pairKey = newPairKey()
          guard let sealed = session.seal(RemoteMessage.paired(hostId: hostId, hostName: hostName, pairKey: pairKey).data)
          else { return .drop }
          let hostProof = BleCrypto.mac(key: pairingKey, label: "host|", transcript: text)
          return .paired(remote: TrustedPeer(id: asker.id, name: asker.name, key: pairKey),
                         send: BleHandshakeMessage.accept(hostProof: hostProof, paired: sealed).wire, session: session)
        case .wrongProof:
          return .refuse(send: BleHandshakeMessage.refused(.wrong).wire)
        case .expired:
          return .refuse(send: BleHandshakeMessage.refused(.expired).wire)
        case .locked:
          return .refuse(send: BleHandshakeMessage.refused(.locked).wire)
        case .taken:
          return .refuse(send: BleHandshakeMessage.refused(.used).wire)
        }
      }
    case .challenge, .accept, .refused, .unpaired:
      return .drop
    }
  }
}
