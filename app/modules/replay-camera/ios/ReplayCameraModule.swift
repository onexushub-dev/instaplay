import ExpoModulesCore
import Speech

struct SessionOptions: Record {
  @Field var lens: String = "ultraWide"
  @Field var maxQuality: String = "1080p60"
  @Field var bufferSeconds: Double = 60
}

struct SaveClipOptions: Record {
  @Field var source: String = "screen"
  @Field var at: Double = 0
}

final class ReplayException: Exception, @unchecked Sendable {
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

struct CropRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 1
  @Field var height: Double = 1
}

struct ExportClipOptions: Record {
  @Field var clipPath: String = ""
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
  @Field var speed: Double = 1
  @Field var muted: Bool = false
  @Field var rotation: Int = 0
  @Field var crop: CropRect?
  @Field var width: Int = 1080
  @Field var height: Int = 1920
  @Field var overlayPngPath: String?
  @Field var background: String = "#0F100D"
}

public class ReplayCameraModule: Module {
  private var engine: ReplayEngine { ReplayEngine.shared }

  public func definition() -> ModuleDefinition {
    Name("ReplayCamera")

    Events("onTrigger", "onThermalChange", "onInterrupted", "onResumed", "onError", "onGestureDebug", "onWatchStatus",
           "onRemoteStatus", "onRemoteState", "onRemoteResult", "onRemotePairing", "onRemoteStop",
           "onRemoteStart", "onRemoteFrame")

    OnCreate {
      self.engine.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      WatchBridge.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      RemoteHost.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      RemoteController.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      WatchBridge.shared.preview = self.engine.watchPreview
      self.engine.remotePreview.onFrame = { RemoteHost.shared.sendFrame($0) }
      RemoteHost.shared.onPreview = { [weak self] on in self?.engine.remotePreview.ask(on) }
      WatchBridge.shared.activate()
    }

    AsyncFunction("startSession") { (opts: SessionOptions) in
      do {
        try self.engine.start(lens: opts.lens, maxQuality: opts.maxQuality, bufferSeconds: opts.bufferSeconds)
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

    AsyncFunction("exportClip") { (o: ExportClipOptions) async throws -> [String: Any] in
      do {
        let result = try await ClipExporter.export(.init(
          clipPath: o.clipPath, startMs: o.startMs, endMs: o.endMs, speed: o.speed, muted: o.muted,
          rotation: o.rotation,
          crop: o.crop.map { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height) },
          width: o.width, height: o.height, overlayPngPath: o.overlayPngPath, background: UIColor(hex: o.background)))
        return ["path": result.path, "durationMs": result.durationMs]
      } catch {
        throw ReplayException("ENCODER_FAILED", "\(error)")
      }
    }

    AsyncFunction("shareToInstagramStory") { (videoPath: String, metaAppId: String) async -> String in
      await InstagramStory.share(videoPath: videoPath, metaAppId: metaAppId) ? "opened" : "unavailable"
    }

    AsyncFunction("createThumbnail") { (clipPath: String, atMs: Double) async throws -> String in
      try await ClipThumbnail.make(clipPath: clipPath, atMs: atMs)
    }

    AsyncFunction("findContentStart") { (clipPath: String) async -> Double in
      await ClipContent.firstPictureMs(clipPath: clipPath)
    }

    Function("getWatchStatus") { () -> String in WatchBridge.shared.status }

    Function("watchSync") { (recording: Bool, clipCount: Int, startedAt: Double?) in
      WatchBridge.shared.sync(recording: recording, clipCount: clipCount, startedAt: startedAt)
    }

    Function("watchSignal") { (saved: Bool) in
      WatchBridge.shared.signal(saved: saved)
    }

    // Second iPhone as a remote. Camera phone side:
    Function("remoteHostStart") { RemoteHost.shared.start() }

    Function("remoteHostStop") { RemoteHost.shared.stop() }

    Function("remoteHostBeginPairing") { () -> [String: Any]? in
      guard let pairing = RemoteHost.shared.beginPairing() else { return nil }
      return ["url": pairing.url, "code": pairing.code, "expiresAt": pairing.expiresAt, "qrPath": pairing.qrPath]
    }

    Function("remoteHostEndPairing") { RemoteHost.shared.endPairing() }

    Function("remoteHostPeers") { () -> [[String: String]] in
      RemoteHost.shared.peers.map { ["id": $0.id, "name": $0.name] }
    }

    Function("remoteHostRemove") { (id: String) in RemoteHost.shared.remove(id: id) }

    Function("remoteHostControllers") { () -> Int in RemoteHost.shared.controllers }

    Function("remoteSync") { (recording: Bool, clipCount: Int, startedAt: Double?) in
      RemoteHost.shared.sync(recording: recording, clipCount: clipCount, startedAt: startedAt)
    }

    Function("remoteSignal") { (saved: Bool) in RemoteHost.shared.signal(saved: saved) }

    // Remote phone side:
    Function("remoteControllerStart") { RemoteController.shared.start() }

    Function("remoteControllerStop") { RemoteController.shared.stop() }

    Function("remoteControllerHost") { () -> [String: String]? in
      guard let host = RemoteController.shared.host else { return nil }
      return ["id": host.id, "name": host.name]
    }

    Function("remoteControllerForget") { RemoteController.shared.forget() }

    Function("remoteControllerPairWithLink") { (hostId: String, secret: String, hostName: String) in
      RemoteController.shared.pair(hostId: hostId, secret: secret, hostName: hostName)
    }

    Function("remoteControllerPairWithCode") { (code: String) in RemoteController.shared.pair(code: code) }

    Function("remoteControllerSave") { RemoteController.shared.save() }

    Function("remoteControllerEndRecording") { RemoteController.shared.endRecording() }

    Function("remoteControllerStartRecording") { RemoteController.shared.startRecording() }

    Function("remoteControllerPreview") { (on: Bool) in RemoteController.shared.preview(on) }

    // The name this phone shows to the other one while pairing, and the way to change it.
    Function("remoteDeviceName") { () -> String in DeviceIdentity.name }

    Function("remoteSetDeviceName") { (name: String) in DeviceIdentity.setCustomName(name) }

    // The locale is the app's language as a tag ("pt-BR" or "en-US"); anything else is treated as English.
    Function("isVoiceSupported") { (locale: String) in VoiceTrigger.isSupported(VoiceLocale(rawValue: locale) ?? .enUS) }

    Function("getSpeechPermission") { () -> String in
      switch SFSpeechRecognizer.authorizationStatus() {
      case .authorized: return "granted"
      case .notDetermined: return "undetermined"
      default: return "denied"
      }
    }

    Function("setVoiceEnabled") { (enabled: Bool, locale: String) in
      self.engine.voice.setEnabled(enabled, locale: VoiceLocale(rawValue: locale) ?? .enUS)
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
