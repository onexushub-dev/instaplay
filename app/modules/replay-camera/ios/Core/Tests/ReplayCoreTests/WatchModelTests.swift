import XCTest
@testable import ReplayCore

// WatchModel.swift is the watch app's own file, symlinked into this test target.
final class WatchModelTests: XCTestCase {
  func testIdleWhenNotRecording() {
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: true, clipCount: 0, startedAtMs: nil), .idle)
    // an old state heard before the phone went away still reads as idle
    XCTAssertEqual(WatchModel.screen(recording: false, reachable: false, clipCount: 4, startedAtMs: 1), .idle)
  }

  func testOfflineWhenRecordingButPhoneUnreachable() {
    XCTAssertEqual(WatchModel.screen(recording: true, reachable: false, clipCount: 2, startedAtMs: 1_000), .offline)
  }

  func testRecordingCarriesCountAndStart() {
    let screen = WatchModel.screen(recording: true, reachable: true, clipCount: 3, startedAtMs: 1_700_000_000_000)
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
}
