import XCTest
@testable import ReplayCore

final class VoiceCommandTests: XCTestCase {
  func test_matchesSalvarOrGravar() {
    for phrase in ["salvar", "Gravar!", "ok, SALVAR agora", "pode gravar"] {
      XCTAssertTrue(VoiceCommand.matches(phrase), phrase)
    }
  }

  func test_ignoresAccentsAndCase() {
    XCTAssertTrue(VoiceCommand.matches("SÁLVAR"))
  }

  func test_doesNotFireOnOtherForms() {
    for phrase in ["que lance", "salvou", "gravando", "salva", "grava", "gravaram", "salvaram o ponto"] {
      XCTAssertFalse(VoiceCommand.matches(phrase), phrase)
    }
  }
}
