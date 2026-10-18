import Foundation

/// Finds the spoken save command ("salva lance") in a speech transcript.
/// Two words make it unlikely to fire on court talk like "que lance!".
public enum VoiceCommand {
  public static let phrase = "salva lance"

  // salva / salve / salvar, optionally "o" or "esse", then "lance".
  private static let pattern = try! NSRegularExpression(pattern: #"\bsalv(a|e|ar)\s+(o\s+|esse\s+)?lance\b"#)

  public static func matches(_ transcript: String) -> Bool {
    let text = transcript
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "pt_BR"))
      .lowercased()
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    return pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
  }
}
