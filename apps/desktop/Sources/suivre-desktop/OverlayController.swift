import AppKit
import WebKit

/// The summonable overlay: a borderless NSPanel that shows on any Space and above
/// full-screen apps, hosting a WKWebView of the active target (a project's local
/// dashboard or any URL). Sessions use a persistent data store so sign-ins
/// survive.
///
/// Built to stay open for days: when hidden for a while the web view is torn down
/// to free WebKit's WebContent process, and recreated transparently on the next
/// summon (cookies/sessions live on disk, so logins survive the round-trip).
final class OverlayController: NSObject, WKUIDelegate {
    private let registry: ProjectRegistry
    private let supervisor: ServerSupervisor

    private var panel: OverlayPanel?
    private var container: NSView?
    private var webView: WKWebView?
    private var escMonitor: Any?
    private var currentTargetID: String?
    private var idleUnloadTimer: Timer?

    /// How long the overlay stays hidden before the web view is torn down.
    private let idleUnloadDelay: TimeInterval = 600

    init(registry: ProjectRegistry, supervisor: ServerSupervisor) {
        self.registry = registry
        self.supervisor = supervisor
        super.init()
    }

    /// Hides only when the overlay is the thing you're looking at. A visible but
    /// non-key panel means focus went elsewhere without `hide()` running, and
    /// dismissing it there would eat the summon and read as "it didn't open".
    func toggle() {
        if let panel, panel.isVisible, panel.isKeyWindow {
            hide()
        } else {
            showActive()
        }
    }

    /// Summons the overlay on the active target.
    func showActive() {
        guard let target = registry.activeTarget else {
            presentPanel()
            loadPlaceholder(message: "Nothing yet. Add a project or a URL from the menu bar (suivre).")
            currentTargetID = nil
            return
        }
        open(target)
    }

    /// Switches the overlay to a target and summons it (keeps the live web view
    /// if it's already showing that target and still loaded).
    func open(_ target: OverlayTarget) {
        present(target, deepLink: nil, forceReload: false)
    }

    /// Reveals a target on a specific deep-link (view/item), always reloading so
    /// the requested view is shown. Used by the `suivre://show` agent hook.
    func reveal(_ target: OverlayTarget, deepLink: String?) {
        present(target, deepLink: deepLink, forceReload: true)
    }

    func hide() {
        panel?.orderOut(nil)
        scheduleIdleUnload()
    }

    // MARK: - WKUIDelegate

    /// Load window.open / target=_blank navigations in place so sign-in popups
    /// (OAuth, etc.) work instead of silently doing nothing.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    // MARK: - Present / load

    private func present(_ target: OverlayTarget, deepLink: String?, forceReload: Bool) {
        registry.setActiveTarget(target.id)
        presentPanel()

        // Already showing this target and no forced view change: keep it live.
        if !forceReload, currentTargetID == target.id {
            return
        }

        switch target {
        case .project(let project):
            loadPlaceholder(message: "Opening \(project.name)\u{2026}")
            supervisor.ensureRunning(project) { [weak self] up in
                guard let self else { return }
                if up {
                    self.loadTarget(target, deepLink: deepLink)
                } else {
                    self.loadPlaceholder(
                        message: "Couldn't start \(project.name). See ~/.config/suivre/logs."
                    )
                }
            }
        case .link:
            loadTarget(target, deepLink: deepLink)
        }
    }

    private func loadTarget(_ target: OverlayTarget, deepLink: String? = nil) {
        guard let url = resolvedURL(for: target, deepLink: deepLink) else {
            loadPlaceholder(message: "Invalid URL.")
            return
        }
        webView?.load(URLRequest(url: url))
        currentTargetID = target.id
    }

    /// A project with a deep-link loads `localhost:<port>/#<view>` (the SPA reads
    /// the hash on load); anything else loads the target's base URL.
    private func resolvedURL(for target: OverlayTarget, deepLink: String?) -> URL? {
        if case .project(let project) = target, let deepLink, !deepLink.isEmpty {
            return URL(string: "http://localhost:\(project.port)/#\(deepLink)")
        }
        return target.url
    }

