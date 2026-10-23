import CryptoKit
import XCTest
@testable import ReplayCore

final class BleHandshakeTests: XCTestCase {
  private let secret = Data((0..<16).map { UInt8($0) })
  private let code = "042517"
  private let t0 = 1_700_000_000_000.0
  private let pairKey = Data((0..<32).map { UInt8(200 - $0) })

  private func makeOffer() -> PairingOffer {
    PairingOffer(hostId: "h1", hostName: "Quadra 1", secret: secret, code: code, createdAt: t0)
  }

  private func host() -> BleHostHandshake { BleHostHandshake(hostId: "h1", hostName: "Quadra 1") }

  private func sendData(_ outcome: BleRemoteHandshake.Outcome, file: StaticString = #filePath, line: UInt = #line) -> Data {
    guard case let .send(data) = outcome else {
      XCTFail("expected send, got \(outcome)", file: file, line: line)
      return Data()
    }
    return data
  }

  private func sendData(_ outcome: BleHostHandshake.Outcome, file: StaticString = #filePath, line: UInt = #line) -> Data {
    guard case let .send(data) = outcome else {
      XCTFail("expected send, got \(outcome)", file: file, line: line)
      return Data()
    }
    return data
  }

  /// Runs a pairing to the end with `key` on the remote side; returns both outcomes.
  private func pair(key: Data, offer: inout PairingOffer?) -> (BleHostHandshake.Outcome, BleRemoteHandshake.Outcome?) {
    var camera = host()
    var remote = BleRemoteHandshake(mode: .pair(key: key), remoteId: "r1", remoteName: "XR")
    let challenge = camera.receive(remote.hello(), offer: &offer, trusted: { _ in nil }, now: t0 + 1_000)
    guard case let .send(challengeData) = challenge else { return (challenge, nil) }
    let proof = sendData(remote.receive(challengeData))
    let result = camera.receive(proof, offer: &offer, trusted: { _ in nil }, now: t0 + 2_000, newPairKey: { self.pairKey })
    switch result {
    case let .paired(_, send, _), let .refuse(send):
      return (result, remote.receive(send))
    default:
      return (result, nil)
    }
  }

  // MARK: Pairing

  func testPairingWithTheQRSecretGivesBothSidesTheSameKeyAndAWorkingSession() {
    var offer: PairingOffer? = makeOffer()
    let (hostOutcome, remoteOutcome) = pair(key: secret, offer: &offer)
    guard case .paired(let remote, _, var hostSession) = hostOutcome,
          case .paired(let camera, var remoteSession)? = remoteOutcome else {
      return XCTFail("pairing did not finish: \(hostOutcome) / \(String(describing: remoteOutcome))")
    }
    XCTAssertEqual(remote, TrustedPeer(id: "r1", name: "XR", key: pairKey))
    XCTAssertEqual(camera, TrustedPeer(id: "h1", name: "Quadra 1", key: pairKey))
    // The link keeps going on the pairing session, both ways.
    let save = remoteSession.seal(RemoteMessage.save.data)
    XCTAssertEqual(save.flatMap { hostSession.open($0) }.flatMap { RemoteMessage.decode(data: $0) }, .save)
    let state = hostSession.seal(RemoteMessage.result(saved: true).data)
    XCTAssertEqual(state.flatMap { remoteSession.open($0) }.flatMap { RemoteMessage.decode(data: $0) }, .result(saved: true))
  }

  func testPairingWithTheSixDigitCodeWorks() {
    var offer: PairingOffer? = makeOffer()
    let (hostOutcome, remoteOutcome) = pair(key: Data(code.utf8), offer: &offer)
    guard case .paired = hostOutcome, case .paired? = remoteOutcome else { return XCTFail("code pairing failed") }
  }

  func testAWrongCodeIsRefusedAndUsesAnAttempt() {
    var offer: PairingOffer? = makeOffer()
    let (hostOutcome, remoteOutcome) = pair(key: Data("999999".utf8), offer: &offer)
    guard case .refuse = hostOutcome else { return XCTFail("expected refuse") }
    guard case .failed(.refused(.wrong))? = remoteOutcome else { return XCTFail("remote should hear 'wrong'") }
    XCTAssertEqual(offer.map { $0.failedAttempts }, 1)
  }

