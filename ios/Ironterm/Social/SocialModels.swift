import Foundation

// Swift mirror of the owner's social API (docs/social/PROTOCOL.md §6). Like AppModels.swift:
// unknown keys are ignored, anything that may be missing or null is optional, and enum-like
// strings fall back instead of failing the whole document.

/// What one side lets the other see (PROTOCOL.md §4).
enum ShareLevel: String, Codable, CaseIterable, Identifiable, Hashable {
    case basic, lifts, full

    var id: String { rawValue }
    var title: String { rawValue.uppercased() }

    /// One line, for pickers and badges.
    var summary: String {
        switch self {
        case .basic: return "Streak, sessions and graph. No weights."
        case .lifts: return "Basic + PR weights, e1RM per lift, session summaries."
        case .full: return "Lifts + every set, workout notes and readiness."
        }
    }

    /// Everything the friend can see at this level.
    var detail: String {
        switch self {
        case .basic:
            return "Your streak, sessions per week and the graph (levels only, no values). PRs and achievements are shown without weights."
        case .lifts:
            return "Everything in BASIC, plus PR weights, your current e1RM per lift, your program name and session summaries (exercises and top set)."
        case .full:
            return "Everything in LIFTS, plus every set, volume, your workout notes, bodyweight and readiness."
        }
    }

    init(from decoder: Decoder) throws {
        let s = try decoder.singleValueContainer().decode(String.self)
        self = ShareLevel(rawValue: s.lowercased()) ?? .basic
    }

    /// Label for "what they let me see" (nil until their profile was fetched).
    static func theirLabel(_ s: ShareLevel?) -> String {
        guard let s else { return "THEY SHARE: —" }
        return "THEY SHARE: " + s.title
    }
}

struct SocialMe: Codable, Equatable {
    var enabled: Bool
    var handle: String?
    var name: String?
    var server: String?
    var directory: String?
    var listed: Bool?
    var fingerprint: String?
    /// the server has a directory (SOCIAL_DIRECTORY); older servers: infer from `directory`
    var directoryConfigured: Bool?
    var unread: Int?

    var hasDirectory: Bool { directoryConfigured ?? (directory != nil) }
}

struct SocialSetupResult: Codable, Equatable {
    var ok: Bool?
    var handle: String?
}

struct Author: Codable, Equatable, Hashable, Identifiable {
    var id: String
    var server: String
    var handle: String?
    var name: String?

    /// Name, else @handle, else the server's host.
    var display: String {
        if let n = name, !n.isEmpty { return n }
        if let h = handle, !h.isEmpty { return "@" + h }
        return SocialFmt.host(server)
    }

    /// "@dan · gym.example.com" (or just the host)
    var subtitle: String {
        let host = SocialFmt.host(server)
        if let h = handle, !h.isEmpty { return "@\(h) · \(host)" }
        return host
    }
}

struct Friend: Codable, Equatable, Identifiable {
    enum Status: String, Codable {
        case friends, outgoing, incoming
        init(from decoder: Decoder) throws {
            let s = try decoder.singleValueContainer().decode(String.self)
            self = Status(rawValue: s) ?? .outgoing
        }
    }

    var id: String
    var server: String
    var handle: String?
    var name: String?
    var status: Status
    /// what *I* let them see
    var share: ShareLevel
    /// what they let me see (from their profile), null until fetched
    var theirShare: ShareLevel?
    var since: String
    var lastSeen: String?
    var fingerprint: String?
    var note: String?

    var author: Author { Author(id: id, server: server, handle: handle, name: name) }
}

struct FriendsResponse: Codable, Equatable { var friends: [Friend] }
struct FriendResponse: Codable, Equatable { var friend: Friend }

struct DirectoryUser: Codable, Equatable, Identifiable {
    var handle: String
    var name: String?
    var server: String
    var id: String { handle + "@" + server }
}

