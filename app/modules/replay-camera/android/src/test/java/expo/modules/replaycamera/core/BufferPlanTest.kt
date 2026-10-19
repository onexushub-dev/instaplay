package expo.modules.replaycamera.core

import org.junit.Assert.assertEquals
import org.junit.Test

class BufferPlanTest {
  @Test fun test_segmentsForTheWindow() {
    assertEquals(60, BufferPlan.segments(60.0, 1.0))
    assertEquals(120, BufferPlan.segments(120.0, 1.0))
    assertEquals(60, BufferPlan.segments(120.0, 2.0))
  }

  @Test fun test_partialSegmentsRoundUpAndBadInputFallsBackToOneMinute() {
    assertEquals(31, BufferPlan.segments(61.0, 2.0))
    assertEquals(30, BufferPlan.segments(0.0, 2.0))
  }
}