  func testAnExpiredOfferIsRefusedAsExpired() {
    var offer: PairingOffer? = makeOffer()
    var camera = host()
    var remote = BleRemoteHandshake(mode: .pair(key: secret), remoteId: "r1", remoteName: "XR")
    let challenge = sendData(camera.receive(remote.hello(), offer: &offer, trusted: { _ in nil }, now: t0))
    let proof = sendData(remote.receive(challenge))
    let late = t0 + (PairingOffer.validFor + 1) * 1000
    guard case let .refuse(send) = camera.receive(proof, offer: &offer, trusted: { _ in nil }, now: late) else {
      return XCTFail("expected refuse")
    }
    guard case .failed(.refused(.expired)) = remote.receive(send) else { return XCTFail("remote should hear 'expired'") }
  }

  func testPairingWithNoOpenOfferIsRefusedAsClosed() {
    var offer: PairingOffer?
    let remote = BleRemoteHandshake(mode: .pair(key: secret), remoteId: "r1", remoteName: "XR")
    var camera = host()
    guard case .refuse = camera.receive(remote.hello(), offer: &offer, trusted: { _ in nil }, now: t0) else {
      return XCTFail("expected refuse")
    }
  }

  func testAFakeCameraThatDoesNotKnowTheCodeCannotHandOutAKey() {
    // The fake camera has its own offer with another secret: the remote's proof fails there, and even if the fake
    // camera answered "accept", the remote checks the camera's own proof.
    var fakeOffer: PairingOffer? = PairingOffer(hostId: "h1", hostName: "Quadra 1", secret: Data(repeating: 9, count: 16),
                                                code: "111111", createdAt: t0)
    let (_, remoteOutcome) = pair(key: secret, offer: &fakeOffer)
    guard case .failed? = remoteOutcome else { return XCTFail("remote must not pair with a camera that lacks the code") }
  }

  // MARK: Reconnect

  private func reconnect(remoteKey: Data, hostKey: Data?) -> (BleHostHandshake.Outcome?, BleRemoteHandshake.Outcome) {
    var offer: PairingOffer?
    var camera = host()
    var remote = BleRemoteHandshake(mode: .reconnect(host: TrustedPeer(id: "h1", name: "Quadra 1", key: remoteKey)),
                                    remoteId: "r1", remoteName: "XR")
    let trusted: (String) -> TrustedPeer? = { id in
      guard id == "r1", let hostKey else { return nil }
      return TrustedPeer(id: "r1", name: "XR", key: hostKey)
    }
    let first = camera.receive(remote.hello(), offer: &offer, trusted: trusted, now: t0)
    switch first {
    case let .send(challenge):
      let answer = remote.receive(challenge)
      guard case let .send(proof) = answer else { return (nil, answer) }
      let result = camera.receive(proof, offer: &offer, trusted: trusted, now: t0)
      switch result {
      case let .connected(_, send, _): return (result, remote.receive(send))
      default: return (result, answer)
      }
    case let .refuse(send):
      return (first, remote.receive(send))
    default:
      return (first, .failed(.malformed))
    }
  }

  func testReconnectWithTheSameKeyConnectsBothSides() {
    let (hostOutcome, remoteOutcome) = reconnect(remoteKey: pairKey, hostKey: pairKey)
    guard case .connected(let id, _, var hostSession)? = hostOutcome,
          case .connected(var remoteSession) = remoteOutcome else { return XCTFail("reconnect failed") }
    XCTAssertEqual(id, "r1")
    let sealed = remoteSession.seal(RemoteMessage.stop.data)
    XCTAssertEqual(sealed.flatMap { hostSession.open($0) }.flatMap { RemoteMessage.decode(data: $0) }, .stop)
  }

