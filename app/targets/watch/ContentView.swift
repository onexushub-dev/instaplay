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
        Message("Comece a gravar no iPhone")
      case .offline:
        VStack(spacing: 8) {
          Message("Sem conexão com o iPhone")
          SaveButton(enabled: false, height: 80, action: link.sendSave)
        }
      case let .recording(clipCount, startedAt):
        if link.previewOn {
          cameraView(clipCount: clipCount)
        } else {
          VStack(spacing: 4) {
            HStack(spacing: 8) {
              CameraToggle(isOn: false) { link.setPreview(true) }
              Spacer(minLength: 0)
              VStack(alignment: .trailing, spacing: 0) {
                if let startedAt {
                  TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(WatchModel.elapsed(since: startedAt, now: context.date)).monospacedDigit()
                  }
                }
                Text(WatchModel.countLabel(clipCount)).foregroundStyle(accent)
              }
              .font(.system(.footnote, design: .rounded).weight(.bold))
            }
            SaveButton(enabled: true, action: link.sendSave)
          }
        }
      }
    }
    .padding(.horizontal, link.previewOn ? 0 : 6)
    .background(ground)
    .overlay { if let saved = link.confirmation { Confirmation(saved: saved) } }
    .animation(.easeOut(duration: 0.15), value: link.confirmation)
    // A watch screen that sleeps or an app that leaves the front stops asking for pictures.
    .onChange(of: scenePhase) { _, phase in if phase != .active { link.setPreview(false) } }
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
        .frame(width: 56, height: 44)
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

/// Fills the width and most of the height: easy to hit without looking, mid-play.
private struct SaveButton: View {
  let enabled: Bool
  var height: CGFloat = 80
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text("Salvar")
        .font(.system(.title3, design: .rounded).weight(.heavy))
        .frame(maxWidth: .infinity, minHeight: height)
    }
    .buttonStyle(.borderedProminent)
    .tint(accent)
    .foregroundStyle(ground)
    .disabled(!enabled)
  }
}

#Preview("Gravando") {
  VStack(spacing: 6) {
    HStack {
      Text("12:34").monospacedDigit()
      Spacer()
      Text("3 clipes").foregroundStyle(accent)
    }
    .font(.system(.footnote, design: .rounded).weight(.bold))
    SaveButton(enabled: true, action: {})
  }
  .padding(6)
  .background(ground)
}

#Preview("Sem conexão") {
  VStack(spacing: 8) {
    Message("Sem conexão com o iPhone")
    SaveButton(enabled: false, action: {})
  }
  .padding(6)
  .background(ground)
}

#Preview("Parado") {
  Message("Comece a gravar no iPhone").padding(6).background(ground)
}
