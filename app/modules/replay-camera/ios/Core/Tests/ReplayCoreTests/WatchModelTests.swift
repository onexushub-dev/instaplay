import XCTest
@testable import ReplayCore

// WatchModel.swift is the watch app's own file, symlinked into this test target.
final class WatchModelTests: XCTestCase {
  func testIdleWhenNotRecording() {
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil, stateAge: 0), .idle)
    // an old state heard before the phone went away still reads as idle
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: false, clipCount: 4, startedAtMs: 1, stateAge: 0), .idle)
  }

  func testOfflineWhenRecordingButPhoneUnreachable() {
    XCTAssertEqual(WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1_000, stateAge: 0), .offline)
  }

  func testRecordingCarriesCountAndStart() {
    let screen = WatchModel.screen(recording: true, reachable: true, clipCount: 3, startedAtMs: 1_700_000_000_000, stateAge: 1)
    XCTAssertEqual(screen, .recording(clipCount: 3, startedAt: Date(timeIntervalSince1970: 1_700_000_000)))
  }

  func testElapsedFormat() {
    let start = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: 75)), "01:15")
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: 3_725)), "1:02:05")
    XCTAssertEqual(WatchModel.elapsed(since: start, now: Date(timeIntervalSince1970: -5)), "00:00")
  }

  func testCountLabel() {
    XCTAssertEqual(WatchModel.countLabel(0), "0 clipes")
    XCTAssertEqual(WatchModel.countLabel(1), "1 clipe")
    XCTAssertEqual(WatchModel.countLabel(12), "12 clipes")
  }

  func testPreviewIsWantedOnlyWhenOnReachableAndRecording() {
    XCTAssertTrue(WatchModel.previewWanted(viewOn: true, reachable: true, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: false, reachable: true, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: true, reachable: false, recording: true))
    XCTAssertFalse(WatchModel.previewWanted(viewOn: true, reachable: true, recording: false))
  }

  func testARecordingThePhoneStopsReportingIsOffline() {
    // Phone app killed while still in range: the link stays "reachable" but the heartbeat stops.
    let stale = WatchModel.staleAfter + 1
    XCTAssertEqual(WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: stale), .offline)
    XCTAssertEqual(
      WatchModel.screen(recording: true, reachable: true, clipCount: 2, startedAtMs: 1, stateAge: WatchModel.staleAfter - 1),
      .recording(clipCount: 2, startedAt: Date(timeIntervalSince1970: 0.001)))
    // an old idle state is still idle, not offline
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil, stateAge: stale), .idle)
  }

  func testTheHeartbeatBeatsTheStaleLimitWithRoomToSpare() {
    XCTAssertGreaterThanOrEqual(WatchModel.staleAfter, 2 * WatchModel.heartbeat)
  }

  func testTapsCloserThanTheSaveCooldownAreIgnored() {
    // Sleeves, sweat and balls touch a full-screen target: one save per cooldown, and no click for the rest.
    XCTAssertTrue(WatchModel.canSave(now: 100, lastSave: nil))
    XCTAssertFalse(WatchModel.canSave(now: 101, lastSave: 100))
    XCTAssertTrue(WatchModel.canSave(now: 103.1, lastSave: 100))
  }
}
