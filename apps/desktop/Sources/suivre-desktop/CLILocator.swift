import Foundation

/// Finds the installed `suivre` CLI to run the board server with.
///
/// The published package ships `dist/` only — no `src/`, no `tsx` — and its
/// `suivre` command is a symlink to `dist/cli/index.js`. So the CLI is looked up
/// where it is *installed*, not where this repo happens to be cloned: an explicit
/// path from the config first, then `suivre` on disk, then a suivre.md checkout
/// as a last resort (which is all the app used to support).
enum CLILocator {
    /// How to run the CLI, resolved before a node binary is known.
    enum Entry: Equatable {
        /// A node script — what npm's `suivre` symlink resolves to.
        case script(String)
        /// An executable shim to run as-is (pnpm/yarn/bun write these).
        case executable(String)
        /// A checkout with no `dist/`, run through its own tsx.
        case tsx(runner: String, entry: String)

        func command(node: String) -> (executable: String, arguments: [String]) {
            switch self {
            case .script(let path): return (node, [path])
            case .executable(let path): return (path, [])
            case .tsx(let runner, let entry): return (node, [runner, entry])
            }
        }

        /// What the menu shows and the log names.
        var description: String {
            switch self {
            case .script(let path): return path
            case .executable(let path): return path
            case .tsx(let runner, let entry): return "\(runner) \(entry)"
            }
        }
    }

    struct Lookup {
        let entry: Entry?
        /// Every place tried, in order — quoted verbatim when nothing matched, so
        /// a failure names what it looked for instead of just giving up.
        let searched: [String]
    }

    static func locate(configured: String?, repoPath: String?) -> Lookup {
        var searched: [String] = []

        if let configured, !configured.isEmpty {
            searched.append("\(configured) (cliPath in ~/.config/suivre/desktop.json)")
            if let entry = entry(atPath: configured) {
                return Lookup(entry: entry, searched: searched)
            }
        }

        for candidate in commandCandidates() {
            searched.append(candidate)
            if let entry = entry(atPath: candidate) {
                return Lookup(entry: entry, searched: searched)
            }
        }

        if let repoPath, !repoPath.isEmpty {
            searched.append("\(repoPath) (suivreRepoPath in ~/.config/suivre/desktop.json)")
            if let entry = entry(atPath: repoPath) {
                return Lookup(entry: entry, searched: searched)
            }
        }

        return Lookup(entry: nil, searched: searched)
    }

    /// Classifies a path the user picked, or one of our candidates: the CLI
    /// itself, a shim pointing at it, or a directory holding one.
    static func entry(atPath path: String) -> Entry? {
        let expanded = (path as NSString).expandingTildeInPath
        let fm = FileManager.default
        var isDirectory: ObjCBool = false
        guard fm.fileExists(atPath: expanded, isDirectory: &isDirectory) else { return nil }

        if isDirectory.boolValue {
            let built = expanded + "/dist/cli/index.js"
            if fm.isReadableFile(atPath: built) { return .script(built) }
            let tsx = expanded + "/node_modules/.bin/tsx"
            let source = expanded + "/src/cli/index.ts"
            if fm.isExecutableFile(atPath: tsx), fm.isReadableFile(atPath: source) {
                return .tsx(runner: tsx, entry: source)
            }
            return nil
        }

        // A bin entry is usually a symlink onto the real script; follow it so we
        // run the file with node rather than depending on its shebang.
        let resolved = URL(fileURLWithPath: expanded).resolvingSymlinksInPath().path
        if isScript(resolved) { return fm.isReadableFile(atPath: resolved) ? .script(resolved) : nil }
        return fm.isExecutableFile(atPath: resolved) ? .executable(resolved) : nil
    }

    /// Directories that hold a global `suivre`. The one next to `node` comes
    /// first: every version manager installs global bins there, and it is the
    /// only one a double-clicked app can find — it inherits launchd's PATH.
    private static func commandCandidates() -> [String] {
        var directories: [String] = []
        if let node = NodeLocator.find() {
            directories.append((node as NSString).deletingLastPathComponent)
        }
        let path = ProcessInfo.processInfo.environment["PATH"] ?? ""
        directories += path.split(separator: ":").map(String.init)
        directories += ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]

        var seen = Set<String>()
        return directories
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .map { $0 + "/suivre" }
    }

    private static func isScript(_ path: String) -> Bool {
        let ext = (path as NSString).pathExtension
        return ext == "js" || ext == "mjs" || ext == "cjs"
    }
}
