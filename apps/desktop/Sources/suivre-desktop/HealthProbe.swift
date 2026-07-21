import Foundation

/// One-shot health check against a local `suivre board` server. Completions are
/// delivered on the main queue so callers can touch UI/state without hopping.
enum HealthProbe {
    static func check(port: Int, completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "http://localhost:\(port)/api/health") else {
            DispatchQueue.main.async { completion(false) }
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { completion(ok) }
        }
        task.resume()
    }
}
