package expo.modules.replaycamera

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
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
      val frame = retriever.getScaledFrameAtTime((atMs * 1000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 640, 640)
        ?: error("no frame at $atMs ms")
      // The segment muxers stored the phone's rotation as metadata; frames come out unrotated.
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toFloatOrNull() ?: 0f
      val upright = if (rotation == 0f) frame else
        Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, Matrix().apply { postRotate(rotation) }, true)
      out.outputStream().use { upright.compress(Bitmap.CompressFormat.JPEG, 75, it) }
      return out.path
    } finally {
      retriever.release()
    }
  }
}
