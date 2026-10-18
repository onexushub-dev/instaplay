package expo.modules.replaycamera

import android.Manifest
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SessionOptions : Record {
  @Field val lens: String = "ultraWide"
  @Field val maxQuality: String = "1080p60"
}

class SaveClipOptions : Record {
  @Field val source: String = "screen"
  @Field val at: Double = 0.0
}

class ReplayCameraModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError", "onGestureDebug")

    OnCreate {
      ReplayEngine.emit = { name, body -> sendEvent(name, body) }
    }

    AsyncFunction("startSession") { opts: SessionOptions, promise: Promise ->
      ReplayEngine.start(context, opts.lens, opts.maxQuality, onReady = { promise.resolve(null) }, onError = promise::reject)
    }

    AsyncFunction("stopSession") { promise: Promise ->
      ReplayEngine.stop { promise.resolve(null) }
    }

    AsyncFunction("saveClip") { _: SaveClipOptions, promise: Promise ->
      ReplayEngine.saveClip(
        onDone = { path, ms -> promise.resolve(mapOf("clipPath" to path, "durationMs" to ms)) },
        onError = promise::reject,
      )
    }

    Function("setGestureEnabled") { enabled: Boolean -> ReplayEngine.setGestureEnabled(enabled) }

    Function("signalSaved") { sound: Boolean, flash: Boolean -> ReplayEngine.signalSaved(sound, flash) }

    // Voice is iOS-only for now: Android's microphone is already taken by the recorder.
    Function("setVoiceEnabled") { _: Boolean -> }

    AsyncFunction("requestSpeechPermission") { false }

    Function("signalSaveFailed") { sound: Boolean -> ReplayEngine.signalSaveFailed(sound) }

    AsyncFunction("requestPermissions") { promise: Promise ->
      val permissions = appContext.permissions ?: return@AsyncFunction promise.resolve(false)
      permissions.askForPermissions(
        { results -> promise.resolve(results.values.all { it.status == PermissionsStatus.GRANTED }) },
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
      )
    }

    OnActivityEntersBackground { ReplayEngine.pause() }

    OnActivityEntersForeground { ReplayEngine.resume() }

    View(ReplayCameraView::class) {}
  }
}
