package expo.modules.replaycamera

import expo.modules.kotlin.exception.CodedException
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

class NoSessionException : CodedException("NO_SESSION", "No replay session is running", null)

class ReplayCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError")

    AsyncFunction("startSession") { _: SessionOptions ->
      throw NoSessionException()
    }

    AsyncFunction("stopSession") {}

    AsyncFunction("saveClip") { _: SaveClipOptions ->
      throw NoSessionException()
    }

    Function("setGestureEnabled") { _: Boolean -> }

    View(ReplayCameraView::class) {}
  }
}
