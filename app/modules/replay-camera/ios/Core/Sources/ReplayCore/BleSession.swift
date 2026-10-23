import CryptoKit
import Foundation

/// What opens every message on the BLE link: a handshake step (JSON) or, once the handshake is done, a sealed message.
public enum BleWire {
  public static let handshake: UInt8 = 0x01
  public static let sealed: UInt8 = 0x02
  public static let nonceSize = 16
}

/// The encrypted link after a handshake: every message is sealed with ChaChaPoly under the session key. The nonce is the
/// sender's side plus a counter that only goes up, so a message cannot be read, changed or replayed by someone listening.
/// Wire: `[0x02][counter, 8 bytes big-endian][ciphertext][tag, 16 bytes]`.
public struct BleSession {
  public enum Side { case host, remote }

  public let side: Side
  private let key: SymmetricKey
  private var sent: UInt64 = 0
  private var received: UInt64 = 0

  public init(key: SymmetricKey, side: Side) {
    self.key = key
    self.side = side
  }

  /// nil only if CryptoKit fails, which does not happen with a valid 32-byte key.
  public mutating func seal(_ plain: Data) -> Data? {
    let counter = sent + 1
    guard let box = try? ChaChaPoly.seal(plain, using: key, nonce: Self.nonce(side: side, counter: counter)) else { return nil }
    sent = counter
    var wire = Data([BleWire.sealed])
    wire.append(Self.bigEndian(counter))
    wire.append(box.ciphertext)
    wire.append(box.tag)
    return wire
  }

  /// nil for anything that is not a newer message from the other side sealed with this key.
  public mutating func open(_ wire: Data) -> Data? {
    let bytes = [UInt8](wire)
    guard bytes.count >= 1 + 8 + 16, bytes[0] == BleWire.sealed else { return nil }
    var counter: UInt64 = 0
    for byte in bytes[1..<9] { counter = counter << 8 | UInt64(byte) }
    guard counter > received else { return nil }
    let other: Side = side == .host ? .remote : .host
    let ciphertext = Data(bytes[9..<(bytes.count - 16)])
    let tag = Data(bytes[(bytes.count - 16)...])
    guard let box = try? ChaChaPoly.SealedBox(nonce: Self.nonce(side: other, counter: counter), ciphertext: ciphertext, tag: tag),
          let plain = try? ChaChaPoly.open(box, using: key) else { return nil }
    received = counter
    return plain
  }

  private static func nonce(side: Side, counter: UInt64) -> ChaChaPoly.Nonce {
    var bytes: [UInt8] = side == .host ? [0x48, 0, 0, 0] : [0x52, 0, 0, 0]
    bytes.append(contentsOf: bigEndian(counter))
    // 12 bytes is always a valid ChaChaPoly nonce.
    return (try? ChaChaPoly.Nonce(data: bytes)) ?? ChaChaPoly.Nonce()
  }

  private static func bigEndian(_ value: UInt64) -> Data {
    Data((0..<8).map { UInt8(truncatingIfNeeded: value >> (56 - 8 * $0)) })
  }
}

/// Small crypto helpers shared by both sides of the handshake.
public enum BleCrypto {
  public static func randomBytes(_ count: Int) -> Data {
    Data((0..<count).map { _ in UInt8.random(in: 0...255) })
  }

  /// HMAC-SHA256 of `label | transcript` under `key`.
  public static func mac(key: Data, label: String, transcript: Data) -> Data {
    var message = Data(label.utf8)
    message.append(transcript)
    return Data(HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key)))
  }

  public static func equal(_ a: Data, _ b: Data) -> Bool {
    let x = [UInt8](a)
    let y = [UInt8](b)
    guard x.count == y.count else { return false }
    var difference: UInt8 = 0
    for (p, q) in zip(x, y) { difference |= p ^ q }
    return difference == 0
  }

  /// 32-byte session key from a shared secret, bound to this exact handshake.
  public static func sessionKey(secret: SymmetricKey, transcript: Data, info: String) -> SymmetricKey {
    HKDF<SHA256>.deriveKey(inputKeyMaterial: secret, salt: transcript, info: Data(info.utf8), outputByteCount: 32)
  }
}
