package expo.modules.replaycamera

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper

/** Save confirmation for a player far from the phone: a tone and two blinks of the rear torch. */
class ReplayFeedback {
  private val tones = runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 100) }.getOrNull()
  private val main = Handler(Looper.getMainLooper())

  fun saved(sound: Boolean, flash: Boolean, torch: ((Boolean) -> Unit)?) {
    if (sound) tones?.startTone(ToneGenerator.TONE_PROP_ACK, 250)
    if (flash && torch != null) {
      listOf(true, false, true, false).forEachIndexed { i, on -> main.postDelayed({ torch(on) }, i * 120L) }
    }
  }

  fun failed(sound: Boolean) {
    if (sound) tones?.startTone(ToneGenerator.TONE_PROP_NACK, 400)
  }
}
