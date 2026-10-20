import XCTest
@testable import ReplayCore

private final class MemoryStore: PeerKeyStore {
  var peers: [TrustedPeer] = []
  func load() -> [TrustedPeer] { peers }
  func save(_ peers: [TrustedPeer]) { self.peers = peers }
}

final class TrustedPeersTests: XCTestCase {
  private func peer(_ id: String, name: String = "iPhone", key: UInt8 = 1) -> TrustedPeer {
    TrustedPeer(id: id, name: name, key: Data(repeating: key, count: 32))
  }

  func testAddedPeersSurviveANewInstance() {
    let store = MemoryStore()
    XCTAssertTrue(TrustedPeers(store: store).add(peer("a")))
    XCTAssertEqual(TrustedPeers(store: store).all, [peer("a")])
  }

  func testAddingTheSameIdReplacesNameAndKey() {
    let peers = TrustedPeers(store: MemoryStore())
    peers.add(peer("a", name: "Old", key: 1))
    XCTAssertTrue(peers.add(peer("a", name: "New", key: 2)))
    XCTAssertEqual(peers.all, [peer("a", name: "New", key: 2)])
  }

  func testTheFifthDistinctPeerIsRefused() {
    let peers = TrustedPeers(store: MemoryStore())
    for id in ["a", "b", "c", "d"] { XCTAssertTrue(peers.add(peer(id))) }
    XCTAssertFalse(peers.add(peer("e")))
    XCTAssertEqual(peers.all.map { $0.id }, ["a", "b", "c", "d"])
    XCTAssertTrue(peers.add(peer("b", name: "Renamed")), "an existing id can still be replaced when full")
  }

  func testRemoveDeletesAndPersists() {
    let store = MemoryStore()
    let peers = TrustedPeers(store: store)
    peers.add(peer("a"))
    peers.add(peer("b"))
    peers.remove(id: "a")
    XCTAssertEqual(peers.all.map { $0.id }, ["b"])
    XCTAssertEqual(store.peers.map { $0.id }, ["b"])
    peers.remove(id: "unknown")
    XCTAssertEqual(peers.all.count, 1)
  }

  func testLookupByIdAndUnknownIdIsNil() {
    let peers = TrustedPeers(store: MemoryStore())
    peers.add(peer("a", name: "Ana"))
    XCTAssertEqual(peers.peer(id: "a")?.name, "Ana")
    XCTAssertNil(peers.peer(id: "zzz"))
  }
}
