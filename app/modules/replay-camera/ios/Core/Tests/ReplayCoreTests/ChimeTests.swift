import Foundation
import XCTest
@testable import ReplayCore

final class ChimeTests: XCTestCase {
  func test_wavHeaderAndLength() {
    let data = Chime.wav(notes: [(880, 0.1), (1320, 0.15)], sampleRate: 44_100)
    XCTAssertEqual(String(data: data.prefix(4), encoding: .ascii), "RIFF")
    XCTAssertEqual(String(data: data.subdata(in: 8..<12), encoding: .ascii), "WAVE")
    let samples = Int(44_100 * 0.1) + Int(44_100 * 0.15)
    XCTAssertEqual(data.count, 44 + samples * 2) // 16-bit mono PCM
  }

  func test_notesFadeOutToSilence() {
    let data = Chime.wav(notes: [(880, 0.1)], sampleRate: 8_000)
    let last = data.suffix(2).withUnsafeBytes { $0.load(as: Int16.self) }
    XCTAssertLessThan(abs(Int(last)), 200)
  }
}
