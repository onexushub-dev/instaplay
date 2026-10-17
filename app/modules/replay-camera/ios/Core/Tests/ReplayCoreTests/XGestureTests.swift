import XCTest
@testable import ReplayCore

private func pt(_ x: Double, _ y: Double, _ c: Double = 0.9) -> Point { Point(x: x, y: y, confidence: c) }

/// Image coordinates, y grows downward. Nose at y=30, shoulders at y=50.
private func makePose(leftWrist: Point, rightWrist: Point, nose: Point = pt(50, 30)) -> Pose {
  Pose(leftWrist: leftWrist, rightWrist: rightWrist,
       leftShoulder: pt(60, 50), rightShoulder: pt(40, 50), nose: nose)
}

final class XGestureTests: XCTestCase {
  func test_crossedArmsAboveHead_isTrue() {
    XCTAssertTrue(XGesture.isX(makePose(leftWrist: pt(45, 10), rightWrist: pt(55, 10))))
  }

  /// At a distance the pose model sees crossed wrists as touching, slightly "uncrossed" (field data: 0.22 shoulder widths).
  func test_wristsTogetherAboveHead_isTrue() {
    XCTAssertTrue(XGesture.isX(makePose(leftWrist: pt(52, 10), rightWrist: pt(48, 10))))
  }

  func test_wristsAboveHeadButApart_isFalse() {
    XCTAssertFalse(XGesture.isX(makePose(leftWrist: pt(58, 10), rightWrist: pt(42, 10))))
  }

  func test_armsUpNotCrossed_isFalse() {
    XCTAssertFalse(XGesture.isX(makePose(leftWrist: pt(65, 10), rightWrist: pt(35, 10))))
  }

  func test_oneArmUp_isFalse() {
    XCTAssertFalse(XGesture.isX(makePose(leftWrist: pt(45, 10), rightWrist: pt(55, 80))))
  }

  func test_lowConfidence_isFalse() {
    XCTAssertFalse(XGesture.isX(makePose(leftWrist: pt(45, 10), rightWrist: pt(55, 10), nose: pt(50, 30, 0.1))))
  }

  func test_missingPoint_isFalse() {
    let p = Pose(leftWrist: pt(45, 10), rightWrist: pt(55, 10), leftShoulder: nil, rightShoulder: pt(40, 50), nose: pt(50, 30))
    XCTAssertFalse(XGesture.isX(p))
  }
}

final class HoldTrackerTests: XCTestCase {
  func test_holdFiresOnceAfter1s() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertFalse(h.update(isX: true, at: 0.8))
    XCTAssertTrue(h.update(isX: true, at: 1.0))
    XCTAssertFalse(h.update(isX: true, at: 1.4))
  }

  func test_brokenHoldResets() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertFalse(h.update(isX: false, at: 0.5))
    XCTAssertFalse(h.update(isX: true, at: 0.6))
    XCTAssertFalse(h.update(isX: true, at: 1.4))
    XCTAssertTrue(h.update(isX: true, at: 1.6))
  }

  func test_cooldownBlocksFor3s() {
    let h = HoldTracker()
    XCTAssertFalse(h.update(isX: true, at: 0.0))
    XCTAssertTrue(h.update(isX: true, at: 1.0))
    XCTAssertFalse(h.update(isX: false, at: 1.2))
    XCTAssertFalse(h.update(isX: true, at: 1.5))
    XCTAssertFalse(h.update(isX: true, at: 2.6))
    XCTAssertFalse(h.update(isX: false, at: 3.0))
    XCTAssertFalse(h.update(isX: true, at: 4.0))
    XCTAssertTrue(h.update(isX: true, at: 5.0))
  }
}
