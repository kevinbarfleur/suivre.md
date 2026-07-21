// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "suivre-desktop",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "suivre-desktop",
            path: "Sources/suivre-desktop"
        )
    ]
)
