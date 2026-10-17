package expo.modules.replaycamera.core

object ImageRotation {
  /** Rounds an OrientationEventListener reading to 0/90/180/270; null when unknown (phone flat). */
  fun snap(degrees: Int): Int? = if (degrees < 0) null else ((degrees + 45) / 90 * 90) % 360

  /** Clockwise rotation that makes a back-camera frame upright, for the device's physical orientation. */
  fun forBackCamera(sensorOrientation: Int, deviceDegrees: Int): Int = (sensorOrientation + deviceDegrees) % 360
}
