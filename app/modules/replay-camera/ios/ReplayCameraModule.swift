import ExpoModulesCore

struct SessionOptions: Record {
  @Field var lens: String = "ultraWide"
  @Field var maxQuality: String = "1080p60"
}

struct SaveClipOptions: Record {
  @Field var source: String = "screen"
  @Field var at: Double = 0
}

final class ReplayException: Exception {
  private let errorCode: String
  private let detail: String

  init(_ code: String, _ detail: String) {
    errorCode = code
    self.detail = detail
    super.init()
  }

  override var code: String { errorCode }
  override var reason: String { detail }

  static func from(_ failure: ReplayEngine.Failure) -> ReplayException {
    switch failure {
    case .lowStorage: return ReplayException("LOW_STORAGE", "Less than 500 MB free")
    case .permission: return ReplayException("CAMERA_PERMISSION", "Camera permission not granted")
    case .unavailable(let e): return ReplayException("CAMERA_UNAVAILABLE", "\(e)")
    case .noSession: return ReplayException("NO_SESSION", "No replay session is running")
    case .encoder(let e): return ReplayException("ENCODER_FAILED", e.map { "\($0)" } ?? "encoder failed")
    }
  }
}

public class ReplayCameraModule: Module {
  private var engine: ReplayEngine { ReplayEngine.shared }

  public func definition() -> ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError", "onGestureDebug")

    OnCreate {
      self.engine.emit = { [weak self] name, body in self?.sendEvent(name, body) }
    }

    AsyncFunction("startSession") { (opts: SessionOptions) in
      do {
        try self.engine.start(lens: opts.lens, maxQuality: opts.maxQuality)
      } catch let failure as ReplayEngine.Failure {
        throw ReplayException.from(failure)
      }
    }

    AsyncFunction("stopSession") { (promise: Promise) in
      self.engine.stop { promise.resolve(nil) }
    }

    AsyncFunction("saveClip") { (_: SaveClipOptions, promise: Promise) in
      self.engine.saveClip { result in
        switch result {
        case .success(let clip): promise.resolve(["clipPath": clip.path, "durationMs": clip.durationMs])
        case .failure(let failure): promise.reject(ReplayException.from(failure))
        }
      }
    }

    Function("setGestureEnabled") { (enabled: Bool) in
      self.engine.gesture.enabled = enabled
    }

    Function("signalSaved") { (sound: Bool, flash: Bool) in
      self.engine.feedback.saved(sound: sound, flash: flash, activeCamera: self.engine.capture.camera)
    }

    AsyncFunction("createThumbnail") { (clipPath: String, atMs: Double) async throws -> String in
      try await ClipThumbnail.make(clipPath: clipPath, atMs: atMs)
    }

    Function("isVoiceSupported") { VoiceTrigger.isSupported }

    Function("setVoiceEnabled") { (enabled: Bool) in
      self.engine.voice.setEnabled(enabled)
    }

    AsyncFunction("requestSpeechPermission") { (promise: Promise) in
      VoiceTrigger.requestPermission { promise.resolve($0) }
    }

    Function("signalSaveFailed") { (sound: Bool) in
      self.engine.feedback.failed(sound: sound)
    }

    AsyncFunction("requestPermissions") { (promise: Promise) in
      ReplayEngine.requestPermissions { promise.resolve($0) }
    }

    View(ReplayCameraView.self) {}
  }
}
