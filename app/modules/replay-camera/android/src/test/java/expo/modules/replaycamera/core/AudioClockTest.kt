package expo.modules.replaycamera.core

import org.junit.Assert.assertEquals
import org.junit.Test

class AudioClockTest {
  @Test fun test_ptsOfFrameFollowsAnchorAtSampleRate() {
    // Anchor: frame 1000 was presented at 10s on the camera clock.
    assertEquals(10_000_000L, AudioClock.ptsUs(anchorNanos = 10_000_000_000, anchorFrame = 1_000, frame = 1_000, sampleRate = 44_100))
    assertEquals(11_000_000L, AudioClock.ptsUs(anchorNanos = 10_000_000_000, anchorFrame = 1_000, frame = 45_100, sampleRate = 44_100))
  }

  @Test fun test_framesBeforeAnchorGetEarlierTimes() {
    assertEquals(9_000_000L, AudioClock.ptsUs(anchorNanos = 10_000_000_000, anchorFrame = 44_100, frame = 0, sampleRate = 44_100))
  }
}
