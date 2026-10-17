package expo.modules.replaycamera

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Live preview of the replay session. Must be mounted before startSession so the camera streams into it. */
class ReplayCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val texture = TextureView(context).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
        st.setDefaultBufferSize(1920, 1080)
        ReplayEngine.previewSurface = Surface(st)
        ReplayEngine.previewBitmap = { if (isAvailable) getBitmap(640, 360) else null }
      }

      override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        ReplayEngine.previewSurface?.release()
        ReplayEngine.previewSurface = null
        ReplayEngine.previewBitmap = null
        return true
      }

      override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) = Unit
      override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
    }
  }

  init {
    addView(texture)
  }
}
