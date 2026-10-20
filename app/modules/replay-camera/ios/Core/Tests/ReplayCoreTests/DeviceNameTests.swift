import XCTest
@testable import ReplayCore

final class DeviceNameTests: XCTestCase {
  func testKnownModelsUseTheirMarketingName() {
    XCTAssertEqual(DeviceName.model(identifier: "iPhone11,8"), "iPhone XR")
    XCTAssertEqual(DeviceName.model(identifier: "iPhone17,2"), "iPhone 16 Pro Max")
    XCTAssertEqual(DeviceName.model(identifier: "iPhone14,6"), "iPhone SE 3")
  }

  func testUnknownModelsFallBackToTheFamilyNotAWrongGuess() {
    XCTAssertEqual(DeviceName.model(identifier: "iPhone99,1"), "iPhone")
    XCTAssertEqual(DeviceName.model(identifier: "iPad14,3"), "iPad")
    XCTAssertEqual(DeviceName.model(identifier: "arm64"), "iPhone")
  }

  func testDefaultIsModelPlusCode() {
    let name = DeviceName.resolve(custom: nil, system: "iPhone", identifier: "iPhone11,8", code: "1234")
    XCTAssertEqual(name, "iPhone XR#1234")
  }

  func testARealSystemNameIsKept() {
    let name = DeviceName.resolve(custom: nil, system: "iPhone do Victor", identifier: "iPhone11,8", code: "1234")
    XCTAssertEqual(name, "iPhone do Victor")
  }

  func testTheChosenNameWinsOverEverything() {
    let name = DeviceName.resolve(custom: "  Controle da quadra ", system: "iPhone do Victor", identifier: "iPhone11,8", code: "1234")
    XCTAssertEqual(name, "Controle da quadra")
  }

  func testAnEmptyChosenNameGoesBackToTheDefault() {
    XCTAssertEqual(DeviceName.resolve(custom: "   ", system: "iPhone", identifier: "iPhone11,8", code: "1234"), "iPhone XR#1234")
    XCTAssertEqual(DeviceName.resolve(custom: "", system: "iPhone", identifier: "iPhone17,2", code: "AB12"), "iPhone 16 Pro Max#AB12")
  }

  func testALongChosenNameIsCut() {
    let long = String(repeating: "a", count: 80)
    XCTAssertEqual(DeviceName.resolve(custom: long, system: "iPhone", identifier: "iPhone11,8", code: "1234").count, DeviceName.maxLength)
  }
}
