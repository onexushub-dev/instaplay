import Foundation
import Security
import UIKit

/// Small wrapper over the Keychain's generic passwords. Items survive reinstalls and are readable after the first
/// unlock, which is when the app can run.
enum Keychain {
  private static let service = "lance.remote"

  private static func match(_ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  static func read(account: String) -> Data? {
    var query = match(account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
    return result as? Data
  }

  static func write(_ data: Data, account: String) {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    if SecItemUpdate(match(account) as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
      var item = match(account)
      item.merge(attributes) { _, new in new }
      SecItemAdd(item as CFDictionary, nil)
    }
  }
}

/// The trusted list of one role (camera phone: its remotes; remote phone: its camera phone), kept in the Keychain.
final class KeychainPeerStore: PeerKeyStore {
  private struct Item: Codable {
    let id: String
    let name: String
    let key: String
  }

  private let account: String

  init(account: String) { self.account = account }

  func load() -> [TrustedPeer] {
    guard let data = Keychain.read(account: account),
          let items = try? JSONDecoder().decode([Item].self, from: data) else { return [] }
    return items.compactMap { item in
      Data(base64Encoded: item.key).map { TrustedPeer(id: item.id, name: item.name, key: $0) }
    }
  }

  func save(_ peers: [TrustedPeer]) {
    let items = peers.map { Item(id: $0.id, name: $0.name, key: $0.key.base64EncodedString()) }
    if let data = try? JSONEncoder().encode(items) { Keychain.write(data, account: account) }
  }
}

/// Who this phone is to the other one: a random id that stays the same, and a name to show.
enum DeviceIdentity {
  private static let account = "lance.remote.deviceId"

  static var id: String {
    if let data = Keychain.read(account: account), let saved = String(data: data, encoding: .utf8) { return saved }
    let fresh = UUID().uuidString
    Keychain.write(Data(fresh.utf8), account: account)
    return fresh
  }

  /// Since iOS 16 the system name is just "iPhone" for apps without a special entitlement; two of those would look
  /// identical, so a few characters of the id are added.
  static var name: String {
    let system = UIDevice.current.name
    return system == "iPhone" || system == "iPad" ? "\(system) \(id.prefix(4).uppercased())" : system
  }
}
