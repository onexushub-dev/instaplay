package expo.modules.replaycamera.core

/** Image coordinates, y grows downward. */
data class Point(val x: Double, val y: Double, val confidence: Double)

data class Pose(
  val leftWrist: Point?,
  val rightWrist: Point?,
  val leftElbow: Point?,
  val rightElbow: Point?,
  val leftShoulder: Point?,
  val rightShoulder: Point?,
  val nose: Point?,
)

/**
 * The save gesture: both arms raised straight up. Big body geometry, so it stays readable when the
 * player is small in the frame; HoldTracker requires it held still, which filters blocks and celebrations.
 */
object ArmsUp {
  /** How far above the nose both wrists must be, in shoulder widths. */
  const val MIN_WRIST_RISE = 0.5

  fun isUp(p: Pose, minConfidence: Double = 0.3): Boolean {
    val lw = p.leftWrist ?: return false
    val rw = p.rightWrist ?: return false
    val le = p.leftElbow ?: return false
    val re = p.rightElbow ?: return false
    val ls = p.leftShoulder ?: return false
    val rs = p.rightShoulder ?: return false
    val nose = p.nose ?: return false
    if (listOf(lw, rw, le, re, ls, rs, nose).any { it.confidence < minConfidence }) return false

    val shoulderWidth = kotlin.math.abs(ls.x - rs.x)
    if (shoulderWidth == 0.0) return false
    val wristLine = nose.y - MIN_WRIST_RISE * shoulderWidth
    val wristsHigh = lw.y < wristLine && rw.y < wristLine
    val elbowsUp = le.y < ls.y && re.y < rs.y
    return wristsHigh && elbowsUp
  }
}

/**
 * Fires once when the gesture is held for [holdSeconds]. After firing, the arms must drop
 * and [cooldownSeconds] must pass before it can fire again.
 */
class HoldTracker(private val holdSeconds: Double = 1.5, private val cooldownSeconds: Double = 3.0) {
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
