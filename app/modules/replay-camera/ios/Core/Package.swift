// swift-tools-version:5.9
// Platform-free replay logic, compiled into the ReplayCamera pod and tested here with `swift test`.
import PackageDescription

let package = Package(
  name: "ReplayCore",
  platforms: [.macOS(.v13), .iOS(.v16)],
  products: [.library(name: "ReplayCore", targets: ["ReplayCore"])],
  targets: [
    .target(name: "ReplayCore"),
    .testTarget(name: "ReplayCoreTests", dependencies: ["ReplayCore"])
  ]
)
