import XCTest
@testable import ReplayCore

final class ZoomMathTests: XCTestCase {
  func test_dualWideRunsFromHalfToFive() {
    let r = ZoomMath.userRange(minFactor: 1, maxFactor: 123.75, wideFactor: 2)
    XCTAssertEqual(r.min, 0.5, accuracy: 0.0001)
    XCTAssertEqual(r.max, 5, accuracy: 0.0001)
  }

  func test_aSingleLensStartsAtOne() {
    let r = ZoomMath.userRange(minFactor: 1, maxFactor: 16, wideFactor: 1)
    XCTAssertEqual(r.min, 1, accuracy: 0.0001)
    XCTAssertEqual(r.max, 5, accuracy: 0.0001)
  }

  func test_aDeviceThatCannotZoomFarStopsWhereItCan() {
    let r = ZoomMath.userRange(minFactor: 1, maxFactor: 6, wideFactor: 2)
    XCTAssertEqual(r.max, 3, accuracy: 0.0001)
  }

  func test_theMaxNeverFallsBelowTheMin() {
    let r = ZoomMath.userRange(minFactor: 1, maxFactor: 1, wideFactor: 1)
    XCTAssertEqual(r.min, 1, accuracy: 0.0001)
    XCTAssertEqual(r.max, 1, accuracy: 0.0001)
  }

  func test_aBadWideFactorCountsAsOne() {
    let r = ZoomMath.userRange(minFactor: 1, maxFactor: 16, wideFactor: 0)
    XCTAssertEqual(r.min, 1, accuracy: 0.0001)
  }

  func test_playerZoomBecomesTheDeviceFactor() {
    func factor(_ zoom: Double) -> Double {
      ZoomMath.deviceFactor(forUserZoom: zoom, wideFactor: 2, minFactor: 1, maxFactor: 123.75)
    }
    XCTAssertEqual(factor(0.5), 1, accuracy: 0.0001)
    XCTAssertEqual(factor(1), 2, accuracy: 0.0001)
    XCTAssertEqual(factor(2), 4, accuracy: 0.0001)
    XCTAssertEqual(factor(5), 10, accuracy: 0.0001)
  }

  func test_theDeviceFactorStaysInsideWhatTheDeviceAllows() {
    XCTAssertEqual(ZoomMath.deviceFactor(forUserZoom: 0.1, wideFactor: 2, minFactor: 1, maxFactor: 8), 1, accuracy: 0.0001)
    XCTAssertEqual(ZoomMath.deviceFactor(forUserZoom: 9, wideFactor: 2, minFactor: 1, maxFactor: 8), 8, accuracy: 0.0001)
  }
}
