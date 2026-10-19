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
          SaveButton(enabled: false, action: link.sendSave)
        }
      case let .recording(clipCount, startedAt):
        VStack(spacing: 6) {
          HStack {
            Button {
              link.setPreview(!link.previewOn)
            } label: {
              Image(systemName: link.previewOn ? "camera.fill" : "camera")
            }
            .buttonStyle(.plain)
            .frame(width: 32, height: 32)
            .accessibilityLabel(link.previewOn ? "Fechar câmera" : "Ver câmera")
            if let startedAt {
              TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(WatchModel.elapsed(since: startedAt, now: context.date)).monospacedDigit()
              }
            }
            Spacer()
            Text(WatchModel.countLabel(clipCount)).foregroundStyle(accent)
          }
          .font(.system(.footnote, design: .rounded).weight(.bold))
          if link.previewOn {
            // What the phone's camera sees, to check the framing from the court.
            Group {
              if let picture = link.picture {
                Image(uiImage: picture).resizable().scaledToFit()
              } else {
                ProgressView()
              }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 8))
          }
          SaveButton(enabled: true, action: link.sendSave)
        }
      }
    }
    .padding(.horizontal, 6)
    .background(ground)
    // A watch screen that sleeps or an app that leaves the front stops asking for pictures.
    .onChange(of: scenePhase) { _, phase in if phase != .active { link.setPreview(false) } }
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
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text("Salvar clipe")
        .font(.system(.title3, design: .rounded).weight(.heavy))
        .frame(maxWidth: .infinity, minHeight: 80)
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
