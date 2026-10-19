package expo.modules.replaycamera.core

import kotlin.math.ceil

object BufferPlan {
  /** How many segments keep [seconds] of video; a missing or bad length means the default minute. */
  fun segments(seconds: Double, segmentSeconds: Double): Int {
    val window = if (seconds > 0) seconds else 60.0
    return ceil(window / segmentSeconds).toInt()
  }
}
