import XCTest
@testable import ReplayCore

/// Gravity in device axes (x right, y up in portrait), in g.
final class DeviceUprightTests: XCTestCase {
  func test_portrait() { XCTAssertEqual(DeviceUpright.from(gravityX: 0, gravityY: -1), .portrait) }
  func test_homeButtonRight_isLandscapeLeft() { XCTAssertEqual(DeviceUpright.from(gravityX: -1, gravityY: 0), .landscapeLeft) }
  func test_homeButtonLeft_isLandscapeRight() { XCTAssertEqual(DeviceUpright.from(gravityX: 1, gravityY: 0), .landscapeRight) }
  func test_upsideDown() { XCTAssertEqual(DeviceUpright.from(gravityX: 0, gravityY: 1), .portraitUpsideDown) }
  func test_tiltedLandscape() { XCTAssertEqual(DeviceUpright.from(gravityX: -0.8, gravityY: -0.4), .landscapeLeft) }
  func test_flat_isUnknown() { XCTAssertNil(DeviceUpright.from(gravityX: 0.1, gravityY: -0.2)) }
}

/// Back-camera buffers are natively upright with the phone in landscapeLeft (home button / camera side as Apple defines it).
final class VideoRotationTests: XCTestCase {
  func test_videoRotationDegreesPerUpright() {
    XCTAssertEqual(DeviceUpright.landscapeLeft.videoRotationDegrees, 0)
    XCTAssertEqual(DeviceUpright.portrait.videoRotationDegrees, 90)
    XCTAssertEqual(DeviceUpright.landscapeRight.videoRotationDegrees, 180)
    XCTAssertEqual(DeviceUpright.portraitUpsideDown.videoRotationDegrees, 270)
  }
}