  func testAnUnknownRemoteHearsUnpaired() {
    let (_, remoteOutcome) = reconnect(remoteKey: pairKey, hostKey: nil)
    guard case .failed(.unpaired) = remoteOutcome else { return XCTFail("expected unpaired") }
  }

  func testAWrongKeyOnTheCameraIsCaughtByTheRemoteFirst() {
    // The camera answers with a proof made with another key: the remote stops before proving anything.
    let (hostOutcome, remoteOutcome) = reconnect(remoteKey: pairKey, hostKey: Data(repeating: 1, count: 32))
    XCTAssertNil(hostOutcome)
    guard case .failed(.wrongHost) = remoteOutcome else { return XCTFail("expected wrongHost") }
  }

  func testAReconnectFromAnotherCameraIdIsRefusedByTheRemote() {
    var offer: PairingOffer?
    var other = BleHostHandshake(hostId: "h2", hostName: "Outra")
    var remote = BleRemoteHandshake(mode: .reconnect(host: TrustedPeer(id: "h1", name: "Quadra 1", key: pairKey)),
                                    remoteId: "r1", remoteName: "XR")
    let challenge = sendData(other.receive(remote.hello(), offer: &offer, trusted: { _ in TrustedPeer(id: "r1", name: "XR", key: self.pairKey) }, now: t0))
    guard case .failed(.wrongHost) = remote.receive(challenge) else { return XCTFail("expected wrongHost") }
  }

  func testTheCameraDropsAWrongReconnectProofSilently() {
    var offer: PairingOffer?
    var camera = host()
    let remote = BleRemoteHandshake(mode: .reconnect(host: TrustedPeer(id: "h1", name: "Quadra 1", key: pairKey)),
                                    remoteId: "r1", remoteName: "XR")
    _ = camera.receive(remote.hello(), offer: &offer, trusted: { _ in TrustedPeer(id: "r1", name: "XR", key: self.pairKey) }, now: t0)
    let forged = BleHandshakeMessage.proof(Data(repeating: 0, count: 32)).wire
    guard case .drop = camera.receive(forged, offer: &offer, trusted: { _ in TrustedPeer(id: "r1", name: "XR", key: self.pairKey) }, now: t0) else {
      return XCTFail("expected drop")
    }
  }

  // MARK: Session

  func testASessionRefusesReplayedTamperedAndForeignMessages() {
    let key = SymmetricKeyFixture.key
    var sender = BleSession(key: key, side: .remote)
    var receiver = BleSession(key: key, side: .host)
    guard let first = sender.seal(Data("one".utf8)), let second = sender.seal(Data("two".utf8)) else {
      return XCTFail("seal failed")
    }
    XCTAssertEqual(receiver.open(first), Data("one".utf8))
    XCTAssertEqual(receiver.open(second), Data("two".utf8))
    XCTAssertNil(receiver.open(first), "a replayed message must be refused")

    guard var tampered = sender.seal(Data("three".utf8)) else { return XCTFail("seal failed") }
    tampered[tampered.count - 1] ^= 0xFF
    XCTAssertNil(receiver.open(tampered), "a changed message must be refused")

    // A message sealed by the same side (a reflected message) does not open either.
    var sameSide = BleSession(key: key, side: .host)
    guard let reflected = sameSide.seal(Data("four".utf8)) else { return XCTFail("seal failed") }
    XCTAssertNil(receiver.open(reflected))
  }

  func testGarbageIsNotAHandshakeMessage() {
    XCTAssertNil(BleHandshakeMessage.decode(Data([0x01, 0x7B])))
    XCTAssertNil(BleHandshakeMessage.decode(Data("{\"t\":\"hello\"}".utf8)))
    var remote = BleRemoteHandshake(mode: .pair(key: secret), remoteId: "r1", remoteName: "XR")
    guard case .failed(.malformed) = remote.receive(Data([0x02, 0, 0])) else { return XCTFail("expected malformed") }
  }
}

private enum SymmetricKeyFixture {
  static let key = SymmetricKey(data: Data((0..<32).map { UInt8($0) }))
}
