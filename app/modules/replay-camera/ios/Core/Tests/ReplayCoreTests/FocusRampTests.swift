import XCTest
@testable import ReplayCore

final class FocusRampTests: XCTestCase {
  private let a = FocusRect(x: 0, y: 0, width: 0.8, height: 0.8)
  private let b = FocusRect(x: 0.2, y: 0.1, width: 0.7, height: 0.7)
  private let c = FocusRect(x: 0.3, y: 0.2, width: 0.7, height: 0.7)

  func test_atTwiceTheSpeedTheTimesAreHalved() {
    let rects = (0..<40).map { _ in a }
    let s = FocusRamp.segments(rects: rects, startMs: 0, stepMs: 100, cutStartMs: 1000, cutEndMs: 3000, speed: 2)
    XCTAssertEqual(s.first!.fromSec, 0, accuracy: 1e-9)
    XCTAssertEqual(s.last!.toSec, 1.0, accuracy: 1e-9)
  }

  func test_atHalfTheSpeedTheTimesAreDoubled() {
    let rects = (0..<40).map { _ in a }
    let s = FocusRamp.segments(rects: rects, startMs: 0, stepMs: 100, cutStartMs: 1000, cutEndMs: 3000, speed: 0.5)
    XCTAssertEqual(s.last!.toSec, 4.0, accuracy: 1e-9)
  }

  func test_aCutBetweenTwoKeyframesStartsOnTheMidpoint() {
    let s = FocusRamp.segments(rects: [a, a, c], startMs: 0, stepMs: 100, cutStartMs: 150, cutEndMs: 200, speed: 1)
    XCTAssertEqual(s.count, 1)
    XCTAssertEqual(s[0].from.x, 0.15, accuracy: 1e-9)
    XCTAssertEqual(s[0].to, c)
    XCTAssertEqual(s[0].toSec, 0.05, accuracy: 1e-9)
  }

  func test_segmentsChainWithoutGaps() {
    let s = FocusRamp.segments(rects: [a, b, c], startMs: 0, stepMs: 100, cutStartMs: 0, cutEndMs: 200, speed: 1)
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].to, s[1].from)
    XCTAssertEqual(s[0].toSec, s[1].fromSec, accuracy: 1e-9)
  }

  func test_aCutBeforeTheAnalysedRangeHoldsTheFirstRect() {
    let s = FocusRamp.segments(rects: [b, c], startMs: 5000, stepMs: 100, cutStartMs: 1000, cutEndMs: 2000, speed: 1)
    XCTAssertEqual(s.count, 1)
    XCTAssertEqual(s[0].from, b)
    XCTAssertEqual(s[0].to, b)
  }

  func test_aCutAfterTheAnalysedRangeHoldsTheLastRect() {
    let s = FocusRamp.segments(rects: [b, c], startMs: 0, stepMs: 100, cutStartMs: 1000, cutEndMs: 2000, speed: 1)
    XCTAssertEqual(s[0].from, c)
    XCTAssertEqual(s.last!.to, c)
  }

  func test_oneRectGivesOneStillSegment() {
    let s = FocusRamp.segments(rects: [b], startMs: 0, stepMs: 100, cutStartMs: 0, cutEndMs: 1000, speed: 1)
    XCTAssertEqual(s.count, 1)
    XCTAssertEqual(s[0].from, b)
    XCTAssertEqual(s[0].to, b)
    XCTAssertEqual(s[0].toSec, 1, accuracy: 1e-9)
  }

  func test_noRectsOrAnEmptyCutGiveNothing() {
    XCTAssertTrue(FocusRamp.segments(rects: [], startMs: 0, stepMs: 100, cutStartMs: 0, cutEndMs: 1000, speed: 1).isEmpty)
    XCTAssertTrue(FocusRamp.segments(rects: [a], startMs: 0, stepMs: 100, cutStartMs: 500, cutEndMs: 500, speed: 1).isEmpty)
  }
}