    private func loadPlaceholder(message: String) {
        let html = """
            <!doctype html><html><head><meta charset="utf-8">
            <style>
              html,body{height:100%;margin:0}
              body{background:#0b0b0c;color:#8a8a8f;display:flex;align-items:center;
                justify-content:center;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
              .msg{opacity:.8;letter-spacing:.02em}
            </style></head>
            <body><div class="msg">\(message)</div></body></html>
            """
        webView?.loadHTMLString(html, baseURL: nil)
    }

    // MARK: - Panel & web view lifecycle

    private func presentPanel() {
        idleUnloadTimer?.invalidate()
        idleUnloadTimer = nil
        let panel = panel ?? makePanel()
        self.panel = panel
        ensureWebView()
        layout(panel)

        // Order in *before* activating, and regardless of whether the app is
        // active: `makeKeyAndOrderFront` on an inactive accessory app is subject
        // to macOS 14+ activation limits, and activating first lets the system
        // switch Spaces to find the app — which is how a summon ended up on the
        // wrong desktop. With the panel already on this Space (it joins all of
        // them), activation has nowhere else to go.
        panel.orderFrontRegardless()
        panel.makeKey()
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Frees WebKit's WebContent process after the overlay has been hidden a while.
    private func scheduleIdleUnload() {
        idleUnloadTimer?.invalidate()
        idleUnloadTimer = Timer.scheduledTimer(
            withTimeInterval: idleUnloadDelay,
            repeats: false
        ) { [weak self] _ in
            self?.unloadWebView()
        }
    }

    private func unloadWebView() {
        idleUnloadTimer?.invalidate()
        idleUnloadTimer = nil
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        currentTargetID = nil
    }

    private func ensureWebView() {
        guard webView == nil, let container else { return }
        // Persistent data store keeps cookies/sessions across summons, relaunches
        // and idle unloads.
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let web = WKWebView(frame: container.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        container.addSubview(web)
        webView = web
    }

    private func makePanel() -> OverlayPanel {
        let panel = OverlayPanel(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
            styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.animationBehavior = .utilityWindow

        // Rounded container that clips the web view's corners and survives web
        // view unload/reload.
        let view = NSView(frame: panel.contentRect(forFrameRect: panel.frame))
        view.wantsLayer = true
        view.layer?.cornerRadius = 14
        view.layer?.cornerCurve = .continuous
        view.layer?.masksToBounds = true
        view.layer?.backgroundColor = NSColor.black.cgColor
        view.autoresizingMask = [.width, .height]
        container = view

        panel.contentView = view
        installEscMonitor()
        NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            self?.hide()
        }
        return panel
    }

    private func installEscMonitor() {
        escMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // Escape key
            if event.keyCode == 53 {
                self?.hide()
                return nil
            }
            return event
        }
    }

    /// Size the panel from the chosen preset relative to the cursor's screen, and
    /// center it there — so the overlay appears where the user is looking.
    private func layout(_ panel: NSPanel) {
        let visible = cursorScreenVisibleFrame()
        let fraction = sizeFraction(registry.overlaySizePreset)
        let width = min(1680, max(980, visible.width * fraction))
        let height = min(1050, max(660, visible.height * fraction))
        let frame = NSRect(
            x: visible.midX - width / 2,
            y: visible.midY - height / 2,
            width: width,
            height: height
        )
        panel.setFrame(frame, display: true)
    }

    private func sizeFraction(_ preset: String) -> CGFloat {
        switch preset {
        case "small": return 0.60
        case "large": return 0.92
        default: return 0.78
        }
    }

    private func cursorScreenVisibleFrame() -> NSRect {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main
        return screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
    }
}

/// Borderless panels can't become key by default; the web view needs key status
/// to receive clicks and scrolling.
final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
