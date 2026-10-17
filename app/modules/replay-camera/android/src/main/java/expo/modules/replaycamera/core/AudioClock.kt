package expo.modules.replaycamera.core

object AudioClock {
  /** Presentation time of audio [frame], given that [anchorFrame] was presented at [anchorNanos]. */
  fun ptsUs(anchorNanos: Long, anchorFrame: Long, frame: Long, sampleRate: Int): Long =
    (anchorNanos + (frame - anchorFrame) * 1_000_000_000L / sampleRate) / 1_000
}
