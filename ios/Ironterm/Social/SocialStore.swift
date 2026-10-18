import Foundation
import UserNotifications

/// State of the FRIENDS tab: who I am, friends, the merged feed, friend profiles, notifications.
/// The last good copy of the main documents is cached (AppCache), so the tab opens instantly and
/// works offline. Reactions and comments are optimistic and roll back when the server refuses.
@MainActor
final class SocialStore: ObservableObject {
    @Published var me: SocialMe?
    @Published var friends: [Friend] = []
    @Published var feed: [FeedItem] = []
    @Published var feedNext: String?
    @Published var staleIds: Set<String> = []
    @Published var unreachable: [String] = []
    @Published var mine: [FeedItem] = []
    @Published var mineNext: String?
    @Published var notifications: [SocialNotification] = []
    @Published var profiles: [String: ProfileResponse] = [:]
    @Published var friendFeeds: [String: FeedPage] = [:]
    @Published var compares: [String: Compare] = [:]

    @Published var loading = false
    @Published var loadingMore = false
    /// the last refresh failed (shown with the cached data, or as an error state without any)
    @Published var error: String?
    @Published var fromCache = false
    @Published var fetchedAt: Date?
    /// a failed action (reaction, comment, friend request): shown as a dismissible strip
    @Published var actionError: String?
    @Published var busy = false

    var serviceProvider: () -> SocialService? = { nil }
    private let useCache: Bool
    private let defaults: UserDefaults
    private var loadedOnce = false

    init(useCache: Bool = true, defaults: UserDefaults = .standard) {
        self.useCache = useCache
        self.defaults = defaults
        if useCache { loadCache() }
    }

    var service: SocialService? { serviceProvider() }
    var myServer: String { me?.server ?? "" }
    var enabled: Bool { me?.enabled == true }
    var unread: Int { notifications.filter { !$0.read }.count }
    var incoming: [Friend] { friends.filter { $0.status == .incoming } }
    var accepted: [Friend] { friends.filter { $0.status == .friends } }
    var outgoing: [Friend] { friends.filter { $0.status == .outgoing } }
    /// dot on the FRIENDS tab
    var attention: Bool { unread > 0 || !incoming.isEmpty }

    func friend(_ id: String) -> Friend? { friends.first { $0.id == id } }

    // MARK: cache

    private enum Key {
        static let me = "social-me", friends = "social-friends", feed = "social-feed"
        static let notifs = "social-notifications", mine = "social-mine"
        static let seen = "social.seenNotifications"
    }

    private func loadCache() {
        if let (m, d) = AppCache.load(Key.me, as: SocialMe.self) { me = m; fetchedAt = d; fromCache = true }
        if let (f, _) = AppCache.load(Key.friends, as: FriendsResponse.self) { friends = f.friends }
        if let (p, _) = AppCache.load(Key.feed, as: FeedPage.self) { feed = p.items; feedNext = p.next; staleIds = Set(p.staleIds); unreachable = p.unreachable }
        if let (n, _) = AppCache.load(Key.notifs, as: NotificationsResponse.self) { notifications = n.items }
        if let (p, _) = AppCache.load(Key.mine, as: FeedPage.self) { mine = p.items; mineNext = p.next }
    }

    private func save<T: Encodable>(_ key: String, _ v: T) {
        guard useCache, let data = try? JSONEncoder().encode(v) else { return }
        AppCache.save(key, data)
    }

    /// Disconnected or switched servers: forget everything.
    func reset() {
        me = nil; friends = []; feed = []; feedNext = nil; staleIds = []; unreachable = []; mine = []; mineNext = nil
        notifications = []; profiles = [:]; friendFeeds = [:]; compares = [:]
        error = nil; fromCache = false; fetchedAt = nil; actionError = nil; loadedOnce = false
        defaults.removeObject(forKey: Key.seen)
    }

    /// Seed state directly (demo mode, offline screenshots, tests).
    func seed(me: SocialMe?, friends: [Friend], feed: FeedPage, notifications: [SocialNotification], mine: FeedPage) {
        self.me = me
        self.friends = friends
        self.feed = feed.items; feedNext = feed.next; staleIds = Set(feed.staleIds)
        self.notifications = notifications
        self.mine = mine.items; mineNext = mine.next
    }

    // MARK: loading

    /// Everything the tab shows. `fresh` bypasses the server's 5-minute friend cache.
    func refresh(fresh: Bool = false) async {
        guard let s = service else { return }
        loading = true
        defer { loading = false }
        do {
            let m = try await s.me()
            me = m
            save(Key.me, m)
            if m.enabled {
                async let f = s.friends()
                async let p = s.feed(before: nil, fresh: fresh)
                async let n = s.notifications()
                let (fr, page, notes) = try await (f, p, n)
                friends = fr
                feed = page.items
                feedNext = page.next
                staleIds = Set(page.staleIds)
                unreachable = page.unreachable
                applyNotifications(notes)
                save(Key.friends, FriendsResponse(friends: fr))
                save(Key.feed, page)
                save(Key.notifs, NotificationsResponse(items: notes))
            }
            error = nil
            fromCache = false
            fetchedAt = Date()
        } catch {
            self.error = Self.message(error)
        }
        loadedOnce = true
    }

