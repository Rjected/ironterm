import Foundation

enum ApiError: LocalizedError, Equatable {
    case notConfigured
    case badURL
    case unauthorized(DataSource)
    case http(Int, String)
    case decoding(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Not connected. Open SETUP."
        case .badURL: return "That server URL isn't valid."
        case .unauthorized(.direct): return "Hevy rejected the API key. Check it in SETUP."
        case .unauthorized: return "Token revoked or invalid. Reconnect."
        case .http(let code, let body): return "Server error \(code)\(body.isEmpty ? "" : ": \(body.prefix(120))")"
        case .decoding(let m): return "Unexpected response: \(m)"
        case .network(let m): return "Network: \(m)"
        }
    }

    var isAuth: Bool { if case .unauthorized = self { return true } else { return false } }
}

/// Server mode: GET /api/snapshot with the app token (docs/api/README.md).
struct ServerClient {
    var base: URL
    var token: String
    var session: URLSession = .shared

    static func endpoint(_ base: URL, _ path: String) -> URL {
        var s = base.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        return URL(string: s + path)!
    }

    func request(_ path: String, method: String = "GET") -> URLRequest {
        var r = URLRequest(url: Self.endpoint(base, path), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        return r
    }

    func fetchSnapshot() async throws -> Snapshot {
        let data = try await send(request("/api/snapshot"))
        do { return try Snapshot.decode(data) } catch { throw ApiError.decoding(String(describing: error).prefix(200).description) }
    }

    /// Ask the server to pull new workouts from Hevy now. Best effort.
    func triggerSync() async {
        _ = try? await send(request("/api/sync", method: "POST"))
    }

    private func send(_ r: URLRequest) async throws -> Data {
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(for: r) } catch { throw ApiError.network(error.localizedDescription) }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 || code == 403 { throw ApiError.unauthorized(.server) }
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: data, encoding: .utf8) ?? "") }
        return data
    }
}

/// Direct mode: the Hevy public API with the user's own key (header `api-key`, pageSize ≤ 10).
struct HevyClient {
    var apiKey: String
    var base = URL(string: "https://api.hevyapp.com")!
    var session: URLSession = .shared
    static let pageSize = 10

    func page(_ n: Int) async throws -> WorkoutsPage {
        var c = URLComponents(url: base.appendingPathComponent("v1/workouts"), resolvingAgainstBaseURL: false)!
        c.queryItems = [.init(name: "page", value: String(n)), .init(name: "pageSize", value: String(Self.pageSize))]
        var r = URLRequest(url: c.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        r.setValue(apiKey, forHTTPHeaderField: "api-key")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(for: r) } catch { throw ApiError.network(error.localizedDescription) }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 || code == 403 { throw ApiError.unauthorized(.direct) }
        // Hevy answers 404 for a page past the end
        if code == 404 { return WorkoutsPage(page: n, pageCount: max(0, n - 1), workouts: []) }
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: data, encoding: .utf8) ?? "") }
        do { return try JSONDecoder().decode(WorkoutsPage.self, from: data) } catch {
            throw ApiError.decoding(String(describing: error).prefix(200).description)
        }
    }

    /// Fetch workouts, newest first, merging into `cached`. With a cache it stops at the first
    /// page whose workouts are all already known and unchanged (incremental). `maxPages` bounds the
    /// work for the widget extension's tight time budget.
    func fetch(merging cached: [Workout], maxPages: Int = 1000) async throws -> [Workout] {
        var byId = Dictionary(cached.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let incremental = !cached.isEmpty
        var fresh: [Workout] = []
        var n = 1, count = 1
        while n <= count && n <= maxPages {
            let p = try await page(n)
            count = p.pageCount
            var allKnown = !p.workouts.isEmpty
            for w in p.workouts {
                if let old = byId[w.id], old.updatedAt == w.updatedAt, old == w { continue }
                allKnown = false
            }
            fresh += p.workouts
            for w in p.workouts { byId[w.id] = w }
            if incremental && allKnown { break }
            n += 1
        }
        // Full fetch (no cache, all pages read): the server's list is authoritative, so deletions drop out.
        if !incremental && n > count { return fresh }
        return Array(byId.values)
    }
}
