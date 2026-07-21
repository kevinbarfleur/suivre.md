import AppKit
import WebKit

/// Headless render check. Loads the dashboard in an offscreen web view, writes a
/// PNG once the SPA has settled, then quits. Lets us verify the web view renders
/// the local dashboard (App Transport Security, port) without popping an overlay
/// on the user's screen.
final class SnapshotDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private let outputPath: String
    private let url = URL(string: "http://localhost:45188")!
    private var window: NSWindow?
    private var webView: WKWebView?

    init(outputPath: String) {
        self.outputPath = outputPath
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let size = NSSize(width: 1180, height: 800)
        // Positioned far offscreen: rendered by WebKit but never visible.
        let window = NSWindow(
            contentRect: NSRect(x: -20000, y: -20000, width: size.width, height: size.height),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        let web = WKWebView(frame: NSRect(origin: .zero, size: size))
        web.navigationDelegate = self
        window.contentView = web
        window.orderFrontRegardless()
        web.load(URLRequest(url: url))
        self.window = window
        self.webView = web

        // Safety net: quit even if the load hangs.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            self?.fail("timeout")
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Give the SPA a moment to fetch /api/board and mount before snapshotting.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.snapshot()
        }
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        fail("didFail: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        fail("didFailProvisional: \(error.localizedDescription)")
    }

    private func snapshot() {
        guard let web = webView else {
            fail("no web view")
            return
        }
        let config = WKSnapshotConfiguration()
        config.rect = web.bounds
        web.takeSnapshot(with: config) { [weak self] image, error in
            guard let self else { return }
            if let image, let png = Self.png(from: image) {
                do {
                    try png.write(to: URL(fileURLWithPath: self.outputPath))
                    self.log("snapshot OK -> \(self.outputPath)")
                } catch {
                    self.log("write failed: \(error)")
                }
            } else {
                self.log("takeSnapshot failed: \(String(describing: error))")
            }
            NSApp.terminate(nil)
        }
    }

    private static func png(from image: NSImage) -> Data? {
        guard
            let tiff = image.tiffRepresentation,
            let rep = NSBitmapImageRep(data: tiff)
        else { return nil }
        return rep.representation(using: .png, properties: [:])
    }

    private func fail(_ message: String) {
        log("snapshot FAIL: \(message)")
        NSApp.terminate(nil)
    }

    private func log(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
}
