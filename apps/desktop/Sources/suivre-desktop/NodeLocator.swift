import Foundation

/// Finds a `node` binary the app can spawn the board server with.
///
/// PATH is tried first — when the app was launched from a shell it is what the
/// user means by "node". A double-clicked app inherits launchd's minimal PATH
/// instead, and a login shell doesn't rescue it: `zsh -lc` is non-interactive, so
/// it skips `.zshrc` — exactly where nvm installs itself. So the version
/// managers' install roots are probed directly too, then Homebrew and the system
/// prefixes.
enum NodeLocator {
    /// Absolute path to an executable `node`, or nil when none is installed.
    static func find() -> String? {
        candidates().first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    /// Where `find` looks, in order — quoted verbatim when nothing is found.
    static let searchDescription =
        "PATH, nvm, fnm, volta, mise, asdf, Homebrew, /usr/local/bin, /usr/bin"

    private static func candidates() -> [String] {
        pathCandidates() + nvmCandidates() + managerCandidates()
            + ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
    }

    private static func pathCandidates() -> [String] {
        let path = ProcessInfo.processInfo.environment["PATH"] ?? ""
        return path.split(separator: ":").filter { !$0.isEmpty }.map { "\($0)/node" }
    }

    /// Installed nvm versions: the one pinned by the `default` alias first, then
    /// newest to oldest so an unpinned setup still lands on a recent runtime.
    private static func nvmCandidates() -> [String] {
        let versionsDir = nvmDir.appendingPathComponent("versions/node")
        let installed = installedVersions(in: versionsDir)

        var ordered = installed
        if let alias = defaultAliasVersion(),
            let pinned = installed.first(where: { matches(version: $0, alias: alias) })
        {
            ordered = [pinned] + installed.filter { $0 != pinned }
        }
        return ordered.map { versionsDir.appendingPathComponent("\($0)/bin/node").path }
    }

    /// The other managers this audience actually uses. volta's `node` is a shim
    /// that picks the version itself; the rest keep versioned install roots, so
    /// they are scanned newest-first (none records its default in a file we can
    /// read as cheaply as nvm's alias).
    private static func managerCandidates() -> [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let fnm = "installation/bin/node"
        let versioned = [
            ("Library/Application Support/fnm/node-versions", fnm),
            (".fnm/node-versions", fnm),
            (".local/share/mise/installs/node", "bin/node"),
            (".asdf/installs/nodejs", "bin/node"),
        ]
        let scanned = versioned.flatMap { relative, suffix -> [String] in
            let root = home.appendingPathComponent(relative)
            return installedVersions(in: root).map {
                root.appendingPathComponent("\($0)/\(suffix)").path
            }
        }
        return [home.appendingPathComponent(".volta/bin/node").path] + scanned
    }

    /// Version-named subdirectories, newest first ("v20.19.4" and "20.19.4" both).
    private static func installedVersions(in directory: URL) -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.first == "v" || $0.first?.isNumber == true }.sorted(by: isNewer)
    }

    private static var nvmDir: URL {
        if let dir = ProcessInfo.processInfo.environment["NVM_DIR"], !dir.isEmpty {
            return URL(fileURLWithPath: dir)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".nvm")
    }

    /// The `default` alias as a bare version prefix ("20", "20.19.4"), resolving
    /// one `lts/*` hop. Symbolic aliases (`node`, `stable`) return nil, which
    /// leaves the newest-first order in place.
    private static func defaultAliasVersion() -> String? {
        guard var alias = readAlias("default") else { return nil }
        if alias.hasPrefix("lts/"), let resolved = readAlias(alias) {
            alias = resolved
        }
        let version = alias.hasPrefix("v") ? String(alias.dropFirst()) : alias
        return version.first?.isNumber == true ? version : nil
    }

    private static func readAlias(_ name: String) -> String? {
        let url = nvmDir.appendingPathComponent("alias/\(name)")
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    /// True when "v20.19.4" satisfies the alias "20" (or "20.19", or "20.19.4").
    private static func matches(version: String, alias: String) -> Bool {
        let versionParts = version.dropFirst().split(separator: ".")
        let aliasParts = alias.split(separator: ".")
        guard aliasParts.count <= versionParts.count else { return false }
        return zip(versionParts, aliasParts).allSatisfy { $0 == $1 }
    }

    /// Compares versions numerically, so v20 sorts above v9.
    private static func isNewer(_ lhs: String, _ rhs: String) -> Bool {
        let left = components(lhs)
        let right = components(rhs)
        for (l, r) in zip(left, right) where l != r {
            return l > r
        }
        return left.count > right.count
    }

    private static func components(_ version: String) -> [Int] {
        let bare = version.hasPrefix("v") ? String(version.dropFirst()) : version
        return bare.split(separator: ".").map { Int($0) ?? 0 }
    }
}
