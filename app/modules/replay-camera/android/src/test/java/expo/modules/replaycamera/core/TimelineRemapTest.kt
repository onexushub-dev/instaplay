package expo.modules.replaycamera.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TimelineRemapTest {
  @Test fun test_segmentSamplesShiftToFollowPreviousSegment() {
    val remap = TimelineRemap()
    remap.beginSegment(videoStartUs = 5_000_000)
    assertEquals(0L, remap.map("video", 5_000_000))
    assertEquals(33_333L, remap.map("video", 5_033_333))
    remap.endSegment(durationUs = 2_000_000)
    remap.beginSegment(videoStartUs = 7_000_000)
    assertEquals(2_000_000L, remap.map("video", 7_000_000))
  }

  @Test fun test_audioBeforeSegmentVideoStartIsDropped() {
    val remap = TimelineRemap()
    remap.beginSegment(videoStartUs = 5_000_000)
    assertNull(remap.map("audio", 4_990_000))
    assertEquals(10_000L, remap.map("audio", 5_010_000))
  }

  @Test fun test_nonIncreasingTimesPerTrackAreDropped() {
    val remap = TimelineRemap()
    remap.beginSegment(videoStartUs = 0)
    assertEquals(1_990_000L, remap.map("audio", 1_990_000)) // tail past the segment's video end
    remap.endSegment(durationUs = 1_980_000)
    remap.beginSegment(videoStartUs = 2_000_000)
    assertNull(remap.map("audio", 2_005_000)) // would land at 1_985_000, before the last written audio
    assertEquals(2_000_000L, remap.map("audio", 2_020_000))
  }
}
