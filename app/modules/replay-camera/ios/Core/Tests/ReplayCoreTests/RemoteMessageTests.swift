import XCTest
@testable import ReplayCore

final class RemoteMessageTests: XCTestCase {
  private let key = Data((0..<32).map { UInt8($0) })

  func testKeysAreFixed() {
    XCTAssertEqual(RemoteMessage.save.payload["cmd"] as? String, "save")
    XCTAssertEqual(RemoteMessage.stop.payload["cmd"] as? String, "stop")
    XCTAssertEqual(RemoteMessage.forget.payload["cmd"] as? String, "forget")
    XCTAssertEqual(RemoteMessage.start.payload["cmd"] as? String, "start")
    XCTAssertEqual(RemoteMessage.preview(on: true).payload["on"] as? Bool, true)
    let state = RemoteMessage.state(recording: true, clipCount: 3, startedAt: 1_700_000_000_000).payload
    XCTAssertEqual(Set(state.keys), ["recording", "clipCount", "startedAt"])
    XCTAssertEqual(RemoteMessage.result(saved: true).payload["result"] as? String, "saved")
    XCTAssertEqual(RemoteMessage.result(saved: false).payload["result"] as? String, "failed")
    XCTAssertEqual(RemoteMessage.unpaired.payload["unpaired"] as? Bool, true)
    XCTAssertEqual(RemoteMessage.refused(reason: .locked).payload["refused"] as? String, "locked")
    XCTAssertEqual(RemoteMessage.ping(token: "t").payload["ping"] as? String, "t")
    XCTAssertEqual(RemoteMessage.pong(token: "t").payload["pong"] as? String, "t")
    let paired = RemoteMessage.paired(hostId: "h1", hostName: "Quadra", pairKey: key).payload["paired"] as? [String: Any]
    XCTAssertEqual(Set((paired ?? [:]).keys), ["hostId", "hostName", "key"])
    XCTAssertEqual(paired?["key"] as? String, key.base64EncodedString())
  }

  func testRoundTrips() {
    let cases: [RemoteMessage] = [
      .save,
      .stop,
      .forget,
      .start,
      .preview(on: true),
      .preview(on: false),
      .state(recording: true, clipCount: 3, startedAt: 1_700_000_000_000),
      .state(recording: false, clipCount: 0, startedAt: nil),
      .result(saved: true),
      .result(saved: false),
      .paired(hostId: "h1", hostName: "Quadra 1", pairKey: key),
      .unpaired,
      .refused(reason: .expired),
      .refused(reason: .locked),
      .refused(reason: .wrong),
      .refused(reason: .used),
      .refused(reason: .closed),
      .ping(token: "a1b2"),
      .pong(token: "a1b2"),
      .previewLink(service: "lance-1a2b3c4d", token: Data(repeating: 7, count: 16), key: key),
    ]
    for message in cases {
      XCTAssertEqual(RemoteMessage.decode(message.payload), message)
      XCTAssertEqual(RemoteMessage.decode(data: message.data), message)
    }
  }

  func testIdleStateOmitsStartedAt() {
    let payload = RemoteMessage.state(recording: false, clipCount: 0, startedAt: nil).payload
    XCTAssertNil(payload["startedAt"])
  }

  func testDecodeRejectsAnythingMalformed() {
    XCTAssertNil(RemoteMessage.decode([:]))
    XCTAssertNil(RemoteMessage.decode(["cmd": "delete"]))
    XCTAssertNil(RemoteMessage.decode(["recording": true, "clipCount": "3"]))
    XCTAssertNil(RemoteMessage.decode(["recording": true, "clipCount": -1]))
    XCTAssertNil(RemoteMessage.decode(["result": "maybe"]))
    XCTAssertNil(RemoteMessage.decode(["unpaired": false]))
    XCTAssertNil(RemoteMessage.decode(["refused": "other"]))
    XCTAssertNil(RemoteMessage.decode(["ping": ""]))
    XCTAssertNil(RemoteMessage.decode(["pong": 7]))
    XCTAssertNil(RemoteMessage.decode(["ping": String(repeating: "x", count: 65)]))
    XCTAssertNil(RemoteMessage.decode(["paired": ["hostId": "h1", "hostName": "Quadra"]]))
    XCTAssertNil(RemoteMessage.decode(["paired": ["hostId": "h1", "hostName": "Quadra", "key": "not base64!"]]))
    let shortKey = Data(repeating: 1, count: 16).base64EncodedString()
    XCTAssertNil(RemoteMessage.decode(["paired": ["hostId": "h1", "hostName": "Quadra", "key": shortKey]]))
    XCTAssertNil(RemoteMessage.decode(["previewLink": ["service": "s", "token": "AAAA", "key": key.base64EncodedString()]]))
    XCTAssertNil(RemoteMessage.decode(["previewLink": ["service": "", "token": Data(count: 16).base64EncodedString(), "key": key.base64EncodedString()]]))
    XCTAssertNil(RemoteMessage.decode(data: Data("[1,2]".utf8)))
    XCTAssertNil(RemoteMessage.decode(data: Data("nope".utf8)))
  }
}
