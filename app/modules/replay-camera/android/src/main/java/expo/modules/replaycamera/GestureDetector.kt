package expo.modules.replaycamera

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.ImageReader
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import expo.modules.replaycamera.core.HoldTracker
import expo.modules.replaycamera.core.Point
import expo.modules.replaycamera.core.Pose
import expo.modules.replaycamera.core.XGesture
import java.util.concurrent.atomic.AtomicBoolean
import com.google.mlkit.vision.pose.Pose as MlPose

/**
 * Runs ML Kit pose detection on ~5 frames per second and fires [onGesture] when the X is held.
 * Frames come from a small ImageReader on the capture session, or, when the device can't add
 * that third stream, from bitmaps of the preview (see [startBitmapSampling]).
 */
class GestureDetector(private val onGesture: () -> Unit) {
  companion object {
    private const val SAMPLE_MS = 200L
  }

  @Volatile var enabled = true
  private val detector = PoseDetection.getClient(
    PoseDetectorOptions.Builder().setDetectorMode(PoseDetectorOptions.STREAM_MODE).build()
  )
  private val tracker = HoldTracker()
  private val busy = AtomicBoolean(false)
  private var lastSample = 0L
  private val main = Handler(Looper.getMainLooper())
  private var bitmapSampler: Runnable? = null

  fun createReader(rotationDegrees: Int, handler: Handler): ImageReader =
    ImageReader.newInstance(640, 360, ImageFormat.YUV_420_888, 2).apply {
      setOnImageAvailableListener({ reader ->
        val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
        val now = SystemClock.elapsedRealtime()
        if (!enabled || now - lastSample < SAMPLE_MS || !busy.compareAndSet(false, true)) {
          image.close()
          return@setOnImageAvailableListener
        }
        lastSample = now
        detect(InputImage.fromMediaImage(image, rotationDegrees), now) { image.close() }
      }, handler)
    }

  /** Fallback when the camera can't stream to an ImageReader: sample the preview on the main thread. */
  fun startBitmapSampling(grab: () -> Bitmap?) {
    stopBitmapSampling()
    val sampler = object : Runnable {
      override fun run() {
        val bitmap = if (enabled && !busy.get()) grab() else null
        if (bitmap != null && busy.compareAndSet(false, true)) {
          detect(InputImage.fromBitmap(bitmap, 0), SystemClock.elapsedRealtime()) {}
        }
        main.postDelayed(this, SAMPLE_MS)
      }
    }
    bitmapSampler = sampler
    main.post(sampler)
  }

  fun stopBitmapSampling() {
    bitmapSampler?.let(main::removeCallbacks)
    bitmapSampler = null
  }

  private fun detect(image: InputImage, nowMs: Long, release: () -> Unit) {
    detector.process(image)
      .addOnSuccessListener { pose ->
        if (tracker.update(XGesture.isX(toPose(pose)), nowMs / 1000.0)) onGesture()
      }
      .addOnCompleteListener {
        release()
        busy.set(false)
      }
  }

  /** ML Kit positions are pixels in the upright image, y growing downward, as XGesture expects. */
  private fun toPose(pose: MlPose): Pose {
    fun point(type: Int): Point? = pose.getPoseLandmark(type)?.let {
      Point(it.position.x.toDouble(), it.position.y.toDouble(), it.inFrameLikelihood.toDouble())
    }
    return Pose(
      leftWrist = point(PoseLandmark.LEFT_WRIST),
      rightWrist = point(PoseLandmark.RIGHT_WRIST),
      leftShoulder = point(PoseLandmark.LEFT_SHOULDER),
      rightShoulder = point(PoseLandmark.RIGHT_SHOULDER),
      nose = point(PoseLandmark.NOSE),
    )
  }
}
