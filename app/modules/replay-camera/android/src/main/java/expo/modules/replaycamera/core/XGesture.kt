package expo.modules.replaycamera.core

import kotlin.math.sign

/** Image coordinates, y grows downward. */
data class Point(val x: Double, val y: Double, val confidence: Double)

data class Pose(
  val leftWrist: Point?,
  val rightWrist: Point?,
  val leftShoulder: Point?,
  val rightShoulder: Point?,
  val nose: Point?,
)

object XGesture {
  /**
   * Both wrists above the nose and forearms crossed. Comparing the wrists' order with the
   * shoulders' order makes the check independent of camera mirroring.
   */
  fun isX(p: Pose, minConfidence: Double = 0.3): Boolean {
    val lw = p.leftWrist ?: return false
    val rw = p.rightWrist ?: return false
    val ls = p.leftShoulder ?: return false
    val rs = p.rightShoulder ?: return false
    val nose = p.nose ?: return false
    if (listOf(lw, rw, ls, rs, nose).any { it.confidence < minConfidence }) return false

    val wristsUp = lw.y < nose.y && rw.y < nose.y
    val crossed = sign(lw.x - rw.x) != sign(ls.x - rs.x)
    return wristsUp && crossed
  }
}

/**
 * Fires once when the X is held for [holdSeconds]. After firing, the arms must drop
 * and [cooldownSeconds] must pass before it can fire again.
 */
class HoldTracker(private val holdSeconds: Double = 1.0, private val cooldownSeconds: Double = 3.0) {
  private var holdStart: Double? = null
  private var cooldownUntil = Double.NEGATIVE_INFINITY
  private var awaitingRelease = false

  fun update(isX: Boolean, t: Double): Boolean {
    if (!isX) {
      holdStart = null
      awaitingRelease = false
      return false
    }
    if (awaitingRelease) return false
    val start = holdStart ?: t
    holdStart = start
    if (t - start < holdSeconds - 1e-9 || t < cooldownUntil) return false
    holdStart = null
    awaitingRelease = true
    cooldownUntil = t + cooldownSeconds
    return true
  }
}
