import AVFoundation
import Speech

/// Listens for "salvar" or "gravar" in the game's own audio (the capture session's microphone samples),
/// strictly on the device (court audio never goes to a server). Each recognition task is restarted every ~50s (Apple's
/// limit is about a minute) and right after a command, which also clears the transcript.
final class VoiceTrigger {
  static let restartAfter: TimeInterval = 50
  static let cooldown: TimeInterval = 2
  /// After a failed task, wait before trying again (doubling up to 30s) instead of retrying every buffer.
  static let firstBackoff: TimeInterval = 2
  static let maxBackoff: TimeInterval = 30

  /// Offline pt-BR recognition exists on this phone.
  static var isSupported: Bool {
    SFSpeechRecognizer(locale: Locale(identifier: "pt-BR"))?.supportsOnDeviceRecognition ?? false
  }

  var onCommand: (() -> Void)?

  private let queue = DispatchQueue(label: "replay.voice")
  private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "pt-BR"))
  private var enabled = false
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var startedAt = Date.distantPast
  private var lastCommand = Date.distantPast
  private var retryAt = Date.distantPast
  private var backoff = firstBackoff

  static func requestPermission(completion: @escaping (Bool) -> Void) {
    SFSpeechRecognizer.requestAuthorization { completion($0 == .authorized) }
  }

  func setEnabled(_ on: Bool) {
    queue.async {
      self.enabled = on
      if !on { self.stopTask() }
    }
  }

  func stop() { setEnabled(false) }

  /// Call with every audio sample buffer from the capture session.
  func consider(_ buffer: CMSampleBuffer) {
    queue.async {
      guard self.enabled, SFSpeechRecognizer.authorizationStatus() == .authorized,
            let recognizer = self.recognizer, recognizer.isAvailable, recognizer.supportsOnDeviceRecognition,
            Date() >= self.retryAt else { return }
      if self.request == nil || Date().timeIntervalSince(self.startedAt) > Self.restartAfter {
        self.startTask(recognizer)
      }
      self.request?.appendAudioSampleBuffer(buffer)
    }
  }

  /// Must run on `queue`.
  private func startTask(_ recognizer: SFSpeechRecognizer) {
    stopTask()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = true
    request.contextualStrings = VoiceCommand.words
    self.request = request
    startedAt = Date()
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      self.queue.async {
        guard self.request === request else { return } // a task we already replaced
        if result != nil { self.backoff = Self.firstBackoff } // recognition works again
        if let text = result?.bestTranscription.formattedString, VoiceCommand.matches(text),
           Date().timeIntervalSince(self.lastCommand) > Self.cooldown {
          self.lastCommand = Date()
          self.onCommand?()
          self.stopTask() // the next buffer starts a fresh transcript
        } else if error != nil {
          self.stopTask()
          self.retryAt = Date().addingTimeInterval(self.backoff)
          self.backoff = min(self.backoff * 2, Self.maxBackoff)
        } else if result?.isFinal == true {
          self.stopTask()
        }
      }
    }
  }

  /// Must run on `queue`.
  private func stopTask() {
    request?.endAudio()
    task?.cancel()
    request = nil
    task = nil
  }
}
