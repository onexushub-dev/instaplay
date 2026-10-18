import CoreGraphics
import XCTest
@testable import ReplayCore

final class FitRectTests: XCTestCase {
  func test_landscapeVideoInAStoryFrame() {
    let r = FitRect.fit(CGSize(width: 1920, height: 1080), into: CGSize(width: 1080, height: 1920))
    XCTAssertEqual(r.origin.x, 0, accuracy: 0.01)
    XCTAssertEqual(r.origin.y, 656.25, accuracy: 0.01)
    XCTAssertEqual(r.width, 1080, accuracy: 0.01)
    XCTAssertEqual(r.height, 607.5, accuracy: 0.01)
  }

  func test_portraitVideoFillsTheFrame() {
    let r = FitRect.fit(CGSize(width: 1080, height: 1920), into: CGSize(width: 1080, height: 1920))
    XCTAssertEqual(r, CGRect(x: 0, y: 0, width: 1080, height: 1920))
  }
}
