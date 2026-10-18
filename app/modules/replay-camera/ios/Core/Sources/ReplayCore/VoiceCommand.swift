import Foundation

/// Finds the spoken save command in a speech transcript: "salvar" or "gravar", as whole words
/// (so "salvou", "gravando" and court talk don't fire it).
public enum VoiceCommand {
  public static let words = ["salvar", "gravar"]

  private static let pattern = try! NSRegularExpression(pattern: #"\b(salvar|gravar)\b"#)

  public static func matches(_ transcript: String) -> Bool {
    let text = transcript
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "pt_BR"))
      .lowercased()
    return pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }
}
