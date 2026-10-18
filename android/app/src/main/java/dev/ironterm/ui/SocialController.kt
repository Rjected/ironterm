package dev.ironterm.ui

import dev.ironterm.data.AuthException
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.ApiException
import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppCache
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.friendly
import dev.ironterm.data.social.Comment
import dev.ironterm.data.social.FeedItem
import dev.ironterm.data.social.FeedPage
import dev.ironterm.data.social.Friend
import dev.ironterm.data.social.FriendList
import dev.ironterm.data.social.NotificationList
import dev.ironterm.data.social.ProfileDoc
import dev.ironterm.data.social.SocialApi
import dev.ironterm.data.social.SocialMe
import dev.ironterm.data.social.Social
import dev.ironterm.data.social.Who
import dev.ironterm.data.social.Compare
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import java.time.Instant

/**
 * FRIENDS state machine: loads /api/social into [DataUi.social], caches what's worth showing
 * offline (me, friends, the first feed page, notifications, profiles), and applies reactions,
 * comments and friend changes optimistically, rolling back with a toast when the server refuses.
 */
class SocialController(
    private val scope: CoroutineScope,
    private val mode: () -> SourceMode,
    private val apiOrNull: () -> AppApi?,
    private val serverUrl: () -> String?,
    private val cache: AppCache,
    private val data: () -> DataUi,
    private val setData: (DataUi.() -> DataUi) -> Unit,
    private val onAuth: (String?) -> Unit,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val s get() = data().social
    private fun set(f: SocialUi.() -> SocialUi) = setData { copy(social = social.f()) }
    private fun toast(msg: String) = setData { copy(toast = msg) }
    private fun api(): SocialApi? = apiOrNull()?.let(::SocialApi)
    private fun busy(key: String, on: Boolean) = set { copy(busy = if (on) busy + key else busy - key) }

    private val me: String get() = s.me.data?.server ?: serverUrl().orEmpty()
    private val myName: String? get() = s.me.data?.name

    companion object {
        const val K_ME = "social_me"
        const val K_FRIENDS = "social_friends"
        const val K_FEED = "social_feed"
        const val K_NOTES = "social_notifications"
        private const val SHORT = 60_000L
        private const val LONG = 5 * 60_000L

        /** Something a 404 on /me means: the server predates FRIENDS. */
        const val NO_SOCIAL = "This server doesn't have FRIENDS yet. Update it, then pull to refresh."
    }

    /** Open instantly from disk. */
    fun initial(): SocialUi {
        if (mode() != SourceMode.SERVER) return SocialUi()
        fun <T> c(k: String, ser: KSerializer<T>) = cache.read(k, ser)?.let { Load.of(it.value, it.savedAt) } ?: Load()
        val feed = cache.read(K_FEED, FeedPage.serializer())
        return SocialUi(
            me = c(K_ME, SocialMe.serializer()),
            friends = c(K_FRIENDS, FriendList.serializer()),
            notifications = c(K_NOTES, NotificationList.serializer()),
            feed = feed?.let { FeedUi(it.value.items, it.value.next, it.value.stale, it.value.unreachable, loaded = true, savedAt = it.savedAt) } ?: FeedUi(),
        )
    }

    // ───────────── documents ─────────────

    private suspend fun <T> doc(key: String, ser: KSerializer<T>, force: Boolean, maxAge: Long, fetch: suspend (SocialApi) -> T): Load<T> {
        val c = cache.read(key, ser)
        if (!force && c != null && clock() - c.savedAt < maxAge) return Load.of(c.value, c.savedAt)
        val api = api() ?: return Load(c?.value, savedAt = c?.savedAt ?: 0, error = "Not connected. Open SETUP.")
        return try {
            val v = fetch(api)
            cache.write(key, ser, v)
            Load.of(v, clock())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e is AuthException) onAuth(e.message)
            Load(c?.value, savedAt = c?.savedAt ?: 0, error = friendly(e), auth = e is AuthException)
        }
    }

    private fun <T> run(get: SocialUi.() -> Load<T>, put: SocialUi.(Load<T>) -> SocialUi, block: suspend () -> Load<T>, then: (Load<T>) -> Unit = {}) {
        val cur = s.get()
        if (cur.loading) return
        set { put(cur.copy(loading = true)) }
        scope.launch {
            val r = block()
            set { put(r) }
            then(r)
        }
    }

    fun load(force: Boolean) {
        if (mode() != SourceMode.SERVER) { set { copy(me = Load.server()) }; return }
        run({ me }, { copy(me = it) }, {
            val r = doc(K_ME, SocialMe.serializer(), force, LONG) { it.me() }
            if (r.data == null && r.error != null && r.error.startsWith("Not found")) r.copy(error = NO_SOCIAL) else r
        }) { r ->
            if (r.data?.enabled == true) {
                loadFriends(force)
                if (force || !s.feed.loaded || clock() - s.feed.savedAt > SHORT) loadFeed(reset = true, fresh = false)
                loadNotifications(force)
            }
        }
    }

    fun loadFriends(force: Boolean) = run({ friends }, { copy(friends = it) }, { doc(K_FRIENDS, FriendList.serializer(), force, SHORT) { it.friends() } })

    fun loadNotifications(force: Boolean) =
        run({ notifications }, { copy(notifications = it) }, { doc(K_NOTES, NotificationList.serializer(), force, SHORT) { it.notifications() } })

    // ───────────── setup ─────────────

    fun setup(handle: String, name: String, listed: Boolean) {
        val h = handle.trim().lowercase().removePrefix("@")
        if (!Social.validHandle(h)) { set { copy(setupError = "Handles are 2–30 characters: a–z, 0–9, _ and -, starting with a letter or digit.") }; return }
        val api = api() ?: return
        busy("setup", true)
        set { copy(setupError = null) }
        scope.launch {
            try {
                api.setup(h, name.trim().ifBlank { h }, listed)
                busy("setup", false)
                toast("You're @$h. Add a friend to get started.")
                load(force = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(busy = busy - "setup", setupError = friendly(e)) }
            }
        }
    }

    // ───────────── feeds ─────────────

    private var feedJob: Job? = null

    fun loadFeed(reset: Boolean, fresh: Boolean) {
        val f = s.feed
        if (!reset && (f.next == null || f.loadingMore || f.loading)) return
        val api = api() ?: return
        if (reset) feedJob?.cancel()
        set { copy(feed = if (reset) feed.copy(loading = true, error = null) else feed.copy(loadingMore = true, error = null)) }
        feedJob = scope.launch {
            try {
                val page = api.feed(before = if (reset) null else f.next, fresh = fresh)
                if (reset) cache.write(K_FEED, FeedPage.serializer(), page)
                set {
                    copy(feed = feed.copy(
                        items = if (reset) page.items else (feed.items + page.items).distinctBy { (it.author?.id ?: "") + it.id },
                        next = page.next, stale = if (reset) page.stale else (feed.stale + page.stale).distinct(),
                        unreachable = if (reset) page.unreachable else feed.unreachable,
                        loading = false, loadingMore = false, loaded = true, error = null, savedAt = if (reset) clock() else feed.savedAt,
                    ))
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (e is AuthException) onAuth(e.message)
                set { copy(feed = feed.copy(loading = false, loadingMore = false, error = friendly(e))) }
            }
        }
    }

    fun loadMine(reset: Boolean) {
        val f = s.mine
        if (!reset && (f.next == null || f.loadingMore || f.loading)) return
        if (reset && f.loading) return
        val api = api() ?: run { set { copy(mine = mine.copy(error = "Not connected.")) }; return }
        set { copy(mine = if (reset) mine.copy(loading = true, error = null) else mine.copy(loadingMore = true, error = null)) }
        scope.launch {
            try {
                val page = api.mine(if (reset) null else f.next)
                set { copy(mine = mine.copy(items = if (reset) page.items else (mine.items + page.items).distinctBy { it.id }, next = page.next, loading = false, loadingMore = false, loaded = true, error = null, savedAt = clock())) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(mine = mine.copy(loading = false, loadingMore = false, error = friendly(e))) }
            }
        }
    }

    private fun friendAuthor(id: String) =
        s.friends.data?.friends?.firstOrNull { it.id == id }?.author
            ?: s.profile[id]?.data?.profile?.let { p -> dev.ironterm.data.social.Author(id, p.server, p.handle, p.name) }

    fun loadFriendFeed(id: String, reset: Boolean, fresh: Boolean) {
        val f = s.friendFeed[id] ?: FeedUi()
        if (!reset && (f.next == null || f.loadingMore || f.loading)) return
        if (reset && f.loading) return
        val api = api() ?: return
        fun put(v: FeedUi) = set { copy(friendFeed = friendFeed + (id to v)) }
        put(if (reset) f.copy(loading = true, error = null) else f.copy(loadingMore = true, error = null))
        scope.launch {
            try {
                val page = api.friendFeed(id, if (reset) null else f.next, fresh)
                val author = friendAuthor(id)
                val items = page.items.map { if (it.author == null && author != null) it.copy(author = author) else it }
                val cur = s.friendFeed[id] ?: FeedUi()
                put(cur.copy(items = if (reset) items else (cur.items + items).distinctBy { it.id }, next = page.next, stale = page.stale, loading = false, loadingMore = false, loaded = true, error = null, savedAt = clock()))
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                put((s.friendFeed[id] ?: FeedUi()).copy(loading = false, loadingMore = false, error = friendly(e)))
            }
        }
    }

    fun loadFriend(id: String, force: Boolean) {
        run({ profile[id] ?: Load() }, { copy(profile = profile + (id to it)) }, { doc("social_profile_$id", ProfileDoc.serializer(), force, SHORT) { it.profile(id, fresh = force) } })
        run({ compare[id] ?: Load() }, { copy(compare = compare + (id to it)) }, { doc("social_compare_$id", Compare.serializer(), force, SHORT) { it.compare(id, fresh = force) } })
        if (force || s.friendFeed[id]?.loaded != true) loadFriendFeed(id, reset = true, fresh = force)
    }

    // ───────────── reactions / comments ─────────────

    private fun updateItem(authorId: String?, itemId: String, f: (FeedItem) -> FeedItem) = set {
        copy(
            feed = feed.copy(items = Social.update(feed.items, authorId, itemId, f)),
            friendFeed = friendFeed.mapValues { (fid, v) -> if (authorId == null || fid == authorId) v.copy(items = Social.update(v.items, authorId, itemId, f)) else v },
        )
    }

    fun react(item: FeedItem, emoji: String) {
        val author = item.author?.id ?: return
        val api = api() ?: return
        val key = "react:$author:${item.id}"
        if (key in s.busy) return
        val myServer = me.ifBlank { return }
        val (_, send) = Social.toggle(item, emoji, myServer, myName)
        val before = Social.myReaction(item, myServer)
        updateItem(author, item.id) { Social.withReaction(it, send, myServer, myName) }
        busy(key, true)
        scope.launch {
            try {
                api.react(author, item.id, send)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                updateItem(author, item.id) { Social.withReaction(it, before, myServer, myName) }
                toast("Reaction not sent: ${friendly(e)}")
            } finally { busy(key, false) }
        }
    }

    fun comment(item: FeedItem, text: String) {
        val author = item.author?.id ?: return
        val t = text.trim().take(280)
        if (t.isEmpty()) return
        val api = api() ?: return
        val local = Comment("local-${clock()}", Who(Social.origin(me), myName), t, Instant.ofEpochMilli(clock()).toString())
        updateItem(author, item.id) { it.copy(comments = it.comments + local) }
        val key = "comment:${item.id}"
        busy(key, true)
        scope.launch {
            try {
                api.comment(author, item.id, t)
                updateItem(author, item.id) { it.copy(comments = it.comments.map { c -> if (c.id == local.id) c.copy(id = "sent-${local.id}") else c }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                updateItem(author, item.id) { it.copy(comments = it.comments.filterNot { c -> c.id == local.id }) }
                toast("Comment not sent: ${friendly(e)}")
            } finally { busy(key, false) }
        }
    }

    // ───────────── friends ─────────────

    private var searchJob: Job? = null

    fun search(q: String) {
        set { copy(search = search.copy(query = q, error = null)) }
        searchJob?.cancel()
        if (q.trim().length < 2) { set { copy(search = search.copy(users = emptyList(), loading = false)) }; return }
        val api = api() ?: return
        searchJob = scope.launch {
            delay(300)
            set { copy(search = search.copy(loading = true)) }
            try {
                val r = api.search(q.trim())
                if (s.search.query == q) set { copy(search = search.copy(users = r.users, loading = false, error = null)) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(search = search.copy(loading = false, error = friendly(e))) }
            }
        }
    }

    fun add(target: String, note: String, share: String) {
        val t = Social.target(target) ?: run { set { copy(addError = "Enter a handle (sam) or a server URL (gym.example.com).") }; return }
        val api = api() ?: return
        busy("add", true)
        set { copy(addError = null) }
        scope.launch {
            try {
                val r = api.addFriend(t.first, t.second, note.trim().take(140).ifBlank { null }, share)
                val f = r.friend
                set {
                    copy(
                        busy = busy - "add", added = added + 1, search = SearchUi(),
                        friends = friends.data?.let { l -> if (f != null) friends.copy(data = FriendList(l.friends.filterNot { it.id == f.id } + f)) else friends } ?: friends,
                    )
                }
                toast(if (f?.status == Friend.FRIENDS) "You're now friends with ${f.author.display}." else "Request sent to ${f?.author?.display ?: t.second}.")
                loadFriends(force = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(busy = busy - "add", addError = addMessage(e)) }
            }
        }
    }

    private fun addMessage(e: Exception): String = when {
        e is ApiException && e.code == 404 -> e.message?.takeIf { !it.startsWith("Server error") } ?: "No one with that handle or server."
        e is ApiException && e.code == 409 -> e.message?.takeIf { !it.startsWith("Server error") } ?: "You already have a request with them."
        e is ApiException && e.code == 429 -> "They have too many pending requests. Try later."
        else -> friendly(e)
    }

    private fun friendOp(key: String, done: String?, optimistic: (FriendList) -> FriendList, call: suspend (SocialApi) -> Unit, after: () -> Unit = {}) {
        val api = api() ?: return
        if (key in s.busy) return
        val before = s.friends
        set { copy(busy = busy + key, friends = friends.data?.let { friends.copy(data = optimistic(it)) } ?: friends) }
        scope.launch {
            try {
                call(api)
                busy(key, false)
                done?.let(::toast)
                after()
                loadFriends(force = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(busy = busy - key, friends = before) }
                toast(friendly(e))
            }
        }
    }

    private fun name(id: String) = s.friends.data?.friends?.firstOrNull { it.id == id }?.author?.display ?: "them"

    fun accept(id: String, share: String) = friendOp(
        "accept:$id", "You and ${name(id)} are friends. They see: ${dev.ironterm.data.social.Share.label(share)}.",
        { l -> FriendList(l.friends.map { if (it.id == id) it.copy(status = Friend.FRIENDS, share = share) else it }) },
        { it.accept(id, share) },
    ) { loadFeed(reset = true, fresh = true); loadNotifications(true) }

    fun reject(id: String) = friendOp("reject:$id", "Request declined.", { l -> FriendList(l.friends.filterNot { it.id == id }) }, { it.reject(id) })

    fun setShare(id: String, share: String) = friendOp(
        "share:$id", "${name(id)} now sees: ${dev.ironterm.data.social.Share.label(share)}.",
        { l -> FriendList(l.friends.map { if (it.id == id) it.copy(share = share) else it }) },
        { it.setShare(id, share) },
    )

    fun unfriend(id: String) {
        val n = name(id)
        val wasRequest = s.friends.data?.friends?.firstOrNull { it.id == id }?.status == Friend.OUTGOING
        friendOp(
            "unfriend:$id", if (wasRequest) "Request cancelled." else "Unfriended $n.",
            { l -> FriendList(l.friends.filterNot { it.id == id }) },
            { it.unfriend(id) },
        ) {
            set { copy(feed = feed.copy(items = feed.items.filterNot { it.author?.id == id }), friendFeed = friendFeed - id, profile = profile - id, compare = compare - id) }
        }
    }

    // ───────────── notifications ─────────────

    fun markRead() {
        val api = api() ?: return
        val before = s.notifications
        set { copy(notifications = notifications.data?.let { n -> notifications.copy(data = NotificationList(n.items.map { it.copy(read = true) })) } ?: notifications) }
        scope.launch {
            try {
                api.markRead()
                s.notifications.data?.let { cache.write(K_NOTES, NotificationList.serializer(), it) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                set { copy(notifications = before) }
                toast("Couldn't mark read: ${friendly(e)}")
            }
        }
    }
}
