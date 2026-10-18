package dev.ironterm

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.AuthException
import dev.ironterm.data.RefreshResult
import dev.ironterm.data.Refresher
import dev.ironterm.data.ServerClient
import dev.ironterm.data.Settings
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotJson
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SourceMode
import dev.ironterm.data.hevy.HevyApi
import dev.ironterm.data.hevy.WorkoutsResponse
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicInteger

/** End-to-end: Refresher → OkHttp → a local mock server that only answers the right credential. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NetworkTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var settings: Settings
    private lateinit var store: SnapshotStore
    private var validToken = "ht_good"
    private val apiKey = "test-api-key-not-real"
    private val hevyCalls = AtomicInteger()
    private val today = LocalDate.parse("2026-10-15")
    private val workouts = TestData.history(today, weeks = 6) // ~24 workouts → 3 pages of 10

    @Before fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath
                return when (path) {
                    "/api/snapshot" ->
                        if (request.getHeader("Authorization") == "Bearer $validToken")
                            MockResponse().setBody(TestData.fixtureText).setHeader("content-type", "application/json")
                        else MockResponse().setResponseCode(401).setBody("""{"error":"login required","auth":"google"}""")
                    "/v1/workouts" -> {
                        hevyCalls.incrementAndGet()
                        if (request.getHeader("api-key") != apiKey) return MockResponse().setResponseCode(401)
                        val page = request.requestUrl!!.queryParameter("page")!!.toInt()
                        val size = request.requestUrl!!.queryParameter("pageSize")!!.toInt()
                        if (size > 10) return MockResponse().setResponseCode(400)
                        val chunks = workouts.chunked(size)
                        val body = WorkoutsResponse(page, chunks.size, chunks.getOrElse(page - 1) { emptyList() })
                        MockResponse().setBody(SnapshotJson.json.encodeToString(WorkoutsResponse.serializer(), body))
                    }
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        settings = Settings(ctx.getSharedPreferences("test_${System.nanoTime()}", Context.MODE_PRIVATE))
        store = SnapshotStore(tmp.newFolder("store"))
    }

    @After fun tearDown() = server.shutdown()

    private val base get() = server.url("/").toString().trimEnd('/')
    private val clock = { java.time.Instant.parse("2026-10-15T16:00:00Z").toEpochMilli() }

    private fun refresher(filesDir: java.io.File = tmp.root) = Refresher(
        settings, store, filesDir, ServerClient(), HevyApi("$base/"), { ZoneId.of("America/New_York") }, clock,
    )

    @Test fun serverModeEndToEnd() = runBlocking {
        settings.connectServer(base, "ht_good")
        val r = refresher().refresh()
        assertTrue(r is RefreshResult.Ok)
        val req = server.takeRequest()
        assertEquals("/api/snapshot", req.path)
        assertEquals("Bearer ht_good", req.getHeader("Authorization"))
        val cached = store.read()!!
        assertEquals(Snapshot.SOURCE_SERVER, cached.origin)
        assertEquals(TestData.fixture.copy(origin = Snapshot.SOURCE_SERVER), cached)
        assertEquals(clock(), store.status().lastSuccessAt)
        assertNull(store.status().lastError)
    }

    @Test fun revokedTokenKeepsCacheAndFlagsAuth() = runBlocking {
        settings.connectServer(base, "ht_good")
        refresher().refresh()
        validToken = "ht_rotated" // token revoked on the server
        val r = refresher().refresh()
        assertTrue(r is RefreshResult.Failed)
        r as RefreshResult.Failed
        assertTrue(r.auth)
        assertEquals("Token revoked or invalid. Reconnect.", r.message)
        assertEquals(AuthException.AUTH_MESSAGE, store.status().lastError)
        assertTrue(store.status().authError)
        assertNotNull("old snapshot still there for widgets", store.read())
        assertEquals(clock(), store.status().lastSuccessAt)
    }

    @Test fun wrongTokenDirectly() = runBlocking {
        try {
            ServerClient().fetchSnapshot(base, "ht_wrong")
            throw AssertionError("expected 401")
        } catch (e: AuthException) {
            assertEquals("Token revoked or invalid. Reconnect.", e.message)
        }
    }

    @Test fun testConnectionReportsErrors() = runBlocking {
        val r = refresher()
        assertNull(r.test(SourceMode.SERVER, base, "ht_good", null))
        assertEquals(AuthException.AUTH_MESSAGE, r.test(SourceMode.SERVER, base, "ht_bad", null))
        assertNull(r.test(SourceMode.DIRECT, null, null, apiKey))
        assertNotNull(r.test(SourceMode.DIRECT, null, null, "wrong"))
        assertFalse(store.read() != null) // tests never write the cache
    }

    @Test fun nonSnapshotResponseIsAnError() = runBlocking {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = MockResponse().setBody("<html>not json</html>")
        }
        settings.connectServer(base, "ht_good")
        val r = refresher().refresh()
        assertTrue(r is RefreshResult.Failed && !r.auth)
    }

    @Test fun directModePagesThroughHevyAndAggregates() = runBlocking {
        settings.connectDirect(apiKey)
        settings.directUnit = "kg"
        val r = refresher().refresh()
        assertTrue(r.toString(), r is RefreshResult.Ok)
        val s = store.read()!!
        assertEquals(Snapshot.SOURCE_DIRECT, s.origin)
        assertEquals(workouts.size, s.totals.allTime)
        assertEquals(3, hevyCalls.get()) // ceil(24/10) pages, pageSize 10
        assertEquals(listOf("squat", "bench", "deadlift", "ohp"), s.lifts.take(4).map { it.key })
        // second refresh is incremental: page 1 already overlaps the cache
        hevyCalls.set(0)
        refresher().refresh()
        assertEquals(1, hevyCalls.get())
        assertEquals(workouts.size, store.read()!!.totals.allTime)
    }

    @Test fun directModeBadKey() = runBlocking {
        settings.connectDirect("nope")
        val r = refresher().refresh()
        assertTrue(r is RefreshResult.Failed && r.auth)
    }

    @Test fun notConfigured() = runBlocking {
        assertEquals(RefreshResult.NotConfigured, refresher().refresh())
    }
}
