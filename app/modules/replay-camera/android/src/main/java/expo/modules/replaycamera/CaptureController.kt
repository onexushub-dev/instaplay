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
  data class Mode(
    val cameraId: String,
    val size: Size,
    val fps: Int,
    val sensorOrientation: Int,
    val clockIsBoottime: Boolean,
    val clockNanos: () -> Long,
  )

  private val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val thread = HandlerThread("replay-camera").apply { start() }
  val handler = Handler(thread.looper)
  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var streaming: Pair<Mode, List<Surface>>? = null

  /** Bumped by every open/close; callbacks from an older open close what they opened and stop. */
  @Volatile private var generation = 0

  /** Ultra-wide = the back camera with the shortest focal length. 1080p60 when asked and supported, else 30fps (720p when not asked). */
  /** "1080p60" | "1080p30" | "720p30" (the hot-phone fallback); falls back to what the camera supports. */
  fun chooseMode(lens: String, quality: String): Mode {
    val wantFullHd = quality.startsWith("1080")
    val want60 = quality == "1080p60"
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
    val size = listOf(Size(1920, 1080), Size(1280, 720)).firstOrNull { (wantFullHd || it.width == 1280) && it in sizes }
      ?: Size(1280, 720)
    val ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES).orEmpty()
    val fps = if (want60 && size.width == 1920 && ranges.any { it.lower == 60 && it.upper == 60 }) 60 else 30

    val realtime = chars.get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE) ==
      CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME
    val clock: () -> Long = if (realtime) SystemClock::elapsedRealtimeNanos else System::nanoTime
    val sensor = chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
    return Mode(id, size, fps, sensor, realtime, clock)
  }

  /**
   * Opens the camera and streams into [surfaces]. Exactly one of [onReady] / [onOpenError] is called for the open;
   * failures after [onReady] (disconnect, camera error) go to [onRuntimeError] instead.
   */
  @SuppressLint("MissingPermission") // checked by ReplayEngine before start
  fun open(
    mode: Mode,
    surfaces: List<Surface>,
    onReady: () -> Unit,
    onOpenError: (String) -> Unit,
    onRuntimeError: (String) -> Unit,
  ) {
    val mine = ++generation
    var ready = false
    val failed = { message: String ->
      close()
      if (ready) onRuntimeError(message) else onOpenError(message)
    }
    manager.openCamera(mode.cameraId, object : CameraDevice.StateCallback() {
      override fun onOpened(camera: CameraDevice) {
        if (mine != generation) return camera.close()
        device = camera
        @Suppress("DEPRECATION")
        camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(s: CameraCaptureSession) {
            if (mine != generation) return s.close()
            session = s
            val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
              surfaces.forEach(::addTarget)
              set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(mode.fps, mode.fps))
            }.build()
            s.setRepeatingRequest(request, null, handler)
            streaming = mode to surfaces
            ready = true
            onReady()
          }

          override fun onConfigureFailed(s: CameraCaptureSession) = failed("capture session configuration failed")
        }, handler)
      }

      override fun onDisconnected(camera: CameraDevice) {
        if (mine == generation) failed("camera disconnected") else camera.close()
      }

      override fun onError(camera: CameraDevice, error: Int) {
        if (mine == generation) failed("camera error $error") else camera.close()
      }
    }, handler)
  }

  /** Turns the rear torch on/off through the running session (the camera is ours, so CameraManager.setTorchMode can't). */
  fun setTorch(on: Boolean) {
    handler.post { applyTorch(on) }
  }

  private fun applyTorch(on: Boolean) {
    val camera = device ?: return
    val s = session ?: return
    val (mode, surfaces) = streaming ?: return
    if (manager.getCameraCharacteristics(mode.cameraId).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) != true) return
    runCatching {
      val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
        surfaces.forEach(::addTarget)
        set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(mode.fps, mode.fps))
        set(CaptureRequest.FLASH_MODE, if (on) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF)
      }.build()
      s.setRepeatingRequest(request, null, handler)
    }
  }

  private fun close() {
    runCatching { session?.close() }
    runCatching { device?.close() }
    session = null
    device = null
    streaming = null
  }

  /** Closes the current camera; one still opening is closed as soon as it arrives. The thread stays for the next open. */
  fun shutdown() {
    generation++
    handler.post { close() }
  }
}
