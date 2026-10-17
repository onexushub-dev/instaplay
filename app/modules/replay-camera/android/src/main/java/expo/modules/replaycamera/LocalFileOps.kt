package expo.modules.replaycamera

import android.content.Context
import expo.modules.replaycamera.core.FileOps
import java.io.File

/** FileOps on the real filesystem. A file that is already gone is the goal, so failures are ignored. */
object LocalFileOps : FileOps {
  override fun delete(file: File) { file.delete() }
  override fun list(dir: File): List<File> = dir.listFiles()?.toList() ?: emptyList()
  override fun exists(file: File): Boolean = file.exists()
}

object ReplayPaths {
  fun buffer(context: Context) = File(context.cacheDir, "replay-buffer").apply { mkdirs() }
  fun clips(context: Context) = File(context.filesDir, "clips").apply { mkdirs() }
}
