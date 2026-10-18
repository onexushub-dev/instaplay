import CoreGraphics
import XCTest
@testable import ReplayCore

final class PersonCropTests: XCTestCase {
  private let frame = CGRect(x: 0, y: 0, width: 1920, height: 1080)

  func test_cropIsWiderForArmsAndTallerForRaisedHands() {
    // A far player: 5% of the width, 20% of the height, near the middle.
    let rect = PersonCrop.rect(person: CGRect(x: 0.5, y: 0.3, width: 0.05, height: 0.2), in: frame)
    XCTAssertEqual(rect.width, 96 * 2.2, accuracy: 2)
    XCTAssertEqual(rect.height, 216 * 1.8, accuracy: 2)
    XCTAssertEqual(rect.midX, 960 + 48, accuracy: 2) // centered on the person
    XCTAssertGreaterThan(rect.maxY, (0.3 + 0.2) * 1080 + 216 * 0.5) // room above the head (y up)
  }

  func test_cropStaysInsideTheFrame() {
    let rect = PersonCrop.rect(person: CGRect(x: 0.97, y: 0.8, width: 0.03, height: 0.2), in: frame)
    XCTAssertTrue(frame.contains(rect))
  }
}
