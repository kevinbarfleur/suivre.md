import Foundation

/// What answers on a project's port.
enum HealthStatus: Equatable {
    /// Nothing answered, or it wasn't HTTP 200.
    case down
    /// A suivre board serving this project's root.
    case mine(name: String?)
    /// Something answered, but not this project's board. Adopting it would show
    /// — and write into — someone else's backlog, so it never counts as up.
    case foreign(reason: String)

    var isMine: Bool {
        if case .mine = self { return true }
        return false
    }

    /// One line for a log, a menu row or an alert.
    var summary: String {
        switch self {
        case .down: return "nothing answered"
        case .mine(let name): return "serving \(name ?? "this board")"
        case .foreign(let reason): return reason
        }
    }
}

/// One-shot health check against a local `suivre board` server. Completions are
/// delivered on the main queue so callers can touch UI/state without hopping.
///
/// This is an identity check, not a liveness check: `/api/health` names the
/// product and the root it serves, and anything else on the port is foreign.
enum HealthProbe {
    static func check(port: Int, root: String, completion: @escaping (HealthStatus) -> Void) {
        guard let url = URL(string: "http://localhost:\(port)/api/health") else {
            DispatchQueue.main.async { completion(.down) }
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let task = URLSession.shared.dataTask(with: request) { data, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let status = classify(code: code, body: data, port: port, root: root)
            DispatchQueue.main.async { completion(status) }
        }
        task.resume()
    }

    /// Pure, so `--selftest` can exercise every branch without a server.
    static func classify(code: Int, body: Data?, port: Int, root: String) -> HealthStatus {
        guard code == 200 else { return .down }
        guard
            let body,
            let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        else {
            return .foreign(reason: "port \(port) answers, but not with a board's health")
        }
        guard let product = json["product"] as? String else {
            // Health used to be a bare `{ok:true}`: every board — every repo —
            // looked identical, which is exactly what we refuse to guess at.
            return .foreign(
                reason: "port \(port) answers without saying what it is — an older suivre, or another server"
            )
        }
        guard product == "suivre" else {
            return .foreign(reason: "port \(port) is served by \(product), not suivre")
        }
        guard let served = json["root"] as? String, samePath(served, root) else {
            let name = json["name"] as? String ?? "another board"
            let location = json["root"] as? String ?? "an unnamed root"
            return .foreign(reason: "port \(port) is serving \(name) (\(location)), not \(root)")
        }
        return .mine(name: json["name"] as? String)
    }

    /// Compares paths through symlinks, so `/tmp/x` and `/private/tmp/x` are the
    /// same board.
    private static func samePath(_ lhs: String, _ rhs: String) -> Bool {
        let left = URL(fileURLWithPath: lhs).resolvingSymlinksInPath().standardizedFileURL.path
        let right = URL(fileURLWithPath: rhs).resolvingSymlinksInPath().standardizedFileURL.path
        return left == right
    }
}
