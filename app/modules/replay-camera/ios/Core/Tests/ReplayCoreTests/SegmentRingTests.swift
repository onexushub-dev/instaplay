import Foundation
import XCTest
@testable import ReplayCore

final class FakeFileOps: FileOps {
  var deleted: [URL] = []
  var created: [URL] = []
  var listing: [URL] = []

  func delete(_ url: URL) { deleted.append(url) }
  func list(_ dir: URL) -> [URL] { listing }
  func exists(_ url: URL) -> Bool { !deleted.contains(url) }
}

private func url(_ i: Int) -> URL { URL(fileURLWithPath: "/tmp/replay-buffer/\(i).m4s") }
private func seg(_ i: Int) -> Segment { Segment(url: url(i), startTime: Double(2 * i), duration: 2) }
private let dest = URL(fileURLWithPath: "/tmp/clips/clip.mp4")

final class SegmentRingTests: XCTestCase {
  func test_appendBeyondCapacityEvictsAndDeletesOldest() {
    let ops = FakeFileOps()
    let ring = SegmentRing(capacity: 30, fileOps: ops)
    for i in 0..<31 { ring.append(seg(i)) }
    XCTAssertEqual(ring.snapshot(lastSeconds: 600).count, 30)
    XCTAssertEqual(ops.deleted, [url(0)])
  }

  func test_snapshotReturnsLast60s() {
    let ring = SegmentRing(capacity: 30, fileOps: FakeFileOps())
    for i in 0..<30 { ring.append(seg(i)) }
    XCTAssertEqual(ring.snapshot(lastSeconds: 60).map(\.startTime).first, 0)
    XCTAssertEqual(ring.snapshot(lastSeconds: 10).count, 5)
  }

  func test_snapshotWithFewSegments() throws {
    let ring = SegmentRing(capacity: 30, fileOps: FakeFileOps())
    for i in 0..<3 { ring.append(seg(i)) }
    XCTAssertEqual(try ring.copyClip(lastSeconds: 60, to: dest, concat: { _, _ in }), 6, accuracy: 0.001)
  }

  func test_savedClipSurvivesEviction() throws {
    let ops = FakeFileOps()
    let ring = SegmentRing(capacity: 30, fileOps: ops)
    for i in 0..<30 { ring.append(seg(i)) }
    _ = try ring.copyClip(lastSeconds: 60, to: dest, concat: { _, d in ops.created.append(d) })
    for i in 30..<60 { ring.append(seg(i)) }
    XCTAssertEqual(ops.created, [dest])
    XCTAssertFalse(ops.deleted.contains(dest))
    XCTAssertEqual(ops.deleted.count, 30)
  }

  func test_copyClipPassesSegmentsOldestFirst() throws {
    let ring = SegmentRing(capacity: 30, fileOps: FakeFileOps())
    for i in 0..<4 { ring.append(seg(i)) }
    var passed: [URL] = []
    _ = try ring.copyClip(lastSeconds: 60, to: dest, concat: { s, _ in passed = s.map(\.url) })
    XCTAssertEqual(passed, [url(0), url(1), url(2), url(3)])
  }

  func test_clearDeletesAll() {
    let ops = FakeFileOps()
    let ring = SegmentRing(capacity: 30, fileOps: ops)
    for i in 0..<5 { ring.append(seg(i)) }
    ring.clear()
    XCTAssertEqual(ops.deleted.count, 5)
    XCTAssertTrue(ring.snapshot(lastSeconds: 60).isEmpty)
  }

  func test_purgeOrphansRemovesLeftoverFiles() {
    let ops = FakeFileOps()
    ops.listing = [url(7), url(8), url(9)]
    SegmentRing.purgeOrphans(dir: URL(fileURLWithPath: "/tmp/replay-buffer"), fileOps: ops)
    XCTAssertEqual(ops.deleted, [url(7), url(8), url(9)])
  }
}
