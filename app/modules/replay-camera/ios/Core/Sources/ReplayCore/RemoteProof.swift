import CryptoKit
import Foundation

/// Proof that a remote phone knows a secret, without sending it: an HMAC-SHA256 of the purpose, a timestamp and the
/// remote's id. Used to pair (key = the QR secret or the 6-digit code) and to reconnect (key = the pair key).
public enum RemoteProof {
  public enum Purpose: String { case pair, reconnect }

  /// A proof is believed only when its timestamp is this close (seconds) to the receiver's clock.
  public static let window = 60.0

  /// Lowercase hex. `at` is ms since 1970.
  public static func make(key: Data, purpose: Purpose, remoteId: String, at: Double) -> String {
    let message = Data("\(purpose.rawValue)|\(Int64(at))|\(remoteId)".utf8)
    let mac = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key))
    return mac.map { String(format: "%02x", $0) }.joined()
  }

  /// `at` is the timestamp the remote used; `now` is the receiver's clock (both ms since 1970).
  public static func verify(_ proof: String, key: Data, purpose: Purpose, remoteId: String, at: Double, now: Double) -> Bool {
    guard abs(now - at) <= window * 1000 else { return false }
    let expected = Array(make(key: key, purpose: purpose, remoteId: remoteId, at: at).utf8)
    let given = Array(proof.utf8)
    guard expected.count == given.count else { return false }
    var difference: UInt8 = 0
    for (a, b) in zip(expected, given) { difference |= a ^ b }
    return difference == 0
  }
}
