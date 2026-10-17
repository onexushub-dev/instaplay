package expo.modules.replaycamera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.ImageReader
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.view.Surface
import android.view.WindowManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.replaycamera.core.LowStorageException
import expo.modules.replaycamera.core.Segment
import expo.modules.replaycamera.core.SegmentRing
import expo.modules.replaycamera.core.StorageGuard
import java.io.File
import java.util.UUID

class ReplayException(code: String, message: String) : CodedException(code, message, null)

/**
 * Ties capture, segment encoding, the ring, gesture and thermal handling together.
 * One per process; the preview view hands it a surface and a bitmap source.
 */
object ReplayEngine {
  const val WINDOW_SECONDS = 60.0

  var emit: ((String, Map<String, Any?>) -> Unit)? = null
  /** Set by the mounted ReplayCameraView. Mount the view before starting a session. */
  var previewSurface: Surface? = null
  var previewBitmap: (() -> Bitmap?)? = null

  private val ring = SegmentRing((WINDOW_SECONDS * 1_000_000 / SegmentEncoder.SEGMENT_US).toInt(), LocalFileOps)
  private val gesture = GestureDetector {
    emit?.invoke("onTrigger", mapOf("source" to "gesture", "at" to System.currentTimeMillis().toDouble()))
  }
  private var capture: CaptureController? = null
  private var encoder: SegmentEncoder? = null
  private var reader: ImageReader? = null
  private val pendingSaves = mutableListOf<() -> Unit>()
  private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null

  private var context: Context? = null
  private var lens = "ultraWide"
  private var quality = "1080p60"
  private var degraded = false
  /** The user's intent: a session is wanted (it may be paused while the app is in the background). */
  @Volatile var running = false
    private set

  fun setGestureEnabled(enabled: Boolean) { gesture.enabled = enabled }

  fun start(context: Context, lens: String, maxQuality: String, onReady: () -> Unit, onError: (CodedException) -> Unit) {
    val granted = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO).all {
      ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }
    if (!granted) return onError(ReplayException("CAMERA_PERMISSION", "Camera or microphone permission not granted"))
    try {
      StorageGuard.check(StatFs(context.cacheDir.path).availableBytes)
    } catch (e: LowStorageException) {
      return onError(ReplayException("LOW_STORAGE", e.message ?: "Less than 500 MB free"))
    }
    SegmentRing.purgeOrphans(ReplayPaths.buffer(context), LocalFileOps)

    this.context = context
    this.lens = lens
    quality = maxQuality
    degraded = false
    running = true
    watchThermal(context)
    startPipeline(onReady, onError)
  }

  fun stop() {
    running = false
    unwatchThermal()
    stopPipeline()
  }

  /** App went to the background: the camera is taken away, so drop the buffer. */
  fun pause() {
    if (!running) return
    stopPipeline()
    emit?.invoke("onInterrupted", emptyMap())
  }

  fun resume() {
    if (!running || capture != null) return
    startPipeline(onReady = { emit?.invoke("onResumed", emptyMap()) }) { emit?.invoke("onError", mapOf("code" to it.code, "message" to it.message)) }
  }

  /** Forces a segment cut at the trigger, then copies the window once that segment is closed. */
  fun saveClip(context: Context, onDone: (String, Int) -> Unit, onError: (CodedException) -> Unit) {
    val enc = encoder
    if (!running || enc == null) return onError(ReplayException("NO_SESSION", "No replay session is running"))
    synchronized(pendingSaves) {
      pendingSaves += {
        val dest = File(ReplayPaths.clips(context), "${UUID.randomUUID()}.mp4")
        try {
          val seconds = ring.copyClip(WINDOW_SECONDS, dest, ClipConcat::concat)
          onDone(dest.path, (seconds * 1000).toInt())
        } catch (t: Throwable) {
          dest.delete()
          onError(ReplayException("ENCODER_FAILED", "$t"))
        }
      }
    }
    enc.requestCut()
  }

  private fun startPipeline(onReady: () -> Unit, onError: (CodedException) -> Unit) {
    val ctx = context ?: return
    try {
      val cap = CaptureController(ctx)
      val mode = cap.chooseMode(lens, wantHigh = quality == "1080p60" && !degraded)
      val enc = SegmentEncoder(
        mode.size.width, mode.size.height, mode.fps, ReplayPaths.buffer(ctx), mode.clockNanos,
        onSegment = ::onSegment,
        onFailure = { emit?.invoke("onError", mapOf("code" to "ENCODER_FAILED", "message" to "$it")) },
      )
      val rdr = gesture.createReader(rotationDegrees(ctx, mode.sensorOrientation), cap.handler)
      cap.onDisconnected = { pause() }
      capture = cap
      encoder = enc
      reader = rdr
      enc.start()
      val base = listOfNotNull(enc.inputSurface, previewSurface)
      cap.open(mode, base + rdr.surface, onReady) {
        // Some devices can't add a third stream at this size: retry without it and sample the preview.
        cap.close()
        reader?.close()
        reader = null
        cap.open(mode, base, onReady = {
          previewBitmap?.let(gesture::startBitmapSampling)
          onReady()
        }) { message ->
          stop()
          onError(ReplayException("CAMERA_UNAVAILABLE", message))
        }
      }
    } catch (t: Throwable) {
      stop()
      onError(ReplayException("CAMERA_UNAVAILABLE", "$t"))
    }
  }

  private fun stopPipeline() {
    gesture.stopBitmapSampling()
    capture?.release()
    encoder?.stop()
    reader?.close()
    capture = null
    encoder = null
    reader = null
    synchronized(pendingSaves) { pendingSaves.clear() }
    ring.clear()
  }

  private fun onSegment(segment: Segment) {
    ring.append(segment)
    val saves = synchronized(pendingSaves) { pendingSaves.toList().also { pendingSaves.clear() } }
    saves.forEach { it() }
  }

  private fun watchThermal(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val listener = PowerManager.OnThermalStatusChangedListener(::thermalChanged)
    power.addThermalStatusListener(ContextCompat.getMainExecutor(context), listener)
    thermalListener = listener
  }

  private fun unwatchThermal() {
    val ctx = context ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    thermalListener?.let { (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).removeThermalStatusListener(it) }
    thermalListener = null
  }

  private fun thermalChanged(status: Int) {
    val level = when {
      status >= PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
      status >= PowerManager.THERMAL_STATUS_SEVERE -> "serious"
      status >= PowerManager.THERMAL_STATUS_MODERATE -> "fair"
      else -> "nominal"
    }
    if (level == "critical") {
      emit?.invoke("onThermalChange", mapOf("level" to level, "degraded" to true))
      emit?.invoke("onError", mapOf("code" to "ENCODER_FAILED", "message" to "thermal"))
      stop()
      return
    }
    if (level == "serious" && !degraded) {
      degraded = true
      stopPipeline()
      startPipeline(onReady = {}) { emit?.invoke("onError", mapOf("code" to it.code, "message" to it.message)) }
    }
    emit?.invoke("onThermalChange", mapOf("level" to level, "degraded" to degraded))
  }

  /** Rotation that makes a back-camera frame upright for the current display rotation. */
  @Suppress("DEPRECATION")
  private fun rotationDegrees(context: Context, sensorOrientation: Int): Int {
    val display = (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay
    return (sensorOrientation - display.rotation * 90 + 360) % 360
  }
}
