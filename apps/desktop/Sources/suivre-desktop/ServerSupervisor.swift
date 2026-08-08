import Foundation

/// Supervises one `suivre board` server per project.
///
/// Health is the source of truth: if the project's own board is already
/// answering on its port (launched by the agent or by hand), it is adopted
/// rather than duplicated. Anything else on that port is left alone — adopting
/// it would show, and write into, another repo's backlog. Only servers we
/// spawned are tracked, so `stopAll` never kills a server we didn't start.
final class ServerSupervisor {
    private let registry: ProjectRegistry
    private var processes: [String: Process] = [:]

    init(registry: ProjectRegistry) {
        self.registry = registry
    }

    /// Ensures the project's own board answers on its port, spawning one if
    /// needed. Calls back with what is actually there.
    func ensureRunning(_ project: Project, completion: @escaping (HealthStatus) -> Void) {
        HealthProbe.check(port: project.port, root: project.path) { [weak self] status in
            guard let self else {
                completion(status)
                return
            }
            switch status {
            case .mine:
                completion(status)
            case .foreign(let reason):
                // Spawning would only fail to bind, and the poll would then
                // "succeed" against the other server.
                self.fail(project, reason)
                completion(status)
            case .down:
                self.spawn(project)
                self.pollHealth(project, attempts: 40, completion: completion)
            }
        }
    }

    /// True when this project's server is one we spawned — the only kind we may
    /// stop.
    func owns(_ project: Project) -> Bool {
        processes[project.path]?.isRunning == true
    }

    /// Stops the server we spawned for this project. Returns false when there is
    /// none: an adopted server is not ours to kill, and pretending otherwise is
    /// how "Stop server" became a no-op that still reported success.
    @discardableResult
    func stop(_ project: Project) -> Bool {
        guard let process = processes.removeValue(forKey: project.path) else { return false }
        if process.isRunning { process.terminate() }
        return true
    }

    func stopAll() {
        for process in processes.values where process.isRunning {
            process.terminate()
        }
        processes.removeAll()
    }

    func status(_ project: Project, completion: @escaping (HealthStatus) -> Void) {
        HealthProbe.check(port: project.port, root: project.path, completion: completion)
    }

    /// Which CLI the servers would be started from, and where that was looked
    /// for — the menu shows both.
    func cliLookup() -> CLILocator.Lookup {
        CLILocator.locate(configured: registry.cliPath, repoPath: registry.suivreRepoPath)
    }

    private func spawn(_ project: Project) {
        if let existing = processes[project.path], existing.isRunning {
            return
        }

        // node is resolved by hand and run directly: a bundled app inherits no
        // shell PATH, and going through a login shell wouldn't find an nvm node
        // either (see NodeLocator).
        guard let node = NodeLocator.find() else {
            fail(project, "no node binary found — looked in \(NodeLocator.searchDescription)")
            return
        }
        let lookup = cliLookup()
        guard let entry = lookup.entry else {
            fail(project, cliMissingMessage(lookup))
            return
        }

        let command = entry.command(node: node)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments + ["board", "--port", String(project.port)]
        // The board serves the project, not wherever the CLI happens to live.
        process.currentDirectoryURL = URL(fileURLWithPath: project.path)

        var env = ProcessInfo.processInfo.environment
        env["SUIVRE_ROOT"] = project.path
        env["PORT"] = String(project.port)
        // Shims and tsx re-spawn node: keep the same one reachable.
        let nodeDir = (node as NSString).deletingLastPathComponent
        env["PATH"] = [nodeDir, env["PATH"] ?? ""].filter { !$0.isEmpty }.joined(separator: ":")
        process.environment = env

        if let handle = logHandle(for: project) {
            process.standardOutput = handle
            process.standardError = handle
        }

        do {
            try process.run()
            processes[project.path] = process
        } catch {
            fail(project, "\(error)")
        }
    }

    private func cliMissingMessage(_ lookup: CLILocator.Lookup) -> String {
        let places = lookup.searched.map { "  \($0)" }.joined(separator: "\n")
        return """
            no suivre CLI found. Looked for:
            \(places)
            Install it (`npm i -g suivre.md`) or point at it from the menu bar: \
            suivre CLI \u{2192} Choose\u{2026}
            """
    }

    /// Records why a spawn never happened, in the file `Reveal logs` opens —
    /// otherwise a failed start is invisible.
    private func fail(_ project: Project, _ reason: String) {
        NSLog("suivre: cannot start server for %@: %@", project.name, reason)
        guard let handle = logHandle(for: project) else { return }
        handle.write(Data("suivre: cannot start server — \(reason)\n".utf8))
        try? handle.close()
    }

    private func pollHealth(
        _ project: Project,
        attempts: Int,
        completion: @escaping (HealthStatus) -> Void
    ) {
        guard attempts > 0 else {
            completion(.down)
            return
        }
        HealthProbe.check(port: project.port, root: project.path) { [weak self] status in
            guard let self else {
                completion(status)
                return
            }
            if case .down = status {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    self.pollHealth(project, attempts: attempts - 1, completion: completion)
                }
                return
            }
            completion(status)
        }
    }

    private func logHandle(for project: Project) -> FileHandle? {
        let dir = registry.logsDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("server-\(project.port).log")
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        let handle = try? FileHandle(forWritingTo: url)
        _ = try? handle?.seekToEnd()
        return handle
    }
}
