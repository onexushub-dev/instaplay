import Foundation

/// A phone this one trusts: the camera phone keeps its remotes, a remote phone keeps its camera phone.
public struct TrustedPeer: Equatable {
  public let id: String
  public let name: String
  /// The 32-byte key both phones got when they paired; it proves identity when they reconnect.
  public let key: Data

  public init(id: String, name: String, key: Data) {
    self.id = id
    self.name = name
    self.key = key
  }
}

/// Where the trusted list lives. The app uses the Keychain; tests use memory.
public protocol PeerKeyStore {
  func load() -> [TrustedPeer]
  func save(_ peers: [TrustedPeer])
}

public final class TrustedPeers {
  public static let limit = 4

  private let store: PeerKeyStore
  private var peers: [TrustedPeer]

  public init(store: PeerKeyStore) {
    self.store = store
    self.peers = store.load()
  }

  public var all: [TrustedPeer] { peers }

  public func peer(id: String) -> TrustedPeer? { peers.first { $0.id == id } }

  /// Adds a peer, or replaces the one with the same id (pairing again gives a new key). The list is kept oldest
  /// first, so a peer paired again moves to the end. False when the list is full and the id is new.
  @discardableResult
  public func add(_ peer: TrustedPeer) -> Bool {
    if let index = peers.firstIndex(where: { $0.id == peer.id }) {
      peers.remove(at: index)
      peers.append(peer)
    } else {
      guard peers.count < Self.limit else { return false }
      peers.append(peer)
    }
    store.save(peers)
    return true
  }

  /// Keeps only the `count` most recently paired peers; returns the ones it dropped (oldest first).
  @discardableResult
  public func keepNewest(_ count: Int) -> [TrustedPeer] {
    guard peers.count > count else { return [] }
    let dropped = Array(peers.prefix(peers.count - max(0, count)))
    peers.removeFirst(dropped.count)
    store.save(peers)
    return dropped
  }

  public func remove(id: String) {
    guard peers.contains(where: { $0.id == id }) else { return }
    peers.removeAll { $0.id == id }
    store.save(peers)
  }
}