struct SearchResponse: Codable, Equatable { var users: [DirectoryUser] }

struct ReactionFrom: Codable, Equatable, Hashable {
    var server: String
    var name: String?
}

struct Reaction: Codable, Equatable {
    var emoji: String
    var from: [ReactionFrom]
}

struct FeedComment: Codable, Equatable, Identifiable {
    var id: String
    var from: ReactionFrom
    var text: String
    var at: String
}

/// One feed item. The three kinds share one flat struct: the kind-specific fields are optional.
struct FeedItem: Codable, Equatable, Identifiable {
    struct TopSet: Codable, Equatable { var weight: Double; var reps: Int }
    struct SetRow: Codable, Equatable { var weight: Double?; var reps: Int? }
    struct Exercise: Codable, Equatable {
        var name: String
        var lift: String?
        var top: TopSet?
        var sets: [SetRow]?
    }

    var id: String
    var at: String
    var kind: String
    var reactions: [Reaction]
    var comments: [FeedComment]
    /// set on the merged feed (whose item it is); missing on a single friend's feed and on mine
    var author: Author?

    // session
    var title: String?
    var durationMin: Double?
    var sets: Int?
    var exercises: [Exercise]?
    var volume: Double?
    var note: String?
    // pr
    var lift: String?
    var liftName: String?
    var prKind: String?
    var reps: Int?
    var weight: Double?
    var prev: Double?
    // achievement (title shared with session)
    var tier: String?
    var description: String?

    enum CodingKeys: String, CodingKey {
        case id, at, kind, reactions, comments, author, title, durationMin, sets, exercises, volume, note
        case lift, liftName, prKind, reps, weight, prev, tier, description
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        at = try c.decode(String.self, forKey: .at)
        kind = try c.decode(String.self, forKey: .kind)
        reactions = try c.decodeIfPresent([Reaction].self, forKey: .reactions) ?? []
        comments = try c.decodeIfPresent([FeedComment].self, forKey: .comments) ?? []
        author = try c.decodeIfPresent(Author.self, forKey: .author)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        durationMin = try c.decodeIfPresent(Double.self, forKey: .durationMin)
        sets = try c.decodeIfPresent(Int.self, forKey: .sets)
        exercises = try c.decodeIfPresent([Exercise].self, forKey: .exercises)
        volume = try c.decodeIfPresent(Double.self, forKey: .volume)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        lift = try c.decodeIfPresent(String.self, forKey: .lift)
        liftName = try c.decodeIfPresent(String.self, forKey: .liftName)
        prKind = try c.decodeIfPresent(String.self, forKey: .prKind)
        reps = try c.decodeIfPresent(Int.self, forKey: .reps)
        weight = try c.decodeIfPresent(Double.self, forKey: .weight)
        prev = try c.decodeIfPresent(Double.self, forKey: .prev)
        tier = try c.decodeIfPresent(String.self, forKey: .tier)
        description = try c.decodeIfPresent(String.self, forKey: .description)
    }

    init(id: String, at: String, kind: String, reactions: [Reaction] = [], comments: [FeedComment] = [], author: Author? = nil) {
        self.id = id; self.at = at; self.kind = kind; self.reactions = reactions; self.comments = comments; self.author = author
    }
}

/// `{ items, next, stale }`. The merged feed lists stale friend ids; a single friend's feed may
/// answer a plain boolean, so both decode.
struct FeedPage: Codable, Equatable {
    var items: [FeedItem]
    var next: String?
    var staleIds: [String]
    var staleAll: Bool
    /// friend ids with nothing to show (unreachable and no cached copy)
    var unreachable: [String]

    enum CodingKeys: String, CodingKey { case items, next, stale, unreachable }

