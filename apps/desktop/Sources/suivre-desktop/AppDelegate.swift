import AppKit

/// Menu-bar agent and control-plane. Owns the status item (projects with server
/// status + start/stop, URL targets, overlay size), the overlay, and the
/// double-Command hotkey. Servers it spawned are stopped on quit.
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let showOnLaunch: Bool
    private let registry = ProjectRegistry()
    private lazy var supervisor = ServerSupervisor(registry: registry)
    private lazy var overlay = OverlayController(registry: registry, supervisor: supervisor)
    private let hotKey = DoubleTapCommand()

    private var statusItem: NSStatusItem?
    private var statusCache: [String: Bool] = [:]

    init(showOnLaunch: Bool) {
        self.showOnLaunch = showOnLaunch
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()
        hotKey.onTrigger = { [weak self] in self?.overlay.toggle() }
        hotKey.start()
        refreshStatuses(in: nil)  // warm the cache once; no permanent polling
        if showOnLaunch { overlay.showActive() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        supervisor.stopAll()
    }

    // MARK: - Status item

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.title = "suivre"
            button.font = .monospacedSystemFont(ofSize: 12, weight: .medium)
        }
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item
    }

    // MARK: - Menu (rebuilt on open from the status cache)

    func menuNeedsUpdate(_ menu: NSMenu) {
        rebuild(menu)
        refreshStatuses(in: menu)
        hotKey.retryIfNeeded()
    }

    private func rebuild(_ menu: NSMenu) {
        menu.removeAllItems()

        let projects = registry.projects
        let links = registry.links

        if projects.isEmpty, links.isEmpty {
            let hint = NSMenuItem(title: "No targets yet", action: nil, keyEquivalent: "")
            hint.isEnabled = false
            menu.addItem(hint)
        }

        if !projects.isEmpty {
            menu.addItem(sectionHeader("PROJECTS"))
            for project in projects {
                menu.addItem(projectItem(project))
            }
        }

        if !links.isEmpty {
            if !projects.isEmpty { menu.addItem(.separator()) }
            menu.addItem(sectionHeader("LINKS"))
            for link in links {
                menu.addItem(linkItem(link))
            }
        }

        menu.addItem(.separator())

        let open = NSMenuItem(
            title: "Open overlay  (\u{2318}\u{2318})",
            action: #selector(openActiveOverlay),
            keyEquivalent: ""
        )
        open.target = self
        menu.addItem(open)

        // Otherwise a revoked grant just looks like a hotkey that stopped working.
        if !hotKey.isActive {
            let fix = NSMenuItem(
                title: "\u{26A0}\u{FE0E} \u{2318}\u{2318} off \u{2014} allow Input Monitoring\u{2026}",
                action: #selector(openInputMonitoringSettings),
                keyEquivalent: ""
            )
            fix.target = self
            menu.addItem(fix)
        }

        let addProjectItem = NSMenuItem(
            title: "Add project\u{2026}",
            action: #selector(addProject),
            keyEquivalent: ""
        )
        addProjectItem.target = self
        menu.addItem(addProjectItem)

        let addURLItem = NSMenuItem(title: "Add URL\u{2026}", action: #selector(addURL), keyEquivalent: "")
        addURLItem.target = self
        menu.addItem(addURLItem)

        menu.addItem(sizeMenu())

        menu.addItem(.separator())
        menu.addItem(
            NSMenuItem(
                title: "Quit suivre",
                action: #selector(NSApplication.terminate(_:)),
                keyEquivalent: "q"
            )
        )
    }

    private func sectionHeader(_ title: String) -> NSMenuItem {
        let header = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        header.isEnabled = false
        return header
    }

    private func projectItem(_ project: Project) -> NSMenuItem {
        let up = statusCache[project.path] ?? false
        let item = NSMenuItem(title: "\(project.name)   :\(project.port)", action: nil, keyEquivalent: "")
        item.image = statusImage(up: up)
        item.representedObject = project  // lets a live status refresh find this item

        let submenu = NSMenu()

        let open = NSMenuItem(title: "Open overlay", action: #selector(openProjectItem(_:)), keyEquivalent: "")
        open.target = self
        open.representedObject = project
        submenu.addItem(open)

        let toggleTitle = up ? "Stop server" : "Start server"
        let toggleAction = up ? #selector(stopServerItem(_:)) : #selector(startServerItem(_:))
        let toggle = NSMenuItem(title: toggleTitle, action: toggleAction, keyEquivalent: "")
        toggle.target = self
        toggle.representedObject = project
        submenu.addItem(toggle)

        submenu.addItem(.separator())

        let logs = NSMenuItem(title: "Reveal logs", action: #selector(revealLogs), keyEquivalent: "")
        logs.target = self
        submenu.addItem(logs)

        let remove = NSMenuItem(title: "Remove from list", action: #selector(removeProjectItem(_:)), keyEquivalent: "")
        remove.target = self
        remove.representedObject = project
        submenu.addItem(remove)

        item.submenu = submenu
        return item
    }

    private func linkItem(_ link: Link) -> NSMenuItem {
        let item = NSMenuItem(title: link.name, action: nil, keyEquivalent: "")
        item.image = linkImage()

        let submenu = NSMenu()

        let open = NSMenuItem(title: "Open overlay", action: #selector(openLinkItem(_:)), keyEquivalent: "")
        open.target = self
        open.representedObject = link
        submenu.addItem(open)

        submenu.addItem(.separator())

        let remove = NSMenuItem(title: "Remove from list", action: #selector(removeLinkItem(_:)), keyEquivalent: "")
        remove.target = self
        remove.representedObject = link
        submenu.addItem(remove)

        item.submenu = submenu
        return item
    }

    private func sizeMenu() -> NSMenuItem {
        let item = NSMenuItem(title: "Overlay size", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        let presets = [("Small", "small"), ("Medium", "medium"), ("Large", "large")]
        for (title, preset) in presets {
            let entry = NSMenuItem(title: title, action: #selector(setSize(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = preset
            entry.state = (registry.overlaySizePreset == preset) ? .on : .off
            submenu.addItem(entry)
        }
        item.submenu = submenu
        return item
    }

    private func statusImage(up: Bool) -> NSImage? {
        let color: NSColor = up ? .systemGreen : .tertiaryLabelColor
        let config = NSImage.SymbolConfiguration(paletteColors: [color])
        return NSImage(systemSymbolName: "circle.fill", accessibilityDescription: up ? "running" : "stopped")?
            .withSymbolConfiguration(config)
    }

    private func linkImage() -> NSImage? {
        let config = NSImage.SymbolConfiguration(paletteColors: [.secondaryLabelColor])
        return NSImage(systemSymbolName: "globe", accessibilityDescription: "link")?
            .withSymbolConfiguration(config)
    }

    /// Pings each project's health once. Only runs when the menu is opened (or at
    /// launch) — no permanent background polling, so the app stays App-Nap idle.
    /// When a menu is passed, its project items are updated live as pings return.
    private func refreshStatuses(in menu: NSMenu?) {
        for project in registry.projects {
            supervisor.status(project) { [weak self, weak menu] up in
                guard let self else { return }
                self.statusCache[project.path] = up
                guard let menu else { return }
                let item = menu.items.first { ($0.representedObject as? Project)?.path == project.path }
                item?.image = self.statusImage(up: up)
            }
        }
    }

}

// MARK: - Actions

extension AppDelegate {
    @objc private func openActiveOverlay() {
        overlay.showActive()
    }

    @objc private func openProjectItem(_ sender: NSMenuItem) {
        guard let project = sender.representedObject as? Project else { return }
        overlay.open(.project(project))
    }

    @objc private func openLinkItem(_ sender: NSMenuItem) {
        guard let link = sender.representedObject as? Link else { return }
        overlay.open(.link(link))
    }

    @objc private func startServerItem(_ sender: NSMenuItem) {
        guard let project = sender.representedObject as? Project else { return }
        supervisor.ensureRunning(project) { [weak self] up in
            guard let self else { return }
            self.statusCache[project.path] = up
            if !up { self.reportFailedStart(project) }
        }
    }

    /// A failed start is otherwise silent: the menu is closed by then, so the
    /// dot just stays grey the next time it's opened.
    private func reportFailedStart(_ project: Project) {
        let alert = NSAlert()
        alert.messageText = "\(project.name) didn't start"
        alert.informativeText =
            "Nothing answered on port \(project.port). The server log says why."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Reveal logs")
        alert.addButton(withTitle: "Close")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn {
            revealLogs()
        }
    }

    @objc private func stopServerItem(_ sender: NSMenuItem) {
        guard let project = sender.representedObject as? Project else { return }
        supervisor.stop(project)
        statusCache[project.path] = false
    }

    @objc private func removeProjectItem(_ sender: NSMenuItem) {
        guard let project = sender.representedObject as? Project else { return }
        supervisor.stop(project)
        registry.remove(project)
    }

    @objc private func removeLinkItem(_ sender: NSMenuItem) {
        guard let link = sender.representedObject as? Link else { return }
        registry.remove(link)
    }

    @objc private func setSize(_ sender: NSMenuItem) {
        guard let preset = sender.representedObject as? String else { return }
        registry.setOverlaySize(preset)
    }

    @objc private func openInputMonitoringSettings() {
        let pane = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        if let url = URL(string: pane) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func revealLogs() {
        let dir = registry.logsDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dir)
    }

    @objc private func addProject() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Add"
        panel.message = "Choose a folder that contains a .suivre board."
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url, let self else { return }
            if self.registry.addProject(atPath: url.path) == nil {
                self.warn(title: "Not a suivre board", message: "\(url.path)\n\nExpected a .suivre/config.yml inside.")
            } else {
                self.refreshStatuses(in: nil)
            }
        }
    }

    @objc private func addURL() {
        let alert = NSAlert()
        alert.messageText = "Add a URL"
        alert.informativeText = "Open any page in the overlay. Sign-ins persist between summons."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.placeholderString = "example.com or https://\u{2026}"
        alert.accessoryView = field
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        if registry.addLink(urlString: field.stringValue) == nil {
            warn(title: "Invalid URL", message: field.stringValue)
        }
    }

    private func warn(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}

// MARK: - URL scheme (agent hook: suivre://show?view=…&target=…)

extension AppDelegate {
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "suivre" {
            handleScheme(url)
        }
    }

    private func handleScheme(_ url: URL) {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = components?.queryItems ?? []
        let view = items.first { $0.name == "view" }?.value
        let targetName = items.first { $0.name == "target" }?.value

        let target: OverlayTarget?
        if let targetName, let named = registry.target(named: targetName) {
            target = named
        } else {
            target = registry.activeTarget
        }
        guard let target else { return }

        logScheme(url: url.absoluteString, resolved: target.id, view: view)
        overlay.reveal(target, deepLink: view)
    }

    private func logScheme(url: String, resolved: String, view: String?) {
        let dir = registry.logsDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let logURL = dir.appendingPathComponent("overlay.log")
        let line = "reveal url=\(url) target=\(resolved) view=\(view ?? "-")\n"
        if let handle = try? FileHandle(forWritingTo: logURL) {
            _ = try? handle.seekToEnd()
            handle.write(Data(line.utf8))
            try? handle.close()
        } else {
            try? Data(line.utf8).write(to: logURL)
        }
    }
}
