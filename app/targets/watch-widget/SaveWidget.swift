import AppIntents
import SwiftUI
import WidgetKit

private let ground = Color(red: 0.059, green: 0.063, blue: 0.051) // #0F100D
private let accent = Color(red: 0.839, green: 0.949, blue: 0.247) // #D6F23F

struct SaveEntry: TimelineEntry {
  let date: Date
}

struct SaveProvider: TimelineProvider {
  func placeholder(in context: Context) -> SaveEntry { SaveEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (SaveEntry) -> Void) { completion(SaveEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SaveEntry>) -> Void) {
    completion(Timeline(entries: [SaveEntry(date: .now)], policy: .never))
  }
}

/// One big button, nothing else: usable from the Smart Stack on a locked watch.
struct SaveWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var body: some View {
    Button(intent: SaveClipIntent()) {
      switch family {
      case .accessoryCircular:
        Image(systemName: "bookmark.fill").font(.title2)
      default:
        HStack {
          Image(systemName: "bookmark.fill")
          Text("Salvar").font(.system(.title3, design: .rounded).weight(.heavy))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .buttonStyle(.plain)
    .foregroundStyle(family == .accessoryRectangular ? ground : accent)
    .containerBackground(accent, for: .widget)
  }
}

struct SaveWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "LanceSave", provider: SaveProvider()) { _ in SaveWidgetView() }
      .configurationDisplayName("Salvar clipe")
      .description("Salva o clipe no iPhone, mesmo com o relógio bloqueado.")
      .supportedFamilies([.accessoryRectangular, .accessoryCircular])
  }
}

@main
struct LanceWidgets: WidgetBundle {
  var body: some Widget { SaveWidget() }
}
