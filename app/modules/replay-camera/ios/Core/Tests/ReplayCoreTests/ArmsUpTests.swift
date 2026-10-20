import XCTest
@testable import ReplayCore

private func pt(_ x: Double, _ y: Double, _ c: Double = 0.9) -> Point { Point(x: x, y: y, confidence: c) }

/// Image coordinates, y grows downward. Shoulders 20 apart at y=50, nose at y=35.
private func makePose(lw: Point, rw: Point, le: Point?, re: Point?, nose: Point? = pt(50, 35),
                      ls: Point? = pt(60, 50), rs: Point? = pt(40, 50)) -> Pose {
  Pose(leftWrist: lw, rightWrist: rw, leftElbow: le, rightElbow: re, leftShoulder: ls, rightShoulder: rs, nose: nose)
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

  func test_handsOnHead_isFalse() { // wrists only 0.25 shoulder widths above the nose
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(55, 30), rw: pt(45, 30), le: pt(70, 38), re: pt(30, 38))))
  }

  func test_elbowsBelowShoulders_isFalse() { // hands raised but arms bent down (hands behind the head)
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(55, 20), rw: pt(45, 20), le: pt(70, 55), re: pt(30, 55))))
  }

  func test_lowConfidenceWrist_isFalse() {
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(62, 5, 0.1), rw: pt(38, 5), le: pt(61, 28), re: pt(39, 28))))
  }

  func test_wristsABitAboveTheHead_nowCount() { // 0.4 shoulder widths above the nose (it used to need 0.5)
    XCTAssertTrue(ArmsUp.isUp(makePose(lw: pt(55, 27), rw: pt(45, 27), le: pt(70, 38), re: pt(30, 38))))
  }

  func test_missingElbow_stillCountsWhenTheWristsAreHigh() { // far away, elbows are the first to drop out
    XCTAssertTrue(ArmsUp.isUp(makePose(lw: pt(62, 5), rw: pt(38, 5), le: nil, re: pt(39, 28))))
  }

  func test_missingNose_fallsBackToTheShoulders() {
    let high = makePose(lw: pt(62, 5), rw: pt(38, 5), le: pt(61, 28), re: pt(39, 28), nose: nil)
    let low = makePose(lw: pt(55, 30), rw: pt(45, 30), le: pt(70, 38), re: pt(30, 38), nose: nil)
    XCTAssertTrue(ArmsUp.isUp(high))
    XCTAssertFalse(ArmsUp.isUp(low)) // a wrist only 1.0 shoulder widths above the shoulders is not enough
  }

  func test_missingShoulder_isFalse() {
    XCTAssertFalse(ArmsUp.isUp(makePose(lw: pt(62, 5), rw: pt(38, 5), le: pt(61, 28), re: pt(39, 28), ls: nil)))
  }
}

/// Feeds samples every `step` seconds in [start, stop]; returns the times at which it fired.
private func feed(_ tracker: HoldTracker, from start: Double, to stop: Double, _ value: Bool, step: Double = 0.25) -> [Double] {
  var fired: [Double] = []
  var i = 0
  while true {
    let t = start + Double(i) * step
    if t > stop + 1e-9 { break }
    if tracker.update(isX: value, at: t) { fired.append(t) }
    i += 1
  }
  return fired
}

final class HoldTrackerTests: XCTestCase {
  func test_holdFiresOnceAfter1_5s() {
    let h = HoldTracker()
    XCTAssertEqual(feed(h, from: 0.0, to: 3.0, true), [1.5])
  }

  func test_aSingleMissedSample_doesNotResetTheHold() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 0.5, true) + feed(h, from: 0.75, to: 0.75, false) + feed(h, from: 1.0, to: 2.0, true)
    XCTAssertEqual(fired, [1.5])
  }

  func test_twoMissedSamplesInARow_areStillTolerated() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 0.5, true) + feed(h, from: 0.75, to: 1.0, false) + feed(h, from: 1.25, to: 2.0, true)
    XCTAssertEqual(fired, [1.5])
  }

  func test_aLongGap_resetsTheHold() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 0.5, true) + feed(h, from: 0.75, to: 1.5, false) + feed(h, from: 1.75, to: 2.5, true)
    XCTAssertEqual(fired, []) // the second run only lasts 0.75s
  }

  func test_aQuickCelebration_doesNotFire() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 0.75, true) + feed(h, from: 1.0, to: 3.0, false)
    XCTAssertEqual(fired, [])
  }

  func test_holdingOnAfterFiring_doesNotFireAgain() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 5.0, true) + feed(h, from: 5.25, to: 5.25, false) + feed(h, from: 5.5, to: 8.0, true)
    XCTAssertEqual(fired, [1.5]) // one dropout is not a release
  }

  func test_releasingThenHoldingAfterTheCooldown_firesAgain() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 1.5, true) + feed(h, from: 1.75, to: 3.0, false) + feed(h, from: 3.25, to: 6.0, true)
    XCTAssertEqual(fired, [1.5, 4.75]) // cooldown ends at 4.5; the new hold is 1.5s old at 4.75
  }

  func test_holdInsideTheCooldown_waitsForIt() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 1.5, true) + feed(h, from: 1.75, to: 2.5, false) + feed(h, from: 2.75, to: 6.0, true)
    XCTAssertEqual(fired, [1.5, 4.5]) // the new hold is old enough at 4.25, but the cooldown lasts until 4.5
  }

  func test_aShortDropAfterFiring_isNotARelease() {
    let h = HoldTracker()
    let fired = feed(h, from: 0.0, to: 1.5, true) + feed(h, from: 1.75, to: 2.0, false) + feed(h, from: 2.25, to: 8.0, true)
    XCTAssertEqual(fired, [1.5]) // two missed samples are a detector hiccup, the player never lowered the arms
  }
}
