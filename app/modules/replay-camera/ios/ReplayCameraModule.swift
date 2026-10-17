import ExpoModulesCore

public class ReplayCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReplayCamera")

    Events("onChange")

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    View(ReplayCameraView.self) {
    }
  }
}
