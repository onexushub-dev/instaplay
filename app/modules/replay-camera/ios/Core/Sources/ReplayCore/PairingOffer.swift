import Foundation

/// One pairing attempt on the camera phone: a QR secret and a 6-digit code that stop working after two minutes or
/// after five wrong proofs. The remote phone proves it knows one of them with `RemoteProof` (purpose `.pair`).
public struct PairingOffer {
  public static let validFor = 120.0
  public static let maxAttempts = 5

  public enum Verdict: Equatable {
    case accepted
    case wrongProof(attemptsLeft: Int)
    case expired
    case locked
  }

  public let hostId: String
  public let hostName: String
  public let secret: Data
  public let code: String
  /// ms since 1970.
  public let createdAt: Double
  public private(set) var failedAttempts = 0

  public init(hostId: String, hostName: String, secret: Data, code: String, createdAt: Double) {
    self.hostId = hostId
    self.hostName = hostName
    self.secret = secret
    self.code = code
    self.createdAt = createdAt
  }

  public static func make(hostId: String, hostName: String, now: Double) -> PairingOffer {
    let secret = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
    let code = String(format: "%06d", Int.random(in: 0..<1_000_000))
    return PairingOffer(hostId: hostId, hostName: hostName, secret: secret, code: code, createdAt: now)
  }

  /// `at` is the timestamp the remote used in its proof; `now` is this phone's clock (both ms since 1970).
  /// Only a wrong proof uses up an attempt.
  public mutating func check(proof: String, remoteId: String, at: Double, now: Double) -> Verdict {
    if now - createdAt > Self.validFor * 1000 { return .expired }
    if failedAttempts >= Self.maxAttempts { return .locked }
    for key in [secret, Data(code.utf8)]
    where RemoteProof.verify(proof, key: key, purpose: .pair, remoteId: remoteId, at: at, now: now) {
      return .accepted
    }
    failedAttempts += 1
    return .wrongProof(attemptsLeft: Self.maxAttempts - failedAttempts)
  }

  public func secondsLeft(now: Double) -> Double {
    max(0, Self.validFor - (now - createdAt) / 1000)
  }

  /// What the QR code holds. The Camera app of the remote phone opens it, and expo-router lands on `/pair`.
  public var qrURL: String {
    let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+#"))
    let name = hostName.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    let encodedSecret = secret.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return "lance://pair?h=\(hostId)&s=\(encodedSecret)&n=\(name)"
  }
}