    init(items: [FeedItem], next: String?, staleIds: [String] = [], staleAll: Bool = false, unreachable: [String] = []) {
        self.items = items; self.next = next; self.staleIds = staleIds; self.staleAll = staleAll; self.unreachable = unreachable
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decodeIfPresent([FeedItem].self, forKey: .items) ?? []
        next = try c.decodeIfPresent(String.self, forKey: .next)
        unreachable = (try? c.decodeIfPresent([String].self, forKey: .unreachable)) ?? []
        if let ids = try? c.decodeIfPresent([String].self, forKey: .stale) {
            staleIds = ids; staleAll = false
        } else if let b = try? c.decodeIfPresent(Bool.self, forKey: .stale) {
            staleIds = []; staleAll = b
        } else {
            staleIds = []; staleAll = false
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(items, forKey: .items)
        try c.encodeIfPresent(next, forKey: .next)
        if staleAll { try c.encode(true, forKey: .stale) } else { try c.encode(staleIds, forKey: .stale) }
        try c.encode(unreachable, forKey: .unreachable)
    }
}

struct SocialProfile: Codable, Equatable {
    struct Streak: Codable, Equatable { var current: Int; var best: Int }
    struct Week: Codable, Equatable { var done: Int; var target: Int }
    struct Graph: Codable, Equatable { var start: String; var levels: [Int] }
    struct Lift: Codable, Equatable, Identifiable {
        var key: String; var name: String; var e1rm: Double?; var best: Double?
        var id: String { key }
    }

    var server: String
    var handle: String?
    var name: String?
    var share: ShareLevel
    var unit: String?
    var streak: Streak
    var week: Week
    var sessions52: Int
    var graph: Graph
    var lifts: [Lift]
    var bodyweight: Double?
    var program: String?
    var updatedAt: String?

    /// The graph as contiguous Monday-first days, for GraphGrid.
    var graphDays: [Snapshot.Graph.Day] {
        var out: [Snapshot.Graph.Day] = []
        out.reserveCapacity(graph.levels.count)
        for (i, l) in graph.levels.enumerated() {
            out.append(Snapshot.Graph.Day(date: Day.add(graph.start, i), level: l, value: 0))
        }
        return out
    }
}

struct ProfileResponse: Codable, Equatable {
    var profile: SocialProfile
    var stale: Bool?
}

struct Compare: Codable, Equatable {
    struct Lift: Codable, Equatable, Identifiable {
        var key: String; var name: String
        var me: Double?; var them: Double?
        var meBw: Double?; var themBw: Double?
        var id: String { key }
    }
    struct Week: Codable, Equatable { var week: String; var me: Int; var them: Int }
    struct Streak: Codable, Equatable { var me: Int; var them: Int }

    var friend: Author
    var unit: String
    var lifts: [Lift]
    var weeks: [Week]
    var streak: Streak
    var stale: Bool?

    /// The ×bodyweight toggle only makes sense when both share bodyweight.
    var hasBodyweight: Bool { lifts.contains { $0.meBw != nil || $0.themBw != nil } }
}

struct SocialNotification: Codable, Equatable, Identifiable {
    var id: String
    var kind: String
    var from: Author
    var item: String?
    var emoji: String?
    var text: String?
    var at: String
    var read: Bool

    /// "reacted 💪 to your session"
    var line: String {
        switch kind {
        case "request": return "wants to be friends" + (text.map { ": “\($0)”" } ?? "")
        case "accepted": return "accepted your friend request"
        case "reaction": return "reacted \(emoji ?? "") to " + SocialFmt.itemLabel(item)
        case "comment": return "commented on \(SocialFmt.itemLabel(item))" + (text.map { ": “\($0)”" } ?? "")
        default: return kind
        }
    }
}

struct NotificationsResponse: Codable, Equatable {
    var items: [SocialNotification]
    var unread: Int?
}

// MARK: - logic

enum Reactions {
    /// The fixed set (PROTOCOL.md §4).
    static let set = ["💪", "🔥", "👏", "🏆", "😤"]

