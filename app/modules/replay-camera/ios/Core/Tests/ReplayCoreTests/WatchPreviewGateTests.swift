import XCTest
@testable import ReplayCore

final class WatchPreviewGateTests: XCTestCase {
  func testEncodesOnlyWhileTheWatchKeepsAsking() {
    XCTAssertFalse(WatchPreviewGate.shouldEncode(now: 10, lastFrame: 0, lastAsk: nil, busy: false))
    XCTAssertTrue(WatchPreviewGate.shouldEncode(now: 10, lastFrame: 0, lastAsk: 9.5, busy: false))
    // the watch went quiet (screen asleep): frames stop within the timeout
    XCTAssertFalse(WatchPreviewGate.shouldEncode(now: 10, lastFrame: 0, lastAsk: 7.4, busy: false))
    XCTAssertTrue(WatchPreviewGate.shouldEncode(now: 10, lastFrame: 0, lastAsk: 7.6, busy: false))
  }

  func testThrottlesToAboutThreeFramesASecondAndNeverQueues() {
    XCTAssertFalse(WatchPreviewGate.shouldEncode(now: 10.2, lastFrame: 10, lastAsk: 10, busy: false))
    XCTAssertTrue(WatchPreviewGate.shouldEncode(now: 10.34, lastFrame: 10, lastAsk: 10, busy: false))
    XCTAssertFalse(WatchPreviewGate.shouldEncode(now: 11, lastFrame: 10, lastAsk: 11, busy: true))
  }

  func testTargetSizeKeepsTheShapeAndNeverUpscales() {
    XCTAssertEqual(WatchPreviewGate.targetSize(width: 1920, height: 1080).width, 240)
    XCTAssertEqual(WatchPreviewGate.targetSize(width: 1920, height: 1080).height, 135)
    XCTAssertEqual(WatchPreviewGate.targetSize(width: 1080, height: 1920).width, 135)
    XCTAssertEqual(WatchPreviewGate.targetSize(width: 1080, height: 1920).height, 240)
    XCTAssertEqual(WatchPreviewGate.targetSize(width: 160, height: 90).width, 160)
  }
}
