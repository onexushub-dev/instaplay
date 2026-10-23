import SwiftUI

private let ground = Color(red: 0.059, green: 0.063, blue: 0.051) // #0F100D
private let accent = Color(red: 0.812, green: 0.918, blue: 0.475) // #CFEA79

struct ContentView: View {
  @StateObject private var link = WatchLink()
  @Environment(\.scenePhase) private var scenePhase
  /// Wrist down / Always-On: the screen is dimmed and the app stays on it, so it shows only what matters.
  @Environment(\.isLuminanceReduced) private var dimmed

  var body: some View {
    Group {
      switch link.screen {
      case .idle:
        idleView
      case .connecting:
        ConnectingView()
      case .offline:
        PhoneClosedView(lostRecording: true)
      case let .recording(clipCount, startedAt):
        if dimmed {
          dimmedView(clipCount: clipCount)
        } else if link.previewOn {
          cameraView(clipCount: clipCount)
        } else {
          recordingView(clipCount: clipCount, startedAt: startedAt)
        }
      }
    }
    // The content runs to every edge of the screen; the small padding keeps the buttons off the rounded corners,
    // and the top row shares the line with the system clock.
    .padding(.horizontal, link.previewOn ? 0 : 3)
    .padding(.bottom, link.previewOn ? 0 : 3)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .ignoresSafeArea()
    .background(ground)
    .overlay { if let saved = link.confirmation { Confirmation(saved: saved) } }
    .animation(.easeOut(duration: 0.15), value: link.confirmation)
    // A watch screen that sleeps or an app that leaves the front stops asking for pictures.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { link.setPreview(false) } else { link.showCachedState() }
    }
  }

  /// Nothing is recording: one big Começar gravação button. Without the Repplay app open on the phone it cannot work, so
  /// the screen says to open it instead: nothing to tap that would go nowhere.
  @ViewBuilder private var idleView: some View {
    if !link.reachable || link.startFailed {
      PhoneClosedView(lostRecording: false).onTapGesture { link.dismissStartFailed() }
    } else {
      VStack(spacing: 3) {
        Header {}
        BigButton(
          title: link.starting ? "Começando…" : "Começar gravação", style: .title2, enabled: !link.starting,
          action: link.sendStart)
      }
    }
  }

  /// Dimmed screen: just the count and Salvar, nothing else to mis-tap.
  private func dimmedView(clipCount: Int) -> some View {
    VStack(spacing: 3) {
      Header { Text(WatchModel.countLabel(clipCount)).foregroundStyle(accent) }
      BigButton(title: "Salvar", enabled: true, action: link.sendSave)
    }
  }

  /// Top to bottom: time and count, the two small controls, then Salvar filling everything that is left.
  private func recordingView(clipCount: Int, startedAt: Date?) -> some View {
    VStack(spacing: 4) {
      Header {
        if let startedAt {
          TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(WatchModel.elapsed(since: startedAt, now: context.date)).monospacedDigit()
          }
        }
        Text(WatchModel.countLabel(clipCount)).foregroundStyle(accent)
      }
      HStack(spacing: 6) {
        CameraToggle(isOn: false) { link.setPreview(true) }
        StopButton(action: link.sendStop)
      }
      // Room between the small controls and Salvar, so a thumb aiming at one does not land on the other.
      BigButton(title: "Salvar", enabled: true, action: link.sendSave)
        .padding(.top, 8)
    }
  }

  /// The camera fills the screen and there is no Salvar button: a tap anywhere saves. Only the corner
  /// buttons (close the camera) and the count sit over the picture.
  private func cameraView(clipCount: Int) -> some View {
    ZStack {
      Color.black
      if let picture = link.picture {
        Image(uiImage: picture).resizable().scaledToFit()
      } else {
        ProgressView()
      }
      VStack {
        HStack(alignment: .top) {
          CameraToggle(isOn: true) { link.setPreview(false) }
          Spacer(minLength: 0)
          Text(WatchModel.countLabel(clipCount))
            .font(.system(.footnote, design: .rounded).weight(.bold))
            .foregroundStyle(accent)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color.black.opacity(0.55), in: Capsule())
        }
        Spacer(minLength: 0)
      }
      .padding(4)
    }
    .contentShape(Rectangle())
    .onTapGesture { link.sendSave() }
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel("Salvar")
    .ignoresSafeArea(edges: .bottom)
  }
}

