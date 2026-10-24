import XCTest
@testable import ReplayCore

final class VoiceCommandTests: XCTestCase {
  func test_wordsPerLocale() {
    XCTAssertEqual(VoiceCommand.words(for: .ptBR), ["salvar", "gravar"])
    XCTAssertEqual(VoiceCommand.words(for: .enUS), ["save", "record"])
  }

  func test_localeFromTheJavaScriptTag() {
    XCTAssertEqual(VoiceLocale(rawValue: "pt-BR"), .ptBR)
    XCTAssertEqual(VoiceLocale(rawValue: "en-US"), .enUS)
    XCTAssertNil(VoiceLocale(rawValue: "es-ES"))
  }

  func test_portugueseMatchesSalvarOrGravar() {
    for phrase in ["salvar", "Gravar!", "ok, SALVAR agora", "pode gravar"] {
      XCTAssertTrue(VoiceCommand.matches(phrase, locale: .ptBR), phrase)
    }
  }

  func test_portugueseIgnoresAccentsAndCase() {
    XCTAssertTrue(VoiceCommand.matches("SÁLVAR", locale: .ptBR))
  }

  func test_portugueseDoesNotFireOnOtherForms() {
    for phrase in ["que lance", "salvou", "gravando", "salva", "grava", "gravaram", "salvaram o ponto", "save", "record"] {
      XCTAssertFalse(VoiceCommand.matches(phrase, locale: .ptBR), phrase)
    }
  }

  func test_englishMatchesSaveOrRecord() {
    for phrase in ["save", "Record!", "ok SAVE it", "please record", "Save."] {
      XCTAssertTrue(VoiceCommand.matches(phrase, locale: .enUS), phrase)
    }
  }

  func test_englishIgnoresAccentsAndCase() {
    XCTAssertTrue(VoiceCommand.matches("SÄVE", locale: .enUS))
  }

  func test_englishDoesNotFireOnOtherForms() {
    for phrase in ["saved", "saves", "saving", "recording", "records", "recorded", "safe", "salvar", "gravar"] {
      XCTAssertFalse(VoiceCommand.matches(phrase, locale: .enUS), phrase)
    }
  }
}
