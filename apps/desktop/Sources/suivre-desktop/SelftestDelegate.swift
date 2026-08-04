import AppKit

/// Headless checks, run with `--selftest`:
///
/// - the summon window of the double-Command detector, replayed with real
///   timings (no event tap, so no Input Monitoring grant and no real keyboard);
/// - the supervisor: spawn a real server for ~/Github/relay on a throwaway port,
///   wait for health, stop it. Proves node resolution, SUIVRE_ROOT and --port
///   end to end. Run it with `env -i HOME=$HOME PATH=/usr/bin:/bin` to reproduce
///   the PATH a double-clicked app inherits.
final class SelftestDelegate: NSObject, NSApplicationDelegate {
    private let registry = ProjectRegistry()
    private lazy var supervisor = ServerSupervisor(registry: registry)
    private var failed = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        checkHotkey()
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

    // MARK: - Server

    private func checkServer() {
        let relayPath = ("~/Github/relay" as NSString).expandingTildeInPath
        let project = Project(name: "relay", path: relayPath, port: 45191)
        log("selftest: repo=\(registry.suivreRepoPath) project=\(project.path) port=\(project.port)")
        supervisor.ensureRunning(project) { [weak self] up in
            self?.expect(up, "health responded on :\(project.port)")
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
