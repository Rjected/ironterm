package dev.ironterm

import dev.ironterm.data.AuthException
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.ApiException
import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppCache
import dev.ironterm.data.app.Load
import dev.ironterm.data.social.FeedItem
import dev.ironterm.data.social.Social
import dev.ironterm.data.social.SocialApi
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.FeedUi
import dev.ironterm.ui.SocialController
import dev.ironterm.ui.SocialUi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import dev.ironterm.testing.Dispatcher
import dev.ironterm.testing.MockResponse
import dev.ironterm.testing.MockWebServer
import dev.ironterm.testing.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.CopyOnWriteArrayList

/** SocialApi requests on the wire, and SocialController's optimistic updates against a mock server. */
class SocialApiTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private val seen = CopyOnWriteArrayList<RecordedRequest>()
    @Volatile private var reactStatus = 200

    private fun fixture(n: String) = SocialApiTest::class.java.classLoader!!.getResource("social/$n.json")!!.readText()
    private fun ok(body: String) = MockResponse().setBody(body).setHeader("content-type", "application/json")

    @Before fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                seen += request
                if (request.getHeader("Authorization") != "Bearer ht_ok") return MockResponse().setResponseCode(401)
                val path = request.requestUrl!!.encodedPath
                return when {
                    path == "/api/social/me" -> ok(fixture("me"))
                    path == "/api/social/feed" -> ok(fixture("feed"))
                    path == "/api/social/friends" && request.method == "GET" -> ok(fixture("friends"))
                    path == "/api/social/notifications" -> ok(fixture("notifications"))
                    path == "/api/social/react" -> if (reactStatus == 200) ok("""{"ok":true}""") else MockResponse().setResponseCode(reactStatus).setBody("""{"error":"Bob: couldn't reach"}""")
                    path.endsWith("/profile") -> MockResponse().setResponseCode(403).setBody("""{"error":"they no longer share with you"}""")
                    path == "/api/social/friends/650b12a8f954/accept" -> ok("""{"friend":{}}""")
                    else -> MockResponse().setResponseCode(404).setBody("""{"error":"not found"}""")
                }
            }
        }
        server.start()
    }

    @After fun tearDown() { server.shutdown() }

    private fun api(token: String = "ht_ok") = SocialApi(AppApi(server.url("/").toString(), token))

    @Test fun reactSendsExplicitNullToRemove() = runBlocking {
        api().react("650b12a8f954", "w:1", null)
        val r = seen.last { it.requestUrl!!.encodedPath == "/api/social/react" }
        assertEquals("POST", r.method)
        assertEquals("""{"friend":"650b12a8f954","item":"w:1","emoji":null}""", r.body.readUtf8())
        api().react("650b12a8f954", "w:1", "💪")
        assertEquals("""{"friend":"650b12a8f954","item":"w:1","emoji":"💪"}""", seen.last().body.readUtf8())
    }

    @Test fun feedQuery() = runBlocking {
        val p = api().feed(before = "650b12a8f954|pr:b:ohp:rep:2", fresh = true)
        assertEquals(20, p.items.size)
        val u = seen.last().requestUrl!!
        assertEquals("650b12a8f954|pr:b:ohp:rep:2", u.queryParameter("before"))
        assertEquals("1", u.queryParameter("fresh"))
        assertEquals("30", u.queryParameter("limit"))
        api().feed()
        assertNull(seen.last().requestUrl!!.queryParameter("fresh"))
    }

    @Test fun forbiddenIsNotAnAuthError() = runBlocking {
        try { api().profile("650b12a8f954"); fail() } catch (e: ApiException) {
            assertEquals(403, e.code)
            assertEquals("they no longer share with you", e.message)
        }
        try { api("ht_bad").me(); fail() } catch (_: AuthException) { }
    }

    @Test fun addFriendBody() = runBlocking {
        runCatching { api().addFriend("handle", "bob", "hi", "lifts") }
        val r = seen.last()
        assertEquals("/api/social/friends", r.requestUrl!!.encodedPath)
        assertEquals("""{"handle":"bob","note":"hi","share":"lifts"}""", r.body.readUtf8())
    }

    // ── controller ──

    private class Harness(val c: SocialController, val data: () -> DataUi, val scope: CoroutineScope)

    private fun harness(start: SocialUi): Harness {
        var d = DataUi(social = start)
        val lock = Any()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val c = SocialController(
            scope, { SourceMode.SERVER }, { AppApi(server.url("/").toString(), "ht_ok") }, { "https://a.test" }, AppCache(tmp.newFolder()),
            { synchronized(lock) { d } }, { f -> synchronized(lock) { d = d.f() } }, {},
        )
        return Harness(c, { synchronized(lock) { d } }, scope)
    }

    private fun waitIdle(h: Harness) {
        val until = System.currentTimeMillis() + 5000
        while (System.currentTimeMillis() < until) {
            val s = h.data().social
            if (s.busy.isEmpty() && !s.me.loading && !s.friends.loading && !s.feed.loading && !s.notifications.loading) return
            Thread.sleep(20)
        }
        fail("controller never went idle")
    }

    private val bobItem get() = SocialModelsTestHelper.feed().items.first { it.kind == FeedItem.SESSION }

    @Test fun reactOptimisticThenKept() {
        val item = bobItem // has Alice's 💪 already
        val h = harness(SocialUi(me = Load.of(dev.ironterm.data.social.SocialMe(true, "alice", "Alice", "https://a.test")), feed = FeedUi(listOf(item), loaded = true)))
        h.c.react(item, "🔥")
        assertEquals("🔥", Social.myReaction(h.data().social.feed.items.single(), "https://a.test"))
        waitIdle(h)
        assertEquals("🔥", Social.myReaction(h.data().social.feed.items.single(), "https://a.test"))
        assertNull(h.data().toast)
        assertTrue(seen.last().body.readUtf8().contains("\"emoji\":\"🔥\""))
        h.scope.cancel()
    }

    @Test fun reactRollsBackOnFailure() {
        reactStatus = 502
        val item = bobItem
        val h = harness(SocialUi(me = Load.of(dev.ironterm.data.social.SocialMe(true, "alice", "Alice", "https://a.test")), feed = FeedUi(listOf(item), loaded = true)))
        h.c.react(item, "💪") // same emoji: optimistic removal
        assertNull(Social.myReaction(h.data().social.feed.items.single(), "https://a.test"))
        waitIdle(h)
        assertEquals("💪", Social.myReaction(h.data().social.feed.items.single(), "https://a.test"))
        assertTrue(h.data().toast!!.startsWith("Reaction not sent"))
        h.scope.cancel()
    }

    @Test fun loadFetchesEverythingWhenEnabled() {
        val h = harness(SocialUi())
        h.c.load(force = true)
        waitIdle(h)
        val s = h.data().social
        assertEquals("alice", s.me.data?.handle)
        assertEquals(1, s.friends.data?.friends?.size)
        assertEquals(20, s.feed.items.size)
        assertEquals(4, s.unread)
        h.scope.cancel()
    }

    @Test fun acceptIsOptimistic() {
        val incoming = dev.ironterm.data.social.Friend("650b12a8f954", "https://b.test", "bob", "Bob", status = "incoming")
        val h = harness(SocialUi(friends = Load.of(dev.ironterm.data.social.FriendList(listOf(incoming)))))
        h.c.accept(incoming.id, "lifts")
        val f = h.data().social.friends.data!!.friends.single()
        assertEquals("friends", f.status)
        assertEquals("lifts", f.share)
        waitIdle(h)
        assertEquals("""{"share":"lifts"}""", seen.first { it.requestUrl!!.encodedPath.endsWith("/accept") }.body.readUtf8())
        h.scope.cancel()
    }
}

object SocialModelsTestHelper {
    fun feed() = dev.ironterm.data.app.AppJson.json.decodeFromString(
        dev.ironterm.data.social.FeedPage.serializer(), SocialModelsTestHelper::class.java.classLoader!!.getResource("social/feed.json")!!.readText(),
    )
}
