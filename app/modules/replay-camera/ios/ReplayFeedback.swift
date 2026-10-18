import AVFoundation

/// Save confirmation for a player far from the phone: a chime and two blinks of the rear torch.
final class ReplayFeedback {
  private let queue = DispatchQueue(label: "replay.feedback")
  private lazy var savedSound = Chime.wav(notes: Chime.saved)
  private lazy var failedSound = Chime.wav(notes: Chime.failed)
  private var player: AVAudioPlayer?

  func saved(sound: Bool, flash: Bool, activeCamera: AVCaptureDevice?) {
    if sound { play(savedSound) }
    if flash { blink(activeCamera) }
  }

  func failed(sound: Bool) {
    if sound { play(failedSound) }
  }

  /// Plays inside the capture session's play-and-record audio session (which ignores the silent switch),
  /// routed to the loudspeaker rather than the earpiece.
  private func play(_ data: Data) {
    DispatchQueue.main.async {
      try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.speaker)
      self.player = try? AVAudioPlayer(data: data)
      self.player?.volume = 1
      self.player?.play()
    }
  }

  /// Two quick blinks. The ultra-wide lens has no torch of its own, so fall back to the wide camera's.
  private func blink(_ active: AVCaptureDevice?) {
    let device = [active, AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)]
      .compactMap { $0 }
      .first { $0.hasTorch && $0.isTorchModeSupported(.on) }
    guard let device else { return }
    queue.async {
      for on in [true, false, true] {
        // A step that can't lock (the camera is being reconfigured) is skipped, never left half-done.
        if (try? device.lockForConfiguration()) != nil {
          if on { try? device.setTorchModeOn(level: 1) } else { device.torchMode = .off }
          device.unlockForConfiguration()
        }
        Thread.sleep(forTimeInterval: 0.12)
      }
      // Always end dark, even if an earlier step failed.
      for _ in 0..<5 {
        if (try? device.lockForConfiguration()) != nil {
          device.torchMode = .off
          device.unlockForConfiguration()
          return
        }
        Thread.sleep(forTimeInterval: 0.05)
      }
    }
  }
}
