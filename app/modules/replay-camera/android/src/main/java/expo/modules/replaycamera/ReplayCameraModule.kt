package expo.modules.replaycamera

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReplayCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReplayCamera")

    Events("onChange")

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    View(ReplayCameraView::class) {
    }
  }
}
