import SwiftUI

private let ground = Color(red: 0.059, green: 0.063, blue: 0.051) // #0F100D
private let accent = Color(red: 0.839, green: 0.949, blue: 0.247) // #D6F23F

struct ContentView: View {
  @StateObject private var link = WatchLink()
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    Group {
      switch link.screen {
      case .idle:
        idleView
      case .offline:
        VStack(spacing: 6) {
          Message("Sem conexão com o iPhone")
          BigButton(title: "Salvar", enabled: false, action: link.sendSave)
        }
      case let .recording(clipCount, startedAt):
        if link.previewOn {
          cameraView(clipCount: clipCount)
        } else {
          recordingView(clipCount: clipCount, startedAt: startedAt)
        }
      }
    }
    // The content runs to the bottom edge; the top stays clear of the clock.
    .padding(.horizontal, link.previewOn ? 0 : 4)
    .padding(.bottom, link.previewOn ? 0 : 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .ignoresSafeArea(edges: .bottom)
    .background(ground)
    .overlay { if let saved = link.confirmation { Confirmation(saved: saved) } }
    .animation(.easeOut(duration: 0.15), value: link.confirmation)
    // A watch screen that sleeps or an app that leaves the front stops asking for pictures.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { link.setPreview(false) } else { link.showCachedState() }
    }
  }

  /// Nothing is recording: one big Gravar button, or the reason it cannot work.
  private var idleView: some View {
    VStack(spacing: 6) {
      if !link.reachable { Message("Sem conexão com o iPhone") }
      BigButton(title: "Gravar", enabled: link.reachable, action: link.sendStart)
    }
  }

  /// Top to bottom: time and count, the two small controls, then Salvar filling everything that is left.
  private func recordingView(clipCount: Int, startedAt: Date?) -> some View {
    VStack(spacing: 6) {
      HStack(spacing: 8) {
        if let startedAt {
          TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(WatchModel.elapsed(since: startedAt, now: context.date)).monospacedDigit()
          }
        }
        Text(WatchModel.countLabel(clipCount)).foregroundStyle(accent)
        Spacer(minLength: 0)
      }
      .font(.system(.footnote, design: .rounded).weight(.bold))
      HStack(spacing: 6) {
        CameraToggle(isOn: false) { link.setPreview(true) }
        StopButton(action: link.sendStop)
      }
      BigButton(title: "Salvar", enabled: true, action: link.sendSave)
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


private struct Message: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text).font(.headline).multilineTextAlignment(.center).foregroundStyle(.white)
  }
}

/// Takes all the width and all the height left: easy to hit without looking, mid-play.
private struct BigButton: View {
  let title: String
  let enabled: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(.title2, design: .rounded).weight(.heavy))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .tint(accent)
    .foregroundStyle(ground)
    .disabled(!enabled)
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
  VStack(spacing: 6) {
    HStack {
      Text("12:34").monospacedDigit()
      Text("3 clipes").foregroundStyle(accent)
      Spacer()
    }
    .font(.system(.footnote, design: .rounded).weight(.bold))
    HStack(spacing: 6) {
      CameraToggle(isOn: false) {}
      StopButton {}
    }
    BigButton(title: "Salvar", enabled: true, action: {})
  }
  .padding(4)
  .background(ground)
}

#Preview("Sem conexão") {
  VStack(spacing: 6) {
    Message("Sem conexão com o iPhone")
    BigButton(title: "Gravar", enabled: false, action: {})
  }
  .padding(4)
  .background(ground)
}

#Preview("Parado") {
  BigButton(title: "Gravar", enabled: true, action: {}).padding(4).background(ground)
}
