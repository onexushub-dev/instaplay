package expo.modules.replaycamera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.StatFs
import android.view.Surface
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.replaycamera.core.LowStorageException
import expo.modules.replaycamera.core.SegmentRing
import expo.modules.replaycamera.core.StorageGuard
import java.io.File
import java.util.UUID

class ReplayException(code: String, message: String) : CodedException(code, message, null)

/** Ties capture, segment encoding and the ring together. One per process; the preview view hands it a surface. */
object ReplayEngine {
  const val WINDOW_SECONDS = 60.0

  var emit: ((String, Map<String, Any?>) -> Unit)? = null
  /** Set by the mounted ReplayCameraView. Mount the view before starting a session. */
  var previewSurface: Surface? = null

  private val ring = SegmentRing((WINDOW_SECONDS * 1_000_000 / SegmentEncoder.SEGMENT_US).toInt(), LocalFileOps)
  private var capture: CaptureController? = null
  private var encoder: SegmentEncoder? = null
  private val pendingSaves = mutableListOf<() -> Unit>()
  @Volatile var running = false
    private set

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

    val bufferDir = ReplayPaths.buffer(context)
    SegmentRing.purgeOrphans(bufferDir, LocalFileOps)

    try {
      val cap = CaptureController(context)
      val mode = cap.chooseMode(lens, wantHigh = maxQuality == "1080p60")
      val enc = SegmentEncoder(
        mode.size.width, mode.size.height, mode.fps, bufferDir, mode.clockNanos,
        onSegment = ::onSegment,
        onFailure = { emit?.invoke("onError", mapOf("code" to "ENCODER_FAILED", "message" to "$it")) },
      )
      cap.onDisconnected = { emit?.invoke("onInterrupted", emptyMap()) }
      capture = cap
      encoder = enc
      enc.start()
      running = true
      cap.open(mode, listOfNotNull(enc.inputSurface, previewSurface), onReady) { message ->
        stop()
        onError(ReplayException("CAMERA_UNAVAILABLE", message))
      }
    } catch (t: Throwable) {
      stop()
      onError(ReplayException("CAMERA_UNAVAILABLE", "$t"))
    }
  }

  fun stop() {
    running = false
    capture?.close()
    encoder?.stop()
    capture = null
    encoder = null
    synchronized(pendingSaves) { pendingSaves.clear() }
    ring.clear()
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

  private fun onSegment(segment: expo.modules.replaycamera.core.Segment) {
    ring.append(segment)
    val saves = synchronized(pendingSaves) { pendingSaves.toList().also { pendingSaves.clear() } }
    saves.forEach { it() }
  }
}
