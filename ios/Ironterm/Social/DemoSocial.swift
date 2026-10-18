import Foundation

/// In-memory social backend for `-demoFixture` (screenshots, UI checks). Made-up people on
/// example.* domains; reactions, comments and friend actions change the in-memory state.
actor DemoSocial: SocialService {
    enum Mode: String { case normal, setup, empty, error, offline }

    let mode: Mode
    private var meValue: SocialMe
    private var friendList: [Friend]
    private var items: [FeedItem]
    private var mineItems: [FeedItem]
    private var notes: [SocialNotification]

    static let myServer = "https://gym.example.com"

    init(mode: Mode, now: Date = Date()) {
        self.mode = mode
        meValue = SocialMe(enabled: mode != .setup, handle: mode == .setup ? nil : "alex", name: mode == .setup ? nil : "Alex",
                           server: Self.myServer, directory: "https://directory.example.com", listed: true,
                           fingerprint: "3F2A 91C0 7B44 E1D9")
        let d = Self.sample(now: now)
        friendList = mode == .empty ? [] : d.friends
        items = mode == .empty ? [] : d.feed
        mineItems = d.mine
        notes = mode == .empty ? [] : d.notes
    }

    private func check() throws {
        if mode == .error || mode == .offline { throw ApiError.network("The Internet connection appears to be offline.") }
    }

    func me() async throws -> SocialMe { try check(); return meValue }

    func setup(handle: String, name: String, listed: Bool) async throws -> SocialSetupResult {
        try check()
        meValue.enabled = true; meValue.handle = handle; meValue.name = name; meValue.listed = listed
        return SocialSetupResult(ok: true, handle: handle)
    }

    func unregister() async throws { try check(); meValue.listed = false }

    func search(_ q: String) async throws -> [DirectoryUser] {
        try check()
        let all = [DirectoryUser(handle: "riley", name: "Riley", server: "https://riley.example.org"),
                   DirectoryUser(handle: "rio", name: "Rio Tanaka", server: "https://lifts.example.net"),
                   DirectoryUser(handle: "maya", name: "Maya", server: "https://maya.example.net")]
        let l = q.lowercased()
        return all.filter { $0.handle.hasPrefix(l) || ($0.name ?? "").lowercased().hasPrefix(l) }
    }

    func friends() async throws -> [Friend] { try check(); return friendList }

    func addFriend(_ target: SocialFmt.Target, note: String?, share: ShareLevel) async throws -> Friend {
        try check()
        let server: String, handle: String?
        switch target {
        case .handle(let h): server = "https://\(h).example.org"; handle = h
        case .server(let s): server = s; handle = nil
        case .invalid: throw ApiError.http(400, "Enter a handle or a server URL.")
        }
        let f = Friend(id: String(server.hashValue.magnitude, radix: 16).prefix(12).description, server: server, handle: handle, name: nil,
                       status: .outgoing, share: share, theirShare: nil, since: ISO8601DateFormatter().string(from: Date()),
                       lastSeen: nil, fingerprint: nil, note: note)
        friendList.append(f)
        return f
    }

    func accept(_ id: String, share: ShareLevel) async throws {
        try check()
        if let i = friendList.firstIndex(where: { $0.id == id }) { friendList[i].status = .friends; friendList[i].share = share }
    }

    func reject(_ id: String) async throws { try check(); friendList.removeAll { $0.id == id } }

    func setShare(_ id: String, share: ShareLevel) async throws {
        try check()
        if let i = friendList.firstIndex(where: { $0.id == id }) { friendList[i].share = share }
    }

    func remove(_ id: String) async throws { try check(); friendList.removeAll { $0.id == id }; items.removeAll { $0.author?.id == id } }

    func feed(before: String?, fresh: Bool) async throws -> FeedPage {
        try check()
        return FeedPage(items: items, next: nil, staleIds: mode == .normal ? ["b7e19c04d2aa"] : [])
    }

    func profile(_ id: String, fresh: Bool) async throws -> ProfileResponse {
        try check()
        guard let f = friendList.first(where: { $0.id == id }) else { throw ApiError.http(404, "Not a friend.") }
        return ProfileResponse(profile: Self.profile(for: f), stale: false)
    }

    func friendFeed(_ id: String, before: String?, fresh: Bool) async throws -> FeedPage {
        try check()
        let mine = items.filter { $0.author?.id == id }
        return FeedPage(items: mine, next: nil)
    }

    func compare(_ id: String) async throws -> Compare {
        try check()
        guard let f = friendList.first(where: { $0.id == id }) else { throw ApiError.http(404, "Not a friend.") }
        let me: [Int] = [3, 4, 3, 3, 4, 2, 4, 4, 3, 4, 4, 3]
        let them: [Int] = [4, 4, 5, 3, 4, 4, 5, 4, 4, 3, 5, 4]
        let monday = Day.weekStart(Day.string(Date()))
        var weeks: [Compare.Week] = []
        for i in 0..<12 { weeks.append(Compare.Week(week: Day.add(monday, (i - 11) * 7), me: me[i], them: them[i])) }
        let lifts: [Compare.Lift] = [
            Compare.Lift(key: "squat", name: "Squat", me: 142.5, them: 130, meBw: 1.78, themBw: 2.0),
            Compare.Lift(key: "bench", name: "Bench Press", me: 102.5, them: 82.5, meBw: 1.28, themBw: 1.27),
            Compare.Lift(key: "deadlift", name: "Deadlift", me: 175, them: 160, meBw: 2.19, themBw: 2.46),
            Compare.Lift(key: "ohp", name: "Overhead Press", me: 62.5, them: 55, meBw: 0.78, themBw: 0.85),
            Compare.Lift(key: "row", name: "Barbell Row", me: 90, them: nil, meBw: 1.13, themBw: nil),
        ]
        return Compare(friend: f.author, unit: "kg", lifts: lifts, weeks: weeks, streak: Compare.Streak(me: 9, them: 14))
    }

    func mine(before: String?) async throws -> FeedPage { try check(); return FeedPage(items: mineItems, next: nil) }

    func react(friend: String, item: String, emoji: String?) async throws {
        try check()
        for i in items.indices where items[i].id == item {
            let t = emoji.map { Reactions.toggle(items[i].reactions, emoji: $0, me: Self.myServer, myName: "Alex").reactions }
                ?? items[i].reactions.compactMap { r in
                    var r2 = r
                    r2.from.removeAll { $0.server == Self.myServer }
                    return r2.from.isEmpty ? nil : r2
                }
            items[i].reactions = t
        }
    }

    func comment(friend: String, item: String, text: String) async throws {
        try check()
        for i in items.indices where items[i].id == item {
            items[i].comments.append(FeedComment(id: UUID().uuidString, from: ReactionFrom(server: Self.myServer, name: "Alex"), text: text,
                                                 at: ISO8601DateFormatter().string(from: Date())))
        }
    }

    func notifications() async throws -> [SocialNotification] { try check(); return notes }

    func markRead() async throws { try check(); for i in notes.indices { notes[i].read = true } }

    // MARK: sample data

    struct Sample {
        var friends: [Friend]
        var feed: [FeedItem]
        var mine: [FeedItem]
        var notes: [SocialNotification]
    }

    static let maya = Author(id: "a41c2e9f01b3", server: "https://maya.example.net", handle: "maya", name: "Maya")
    static let jonas = Author(id: "b7e19c04d2aa", server: "https://jonas.example.org", handle: "jonas", name: "Jonas")
    static let priya = Author(id: "c03d55e8a7f1", server: "https://priya.example.com", handle: "priya", name: "Priya")
    static let sam = Author(id: "d9a0b2c4e6f8", server: "https://train.example.dev", handle: nil, name: nil)

    static func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }

    static func sample(now: Date) -> Sample {
        func ago(_ h: Double) -> String { iso(now.addingTimeInterval(-h * 3600)) }
        let friends: [Friend] = [
            Friend(id: maya.id, server: maya.server, handle: maya.handle, name: maya.name, status: .friends, share: .lifts, theirShare: .full,
                   since: ago(24 * 60), lastSeen: ago(0.3), fingerprint: "9C1E 4A70 22B8 D315", note: nil),
            Friend(id: jonas.id, server: jonas.server, handle: jonas.handle, name: jonas.name, status: .friends, share: .basic, theirShare: .lifts,
                   since: ago(24 * 21), lastSeen: ago(30), fingerprint: "51D2 0F9E A6C3 7714", note: nil),
            Friend(id: priya.id, server: priya.server, handle: priya.handle, name: priya.name, status: .incoming, share: .basic, theirShare: nil,
                   since: ago(5), lastSeen: nil, fingerprint: "E07B 3C19 88A4 0D62", note: "Hey! Saw you on the directory. Same program as me."),
            Friend(id: sam.id, server: sam.server, handle: nil, name: nil, status: .outgoing, share: .lifts, theirShare: nil,
                   since: ago(48), lastSeen: nil, fingerprint: "77F0 A1B2 C3D4 E5F6", note: nil),
        ]
        func from(_ a: Author) -> ReactionFrom { ReactionFrom(server: a.server, name: a.name) }
        let me = ReactionFrom(server: myServer, name: "Alex")

        var s1 = FeedItem(id: "w:m-1042", at: ago(1.5), kind: "session",
                          reactions: [Reaction(emoji: "💪", from: [me]), Reaction(emoji: "🔥", from: [from(jonas)])],
                          comments: [FeedComment(id: "c1", from: from(jonas), text: "That last set looked brutal", at: ago(1))], author: maya)
        s1.title = "Day B1 · Squat"; s1.durationMin = 68; s1.sets = 19; s1.volume = 7420
        s1.exercises = [
            FeedItem.Exercise(name: "Squat (Barbell)", lift: "squat", top: FeedItem.TopSet(weight: 120, reps: 5),
                              sets: [FeedItem.SetRow(weight: 120, reps: 5), FeedItem.SetRow(weight: 120, reps: 5), FeedItem.SetRow(weight: 120, reps: 6)]),
            FeedItem.Exercise(name: "Overhead Press (Barbell)", lift: "ohp", top: FeedItem.TopSet(weight: 47.5, reps: 8), sets: nil),
            FeedItem.Exercise(name: "Lat Pulldown (Cable)", lift: "lat_pulldown", top: FeedItem.TopSet(weight: 60, reps: 12), sets: nil),
        ]
        s1.note = "Felt fast today. Belt on for the top sets."

        var p1 = FeedItem(id: "pr:m-1042:squat:rep:5", at: ago(1.4), kind: "pr", reactions: [Reaction(emoji: "🏆", from: [from(jonas)])], author: maya)
        p1.lift = "squat"; p1.liftName = "Squat"; p1.prKind = "rep"; p1.reps = 5; p1.weight = 120; p1.prev = 117.5

        var s2 = FeedItem(id: "w:j-88", at: ago(26), kind: "session", reactions: [], comments: [], author: jonas)
        s2.title = "Upper A"; s2.durationMin = 52; s2.sets = 16
        s2.exercises = [
            FeedItem.Exercise(name: "Bench Press (Barbell)", lift: "bench", top: FeedItem.TopSet(weight: 80, reps: 5), sets: nil),
            FeedItem.Exercise(name: "Bent Over Row (Barbell)", lift: "row", top: FeedItem.TopSet(weight: 70, reps: 8), sets: nil),
            FeedItem.Exercise(name: "Bicep Curl (Dumbbell)", lift: nil, top: FeedItem.TopSet(weight: 14, reps: 12), sets: nil),
        ]

        var a1 = FeedItem(id: "a:j-streak-12", at: ago(27), kind: "achievement", reactions: [Reaction(emoji: "👏", from: [me, from(maya)])], author: jonas)
        a1.title = "12-week streak"; a1.tier = "gold"; a1.description = "Hit the weekly target 12 weeks in a row."

        var p2 = FeedItem(id: "pr:m-1031:deadlift:e1rm:1", at: ago(74), kind: "pr", reactions: [], author: maya)
        p2.lift = "deadlift"; p2.liftName = "Deadlift"; p2.prKind = "e1rm"; p2.reps = 1; p2.weight = 162.5; p2.prev = 157.5

        var m1 = FeedItem(id: "w:me-311", at: ago(20), kind: "session",
                          reactions: [Reaction(emoji: "🔥", from: [from(maya)]), Reaction(emoji: "💪", from: [from(jonas)])],
                          comments: [FeedComment(id: "c9", from: from(maya), text: "Bench is flying!", at: ago(18))])
        m1.title = "Day A2 · Bench"; m1.durationMin = 61; m1.sets = 17
        m1.exercises = [FeedItem.Exercise(name: "Bench Press (Barbell)", lift: "bench", top: FeedItem.TopSet(weight: 92.5, reps: 3), sets: nil)]
        var m2 = FeedItem(id: "pr:me-311:bench:rep:3", at: ago(19.9), kind: "pr", reactions: [Reaction(emoji: "🏆", from: [from(maya)])])
        m2.lift = "bench"; m2.liftName = "Bench Press"; m2.prKind = "rep"; m2.reps = 3; m2.weight = 92.5; m2.prev = 90

        let notes: [SocialNotification] = [
            SocialNotification(id: "n1", kind: "request", from: priya, item: nil, emoji: nil, text: "Hey! Saw you on the directory.", at: ago(5), read: false),
            SocialNotification(id: "n2", kind: "reaction", from: maya, item: "w:me-311", emoji: "🔥", text: nil, at: ago(19), read: false),
            SocialNotification(id: "n3", kind: "comment", from: maya, item: "w:me-311", emoji: nil, text: "Bench is flying!", at: ago(18), read: false),
            SocialNotification(id: "n4", kind: "accepted", from: jonas, item: nil, emoji: nil, text: nil, at: ago(24 * 21), read: true),
        ]
        return Sample(friends: friends, feed: [s1, p1, s2, a1, p2], mine: [m1, m2], notes: notes)
    }

    static func profile(for f: Friend) -> SocialProfile {
        let isMaya = f.id == maya.id
        let share: ShareLevel = f.theirShare ?? .basic
        let monday = Day.weekStart(Day.string(Date()))
        let start = Day.add(monday, -52 * 7)
        let todayIdx = Day.weekdayIndex(Day.string(Date()))
        var levels: [Int] = []
        // deterministic pattern: 3–5 sessions a week, a two-week break in spring
        for w in 0..<53 {
            for d in 0..<7 {
                if w == 52 && d > todayIdx { break }
                let seed = (w * 7 + d) * 2654435761 % 97
                let train = [0, 2, 4, 5].contains(d) && !(18...19).contains(w) && seed % 9 != 0
                levels.append(train ? 1 + seed % 4 : 0)
            }
        }
        let lb = share != .basic
        let lifts: [SocialProfile.Lift] = isMaya ? [
            SocialProfile.Lift(key: "squat", name: "Squat", e1rm: lb ? 140 : nil, best: lb ? 120 : nil),
            SocialProfile.Lift(key: "bench", name: "Bench Press", e1rm: lb ? 82.5 : nil, best: lb ? 75 : nil),
            SocialProfile.Lift(key: "deadlift", name: "Deadlift", e1rm: lb ? 162.5 : nil, best: lb ? 150 : nil),
            SocialProfile.Lift(key: "ohp", name: "Overhead Press", e1rm: lb ? 57.5 : nil, best: lb ? 50 : nil),
        ] : [
            SocialProfile.Lift(key: "bench", name: "Bench Press", e1rm: lb ? 92 : nil, best: lb ? 82.5 : nil),
            SocialProfile.Lift(key: "row", name: "Barbell Row", e1rm: lb ? 88 : nil, best: lb ? 75 : nil),
        ]
        return SocialProfile(server: f.server, handle: f.handle, name: f.name, share: share, unit: lb ? "kg" : nil,
                             streak: SocialProfile.Streak(current: isMaya ? 14 : 12, best: isMaya ? 22 : 12),
                             week: SocialProfile.Week(done: isMaya ? 3 : 1, target: 4), sessions52: isMaya ? 171 : 128,
                             graph: SocialProfile.Graph(start: start, levels: levels), lifts: lifts,
                             bodyweight: share == .full ? 65 : nil, program: lb ? (isMaya ? "GZCLP 4-Day" : "5/3/1 BBB") : nil,
                             updatedAt: iso(Date()))
    }
}
