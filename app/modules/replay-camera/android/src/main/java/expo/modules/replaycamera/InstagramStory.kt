package expo.modules.replaycamera

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * Opens Instagram's Story composer with a video as the background (Meta "Sharing to Stories").
 * Needs a Meta (Facebook) App ID; without one, or without Instagram installed, the caller falls back.
 */
object InstagramStory {
  private const val INSTAGRAM = "com.instagram.android"

  fun share(activity: Activity, videoPath: String, metaAppId: String): Boolean {
    if (metaAppId.isEmpty()) return false
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.replaycamera.files", File(videoPath))
    val intent = Intent("com.instagram.share.ADD_TO_STORY").apply {
      setDataAndType(uri, "video/mp4")
      putExtra("source_application", metaAppId)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    if (intent.resolveActivity(activity.packageManager) == null) return false
    activity.grantUriPermission(INSTAGRAM, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    activity.startActivity(intent)
    return true
  }
}
