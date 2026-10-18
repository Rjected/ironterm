import XCTest
@testable import Ironterm

/// The social API documents decode from the server's real responses (docs/api/social/*.json,
/// copied into the test bundle as social-*.json), plus the reaction toggle, share levels and
/// the store's optimistic updates.
final class SocialDecodingTests: XCTestCase {
    func decode<T: Decodable>(_ t: T.Type, _ name: String) throws -> T {
        try AppAPI.decode(T.self, LiveTests.fixture("social-" + name))
    }

    func testMe() throws {
        let m = try decode(SocialMe.self, "me")
        XCTAssertTrue(m.enabled)
        XCTAssertEqual(m.handle, "alice")
        XCTAssertEqual(m.server, "https://a.test")
        XCTAssertEqual(m.listed, true)
        XCTAssertEqual(m.directoryConfigured, true)
        XCTAssertTrue(m.hasDirectory)
        XCTAssertNotNil(m.fingerprint)
        XCTAssertEqual(m.unread, 0)
    }

    func testMeWithoutDirectoryFields() throws {
        let m = try JSONDecoder().decode(SocialMe.self, from: Data(#"{"enabled":false,"handle":null,"name":null,"server":"https://x.test","directory":null,"listed":false,"fingerprint":"ab"}"#.utf8))
        XCTAssertFalse(m.enabled)
        XCTAssertFalse(m.hasDirectory)
    }

    func testFriends() throws {
        let r = try decode(FriendsResponse.self, "friends")
        let f = try XCTUnwrap(r.friends.first)
        XCTAssertEqual(f.id.count, 12, "first 12 hex chars of sha256(origin)")
        XCTAssertEqual(f.status, .friends)
        XCTAssertEqual(f.share, .full)
        XCTAssertEqual(f.theirShare, .lifts)
        XCTAssertEqual(f.author.display, "Bob")
        XCTAssertEqual(f.author.subtitle, "@bob · b.test")
        XCTAssertNotNil(f.note)
    }

    func testSearch() throws {
        let r = try decode(SearchResponse.self, "search")
        XCTAssertEqual(r.users.map(\.handle), ["bob"])
    }

    func testFeed() throws {
        let p = try decode(FeedPage.self, "feed")
        XCTAssertFalse(p.items.isEmpty)
        XCTAssertNotNil(p.next, "more pages")
        XCTAssertEqual(p.staleIds, [])
        XCTAssertFalse(p.staleAll)
        XCTAssertTrue(p.items.allSatisfy { $0.author != nil }, "merged feed items carry their author")
        XCTAssertEqual(Set(p.items.map(\.kind)), ["session", "pr", "achievement"])
        XCTAssertEqual(p.items.map(\.at), p.items.map(\.at).sorted(by: >), "newest first")
        let s = try XCTUnwrap(p.items.first { $0.kind == "session" })
        XCTAssertNotNil(s.title)
        XCTAssertNotNil(s.durationMin)
        XCTAssertNotNil(s.sets)
        XCTAssertNotNil(s.exercises?.first?.top, "top set at lifts+")
        XCTAssertNil(s.exercises?.first?.sets, "every set only at full")
        let pr = try XCTUnwrap(p.items.first { $0.kind == "pr" })
        XCTAssertNotNil(pr.liftName)
        XCTAssertNotNil(pr.weight)
        let a = try XCTUnwrap(p.items.first { $0.kind == "achievement" })
        XCTAssertNotNil(a.tier)
        XCTAssertNotNil(a.description)
        let reacted = try XCTUnwrap(p.items.first { !$0.reactions.isEmpty })
        XCTAssertTrue(Reactions.set.contains(reacted.reactions[0].emoji))
        XCTAssertTrue(p.items.contains { !$0.comments.isEmpty })
        // the cache round trip keeps everything
        let again = try JSONDecoder().decode(FeedPage.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(again, p)
    }

    func testFeedFull() throws {
        let p = try decode(FeedPage.self, "feed-full")
        let s = try XCTUnwrap(p.items.first { $0.kind == "session" })
        let sets = try XCTUnwrap(s.exercises?.first?.sets)
        XCTAssertFalse(sets.isEmpty)
        XCTAssertNotNil(sets.first?.weight)
    }

    func testMine() throws {
        let p = try decode(FeedPage.self, "mine")
        XCTAssertFalse(p.items.isEmpty)
        XCTAssertTrue(p.items.allSatisfy { $0.author == nil }, "my own items have no author")
        XCTAssertTrue(p.items.contains { !$0.reactions.isEmpty })
    }

    func testProfile() throws {
        let r = try decode(ProfileResponse.self, "profile")
        let p = r.profile
        XCTAssertEqual(r.stale, false)
        XCTAssertEqual(p.share, .lifts)
        XCTAssertEqual(p.unit, "kg")
        XCTAssertGreaterThan(p.sessions52, 0)
        XCTAssertFalse(p.lifts.isEmpty)
        XCTAssertNotNil(p.lifts[0].e1rm, "e1rm at lifts+")
        XCTAssertNil(p.bodyweight, "full only")
        XCTAssertTrue(p.graph.levels.allSatisfy { (0...4).contains($0) })
        XCTAssertLessThanOrEqual(p.graph.levels.count, 53 * 7)
        XCTAssertEqual(Day.weekdayIndex(p.graph.start), 0, "Monday first")
        let days = p.graphDays
        XCTAssertEqual(days.count, p.graph.levels.count)
        XCTAssertEqual(days.first?.date, p.graph.start)
        XCTAssertEqual(days.last?.date, Day.add(p.graph.start, p.graph.levels.count - 1))
    }

    func testCompare() throws {
        let c = try decode(Compare.self, "compare")
        XCTAssertEqual(c.friend.handle, "bob")
        XCTAssertEqual(c.unit, "lb")
        XCTAssertEqual(c.weeks.count, 12)
        XCTAssertEqual(c.weeks.map(\.week), c.weeks.map(\.week).sorted())
        XCTAssertTrue(c.weeks.allSatisfy { Day.weekdayIndex($0.week) == 0 }, "Monday dates")
        XCTAssertTrue(c.hasBodyweight)
        XCTAssertEqual(c.stale, false)
        XCTAssertFalse(c.lifts.isEmpty)
    }

    func testNotifications() throws {
        let r = try decode(NotificationsResponse.self, "notifications")
        XCTAssertEqual(Set(r.items.map(\.kind)), ["request", "reaction", "comment"])
        XCTAssertEqual(r.unread, r.items.filter { !$0.read }.count)
        let react = try XCTUnwrap(r.items.first { $0.kind == "reaction" })
        XCTAssertTrue(react.line.hasPrefix("reacted "))
        XCTAssertNotNil(react.emoji)
        let req = try XCTUnwrap(r.items.first { $0.kind == "request" })
        XCTAssertTrue(req.line.contains("Gym buddy"), "a request's text is its note")
    }

    func testFeedPageStaleAsBoolean() throws {
        let p = try JSONDecoder().decode(FeedPage.self, from: Data(#"{"items":[],"next":null,"stale":true}"#.utf8))
        XCTAssertTrue(p.staleAll)
        XCTAssertEqual(p.staleIds, [])
        XCTAssertNil(p.next)
    }

    func testUnknownValuesDontBreakDecoding() throws {
        let json = #"{"id":"x","server":"https://x.test","handle":null,"name":null,"status":"blocked","share":"everything","theirShare":null,"since":"2026-01-01T00:00:00Z","lastSeen":null,"fingerprint":"ab"}"#
        let f = try JSONDecoder().decode(Friend.self, from: Data(json.utf8))
        XCTAssertEqual(f.share, .basic)
        XCTAssertEqual(f.author.display, "x.test")
        let item = try JSONDecoder().decode(FeedItem.self, from: Data(#"{"id":"z:1","at":"2026-01-01T00:00:00Z","kind":"future"}"#.utf8))
        XCTAssertEqual(item.reactions, [])
        XCTAssertEqual(item.comments, [])
    }
}

final class SocialLogicTests: XCTestCase {
    let me = "https://a.test"
    let bob = ReactionFrom(server: "https://b.test", name: "Bob")

    func testReactAddsMine() {
        let t = Reactions.toggle([], emoji: "💪", me: me, myName: "Alice")
        XCTAssertEqual(t.send, "💪")
        XCTAssertEqual(t.reactions, [Reaction(emoji: "💪", from: [ReactionFrom(server: me, name: "Alice")])])
        XCTAssertEqual(Reactions.mine(t.reactions, me: me), "💪")
    }

    func testSameEmojiAgainRemoves() {
        let start = [Reaction(emoji: "💪", from: [bob, ReactionFrom(server: me, name: "Alice")])]
        let t = Reactions.toggle(start, emoji: "💪", me: me, myName: "Alice")
        XCTAssertNil(t.send, "null removes")
        XCTAssertEqual(t.reactions, [Reaction(emoji: "💪", from: [bob])], "other people's reactions stay")
        XCTAssertNil(Reactions.mine(t.reactions, me: me))
    }

    func testOtherEmojiReplaces() {
        let start = [Reaction(emoji: "🔥", from: [ReactionFrom(server: me, name: nil)]), Reaction(emoji: "👏", from: [bob])]
        let t = Reactions.toggle(start, emoji: "👏", me: me, myName: nil)
        XCTAssertEqual(t.send, "👏")
        XCTAssertEqual(t.reactions.map(\.emoji), ["👏"], "the emptied 🔥 group is dropped")
        XCTAssertEqual(Reactions.count(t.reactions, "👏"), 2)
        XCTAssertEqual(Reactions.count(t.reactions, "🔥"), 0)
    }

    func testOriginMatchingIgnoresCaseAndSlash() {
        let start = [Reaction(emoji: "🏆", from: [ReactionFrom(server: "https://A.test/", name: nil)])]
        XCTAssertEqual(Reactions.mine(start, me: me), "🏆")
        XCTAssertNil(Reactions.toggle(start, emoji: "🏆", me: me, myName: nil).send)
    }

    func testFixedSet() {
        XCTAssertEqual(Reactions.set, ["💪", "🔥", "👏", "🏆", "😤"])
    }

    func testShareLevelLabels() throws {
        XCTAssertEqual(ShareLevel.allCases.map(\.title), ["BASIC", "LIFTS", "FULL"])
        XCTAssertTrue(ShareLevel.basic.detail.contains("no values"))
        XCTAssertTrue(ShareLevel.basic.summary.contains("No weights"))
        XCTAssertTrue(ShareLevel.lifts.detail.contains("e1RM"))
        XCTAssertTrue(ShareLevel.full.detail.contains("every set"))
        XCTAssertTrue(ShareLevel.full.detail.contains("readiness"))
        XCTAssertEqual(ShareLevel.theirLabel(nil), "THEY SHARE: —")
        XCTAssertEqual(ShareLevel.theirLabel(.lifts), "THEY SHARE: LIFTS")
        XCTAssertEqual(try JSONDecoder().decode([ShareLevel].self, from: Data(#"["FULL","lifts","x"]"#.utf8)), [.full, .lifts, .basic])
        XCTAssertEqual(String(data: try JSONEncoder().encode(ShareLevel.lifts), encoding: .utf8), "\"lifts\"")
    }

    func testTargetParsing() {
        XCTAssertEqual(SocialFmt.target("bob"), .handle("bob"))
        XCTAssertEqual(SocialFmt.target(" @Bob "), .handle("bob"))
        XCTAssertEqual(SocialFmt.target("gym.example.com"), .server("https://gym.example.com"))
        XCTAssertEqual(SocialFmt.target("http://127.0.0.1:8761/"), .server("http://127.0.0.1:8761"))
        XCTAssertEqual(SocialFmt.target("ftp://x.test"), .invalid)
        XCTAssertEqual(SocialFmt.target("a"), .invalid, "handles are 2–30 characters")
        XCTAssertEqual(SocialFmt.target(""), .invalid)
        XCTAssertTrue(SocialFmt.validHandle("dan_2-x"))
        XCTAssertFalse(SocialFmt.validHandle("-dan"))
        XCTAssertFalse(SocialFmt.validHandle(String(repeating: "a", count: 31)))
    }

    func testPaths() {
        XCTAssertEqual(SocialAPI.feedPath("/api/social/feed", before: nil, limit: nil, fresh: false), "/api/social/feed")
        XCTAssertEqual(SocialAPI.feedPath("/api/social/feed", before: "650b|pr:x:bench:rep:3", limit: 30, fresh: true),
                       "/api/social/feed?before=650b%7Cpr:x:bench:rep:3&limit=30&fresh=1")
        XCTAssertEqual(SocialAPI.friendPath("650b12a8f954", "/accept"), "/api/social/friends/650b12a8f954/accept")
    }

    func testItemLabels() {
        XCTAssertEqual(SocialFmt.itemLabel("w:1"), "your session")
        XCTAssertEqual(SocialFmt.itemLabel("pr:1:squat:rep:5"), "your PR")
        XCTAssertEqual(SocialFmt.itemLabel("a:club"), "your achievement")
        XCTAssertEqual(SocialFmt.duration(66), "1H 6M")
        XCTAssertEqual(SocialFmt.duration(45), "45M")
    }

    func testNewUnreadForLocalNotifications() {
        let a = Author(id: "1", server: "https://b.test", handle: nil, name: nil)
        let items = [SocialNotification(id: "n1", kind: "reaction", from: a, item: "w:1", emoji: "💪", text: nil, at: "", read: false),
                     SocialNotification(id: "n2", kind: "comment", from: a, item: "w:1", emoji: nil, text: "hi", at: "", read: true),
                     SocialNotification(id: "n3", kind: "accepted", from: a, item: nil, emoji: nil, text: nil, at: "", read: false)]
        XCTAssertEqual(SocialStore.newUnread(items, seen: ["n1"]).map(\.id), ["n3"])
    }
}

/// A backend that records calls and can be told to fail.
actor StubSocial: SocialService {
    var fail = false
    var reacts: [(String, String, String?)] = []
    var page: FeedPage

    init(page: FeedPage) { self.page = page }
    func setFail(_ f: Bool) { fail = f }
    func reactCalls() -> [(String, String, String?)] { reacts }

    func me() async throws -> SocialMe { SocialMe(enabled: true, handle: "alice", name: "Alice", server: "https://a.test", directory: nil, listed: false, fingerprint: nil) }
    func setup(handle: String, name: String, listed: Bool) async throws -> SocialSetupResult { SocialSetupResult(ok: true, handle: handle) }
    func unregister() async throws {}
    func search(_ q: String) async throws -> [DirectoryUser] { [] }
    func friends() async throws -> [Friend] { [] }
    func addFriend(_ target: SocialFmt.Target, note: String?, share: ShareLevel) async throws -> Friend { throw ApiError.http(400, "no") }
    func accept(_ id: String, share: ShareLevel) async throws {}
    func reject(_ id: String) async throws {}
    func setShare(_ id: String, share: ShareLevel) async throws {}
    func remove(_ id: String) async throws {}
    func feed(before: String?, fresh: Bool) async throws -> FeedPage { page }
    func profile(_ id: String, fresh: Bool) async throws -> ProfileResponse { throw ApiError.http(404, "") }
    func friendFeed(_ id: String, before: String?, fresh: Bool) async throws -> FeedPage { FeedPage(items: [], next: nil) }
    func compare(_ id: String) async throws -> Compare { throw ApiError.http(404, "") }
    func mine(before: String?) async throws -> FeedPage { FeedPage(items: [], next: nil) }
    func react(friend: String, item: String, emoji: String?) async throws {
        reacts.append((friend, item, emoji))
        if fail { throw ApiError.network("offline") }
    }
    func comment(friend: String, item: String, text: String) async throws { if fail { throw ApiError.network("offline") } }
    func notifications() async throws -> [SocialNotification] { [] }
    func markRead() async throws {}
}

@MainActor
final class SocialStoreTests: XCTestCase {
    func store(_ stub: StubSocial) -> SocialStore {
        let d = UserDefaults(suiteName: "social-tests-\(UUID().uuidString)")!
        let s = SocialStore(useCache: false, defaults: d)
        s.serviceProvider = { stub }
        return s
    }

    func testReactionToggleIsOptimisticAndPosts() async throws {
        let page = try AppAPI.decode(FeedPage.self, LiveTests.fixture("social-feed"))
        let stub = StubSocial(page: page)
        let s = store(stub)
        await s.refresh()
        let item = try XCTUnwrap(s.feed.first { $0.reactions.isEmpty })
        let friend = try XCTUnwrap(item.author?.id)

        await s.react(friend: friend, item: item.id, emoji: "🔥")
        var now = try XCTUnwrap(s.feed.first { $0.id == item.id })
        XCTAssertEqual(Reactions.mine(now.reactions, me: "https://a.test"), "🔥")

        await s.react(friend: friend, item: item.id, emoji: "🔥")
        now = try XCTUnwrap(s.feed.first { $0.id == item.id })
        XCTAssertTrue(now.reactions.isEmpty, "tapping it again removes it")

        let calls = await stub.reactCalls()
        XCTAssertEqual(calls.map(\.2), ["🔥", nil])
        XCTAssertEqual(calls.map(\.0), [friend, friend])
    }

    func testFailedReactionRollsBack() async throws {
        let page = try AppAPI.decode(FeedPage.self, LiveTests.fixture("social-feed"))
        let stub = StubSocial(page: page)
        let s = store(stub)
        await s.refresh()
        let item = try XCTUnwrap(s.feed.first { !$0.reactions.isEmpty })
        await stub.setFail(true)
        await s.react(friend: item.author!.id, item: item.id, emoji: "😤")
        XCTAssertEqual(s.feed.first { $0.id == item.id }?.reactions, item.reactions)
        XCTAssertNotNil(s.actionError)
    }

    func testCommentRollsBackOnFailure() async throws {
        let page = try AppAPI.decode(FeedPage.self, LiveTests.fixture("social-feed"))
        let stub = StubSocial(page: page)
        let s = store(stub)
        await s.refresh()
        let item = try XCTUnwrap(s.feed.first)
        let ok = await s.comment(friend: item.author!.id, item: item.id, text: "  nice  ")
        XCTAssertTrue(ok)
        XCTAssertEqual(s.feed.first { $0.id == item.id }?.comments.last?.text, "nice")
        await stub.setFail(true)
        let n = s.feed.first { $0.id == item.id }?.comments.count
        let failed = await s.comment(friend: item.author!.id, item: item.id, text: "again")
        XCTAssertFalse(failed)
        XCTAssertEqual(s.feed.first { $0.id == item.id }?.comments.count, n)
    }

    func testDemoBackend() async throws {
        let demo = DemoSocial(mode: .normal)
        let s = store(StubSocial(page: FeedPage(items: [], next: nil)))
        s.serviceProvider = { demo }
        await s.refresh()
        XCTAssertTrue(s.enabled)
        XCTAssertEqual(s.incoming.count, 1)
        XCTAssertGreaterThan(s.unread, 0)
        XCTAssertTrue(s.attention)
        let req = try XCTUnwrap(s.incoming.first)
        await s.accept(req.id, share: .lifts)
        XCTAssertEqual(s.friend(req.id)?.status, .friends)
        XCTAssertEqual(s.friend(req.id)?.share, .lifts)
        await s.markRead()
        XCTAssertEqual(s.unread, 0)
    }
}
