import XCTest
@testable import ReplayCore

final class VoiceCommandTests: XCTestCase {
  func test_matchesTheCommandAndCommonVariants() {
    for phrase in ["salva lance", "Salva o lance!", "salvar lance", "salve esse lance", "ok SALVA LANCE agora"] {
      XCTAssertTrue(VoiceCommand.matches(phrase), phrase)
    }
  }

  func test_ignoresAccentsAndExtraSpaces() {
    XCTAssertTrue(VoiceCommand.matches("sálva   lânce"))
  }

  func test_doesNotFireOnCourtTalk() {
    for phrase in ["que lance", "lance bonito", "salva", "salvou", "boa! lance", "salvar o jogo"] {
      XCTAssertFalse(VoiceCommand.matches(phrase), phrase)
    }
  }
}
