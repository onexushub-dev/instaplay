import ExpoModulesCore

struct SessionOptions: Record {
  @Field var lens: String = "ultraWide"
  @Field var maxQuality: String = "1080p60"
}

struct SaveClipOptions: Record {
  @Field var source: String = "screen"
  @Field var at: Double = 0
}

final class NoSessionException: Exception {
  override var code: String { "NO_SESSION" }
  override var reason: String { "No replay session is running" }
}

public class ReplayCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError")

    AsyncFunction("startSession") { (_: SessionOptions) in
      throw NoSessionException()
    }

    AsyncFunction("stopSession") {}

    AsyncFunction("saveClip") { (_: SaveClipOptions) -> [String: Any] in
      throw NoSessionException()
    }

    Function("setGestureEnabled") { (_: Bool) in }

    View(ReplayCameraView.self) {}
  }
}
