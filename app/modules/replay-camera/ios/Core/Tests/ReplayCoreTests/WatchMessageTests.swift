import XCTest
@testable import ReplayCore

final class WatchMessageTests: XCTestCase {
  func testKeysAreFixed() {
    XCTAssertEqual(WatchMessage.save.payload["cmd"] as? String, "save")
    let state = WatchMessage.state(recording: true, clipCount: 3, startedAt: 1_700_000_000_000).payload
    XCTAssertEqual(Set(state.keys), ["recording", "clipCount", "startedAt"])
    XCTAssertEqual(WatchMessage.start.payload["cmd"] as? String, "start")
    XCTAssertEqual(WatchMessage.stop.payload["cmd"] as? String, "stop")
    XCTAssertEqual(WatchMessage.preview(on: true).payload["preview"] as? Bool, true)
    XCTAssertEqual(WatchMessage.result(saved: true).payload["result"] as? String, "saved")
    XCTAssertEqual(WatchMessage.result(saved: false).payload["result"] as? String, "failed")
  }

  func testRoundTrips() {
    let cases: [WatchMessage] = [
      .save,
      .start,
      .stop,
      .state(recording: true, clipCount: 3, startedAt: 1_700_000_000_000),
      .state(recording: false, clipCount: 0, startedAt: nil),
      .result(saved: true),
      .result(saved: false),
      .preview(on: true),
      .preview(on: false),
    ]
    for message in cases { XCTAssertEqual(WatchMessage.decode(message.payload), message) }
  }

  func testIdleStateOmitsStartedAt() {
    let payload = WatchMessage.state(recording: false, clipCount: 0, startedAt: nil).payload
    XCTAssertNil(payload["startedAt"])
  }

  func testDecodeRejectsAnythingMalformed() {
    XCTAssertNil(WatchMessage.decode([:]))
    XCTAssertNil(WatchMessage.decode(["cmd": "delete"]))
    XCTAssertNil(WatchMessage.decode(["recording": true, "clipCount": "3"]))
    XCTAssertNil(WatchMessage.decode(["recording": true, "clipCount": -1]))
    XCTAssertNil(WatchMessage.decode(["result": "maybe"]))
    XCTAssertNil(WatchMessage.decode(["preview": "yes"]))
  }

  func testNumbersFromWatchConnectivityDecode() {
    // WatchConnectivity hands numbers back as NSNumber.
    let payload: [String: Any] = ["recording": NSNumber(value: true), "clipCount": NSNumber(value: 2), "startedAt": NSNumber(value: 5.0)]
    XCTAssertEqual(WatchMessage.decode(payload), .state(recording: true, clipCount: 2, startedAt: 5.0))
  }
}
