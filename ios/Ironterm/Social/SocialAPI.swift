import Foundation

/// Everything the FRIENDS tab needs from the owner's server (PROTOCOL.md §6). The live
/// implementation talks to `/api/social/*`; `DemoSocial` answers from memory for screenshots.
protocol SocialService: Sendable {
    func me() async throws -> SocialMe
    func setup(handle: String, name: String, listed: Bool) async throws -> SocialSetupResult
    func unregister() async throws
    func search(_ q: String) async throws -> [DirectoryUser]
    func friends() async throws -> [Friend]
    func addFriend(_ target: SocialFmt.Target, note: String?, share: ShareLevel) async throws -> Friend
    func accept(_ id: String, share: ShareLevel) async throws
    func reject(_ id: String) async throws
    func setShare(_ id: String, share: ShareLevel) async throws
    func remove(_ id: String) async throws
    func feed(before: String?, fresh: Bool) async throws -> FeedPage
    func profile(_ id: String, fresh: Bool) async throws -> ProfileResponse
    func friendFeed(_ id: String, before: String?, fresh: Bool) async throws -> FeedPage
    func compare(_ id: String) async throws -> Compare
    func mine(before: String?) async throws -> FeedPage
    func react(friend: String, item: String, emoji: String?) async throws
    func comment(friend: String, item: String, text: String) async throws
    func notifications() async throws -> [SocialNotification]
    func markRead() async throws
}

struct SocialAPI: SocialService {
    var api: AppAPI

    static func feedPath(_ base: String, before: String?, limit: Int?, fresh: Bool) -> String {
        var items: [URLQueryItem] = []
        if let before, !before.isEmpty { items.append(URLQueryItem(name: "before", value: before)) }
        if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
        if fresh { items.append(URLQueryItem(name: "fresh", value: "1")) }
        guard !items.isEmpty else { return base }
        var c = URLComponents()
        c.queryItems = items
        // ":" in item ids is fine in a query, but "+" and "&" are not
        let q: String = (c.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
        return base + "?" + q
    }

    static func friendPath(_ id: String, _ rest: String = "") -> String {
        "/api/social/friends/" + AppAPI.seg(id) + rest
    }

    func me() async throws -> SocialMe { try await get("/api/social/me") }

    func setup(handle: String, name: String, listed: Bool) async throws -> SocialSetupResult {
        try await send("/api/social/setup", "POST", ["handle": handle, "name": name, "listed": listed])
    }

    func unregister() async throws {
        let _: AppAPI.OK = try await send("/api/social/setup", "DELETE", nil)
    }

    func search(_ q: String) async throws -> [DirectoryUser] {
        var c = URLComponents()
        c.queryItems = [URLQueryItem(name: "q", value: q)]
        let r: SearchResponse = try await get("/api/social/search?" + (c.percentEncodedQuery ?? ""))
        return r.users
    }

    func friends() async throws -> [Friend] {
        let r: FriendsResponse = try await get("/api/social/friends")
        return r.friends
    }

    func addFriend(_ target: SocialFmt.Target, note: String?, share: ShareLevel) async throws -> Friend {
        var body: [String: Any] = ["share": share.rawValue]
        switch target {
        case .handle(let h): body["handle"] = h
        case .server(let s): body["server"] = s
        case .invalid: throw ApiError.http(400, "Enter a handle or a server URL.")
        }
        if let note, !note.isEmpty { body["note"] = note }
        let r: FriendResponse = try await send("/api/social/friends", "POST", body)
        return r.friend
    }

    func accept(_ id: String, share: ShareLevel) async throws {
        let _: AppAPI.OK = try await send(Self.friendPath(id, "/accept"), "POST", ["share": share.rawValue])
    }

    func reject(_ id: String) async throws {
        let _: AppAPI.OK = try await send(Self.friendPath(id, "/reject"), "POST", [:])
    }

    func setShare(_ id: String, share: ShareLevel) async throws {
        let _: AppAPI.OK = try await send(Self.friendPath(id), "PUT", ["share": share.rawValue])
    }

    func remove(_ id: String) async throws {
        let _: AppAPI.OK = try await send(Self.friendPath(id), "DELETE", nil)
    }

    func feed(before: String?, fresh: Bool) async throws -> FeedPage {
        try await get(Self.feedPath("/api/social/feed", before: before, limit: 30, fresh: fresh))
    }

    func profile(_ id: String, fresh: Bool) async throws -> ProfileResponse {
        try await get(Self.friendPath(id, "/profile") + (fresh ? "?fresh=1" : ""))
    }

    func friendFeed(_ id: String, before: String?, fresh: Bool) async throws -> FeedPage {
        try await get(Self.feedPath(Self.friendPath(id, "/feed"), before: before, limit: nil, fresh: fresh))
    }

    func compare(_ id: String) async throws -> Compare {
        try await get("/api/social/compare/" + AppAPI.seg(id))
    }

    func mine(before: String?) async throws -> FeedPage {
        try await get(Self.feedPath("/api/social/mine", before: before, limit: nil, fresh: false))
    }

    func react(friend: String, item: String, emoji: String?) async throws {
        let e: Any = emoji ?? NSNull()
        let _: AppAPI.OK = try await send("/api/social/react", "POST", ["friend": friend, "item": item, "emoji": e])
    }

    func comment(friend: String, item: String, text: String) async throws {
        let _: AppAPI.OK = try await send("/api/social/comment", "POST", ["friend": friend, "item": item, "text": text])
    }

    func notifications() async throws -> [SocialNotification] {
        let r: NotificationsResponse = try await get("/api/social/notifications")
        return r.items
    }

    func markRead() async throws {
        let _: AppAPI.OK = try await send("/api/social/notifications/read", "POST", [:])
    }

    // MARK: plumbing (403 here means "not allowed", not a revoked token)

    func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await api.perform(api.client.request(path), forbiddenIsAuth: false)
        return try AppAPI.decode(T.self, data)
    }

    func send<T: Decodable>(_ path: String, _ method: String, _ body: [String: Any]?) async throws -> T {
        var r = api.client.request(path, method: method)
        if let body {
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data = try await api.perform(r, forbiddenIsAuth: false)
        return try AppAPI.decode(T.self, data)
    }
}
