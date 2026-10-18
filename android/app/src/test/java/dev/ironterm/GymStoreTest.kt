package dev.ironterm

import dev.ironterm.data.AuthException
import dev.ironterm.data.app.ApiException
import dev.ironterm.gym.FinishState
import dev.ironterm.gym.GymStore
import dev.ironterm.gym.GymTransport
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.OutOp
import dev.ironterm.gym.Outbox
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException

/** Offline-first gym store: disk persistence, the outbox, debounced PUTs, retries, FINISH queueing. */
@OptIn(ExperimentalCoroutinesApi::class)
class GymStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    /** A server that can be offline, reject with a status, or reject the token. */
    class FakeServer : GymTransport {
        var online = true
        var status: Int? = null
        var auth = false
        val puts = ArrayList<LiveSession>()
        var deletes = 0
        val finishes = ArrayList<LiveSession>()
        override var direct = false

        private fun check() {
            if (auth) throw AuthException()
            if (!online) throw IOException("Unable to resolve host")
            status?.let { throw ApiException(it, "No Hevy exercise found for cableFly. Map it in Settings › Lifts.") }
        }
        override suspend fun put(s: LiveSession) { check(); puts.add(s) }
        override suspend fun delete() { check(); deletes++ }
        /** what the server says about PRs (null = an older server that sends none) */
        var prs: List<String>? = null
        override suspend fun finish(s: LiveSession): dev.ironterm.gym.Finished { check(); finishes.add(s); return dev.ironterm.gym.Finished("w-${finishes.size}", false, prs) }
    }

    private fun TestScope.store(dir: File, server: FakeServer, retries: IntArray = IntArray(1), finished: IntArray = IntArray(1)) = GymStore(
        dir = dir, transport = { server }, scope = backgroundScope, clock = { testScheduler.currentTime },
        onRetryLater = { retries[0]++ }, onFinished = { finished[0]++ }, debounceMs = 700,
    )

    /** Background work (debounce, retries) isn't covered by advanceUntilIdle: run 10 virtual minutes. */
    private fun TestScope.settle() { advanceTimeBy(600_000); runCurrent() }

    private fun session(): LiveSession {
        var s = Live.emptySession("kg", "2026-01-02T15:00:00.000Z")
        s = Live.addExercise(s, "bench")
        return s
    }

    @Test fun changesPersistImmediatelyAndPutsAreDebouncedAndCoalesced() = runTest {
        val dir = tmp.newFolder()
        val srv = FakeServer()
        val st = store(dir, srv)
        st.start(session(), onServer = true)
        val ex = st.session!!.exercises[0].id
        st.update { Live.updateSet(it, ex, 0) { x -> x.copy(weight = 60.0) } }
        st.update { Live.updateSet(it, ex, 0) { x -> x.copy(weight = 62.5) } }
        st.update { Live.completeSet(it, ex, 0, 1000) }
        // on disk right away, before any network
        assertEquals(62.5, Live.decode(File(dir, "gym_session.json").readText()).exercises[0].sets[0].weight!!, 0.0)
        assertEquals(1, st.state.value.outbox.size)
        runCurrent()
        assertTrue("debounced", srv.puts.isEmpty())
        advanceTimeBy(800); runCurrent()
        assertEquals("one PUT with the latest state", 1, srv.puts.size)
        assertTrue(srv.puts[0].exercises[0].sets[0].done)
        assertTrue(st.state.value.outbox.isEmpty())
        assertTrue(Outbox.next(Live.json.decodeFromString(dev.ironterm.gym.OutboxFile.serializer(), File(dir, "gym_outbox.json").readText()).ops) == null)
    }

    @Test fun offlineQueuesThenRetriesWhenOnline() = runTest {
        val srv = FakeServer().apply { online = false }
        val retries = IntArray(1)
        val st = store(tmp.newFolder(), srv, retries)
        st.start(session(), onServer = false) // offline start: the server never saw it
        runCurrent()
        assertEquals(1, st.state.value.pending)
        assertEquals("Offline · will retry", st.state.value.syncError)
        assertTrue(retries[0] >= 1)
        val ex = st.session!!.exercises[0].id
        st.update { Live.completeSet(it, ex, 0, 5000) }
        advanceTimeBy(800); runCurrent()
        assertEquals("still one coalesced PUT", 1, st.state.value.pending)
        srv.online = true
        settle()
        assertEquals(0, st.state.value.pending)
        assertNull(st.state.value.syncError)
        assertTrue(srv.puts.last().exercises[0].sets[0].done)
    }

    @Test fun sessionAndQueueSurviveProcessDeath() = runTest {
        val dir = tmp.newFolder()
        val srv = FakeServer().apply { online = false }
        val a = store(dir, srv)
        a.start(session(), onServer = true)
        val ex = a.session!!.exercises[0].id
        a.update { Live.completeSet(it, ex, 0, 1_000) }
        advanceTimeBy(800); runCurrent()
        // "process death": a fresh store on the same files
        srv.online = true
        val b = store(dir, srv)
        assertEquals(a.session, b.session)
        assertEquals(1, b.state.value.pending)
        assertTrue(b.flush())
        assertEquals(1, srv.puts.size)
        assertTrue(srv.puts[0].exercises[0].sets[0].done)
    }

    @Test fun finishOfflineIsQueuedThenUploaded() = runTest {
        val srv = FakeServer().apply { online = false }
        val finished = IntArray(1)
        val st = store(tmp.newFolder(), srv, finished = finished)
        st.start(session(), onServer = true)
        val ex = st.session!!.exercises[0].id
        st.update { Live.completeSet(Live.updateSet(it, ex, 0) { x -> x.copy(weight = 100.0, reps = 5) }, ex, 0, 2_000) }
        st.finish(listOf("BENCH 100×5"))
        runCurrent()
        assertNull("session cleared", st.session)
        val q = st.state.value.outbox
        assertEquals(listOf(OutOp.FINISH), q.map { it.kind })
        assertEquals(FinishState.QUEUED, st.state.value.summary!!.state)
        assertEquals(1, st.state.value.summary!!.sets)
        assertEquals(500.0, st.state.value.summary!!.volume, 0.0)
        assertEquals(listOf("BENCH 100×5"), st.state.value.summary!!.prs)
        srv.online = true
        settle()
        assertEquals(1, srv.finishes.size)
        assertNull("rest timer never uploaded", srv.finishes[0].restEndsAt)
        assertTrue(srv.puts.isEmpty())
        assertEquals(FinishState.SAVED, st.state.value.summary!!.state)
        assertEquals("w-1", st.state.value.summary!!.workoutId)
        assertEquals(1, finished[0])
        st.dismissSummary()
        assertNull(st.state.value.summary)
    }

    @Test fun refusedFinishStopsRetryingAndCanBeRestored() = runTest {
        val srv = FakeServer().apply { status = 500 }
        val st = store(tmp.newFolder(), srv)
        st.start(session(), onServer = true)
        val id = st.session!!.id
        st.finish()
        settle()
        val f = st.state.value.failedFinish
        assertNotNull("server error 3× → marked failed, not retried forever", f)
        assertEquals(FinishState.FAILED, st.state.value.summary!!.state)
        assertTrue(st.state.value.summary!!.error!!.contains("Map it"))
        st.restoreFailed()
        assertEquals(id, st.session!!.id)
        assertTrue(st.state.value.outbox.isEmpty())
        // a 4xx (other than 409 "still being saved") fails at once
        srv.status = 422
        st.finish()
        settle()
        assertNotNull(st.state.value.failedFinish)
        st.dropFailed()
        assertNull(st.state.value.failedFinish)
        assertNull(st.state.value.summary)
        // and a manual retry after fixing it on the server works
        srv.status = null
        st.start(session(), onServer = true)
        srv.status = 400
        st.finish(); settle()
        srv.status = null
        st.retry(); settle()
        assertEquals(1, srv.finishes.size)
        assertEquals(FinishState.SAVED, st.state.value.summary!!.state)
    }

    @Test fun stillBeingSaved409IsRetriedNotFailed() = runTest {
        val srv = FakeServer().apply { status = 409 }
        val st = store(tmp.newFolder(), srv)
        st.start(session(), onServer = true)
        st.finish(listOf("local guess"))
        advanceTimeBy(120_000); runCurrent()
        assertNull("409 never becomes a failure", st.state.value.failedFinish)
        assertTrue(st.state.value.outbox.first().attempts >= 3)
        assertEquals(FinishState.QUEUED, st.state.value.summary!!.state)
        srv.status = null
        srv.prs = listOf("BENCH 100×5 · E1RM PR (was 95)")
        settle()
        assertEquals(FinishState.SAVED, st.state.value.summary!!.state)
        assertEquals("the server's PRs replace the phone's estimate", listOf("BENCH 100×5 · E1RM PR (was 95)"), st.state.value.summary!!.prs)
        assertTrue(st.state.value.summary!!.prsFromServer)
    }

    @Test fun discardReplacesPendingPuts() = runTest {
        val srv = FakeServer().apply { online = false }
        val st = store(tmp.newFolder(), srv)
        st.start(session(), onServer = true)
        st.update { it.copy(title = "x") }
        st.discard()
        assertEquals(listOf(OutOp.DELETE), st.state.value.outbox.map { it.kind })
        srv.online = true
        settle()
        assertEquals(1, srv.deletes)
        assertTrue(srv.puts.isEmpty())
        assertNull(st.session)
    }

    @Test fun revokedTokenKeepsEverythingAndFlagsAuth() = runTest {
        val srv = FakeServer().apply { auth = true }
        val st = store(tmp.newFolder(), srv)
        st.start(session(), onServer = false)
        settle()
        assertTrue(st.state.value.authError)
        assertEquals(1, st.state.value.pending)
        assertNotNull(st.session)
        srv.auth = false
        st.retry(); settle()
        assertFalse(st.state.value.authError)
        assertEquals(0, st.state.value.pending)
    }

    @Test fun adoptOnlyWhenThisPhoneHasNoSession() = runTest {
        val srv = FakeServer()
        val st = store(tmp.newFolder(), srv)
        val web = session()
        st.adopt(web)
        assertEquals(web, st.session)
        st.adopt(session())
        assertEquals("local wins", web.id, st.session!!.id)
        // a session this phone already finished isn't resurrected by a stale server copy
        srv.online = false
        st.finish(); runCurrent()
        st.adopt(web)
        assertNull(st.session)
    }

    // ── Outbox, pure ──

    @Test fun outboxCoalescing() {
        val a = session()
        val b = session()
        var q = Outbox.put(emptyList(), a, 1)
        q = Outbox.put(q, a.copy(title = "2"), 2)
        assertEquals(1, q.size); assertEquals("2", q[0].session!!.title)
        q = Outbox.delete(q, a.id, 3)
        assertEquals(listOf(OutOp.DELETE), q.map { it.kind })
        q = Outbox.put(q, b, 4)
        q = Outbox.finish(q, b, 5)
        assertEquals("delete of the old one first, then finish", listOf(OutOp.DELETE, OutOp.FINISH), q.map { it.kind })
        assertEquals("a PUT after FINISH is ignored", q, Outbox.put(q, b, 6))
        val failed = Outbox.markAttempt(q, q[0], "x", failed = true)
        assertNull("blocked behind a failed op", Outbox.next(failed))
        assertEquals(q[0].kind, Outbox.next(Outbox.unblock(failed))!!.kind)
        assertEquals(listOf(2_000L, 5_000L, 15_000L, 30_000L, 60_000L, 60_000L), (1..6).map(Outbox::backoffMs))
    }
}
