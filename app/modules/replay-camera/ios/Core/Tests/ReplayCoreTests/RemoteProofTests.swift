import XCTest
@testable import ReplayCore

final class RemoteProofTests: XCTestCase {
  private let key = Data("key".utf8)
  private let at = 1_700_000_000_000.0

  private func proof(_ purpose: RemoteProof.Purpose = .pair, key: Data? = nil, remoteId: String = "remote-1") -> String {
    RemoteProof.make(key: key ?? self.key, purpose: purpose, remoteId: remoteId, at: at)
  }

  private func verify(_ proof: String, purpose: RemoteProof.Purpose = .pair, key: Data? = nil,
                      remoteId: String = "remote-1", now: Double? = nil) -> Bool {
    RemoteProof.verify(proof, key: key ?? self.key, purpose: purpose, remoteId: remoteId, at: at, now: now ?? at)
  }

  /// Computed independently with Python's hmac/hashlib over "<purpose>|1700000000000|remote-1".
  func testKnownVectors() {
    XCTAssertEqual(proof(.pair), "91384218a210d76de17540fd2bb2f7580ec1f998f8aadc966b67f8cf49ed1819")
    XCTAssertEqual(proof(.reconnect), "78a813f8d7812c2c62d17ad5f50c76769e5c477e47c509fd8c1c04f02705d67c")
  }

  func testVerifyAcceptsInsideTheWindow() {
    let p = proof()
    for now in [at, at + 59_000, at - 59_000] {
      XCTAssertTrue(verify(p, now: now), "now = at + \(now - at) ms")
    }
  }

  func testVerifyRejectsOutsideTheWindow() {
    let p = proof()
    XCTAssertFalse(verify(p, now: at + 61_000))
    XCTAssertFalse(verify(p, now: at - 61_000))
  }

  func testVerifyRejectsAnyMismatch() {
    let p = proof()
    XCTAssertFalse(verify(p, key: Data("other".utf8)))
    XCTAssertFalse(verify(p, remoteId: "remote-2"))
    XCTAssertFalse(verify(p, purpose: .reconnect))
    let flipped = String(p.dropLast()) + (p.last == "0" ? "1" : "0")
    XCTAssertFalse(verify(flipped))
    XCTAssertFalse(verify(""))
    XCTAssertFalse(verify(String(p.dropLast())))
    XCTAssertFalse(verify(p + "0"))
  }
}
