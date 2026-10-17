package expo.modules.replaycamera

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.MediaCodec
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.Surface

/** Picks lens and mode, then streams the camera into the given surfaces (encoder + optional preview). */
class CaptureController(context: Context) {
  data class Mode(val cameraId: String, val size: Size, val fps: Int, val sensorOrientation: Int, val clockNanos: () -> Long)

  private val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val thread = HandlerThread("replay-camera").apply { start() }
  val handler = Handler(thread.looper)
  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null

  var onDisconnected: (() -> Unit)? = null

  /** Ultra-wide = the back camera with the shortest focal length. 1080p60 when asked and supported, else 30fps (720p when not asked). */
  fun chooseMode(lens: String, wantHigh: Boolean): Mode {
    val backs = manager.cameraIdList.filter {
      manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    }
    require(backs.isNotEmpty()) { "no back camera" }
    val focal = { id: String ->
      manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.minOrNull() ?: Float.MAX_VALUE
    }
    val id = if (lens == "ultraWide") backs.minBy(focal) else backs.first()
    val chars = manager.getCameraCharacteristics(id)

    val sizes = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)!!.getOutputSizes(MediaCodec::class.java).toList()
    val size = listOf(Size(1920, 1080), Size(1280, 720)).firstOrNull { (wantHigh || it.width == 1280) && it in sizes }
      ?: Size(1280, 720)
    val ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES).orEmpty()
    val fps = if (wantHigh && size.width == 1920 && ranges.any { it.lower == 60 && it.upper == 60 }) 60 else 30

    val realtime = chars.get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE) ==
      CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME
    val clock: () -> Long = if (realtime) SystemClock::elapsedRealtimeNanos else System::nanoTime
    val sensor = chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
    return Mode(id, size, fps, sensor, clock)
  }

  @SuppressLint("MissingPermission") // checked by ReplayEngine before start
  fun open(mode: Mode, surfaces: List<Surface>, onReady: () -> Unit, onError: (String) -> Unit) {
    manager.openCamera(mode.cameraId, object : CameraDevice.StateCallback() {
      override fun onOpened(camera: CameraDevice) {
        device = camera
        @Suppress("DEPRECATION")
        camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(s: CameraCaptureSession) {
            session = s
            val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
              surfaces.forEach(::addTarget)
              set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(mode.fps, mode.fps))
            }.build()
            s.setRepeatingRequest(request, null, handler)
            onReady()
          }

          override fun onConfigureFailed(s: CameraCaptureSession) = onError("capture session configuration failed")
        }, handler)
      }

      override fun onDisconnected(camera: CameraDevice) {
        close()
        onDisconnected?.invoke()
      }

      override fun onError(camera: CameraDevice, error: Int) {
        close()
        onError("camera error $error")
      }
    }, handler)
  }

  fun close() {
    runCatching { session?.close() }
    runCatching { device?.close() }
    session = null
    device = null
  }

  fun release() {
    close()
    thread.quitSafely()
  }
}
