package expo.modules.replaycamera.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun pt(x: Double, y: Double, c: Double = 0.9) = Point(x, y, c)

/** Image coordinates, y grows downward. Nose at y=30, shoulders at y=50. */
private fun makePose(leftWrist: Point, rightWrist: Point, nose: Point = pt(50.0, 30.0)) =
  Pose(leftWrist, rightWrist, leftShoulder = pt(60.0, 50.0), rightShoulder = pt(40.0, 50.0), nose = nose)

class XGestureTest {
  @Test fun test_crossedArmsAboveHead_isTrue() {
    assertTrue(XGesture.isX(makePose(pt(45.0, 10.0), pt(55.0, 10.0))))
  }

  @Test fun test_armsUpNotCrossed_isFalse() {
    assertFalse(XGesture.isX(makePose(pt(65.0, 10.0), pt(35.0, 10.0))))
  }

  @Test fun test_oneArmUp_isFalse() {
    assertFalse(XGesture.isX(makePose(pt(45.0, 10.0), pt(55.0, 80.0))))
  }

  @Test fun test_lowConfidence_isFalse() {
    assertFalse(XGesture.isX(makePose(pt(45.0, 10.0), pt(55.0, 10.0), nose = pt(50.0, 30.0, 0.1))))
  }

  @Test fun test_missingPoint_isFalse() {
    val p = Pose(pt(45.0, 10.0), pt(55.0, 10.0), leftShoulder = null, rightShoulder = pt(40.0, 50.0), nose = pt(50.0, 30.0))
    assertFalse(XGesture.isX(p))
  }
}

class HoldTrackerTest {
  @Test fun test_holdFiresOnceAfter1s() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertFalse(h.update(true, 0.8))
    assertTrue(h.update(true, 1.0))
    assertFalse(h.update(true, 1.4))
  }

  @Test fun test_brokenHoldResets() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertFalse(h.update(false, 0.5))
    assertFalse(h.update(true, 0.6))
    assertFalse(h.update(true, 1.4))
    assertTrue(h.update(true, 1.6))
  }

  @Test fun test_cooldownBlocksFor3s() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertTrue(h.update(true, 1.0))
    assertFalse(h.update(false, 1.2))
    assertFalse(h.update(true, 1.5))
    assertFalse(h.update(true, 2.6))
    assertFalse(h.update(false, 3.0))
    assertFalse(h.update(true, 4.0))
    assertTrue(h.update(true, 5.0))
  }
}
