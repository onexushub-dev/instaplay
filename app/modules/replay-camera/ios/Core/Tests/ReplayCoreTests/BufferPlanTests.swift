import XCTest
@testable import ReplayCore

final class BufferPlanTests: XCTestCase {
  func test_segmentsForTheWindow() {
    XCTAssertEqual(BufferPlan.segments(forSeconds: 60, segmentSeconds: 1), 60)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 120, segmentSeconds: 1), 120)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 120, segmentSeconds: 2), 60)
  }

  func test_partialSegmentsRoundUpAndBadInputFallsBackToOneMinute() {
    XCTAssertEqual(BufferPlan.segments(forSeconds: 61, segmentSeconds: 2), 31)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 0, segmentSeconds: 1), 60)
  }
}