    /// Just the bell (app start / back to foreground).
    func refreshNotifications() async {
        guard let s = service, enabled else { return }
        if let n = try? await s.notifications() {
            applyNotifications(n)
            save(Key.notifs, NotificationsResponse(items: n))
        }
        if let f = try? await s.friends() {
            friends = f
            save(Key.friends, FriendsResponse(friends: f))
        }
    }

    func loadMoreFeed() async {
        guard let s = service, let next = feedNext, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let p = try await s.feed(before: next, fresh: false)
            let known = Set(feed.map { Self.key($0) })
            feed += p.items.filter { !known.contains(Self.key($0)) }
            feedNext = p.next
            staleIds.formUnion(p.staleIds)
        } catch {
            actionError = Self.message(error)
        }
    }

    func loadMine(more: Bool = false) async {
        guard let s = service else { return }
        if more && (mineNext == nil || loadingMore) { return }
        if more { loadingMore = true }
        defer { if more { loadingMore = false } }
        do {
            let p = try await s.mine(before: more ? mineNext : nil)
            if more { mine += p.items } else { mine = p.items; save(Key.mine, p) }
            mineNext = p.next
        } catch {
            if more || mine.isEmpty { actionError = Self.message(error) }
        }
    }

    func loadProfile(_ id: String, fresh: Bool = false) async throws {
        guard let s = service else { throw ApiError.notConfigured }
        async let p = s.profile(id, fresh: fresh)
        async let f = s.friendFeed(id, before: nil, fresh: fresh)
        let prof = try await p
        profiles[id] = prof
        // the profile tells us what they share with us
        if let i = friends.firstIndex(where: { $0.id == id }) { friends[i].theirShare = prof.profile.share }
        if let page = try? await f { friendFeeds[id] = page }
    }

    func loadMoreFriendFeed(_ id: String) async {
        guard let s = service, let cur = friendFeeds[id], let next = cur.next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let p = try await s.friendFeed(id, before: next, fresh: false)
            var merged = cur
            let known = Set(cur.items.map(\.id))
            merged.items += p.items.filter { !known.contains($0.id) }
            merged.next = p.next
            friendFeeds[id] = merged
        } catch {
            actionError = Self.message(error)
        }
    }

    func loadCompare(_ id: String) async throws {
        guard let s = service else { throw ApiError.notConfigured }
        compares[id] = try await s.compare(id)
    }

    // MARK: reactions and comments

    /// Feed items are identified by friend + item id (two friends can't share an id, but be safe).
    nonisolated static func key(_ i: FeedItem) -> String { (i.author?.id ?? "") + "|" + i.id }

    private func mutate(friend: String, item: String, _ f: (inout FeedItem) -> Void) {
        for i in feed.indices where feed[i].id == item && (feed[i].author?.id ?? friend) == friend { f(&feed[i]) }
        if var page = friendFeeds[friend] {
            for i in page.items.indices where page.items[i].id == item { f(&page.items[i]) }
            friendFeeds[friend] = page
        }
    }

    private func current(friend: String, item: String) -> FeedItem? {
        feed.first { $0.id == item && ($0.author?.id ?? friend) == friend }
            ?? friendFeeds[friend]?.items.first { $0.id == item }
    }

    func react(friend: String, item: String, emoji: String) async {
        guard let s = service, let it = current(friend: friend, item: item) else { return }
        let before = it.reactions
        let t = Reactions.toggle(before, emoji: emoji, me: myServer, myName: me?.name)
        mutate(friend: friend, item: item) { $0.reactions = t.reactions }
        do {
            try await s.react(friend: friend, item: item, emoji: t.send)
        } catch {
            mutate(friend: friend, item: item) { $0.reactions = before }
            actionError = "Reaction not sent. " + Self.message(error)
        }
    }

    @discardableResult
    func comment(friend: String, item: String, text: String) async -> Bool {
        let body = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(280))
        guard let s = service, !body.isEmpty else { return false }
        let local = FeedComment(id: "local-" + UUID().uuidString, from: ReactionFrom(server: myServer, name: me?.name), text: body,
                                at: ISO8601DateFormatter().string(from: Date()))
        mutate(friend: friend, item: item) { $0.comments.append(local) }
        do {
            try await s.comment(friend: friend, item: item, text: body)
            return true
        } catch {
            mutate(friend: friend, item: item) { $0.comments.removeAll { $0.id == local.id } }
            actionError = "Comment not sent. " + Self.message(error)
            return false
        }
    }

    // MARK: friends

    func setup(handle: String, name: String, listed: Bool) async -> String? {
        guard let s = service else { return "Needs a server." }
        busy = true
        defer { busy = false }
        do {
            _ = try await s.setup(handle: handle, name: name, listed: listed)
            await refresh()
            return nil
        } catch {
            return Self.message(error)
        }
    }

    func unregister() async -> String? {
        guard let s = service else { return "Needs a server." }
        do { try await s.unregister(); await refresh(); return nil } catch { return Self.message(error) }
    }

    func search(_ q: String) async throws -> [DirectoryUser] {
        guard let s = service else { throw ApiError.notConfigured }
        return try await s.search(q)
    }

    /// nil on success, else the message to show.
    func add(_ target: SocialFmt.Target, note: String?, share: ShareLevel) async -> String? {
        guard let s = service else { return "Needs a server." }
        busy = true
        defer { busy = false }
        do {
            let f = try await s.addFriend(target, note: note, share: share)
            friends.removeAll { $0.id == f.id }
            friends.append(f)
            save(Key.friends, FriendsResponse(friends: friends))
            // if they had already asked us, this accepted: the feed has a new friend
            if f.status == .friends { await refresh() }
            return nil
        } catch {
            return Self.message(error)
        }
    }

    func accept(_ id: String, share: ShareLevel) async {
        await friendAction { try await $0.accept(id, share: share) }
        await refresh()
    }

    func reject(_ id: String) async { await friendAction { try await $0.reject(id) } }

    func setShare(_ id: String, share: ShareLevel) async {
        let old = friend(id)?.share
        if let i = friends.firstIndex(where: { $0.id == id }) { friends[i].share = share }
        do {
            guard let s = service else { return }
            try await s.setShare(id, share: share)
            save(Key.friends, FriendsResponse(friends: friends))
        } catch {
            if let i = friends.firstIndex(where: { $0.id == id }), let old { friends[i].share = old }
            actionError = Self.message(error)
        }
    }

    func remove(_ id: String) async {
        await friendAction { try await $0.remove(id) }
        feed.removeAll { $0.author?.id == id }
        profiles[id] = nil; friendFeeds[id] = nil; compares[id] = nil
    }

    private func friendAction(_ f: (SocialService) async throws -> Void) async {
        guard let s = service else { return }
        busy = true
        defer { busy = false }
        do {
            try await f(s)
            let fr = try await s.friends()
            friends = fr
            save(Key.friends, FriendsResponse(friends: fr))
        } catch {
            actionError = Self.message(error)
        }
    }

    // MARK: notifications

    func markRead() async {
        guard unread > 0, let s = service else { return }
        let before = notifications
        for i in notifications.indices { notifications[i].read = true }
        do {
            try await s.markRead()
            save(Key.notifs, NotificationsResponse(items: notifications))
        } catch {
            notifications = before
        }
    }

    /// Store the list and post a local notification for unread items not seen before (only when
    /// the user already allowed notifications; the first load just records what's there).
    private func applyNotifications(_ items: [SocialNotification]) {
        notifications = items
        guard useCache else { return }
        let seen = Set(defaults.stringArray(forKey: Key.seen) ?? [])
        let first = defaults.object(forKey: Key.seen) == nil
        let fresh = Self.newUnread(items, seen: seen)
        defaults.set(Array(seen.union(items.map(\.id)).suffix(500)), forKey: Key.seen)
        guard !first, !fresh.isEmpty else { return }
        Self.postLocal(fresh)
    }

    nonisolated static func newUnread(_ items: [SocialNotification], seen: Set<String>) -> [SocialNotification] {
        items.filter { !$0.read && !seen.contains($0.id) }
    }

    private static func postLocal(_ items: [SocialNotification]) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let content = UNMutableNotificationContent()
            if items.count == 1, let n = items.first {
                content.title = n.from.display
                content.body = n.line
            } else {
                content.title = "\(Brand.name) friends"
                content.body = "\(items.count) new: " + items.prefix(3).map { "\($0.from.display) \($0.line)" }.joined(separator: " · ")
            }
            content.userInfo = ["link": "ironterm://tab/notifications"]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "social-" + (items.first?.id ?? UUID().uuidString), content: content, trigger: nil))
        }
    }

    static func message(_ e: Error) -> String {
        if let a = e as? ApiError {
            if case .http(let code, let m) = a {
                if code == 404 && m.isEmpty { return "Your server doesn't support friends yet. Update it." }
                if !m.isEmpty { return m }
            }
            return a.errorDescription ?? "\(a)"
        }
        return e.localizedDescription
    }
}
