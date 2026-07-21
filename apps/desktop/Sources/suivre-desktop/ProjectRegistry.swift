import Foundation

/// A registered project: a folder holding a `.suivre` board, pinned to a port.
struct Project: Codable, Equatable {
    var name: String
    var path: String
    var port: Int
}

/// A registered URL target: any page to open in the overlay.
struct Link: Codable, Equatable {
    var name: String
    var url: String
}

/// What the overlay can show: a project's local dashboard, or an arbitrary URL.
enum OverlayTarget {
    case project(Project)
    case link(Link)

    var id: String {
        switch self {
        case .project(let project): return "project:\(project.path)"
        case .link(let link): return "link:\(link.url)"
        }
    }

    var title: String {
        switch self {
        case .project(let project): return project.name
        case .link(let link): return link.name
        }
    }

    var url: URL? {
        switch self {
        case .project(let project): return URL(string: "http://localhost:\(project.port)")
        case .link(let link): return URL(string: link.url)
        }
    }
}

/// Persisted state for the desktop app: registered projects and URL targets, the
/// active target, the overlay size, and where the suivre.md checkout lives.
/// Stored at `~/.config/suivre/desktop.json`, next to the machine preferences.
final class ProjectRegistry {
    private struct State: Codable {
        var suivreRepoPath: String
        var projects: [Project]
        var links: [Link]
        var activeTargetID: String?
        var overlaySize: String?
        var activePath: String?  // legacy; migrated to activeTargetID

        init(suivreRepoPath: String) {
            self.suivreRepoPath = suivreRepoPath
            self.projects = []
            self.links = []
            self.activeTargetID = nil
            self.overlaySize = nil
            self.activePath = nil
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            suivreRepoPath = try container.decode(String.self, forKey: .suivreRepoPath)
            projects = try container.decodeIfPresent([Project].self, forKey: .projects) ?? []
            links = try container.decodeIfPresent([Link].self, forKey: .links) ?? []
            activeTargetID = try container.decodeIfPresent(String.self, forKey: .activeTargetID)
            overlaySize = try container.decodeIfPresent(String.self, forKey: .overlaySize)
            activePath = try container.decodeIfPresent(String.self, forKey: .activePath)
        }
    }

    private var state: State
    private let fileURL: URL

    init() {
        let configDir = ProjectRegistry.configDirectory
        fileURL = configDir.appendingPathComponent("desktop.json")
        try? FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)
        state =
            ProjectRegistry.load(from: fileURL)
            ?? State(suivreRepoPath: ProjectRegistry.defaultRepoPath())
        migrateLegacyActive()
        persist()
    }

    var projects: [Project] { state.projects }
    var links: [Link] { state.links }
    var suivreRepoPath: String { state.suivreRepoPath }
    var overlaySizePreset: String { state.overlaySize ?? "medium" }

    var logsDirectory: URL {
        ProjectRegistry.configDirectory.appendingPathComponent("logs")
    }

    /// Active target, defaulting to the first project, then the first link.
    var activeTarget: OverlayTarget? {
        if let id = state.activeTargetID, let target = target(forID: id) {
            return target
        }
        if let project = state.projects.first { return .project(project) }
        if let link = state.links.first { return .link(link) }
        return nil
    }

    /// Resolves a target by its display name (project first, then link).
    func target(named name: String) -> OverlayTarget? {
        if let project = state.projects.first(where: { $0.name == name }) {
            return .project(project)
        }
        if let link = state.links.first(where: { $0.name == name }) {
            return .link(link)
        }
        return nil
    }

    func target(forID id: String) -> OverlayTarget? {
        if id.hasPrefix("project:") {
            let path = String(id.dropFirst("project:".count))
            return state.projects.first { $0.path == path }.map(OverlayTarget.project)
        }
        if id.hasPrefix("link:") {
            let url = String(id.dropFirst("link:".count))
            return state.links.first { $0.url == url }.map(OverlayTarget.link)
        }
        return nil
    }

    func setActiveTarget(_ id: String) {
        state.activeTargetID = id
        persist()
    }

    func setOverlaySize(_ preset: String) {
        state.overlaySize = preset
        persist()
    }

    /// Registers a folder as a project. The folder must contain a
    /// `.suivre/config.yml`. Returns the project, or nil if it isn't a board.
    @discardableResult
    func addProject(atPath path: String) -> Project? {
        let normalized = (path as NSString).expandingTildeInPath
        let configFile = normalized + "/.suivre/config.yml"
        guard FileManager.default.fileExists(atPath: configFile) else {
            return nil
        }
        if let existing = state.projects.first(where: { $0.path == normalized }) {
            return existing
        }
        let project = Project(
            name: (normalized as NSString).lastPathComponent,
            path: normalized,
            port: nextPort()
        )
        state.projects.append(project)
        if state.activeTargetID == nil {
            state.activeTargetID = "project:\(project.path)"
        }
        persist()
        return project
    }

    /// Registers any URL as an overlay target. Accepts bare hosts (prefixes
    /// https://). Returns the link, or nil if the URL can't be parsed.
    @discardableResult
    func addLink(urlString: String, name: String? = nil) -> Link? {
        var text = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard let url = URL(string: text), let host = url.host else {
            return nil
        }
        if let existing = state.links.first(where: { $0.url == text }) {
            return existing
        }
        let trimmedName = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let link = Link(name: (trimmedName?.isEmpty == false) ? trimmedName! : host, url: text)
        state.links.append(link)
        if state.activeTargetID == nil {
            state.activeTargetID = "link:\(text)"
        }
        persist()
        return link
    }

    func remove(_ project: Project) {
        state.projects.removeAll { $0.path == project.path }
        clearActiveIfNeeded("project:\(project.path)")
        persist()
    }

    func remove(_ link: Link) {
        state.links.removeAll { $0.url == link.url }
        clearActiveIfNeeded("link:\(link.url)")
        persist()
    }

    private func clearActiveIfNeeded(_ id: String) {
        if state.activeTargetID == id {
            state.activeTargetID = nil
        }
    }

    private func migrateLegacyActive() {
        guard state.activeTargetID == nil, let path = state.activePath else { return }
        state.activeTargetID = "project:\(path)"
        state.activePath = nil
    }

    private func nextPort() -> Int {
        let used = Set(state.projects.map(\.port))
        var port = 45188
        while used.contains(port) {
            port += 1
        }
        return port
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let data = try? encoder.encode(state) {
            try? data.write(to: fileURL)
        }
    }

    private static func load(from url: URL) -> State? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(State.self, from: data)
    }

    private static var configDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config")
            .appendingPathComponent("suivre")
    }

    private static func defaultRepoPath() -> String {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Github/suivre.md")
            .path
    }
}
