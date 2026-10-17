import XCTest
@testable import ReplayCore

final class StorageGuardTests: XCTestCase {
  func test_storageGuard() {
    XCTAssertThrowsError(try StorageGuard.check(freeBytes: 499 * 1024 * 1024)) { error in
      XCTAssertEqual(error as? ReplayError, .lowStorage)
    }
    XCTAssertNoThrow(try StorageGuard.check(freeBytes: 500 * 1024 * 1024))
  }
}