    /// The emoji I reacted with, if any (one reaction per person per item).
    static func mine(_ rs: [Reaction], me: String) -> String? {
        let m = SocialFmt.origin(me)
        return rs.first { r in r.from.contains { SocialFmt.origin($0.server) == m } }?.emoji
    }

    /// Tap on `emoji`: the same one again removes my reaction, another one replaces it.
    /// Returns the new list (optimistic) and what to POST (`nil` = remove).
    static func toggle(_ rs: [Reaction], emoji: String, me: String, myName: String?) -> (reactions: [Reaction], send: String?) {
        let m = SocialFmt.origin(me)
        let had = mine(rs, me: me)
        var out: [Reaction] = []
        for r in rs {
            var r2 = r
            r2.from.removeAll { SocialFmt.origin($0.server) == m }
            if !r2.from.isEmpty { out.append(r2) }
        }
        if had == emoji { return (out, nil) }
        let me1 = ReactionFrom(server: me, name: myName)
        if let i = out.firstIndex(where: { $0.emoji == emoji }) {
            out[i].from.append(me1)
        } else {
            out.append(Reaction(emoji: emoji, from: [me1]))
        }
        return (out, emoji)
    }

    static func count(_ rs: [Reaction], _ emoji: String) -> Int {
        rs.first { $0.emoji == emoji }?.from.count ?? 0
    }
}

enum SocialFmt {
    static func host(_ server: String) -> String {
        URL(string: server)?.host.map { h in
            let p = URL(string: server)?.port
            return p.map { "\(h):\($0)" } ?? h
        } ?? server
    }

    /// Comparable origin: lowercase, no trailing slash.
    static func origin(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespaces).lowercased()
        while t.hasSuffix("/") { t.removeLast() }
        return t
    }

    static let handlePattern = "^[a-z0-9][a-z0-9_-]{1,29}$"

    static func validHandle(_ h: String) -> Bool {
        h.range(of: handlePattern, options: .regularExpression) != nil
    }

    /// "dan" → handle; "gym.example.com" or "https://…" → server URL (https added when missing).
    enum Target: Equatable { case handle(String), server(String), invalid }

    static func target(_ raw: String) -> Target {
        var t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("@") { t.removeFirst() }
        if t.isEmpty { return .invalid }
        if t.contains("://") {
            guard let u = URL(string: t), let s = u.scheme?.lowercased(), s == "https" || s == "http", u.host != nil else { return .invalid }
            return .server(origin(t))
        }
        if t.contains(".") || t.contains(":") {
            guard let u = URL(string: "https://" + t), u.host != nil else { return .invalid }
            return .server(origin("https://" + t))
        }
        let h = t.lowercased()
        return validHandle(h) ? .handle(h) : .invalid
    }

    /// "w:abc" → "your session", "pr:…" → "your PR", "a:…" → "your achievement"
    static func itemLabel(_ id: String?) -> String {
        guard let id else { return "your activity" }
        if id.hasPrefix("w:") { return "your session" }
        if id.hasPrefix("pr:") { return "your PR" }
        if id.hasPrefix("a:") { return "your achievement" }
        return "your activity"
    }

    /// Relative time for feed items: "5M", "3H", "2D", else "12 OCT".
    static func ago(_ iso: String, now: Date = Date()) -> String {
        guard let d = Fmt.parseISO(iso) else { return "" }
        let s = Int(now.timeIntervalSince(d))
        if s < 60 { return "NOW" }
        if s < 3600 { return "\(s / 60)M" }
        if s < 86400 { return "\(s / 3600)H" }
        if s < 7 * 86400 { return "\(s / 86400)D" }
        return Fmt.dayLabel(String(iso.prefix(10)))
    }

    static func duration(_ min: Double?) -> String {
        guard let m = min, m > 0 else { return "" }
        let total: Int = Int(m.rounded())
        return total >= 60 ? "\(total / 60)H \(total % 60)M" : "\(total)M"
    }
}
