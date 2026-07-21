import Foundation

/// Supervises one `suivre board` server per project.
///
/// Health is the source of truth: if a server is already answering on a
/// project's port (launched by the agent or by hand), it is adopted rather than
/// duplicated. Only servers we spawned are tracked, so `stopAll` never kills a
/// server we didn't start.
final class ServerSupervisor {
    private let registry: ProjectRegistry
    private var processes: [String: Process] = [:]

    init(registry: ProjectRegistry) {
        self.registry = registry
    }

    /// Ensures a server answers on the project's port, spawning one if needed.
    /// Calls back with `true` once health responds, or `false` on timeout.
    func ensureRunning(_ project: Project, completion: @escaping (Bool) -> Void) {
        HealthProbe.check(port: project.port) { [weak self] up in
            guard let self else {
                completion(up)
                return
            }
            if up {
                completion(true)
                return
            }
            self.spawn(project)
            self.pollHealth(project, attempts: 40, completion: completion)
        }
    }

    func stop(_ project: Project) {
        if let process = processes[project.path], process.isRunning {
            process.terminate()
        }
        processes[project.path] = nil
    }

    func stopAll() {
        for process in processes.values where process.isRunning {
            process.terminate()
        }
        processes.removeAll()
    }

    func status(_ project: Project, completion: @escaping (Bool) -> Void) {
        HealthProbe.check(port: project.port, completion: completion)
    }

    private func spawn(_ project: Project) {
        if let existing = processes[project.path], existing.isRunning {
            return
        }

        // Run through a login shell so nvm/homebrew node is on PATH even when the
        // app was double-clicked (a bundled app doesn't inherit a shell PATH).
        // `exec` replaces the shell with tsx so terminate() hits the server.
        let command = "exec ./node_modules/.bin/tsx src/cli/index.ts board --port \(project.port)"

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", command]
        process.currentDirectoryURL = URL(fileURLWithPath: registry.suivreRepoPath)

        var env = ProcessInfo.processInfo.environment
        env["SUIVRE_ROOT"] = project.path
        env["PORT"] = String(project.port)
        process.environment = env

        if let handle = logHandle(for: project) {
            process.standardOutput = handle
            process.standardError = handle
        }

        do {
            try process.run()
            processes[project.path] = process
        } catch {
            NSLog("suivre: failed to spawn server for %@: %@", project.name, "\(error)")
        }
    }

    private func pollHealth(
        _ project: Project,
        attempts: Int,
        completion: @escaping (Bool) -> Void
    ) {
        guard attempts > 0 else {
            completion(false)
            return
        }
        HealthProbe.check(port: project.port) { [weak self] up in
            guard let self else {
                completion(up)
                return
            }
            if up {
                completion(true)
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                self.pollHealth(project, attempts: attempts - 1, completion: completion)
            }
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
