package dev.ironterm

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.RefreshResult
import dev.ironterm.data.Refresher
import dev.ironterm.data.ServerClient
import dev.ironterm.data.Settings
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SyncRunner
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Connecting to a new server while a sync to the old one hangs: the first sync after connect goes to
 * the new server right away, lands as synced, and nothing from the old server is written afterwards.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConnectSyncTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var old: MockWebServer
    private lateinit var new: MockWebServer
    private lateinit var settings: Settings
    private lateinit var store: SnapshotStore
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    /** released to let the old server finally answer (with an error) */
    private val releaseOld = CountDownLatch(1)

    @Before fun setUp() {
        old = MockWebServer().apply {
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    releaseOld.await(20, TimeUnit.SECONDS) // hangs until released
                    return MockResponse().setResponseCode(502).setBody("old server is gone")
                }
            }
            start()
        }
        new = MockWebServer().apply {
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest) =
                    if (request.getHeader("Authorization") == "Bearer ht_new") MockResponse().setBody(TestData.fixtureText)
                    else MockResponse().setResponseCode(401)
            }
            start()
        }
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        settings = Settings(ctx.getSharedPreferences("connect_${System.nanoTime()}", Context.MODE_PRIVATE))
        store = SnapshotStore(tmp.newFolder("store"))
    }

    @After fun tearDown() {
        releaseOld.countDown()
        scope.cancel()
        old.shutdown()
        new.shutdown()
    }

    private fun url(s: MockWebServer) = s.url("/").toString().trimEnd('/')
    private fun refresher() = Refresher(settings, store, tmp.root, ServerClient())

    @Test fun connectCancelsTheHungSyncAndSyncsTheNewServer() = runBlocking {
        settings.connectServer(url(old), "ht_old")
        val runner = SyncRunner(scope) { refresher() }
        val oldDone = CompletableDeferred<RefreshResult>()
        val oldJob = runner.start { oldDone.complete(it) }!!
        assertNotNull("the old sync reached the old server", old.takeRequest(5, TimeUnit.SECONDS))
        assertTrue(runner.running)

        // connect (what AppViewModel.afterConnect does): new settings, old data cleared, fresh sync
        settings.connectServer(url(new), "ht_new")
        store.clear()
        val newDone = CompletableDeferred<RefreshResult>()
        runner.restart { newDone.complete(it) }

        val r = withTimeout(10_000) { newDone.await() } // not blocked behind the hung old sync
        assertTrue(r.toString(), r is RefreshResult.Ok)
        assertEquals(1, new.requestCount)
        assertEquals("Bearer ht_new", new.takeRequest().getHeader("Authorization"))
        val st = store.status()
        assertTrue("synced", st.lastSuccessAt > 0)
        assertNull(st.lastError)
        assertEquals(Snapshot.SOURCE_SERVER, store.read()!!.source)

        assertTrue("the old sync was cancelled", oldJob.isCancelled)
        releaseOld.countDown()
        Thread.sleep(300)
        assertTrue("the old result never reaches the UI", !oldDone.isCompleted)
        assertNull("no old error written over the new status", store.status().lastError)
    }

    /** A sync nobody cancels (the background worker) can't block or overwrite the new server's. */
    @Test fun uncancelledOldSyncIsSuperseded() = runBlocking {
        settings.connectServer(url(old), "ht_old")
        val oldSync = scope.async { refresher().refresh() }
        assertNotNull(old.takeRequest(5, TimeUnit.SECONDS))

        settings.connectServer(url(new), "ht_new")
        store.clear()
        val r = withTimeout(10_000) { refresher().refresh() }
        assertTrue(r.toString(), r is RefreshResult.Ok)
        val synced = store.status()
        assertNull(synced.lastError)

        releaseOld.countDown() // the old server finally answers 502
        assertEquals(RefreshResult.Superseded, withTimeout(10_000) { oldSync.await() })
        assertEquals("the old failure wrote nothing", synced, store.status())
        assertNotNull(store.read())
    }

    @Test fun startDoesNotStackSyncs() = runBlocking {
        settings.connectServer(url(old), "ht_old")
        val runner = SyncRunner(scope) { refresher() }
        assertNotNull(runner.start { })
        assertNull("a second refresh while one runs is a no-op", runner.start { })
        Unit
    }
}
