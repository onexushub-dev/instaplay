package expo.modules.replaycamera.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ImageRotationTest {
  @Test fun test_snapRoundsToNearestQuarter() {
    assertEquals(0, ImageRotation.snap(44))
    assertEquals(90, ImageRotation.snap(46))
    assertEquals(0, ImageRotation.snap(359))
    assertEquals(270, ImageRotation.snap(260))
  }

  @Test fun test_snapUnknownIsNull() {
    assertNull(ImageRotation.snap(-1))
  }

  @Test fun test_backCameraRotationAddsDeviceOrientation() {
    assertEquals(90, ImageRotation.forBackCamera(sensorOrientation = 90, deviceDegrees = 0))
    assertEquals(180, ImageRotation.forBackCamera(sensorOrientation = 90, deviceDegrees = 90))
    assertEquals(0, ImageRotation.forBackCamera(sensorOrientation = 90, deviceDegrees = 270))
  }
}
