package expo.modules.replaycamera.core

/**
 * Maps sample times from consecutive segment files onto one clip timeline. Each segment is placed
 * right after the previous one, measured from its own first video frame. Samples before that frame,
 * or not after the last time written on their track, are dropped (the muxer rejects time going back).
 */
class TimelineRemap {
  private var offsetUs = 0L
  private var baseUs = 0L
  private val lastUs = mutableMapOf<String, Long>()

  fun beginSegment(videoStartUs: Long) { baseUs = videoStartUs }

  fun endSegment(durationUs: Long) { offsetUs += durationUs }

  /** The clip time for a sample, or null to drop it. */
  fun map(track: String, ptsUs: Long): Long? {
    if (ptsUs < baseUs) return null
    val out = offsetUs + (ptsUs - baseUs)
    val previous = lastUs[track]
    if (previous != null && out <= previous) return null
    lastUs[track] = out
    return out
  }
}
