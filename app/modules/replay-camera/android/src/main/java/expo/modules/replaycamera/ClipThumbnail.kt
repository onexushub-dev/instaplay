package expo.modules.replaycamera

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.os.Build
import java.io.File

/** A JPEG frame of a saved clip, written next to it (<clip>.jpg) and reused when it already exists. */
object ClipThumbnail {
  fun path(clipPath: String): String = clipPath.substringBeforeLast('.') + ".jpg"

  fun make(clipPath: String, atMs: Double): String {
    val out = File(path(clipPath))
    if (out.exists()) return out.path

    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(clipPath)
      val timeUs = (atMs * 1000).toLong()
      val frame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        retriever.getScaledFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 640, 640)
      } else {
        retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let(::scaledDown)
      } ?: error("no frame at $atMs ms")
      // The segment muxers stored the phone's rotation as metadata; frames come out unrotated.
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toFloatOrNull() ?: 0f
      val upright = if (rotation == 0f) frame else
        Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, Matrix().apply { postRotate(rotation) }, true)
      // Write then rename, so a crash never leaves a half-written thumbnail that later views would reuse.
      val tmp = File(out.path + ".tmp")
      tmp.outputStream().use { upright.compress(Bitmap.CompressFormat.JPEG, 75, it) }
      if (!tmp.renameTo(out)) tmp.delete()
      return out.path
    } finally {
      retriever.release()
    }
  }

  private fun scaledDown(frame: Bitmap): Bitmap {
    val scale = 640f / maxOf(frame.width, frame.height)
    return if (scale >= 1f) frame else
      Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt(), (frame.height * scale).toInt(), true)
  }
}
