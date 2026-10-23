import XCTest
@testable import ReplayCore

final class BleFramesTests: XCTestCase {
  private func message(_ size: Int) -> Data { Data((0..<size).map { UInt8($0 % 251) }) }

  func testAShortMessageIsOneFrame() {
    let frames = BleFrames.split(message(10), id: 7, maxFrame: 512)
    XCTAssertEqual(frames.count, 1)
    var assembler = BleFrames.Assembler()
    XCTAssertEqual(assembler.add(frames[0], now: 0), message(10))
  }

  func testALongMessageIsSplitAndJoinedBackInAnyOrder() {
    let whole = message(1_000)
    let frames = BleFrames.split(whole, id: 300, maxFrame: 104)
    XCTAssertEqual(frames.count, 10)
    XCTAssertTrue(frames.allSatisfy { $0.count <= 104 })
    var assembler = BleFrames.Assembler()
    var result: Data?
    for frame in frames.reversed() { result = assembler.add(frame, now: 0) }
    XCTAssertEqual(result, whole)
  }

  func testTwoMessagesInterleavedStaySeparate() {
    let a = message(300)
    let b = Data(message(300).reversed())
    let fa = BleFrames.split(a, id: 1, maxFrame: 104)
    let fb = BleFrames.split(b, id: 2, maxFrame: 104)
    var assembler = BleFrames.Assembler()
    var done: [Data] = []
    for (x, y) in zip(fa, fb) {
      if let m = assembler.add(x, now: 0) { done.append(m) }
      if let m = assembler.add(y, now: 0) { done.append(m) }
    }
    XCTAssertEqual(done, [a, b])
  }

  func testAMessageMissingFramesForTooLongIsDropped() {
    let frames = BleFrames.split(message(300), id: 9, maxFrame: 104)
    var assembler = BleFrames.Assembler(timeout: 2)
    XCTAssertNil(assembler.add(frames[0], now: 0))
    XCTAssertNil(assembler.add(frames[1], now: 1))
    // The last frame comes after the timeout: the earlier ones are gone, so the message never completes.
    XCTAssertNil(assembler.add(frames[2], now: 3))
    XCTAssertNil(assembler.add(frames[0], now: 3))
  }

  func testRefusesWhatCannotBeSent() {
    XCTAssertTrue(BleFrames.split(Data(), id: 1, maxFrame: 512).isEmpty)
    XCTAssertTrue(BleFrames.split(message(BleFrames.maxMessage + 1), id: 1, maxFrame: 512).isEmpty)
    XCTAssertTrue(BleFrames.split(message(10), id: 1, maxFrame: BleFrames.headerSize).isEmpty)
  }

  func testIgnoresGarbage() {
    var assembler = BleFrames.Assembler()
    XCTAssertNil(assembler.add(Data([1, 2]), now: 0))
    XCTAssertNil(assembler.add(Data([0, 1, 5, 2, 9]), now: 0))  // index past count
    XCTAssertNil(assembler.add(Data([0, 1, 0, 0, 9]), now: 0))  // zero frames
  }
}