/// Fills the screen for a moment: the clip is safe (or the save failed), visible even when the haptic is missed.
private struct Confirmation: View {
  let saved: Bool
  var body: some View {
    ZStack {
      (saved ? accent : Color.red).opacity(0.92)
      VStack(spacing: 4) {
        Image(systemName: saved ? "checkmark.circle.fill" : "xmark.circle.fill").font(.system(size: 44))
        Text(saved ? "Salvo" : "Não salvou").font(.system(.title3, design: .rounded).weight(.heavy))
      }
      .foregroundStyle(saved ? ground : .white)
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .transition(.opacity)
  }
}

private struct CameraToggle: View {
  let isOn: Bool
  let action: () -> Void
  var body: some View {
    // A real button, not a small icon: easy to hit on a moving wrist.
    Button(action: action) {
      Image(systemName: isOn ? "xmark" : "camera")
        .font(.system(size: 20, weight: .semibold))
        .frame(width: isOn ? 56 : nil, height: 44)
        .frame(maxWidth: isOn ? nil : .infinity)
        .background(isOn ? Color.black.opacity(0.6) : Color.white.opacity(0.2), in: Capsule())
        .foregroundStyle(.white)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(isOn ? "Fechar câmera" : "Ver câmera")
  }
}


/// The Repplay app is not open on the phone, so nothing here can record or save: say so, large, and say what to do.
private struct PhoneClosedView: View {
  /// A recording that lost its phone, rather than a watch that never had one.
  let lostRecording: Bool
  var body: some View {
    VStack(spacing: 3) {
      Header { if lostRecording { Text("Sem conexão").foregroundStyle(.red) } }
      VStack(spacing: 8) {
        Image(systemName: "iphone.gen3").font(.system(size: 42, weight: .semibold)).foregroundStyle(accent)
        Text("Abra o Repplay no iPhone")
          .font(.system(.title3, design: .rounded).weight(.heavy))
          .multilineTextAlignment(.center)
          .foregroundStyle(.white)
        Text(lostRecording ? "A gravação perdeu a conexão com o relógio." : "Sem o app aberto não dá para gravar nem salvar clipes.")
          .font(.system(.footnote, design: .rounded))
          .multilineTextAlignment(.center)
          .minimumScaleFactor(0.8)
          .foregroundStyle(.white.opacity(0.7))
      }
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
  }
}

/// Just opened and the phone has not spoken yet: a short, neutral wait before deciding anything.
private struct ConnectingView: View {
  var body: some View {
    VStack(spacing: 3) {
      Header {}
      VStack(spacing: 10) {
        ProgressView().tint(accent)
        Text("Conectando ao iPhone…")
          .font(.system(.title3, design: .rounded).weight(.heavy))
          .multilineTextAlignment(.center)
          .foregroundStyle(.white)
      }
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
  }
}

/// The line at the top, level with the system clock (which owns the right side): text on the left only.
private struct Header<Content: View>: View {
  @ViewBuilder let content: Content
  var body: some View {
    HStack(spacing: 8) {
      content
      Spacer(minLength: 0)
    }
    .font(.system(.footnote, design: .rounded).weight(.bold))
    // The screen curves away at the top corners: the text starts well inside, level with the system clock.
    .padding(.leading, 22)
    .frame(height: 28)
    .padding(.top, 8)
  }
}

/// Fills all the width and all the height left, edge to edge: easy to hit without looking, mid-play.
/// Drawn by hand: the system prominent style adds its own margin and shrinks the target.
private struct BigButton: View {
  let title: String
  var style: Font.TextStyle = .title
  let enabled: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(style, design: .rounded).weight(.heavy))
        .multilineTextAlignment(.center)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, 8)
        .foregroundStyle(ground)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(enabled ? accent : accent.opacity(0.25), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
    .buttonStyle(PressStyle())
    .disabled(!enabled)
  }
}

private struct PressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.75 : 1)
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
  }
}

/// Ends the game only on a press-and-hold, so a mis-tap mid-play cannot; a short tap says how.
private struct StopButton: View {
  let action: () -> Void
  @State private var pressing = false
  @State private var hint = false
  var body: some View {
    Text(hint ? "Segure" : "Parar")
      .font(.system(.footnote, design: .rounded).weight(.bold))
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(pressing ? Color.red : Color.red.opacity(0.35), in: Capsule())
      .foregroundStyle(.white)
      .scaleEffect(pressing ? 0.96 : 1)
      .animation(.easeOut(duration: 0.15), value: pressing)
      .onLongPressGesture(minimumDuration: 1, maximumDistance: 30, perform: action) { pressing = $0 }
      .onTapGesture {
        hint = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { hint = false }
      }
      .accessibilityLabel("Parar a gravação")
      .accessibilityHint("Segure para parar")
  }
}

#Preview("Gravando") {
  VStack(spacing: 3) {
    Header {
      Text("12:34").monospacedDigit()
      Text("3 clipes").foregroundStyle(accent)
    }
    HStack(spacing: 3) {
      CameraToggle(isOn: false) {}
      StopButton {}
    }
    BigButton(title: "Salvar", enabled: true, action: {})
  }
  .padding(3)
  .background(ground)
}

#Preview("iPhone fechado") {
  PhoneClosedView(lostRecording: false).padding(3).background(ground)
}

#Preview("Conectando") {
  ConnectingView().padding(3).background(ground)
}

#Preview("Parado") {
  VStack(spacing: 3) {
    Header {}
    BigButton(title: "Começar gravação", style: .title2, enabled: true, action: {})
  }
  .padding(3)
  .background(ground)
}
