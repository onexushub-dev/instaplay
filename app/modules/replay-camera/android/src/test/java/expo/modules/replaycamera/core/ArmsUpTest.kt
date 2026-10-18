package expo.modules.replaycamera.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun pt(x: Double, y: Double, c: Double = 0.9) = Point(x, y, c)

/** Image coordinates, y grows downward. Shoulders 20 apart at y=50, nose at y=35. */
private fun makePose(lw: Point, rw: Point, le: Point, re: Point, nose: Point = pt(50.0, 35.0)) =
  Pose(lw, rw, le, re, leftShoulder = pt(60.0, 50.0), rightShoulder = pt(40.0, 50.0), nose = nose)

class ArmsUpTest {
  @Test fun test_bothArmsStraightUp_isTrue() {
    assertTrue(ArmsUp.isUp(makePose(pt(62.0, 5.0), pt(38.0, 5.0), pt(61.0, 28.0), pt(39.0, 28.0))))
  }

  @Test fun test_armsUpInAV_isTrue() {
    assertTrue(ArmsUp.isUp(makePose(pt(75.0, 8.0), pt(25.0, 8.0), pt(68.0, 30.0), pt(32.0, 30.0))))
  }

  @Test fun test_oneArmUp_isFalse() {
    assertFalse(ArmsUp.isUp(makePose(pt(62.0, 5.0), pt(35.0, 70.0), pt(61.0, 28.0), pt(37.0, 60.0))))
  }

  @Test fun test_handsOnHead_isFalse() {
    assertFalse(ArmsUp.isUp(makePose(pt(55.0, 30.0), pt(45.0, 30.0), pt(70.0, 38.0), pt(30.0, 38.0))))
  }

  @Test fun test_elbowsBelowShoulders_isFalse() {
    assertFalse(ArmsUp.isUp(makePose(pt(55.0, 20.0), pt(45.0, 20.0), pt(70.0, 55.0), pt(30.0, 55.0))))
  }

  @Test fun test_lowConfidence_isFalse() {
    assertFalse(ArmsUp.isUp(makePose(pt(62.0, 5.0, 0.1), pt(38.0, 5.0), pt(61.0, 28.0), pt(39.0, 28.0))))
  }

  @Test fun test_missingElbow_isFalse() {
    val p = Pose(pt(62.0, 5.0), pt(38.0, 5.0), leftElbow = null, rightElbow = pt(39.0, 28.0),
      leftShoulder = pt(60.0, 50.0), rightShoulder = pt(40.0, 50.0), nose = pt(50.0, 35.0))
    assertFalse(ArmsUp.isUp(p))
  }
}

class HoldTrackerTest {
  @Test fun test_holdFiresOnceAfter1_5s() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertFalse(h.update(true, 1.2))
    assertTrue(h.update(true, 1.5))
    assertFalse(h.update(true, 2.0))
  }

  @Test fun test_aQuickCelebrationDoesNotFire() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertFalse(h.update(true, 0.8))
    assertFalse(h.update(false, 1.0))
    assertFalse(h.update(true, 1.2))
    assertFalse(h.update(true, 2.6))
  }

  @Test fun test_cooldownBlocksFor3s() {
    val h = HoldTracker()
    assertFalse(h.update(true, 0.0))
    assertTrue(h.update(true, 1.5))
    assertFalse(h.update(false, 1.7))
    assertFalse(h.update(true, 2.0))
    assertFalse(h.update(true, 4.0))
    assertFalse(h.update(false, 4.2))
    assertFalse(h.update(true, 4.6))
    assertTrue(h.update(true, 6.1))
  }
}
