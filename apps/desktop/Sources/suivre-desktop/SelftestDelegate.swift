import AppKit

/// Headless checks, run with `--selftest`:
///
/// - the summon window of the double-Command detector, replayed with real
///   timings (no event tap, so no Input Monitoring grant and no real keyboard);
/// - how a health response is classified, which decides whether a server is
///   adopted or refused;
/// - the supervisor: resolve the CLI, spawn a real server for the first
///   registered project, wait for health, stop it. Proves node/CLI resolution,
///   SUIVRE_ROOT and --port end to end. Run it with
///   `env -i HOME=$HOME PATH=/usr/bin:/bin` to reproduce the PATH a
///   double-clicked app inherits.
final class SelftestDelegate: NSObject, NSApplicationDelegate {
    private let registry = ProjectRegistry()
    private lazy var supervisor = ServerSupervisor(registry: registry)
    private var failed = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        checkHotkey()
        checkHealthClassification()
        checkServer()
    }

    // MARK: - Hotkey

    private func checkHotkey() {
        // A held second tap still summons: the gap is measured to the press, not
        // to the release. This is the case that used to miss.
        hotkeyCase("a double-tap with a held second press summons", summons: 1) { hotKey in
            hotKey.tap()
            Thread.sleep(forTimeInterval: 0.10)
            hotKey.tap(hold: 0.25)
        }

        // Two taps too far apart are two separate taps.
        hotkeyCase("taps 0.7s apart don't summon", summons: 0) { hotKey in
            hotKey.tap()
            Thread.sleep(forTimeInterval: 0.70)
            hotKey.tap()
        }

        // Holding Command isn't tapping it, so its release can't open a pair.
        hotkeyCase("a long hold then a tap doesn't summon", summons: 0) { hotKey in
            hotKey.tap(hold: 0.60)
            Thread.sleep(forTimeInterval: 0.10)
            hotKey.tap()
        }

        // Command + another key is a shortcut, not a tap.
        hotkeyCase("a tap then a Command shortcut doesn't summon", summons: 0) { hotKey in
            hotKey.tap()
            Thread.sleep(forTimeInterval: 0.10)
            hotKey.handle(type: .flagsChanged, flags: .maskCommand)
            hotKey.handle(type: .keyDown, flags: .maskCommand)
            hotKey.handle(type: .flagsChanged, flags: [])
        }
    }

    /// Each case gets its own detector: sharing one would let a case's trailing
    /// tap pair up with the next case's opening tap.
    private func hotkeyCase(_ what: String, summons: Int, _ script: (DoubleTapCommand) -> Void) {
        var fired = 0
        let hotKey = DoubleTapCommand()
        hotKey.onTrigger = { fired += 1 }
        script(hotKey)
        expect(fired == summons, "\(what) (summoned \(fired), expected \(summons))")
    }

    // MARK: - Health

    /// Only a board that names itself *and* the root we asked about is adopted.
    /// Everything else on that port belongs to someone else.
    private func checkHealthClassification() {
        let root = "/tmp/board"
        let mine = #"{"ok":true,"product":"suivre","root":"/tmp/board","name":"board"}"#
        let elsewhere = #"{"ok":true,"product":"suivre","root":"/tmp/other","name":"other"}"#

        healthCase("a board on this root is ours", body: mine, root: root) {
            $0 == .mine(name: "board")
        }
        healthCase("another repo's board is foreign", body: elsewhere, root: root, isForeign)
        healthCase("a legacy {ok:true} is not adopted", body: #"{"ok":true}"#, root: root, isForeign)
        healthCase("another product is foreign", body: #"{"product":"vite"}"#, root: root, isForeign)
        healthCase("a non-JSON body is foreign", body: "<html>", root: root, isForeign)
        expect(
            HealthProbe.classify(code: 404, body: nil, port: 1, root: root) == .down,
            "a non-200 is down"
        )
    }

    private func healthCase(
        _ what: String,
        body: String,
        root: String,
        _ check: (HealthStatus) -> Bool
    ) {
        let status = HealthProbe.classify(code: 200, body: Data(body.utf8), port: 45188, root: root)
        expect(check(status), "\(what) (got: \(status.summary))")
    }

    private func isForeign(_ status: HealthStatus) -> Bool {
        if case .foreign = status { return true }
        return false
    }

    // MARK: - Server

    private func checkServer() {
        guard let project = registry.projects.first else {
            log("  skip  no project registered — add one to exercise the supervisor")
            DispatchQueue.main.async { NSApp.terminate(nil) }
            return
        }
        let lookup = supervisor.cliLookup()
        expect(lookup.entry != nil, "found a suivre CLI (\(lookup.searched.count) places tried)")
        log("selftest: cli=\(lookup.entry?.description ?? "-") project=\(project.path) port=\(project.port)")
        supervisor.ensureRunning(project) { [weak self] status in
            self?.expect(status.isMine, "health identified \(project.name) on :\(project.port) — \(status.summary)")
            self?.supervisor.stop(project)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                NSApp.terminate(nil)
            }
        }
    }

    // MARK: - Reporting

    private func expect(_ condition: Bool, _ what: String) {
        log(condition ? "  ok    \(what)" : "  FAIL  \(what)")
        if !condition { failed = true }
    }

    func applicationWillTerminate(_ notification: Notification) {
        log(failed ? "selftest FAILED" : "selftest OK")
        exit(failed ? 1 : 0)
    }

    private func log(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
}

extension DoubleTapCommand {
    /// One Command press and release, held for `hold` seconds.
    fileprivate func tap(hold: TimeInterval = 0.05) {
        handle(type: .flagsChanged, flags: .maskCommand)
        Thread.sleep(forTimeInterval: hold)
        handle(type: .flagsChanged, flags: [])
    }
}
