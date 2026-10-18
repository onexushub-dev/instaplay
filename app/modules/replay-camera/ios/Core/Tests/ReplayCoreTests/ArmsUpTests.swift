import XCTest
@testable import ReplayCore

private func pt(_ x: Double, _ y: Double, _ c: Double = 0.9) -> Point { Point(x: x, y: y, confidence: c) }

/// Image coordinates, y grows downward. Shoulders 20 apart at y=50, nose at y=35.
private func makePose(lw: Point, rw: Point, le: Point, re: Point, nose: Point = pt(50, 35)) -> Pose {
  Pose(leftWrist: lw, rightWrist: rw, leftElbow: le, rightElbow: re,
       leftShoulder: pt(60, 50), rightShoulder: pt(40, 50), nose: nose)
}

final class ArmsUpTests: XCTestCase {
  func test_bothArmsStraightUp_isTrue() {
    XCTAssertTrue(ArmsUp.isUp(makePose(lw: pt(62, 5), rw: pt(38, 5), le: pt(61, 28), re: pt(39, 28))))
  }

  func test_armsUpInAV_isTrue() {
    XCTAssertTrue(ArmsUp.isUp(makePose(lw: pt(75, 8), rw: pt(25, 8), le: pt(68, 30), re: pt(32, 30))))
  }

  func test_oneArmUp_isFalse() { // the beach tennis serve toss
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(62, 5), rw: pt(35, 70), le: pt(61, 28), re: pt(37, 60))))
  }

  func test_handsOnHead_isFalse() { // wrists barely above the nose
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(55, 30), rw: pt(45, 30), le: pt(70, 38), re: pt(30, 38))))
  }

  func test_elbowsBelowShoulders_isFalse() { // hands raised but arms bent down (hands behind the head)
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(55, 20), rw: pt(45, 20), le: pt(70, 55), re: pt(30, 55))))
  }

  func test_lowConfidence_isFalse() {
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(62, 5, 0.1), rw: pt(38, 5), le: pt(61, 28), re: pt(39, 28))))
  }

  func test_missingElbow_isFalse() {
    let p = Pose(leftWrist: pt(62, 5), rightWrist: pt(38, 5), leftElbow: nil, rightElbow: pt(39, 28),
                 leftShoulder: pt(60, 50), rightShoulder: pt(40, 50), nose: pt(50, 35))
    XCTAssertFalse(ArmsUp.isUp(p))
  }
}

final class HoldTrackerTests: XCTestCase {
  func test_holdFiresOnceAfter1_5s() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertFalse(h.update(isX: true, at: 1.2))
    XCTAssertTrue(h.update(isX: true, at: 1.5))
    XCTAssertFalse(h.update(isX: true, at: 2.0))
  }

  func test_aQuickCelebrationDoesNotFire() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertFalse(h.update(isX: true, at: 0.8))
    XCTAssertFalse(h.update(isX: false, at: 1.0))
    XCTAssertFalse(h.update(isX: true, at: 1.2))
    XCTAssertFalse(h.update(isX: true, at: 2.6))
  }

  func test_cooldownBlocksFor3s() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertTrue(h.update(isX: true, at: 1.5))
    XCTAssertFalse(h.update(isX: false, at: 1.7))
    XCTAssertFalse(h.update(isX: true, at: 2.0))
    XCTAssertFalse(h.update(isX: true, at: 4.0))
    XCTAssertFalse(h.update(isX: false, at: 4.2))
    XCTAssertFalse(h.update(isX: true, at: 4.6))
    XCTAssertTrue(h.update(isX: true, at: 6.1))
  }
}
