import AppKit

/// Headless check of the supervisor: spawn a real server for ~/Github/relay on a
/// throwaway port, wait for health, stop it, quit. Proves node resolution, the
/// login-shell spawn, SUIVRE_ROOT and --port end to end.
final class SelftestDelegate: NSObject, NSApplicationDelegate {
    private let registry = ProjectRegistry()
    private lazy var supervisor = ServerSupervisor(registry: registry)

    func applicationDidFinishLaunching(_ notification: Notification) {
        let relayPath = ("~/Github/relay" as NSString).expandingTildeInPath
        let project = Project(name: "relay", path: relayPath, port: 45191)
        log("selftest: repo=\(registry.suivreRepoPath) project=\(project.path) port=\(project.port)")
        supervisor.ensureRunning(project) { [weak self] up in
            self?.log(up ? "selftest OK: health responded on :\(project.port)" : "selftest FAIL: no health")
            self?.supervisor.stop(project)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                NSApp.terminate(nil)
            }
        }
    }

    private func log(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
}
