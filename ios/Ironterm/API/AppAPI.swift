import Foundation

/// The native app screens API (docs/api/README.md "App screens"), Bearer `ht_…` token auth.
struct AppAPI {
    var base: URL
    var token: String
    var session: URLSession = .shared

    private var client: ServerClient { ServerClient(base: base, token: token, session: session) }

    // MARK: screens

    func home() async throws -> AppHome { try await get("/api/app/home") }
    func gym() async throws -> AppGym { try await get("/api/app/gym") }
    func lifts() async throws -> AppLiftList { try await get("/api/app/lifts") }
    func lift(_ key: String) async throws -> AppLiftDetail { try await get("/api/app/lifts/" + Self.seg(key)) }
    func history(cursor: String?, limit: Int = 30, q: String?) async throws -> AppHistory {
        try await get(Self.historyPath(cursor: cursor, limit: limit, q: q))
    }
    func workout(_ id: String) async throws -> AppWorkout { try await get("/api/app/workouts/" + Self.seg(id)) }
    func calendar(month: String?) async throws -> AppCalendar { try await get("/api/app/calendar" + (month.map { "?month=\($0)" } ?? "")) }
    func program() async throws -> AppProgram { try await get("/api/app/program") }
    func body(mode: String) async throws -> AppBody { try await get("/api/app/body?mode=\(mode)") }
    func insights() async throws -> AppInsights { try await get("/api/app/insights") }
    func stats() async throws -> AppStats { try await get("/api/app/stats") }

    // MARK: actions

    func startGym(dayIndex: Int?, empty: Bool) async throws -> LiveSession {
        var body: [String: Any] = [:]
        if let dayIndex { body["dayIndex"] = dayIndex }
        if empty { body["empty"] = true }
        return try await send("/api/app/gym/start", method: "POST", json: try JSONSerialization.data(withJSONObject: body))
    }

    func putLive(_ s: LiveSession) async throws {
        let _: OK = try await send("/api/live", method: "PUT", json: try JSONEncoder().encode(s))
    }

    func discardLive() async throws {
        let _: OK = try await send("/api/live", method: "DELETE", json: nil)
    }

    func finishLive(_ s: LiveSession) async throws -> FinishResult {
        try await send("/api/live/finish", method: "POST", json: try JSONEncoder().encode(s))
    }

    func saveNotes(workoutId: String, _ edit: NotesEdit) async throws {
        let _: OK = try await send("/api/workouts/\(Self.seg(workoutId))/notes", method: "PUT", json: try JSONEncoder().encode(edit))
    }

    func pushRoutines() async throws -> PushResult {
        try await send("/api/routines/push", method: "POST", json: Data("{}".utf8))
    }

    func sync() async { await client.triggerSync() }

    // MARK: plumbing

    struct OK: Decodable {}

    static func seg(_ s: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    static func historyPath(cursor: String?, limit: Int, q: String?) -> String {
        var c = URLComponents()
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor, !cursor.isEmpty { items.append(.init(name: "cursor", value: cursor)) }
        if let q = q?.trimmingCharacters(in: .whitespaces), !q.isEmpty { items.append(.init(name: "q", value: q)) }
        c.queryItems = items
        return "/api/app/history?" + (c.percentEncodedQuery ?? "")
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        let (v, _): (T, Data) = try await getRaw(path)
        return v
    }

    /// The decoded value and the raw bytes (for the offline cache).
    func getRaw<T: Decodable>(_ path: String) async throws -> (T, Data) {
        let data = try await perform(client.request(path))
        return (try Self.decode(T.self, data), data)
    }

    func send<T: Decodable>(_ path: String, method: String, json: Data?) async throws -> T {
        var r = client.request(path, method: method)
        if let json {
            r.httpBody = json
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try Self.decode(T.self, try await perform(r))
    }

    static func decode<T: Decodable>(_ t: T.Type, _ data: Data) throws -> T {
        if T.self == OK.self { return OK() as! T }
        do { return try JSONDecoder().decode(T.self, from: data) } catch {
            throw ApiError.decoding(String(describing: error).prefix(240).description)
        }
    }

    private func perform(_ r: URLRequest) async throws -> Data {
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(for: r) } catch { throw ApiError.network(error.localizedDescription) }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 || code == 403 { throw ApiError.unauthorized(.server) }
        guard (200..<300).contains(code) else {
            // the server answers {"error": "..."}: show just the message
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let msg = obj?["error"] as? String ?? String(data: data, encoding: .utf8) ?? ""
            throw ApiError.http(code, msg)
        }
        return data
    }
}

extension ApiError {
    /// Worth retrying later (offline, timeouts, server hiccups) rather than giving up.
    var isTransient: Bool {
        switch self {
        case .network: return true
        // 409: the server is still saving an earlier attempt of the same finish
        case .http(let code, _): return code >= 500 || code == 408 || code == 409 || code == 429
        default: return false
        }
    }
}
