import AppKit

// Menu-bar agent (no dock icon). The overlay lives on every Space and is summoned
// by a double-tap of Command; the status item is the control-plane.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let args = CommandLine.arguments
let appDelegate: NSApplicationDelegate

if let idx = args.firstIndex(of: "--snapshot"), idx + 1 < args.count {
    // Headless render check: load the dashboard offscreen, write a PNG, quit.
    appDelegate = SnapshotDelegate(outputPath: args[idx + 1])
} else if args.contains("--selftest") {
    // Headless supervisor check: spawn a real server, verify health, quit.
    appDelegate = SelftestDelegate()
} else {
    appDelegate = AppDelegate(showOnLaunch: args.contains("--show"))
}

app.delegate = appDelegate
app.run()
