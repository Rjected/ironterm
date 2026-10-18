package dev.ironterm.gym

import dev.ironterm.data.AuthException
import dev.ironterm.data.app.ApiException
import dev.ironterm.data.app.isRetryable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException

/** Where a finished session's upload stands. */
object FinishState {
    const val SAVING = "saving"
    const val SAVED = "saved"
    const val QUEUED = "queued"
    const val FAILED = "failed"
}

/** What the FINISH summary shows; persisted so it's still there after process death. */
@Serializable
data class FinishSummary(
    val sessionId: String = "",
    val title: String = "",
    val unit: String = "kg",
    val sets: Int = 0,
    val volume: Double = 0.0,
    val durationSec: Long = 0,
    val exercises: Int = 0,
    /** "SQUAT 140×5 · e1RM 163" lines for sets above the previous best e1RM */
    val prs: List<String> = emptyList(),
    val state: String = FinishState.SAVING,
    val workoutId: String? = null,
    val error: String? = null,
    val demo: Boolean = false,
    /** saved straight to Hevy (Direct mode) */
    val direct: Boolean = false,
    /** a program day (the server advances the program) */
    val program: Boolean = false,
    /** [prs] came from the server (else: the phone's estimate against the last known bests) */
    val prsFromServer: Boolean = false,
)

data class GymState(
    val session: LiveSession? = null,
    val outbox: List<OutOp> = emptyList(),
    val summary: FinishSummary? = null,
    val syncing: Boolean = false,
    /** last sync problem, shown as a small status line ("offline · 3 changes queued") */
    val syncError: String? = null,
    val authError: Boolean = false,
) {
    val pending: Int get() = outbox.size
    val failedFinish: OutOp? get() = outbox.firstOrNull { it.kind == OutOp.FINISH && it.failed }
}

/** A FINISH the server accepted: workout id, demo server, and the server's PR lines (null = it sent none, keep the local estimate). */
data class Finished(val workoutId: String?, val demo: Boolean = false, val prs: List<String>? = null)

/** Sends gym writes. Server mode: the Ironterm API; Direct mode: PUT/DELETE are no-ops and FINISH posts to Hevy. */
interface GymTransport {
    suspend fun put(s: LiveSession)
    suspend fun delete()
    /** Uploads the finished session. */
    suspend fun finish(s: LiveSession): Finished
    val direct: Boolean get() = false
}

/**
 * The live session on this phone: the source of truth while you train. Every change is written to
 * disk first (survives process death), then queued for the server ([Outbox]) and sent debounced,
 * with retries. FINISH works offline: it's queued and uploaded when the network is back.
 */
class GymStore(
    private val dir: File,
    private val transport: () -> GymTransport?,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val clock: () -> Long = System::currentTimeMillis,
    /** called after every state change (rest-timer service, widget) */
    var onChange: (GymState) -> Unit = {},
    /** a write is waiting for the network: schedule a durable retry (WorkManager) */
    var onRetryLater: () -> Unit = {},
    /** a FINISH reached the server: refresh caches */
    var onFinished: () -> Unit = {},
    private val debounceMs: Long = 700,
) {
    private val sessionFile get() = File(dir, "gym_session.json")
    private val outboxFile get() = File(dir, "gym_outbox.json")
    private val summaryFile get() = File(dir, "gym_summary.json")

    private val _state = MutableStateFlow(load())
    val state: StateFlow<GymState> = _state
    val session: LiveSession? get() = _state.value.session

    private val flushLock = Mutex()
    private var debounce: Job? = null
    private var retry: Job? = null

    private fun load(): GymState {
        val s = runCatching { Live.decode(sessionFile.readText()) }.getOrNull()
        val ops = runCatching { Live.json.decodeFromString(OutboxFile.serializer(), outboxFile.readText()).ops }.getOrDefault(emptyList())
        val sum = runCatching { Live.json.decodeFromString(FinishSummary.serializer(), summaryFile.readText()) }.getOrNull()
        return GymState(session = s, outbox = ops, summary = sum)
    }

    private fun write(f: File, text: String?) {
        dir.mkdirs()
        if (text == null) { f.delete(); return }
        val tmp = File(dir, f.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(f)) { f.writeText(text); tmp.delete() }
    }

    @Synchronized
    private fun set(persistSession: Boolean = false, persistOutbox: Boolean = false, persistSummary: Boolean = false, f: (GymState) -> GymState) {
        val next = f(_state.value)
        _state.value = next
        if (persistSession) write(sessionFile, next.session?.let(Live::encode))
        if (persistOutbox) write(outboxFile, Live.json.encodeToString(OutboxFile.serializer(), OutboxFile(next.outbox)))
        if (persistSummary) write(summaryFile, next.summary?.let { Live.json.encodeToString(FinishSummary.serializer(), it) })
        onChange(next)
    }

    /** Begin a session. [onServer]: created by POST /api/app/gym/start, so the server already has it. */
    fun start(s: LiveSession, onServer: Boolean) {
        set(persistSession = true, persistOutbox = !onServer, persistSummary = true) {
            it.copy(session = s, summary = null, outbox = if (onServer) it.outbox else Outbox.put(it.outbox, s, clock()))
        }
        if (!onServer) scheduleFlush(0)
    }

    /** Server has a session and this phone has none (e.g. started on the web): resume it. */
    fun adopt(s: LiveSession) {
        if (session != null) return
        if (_state.value.outbox.any { it.sessionId == s.id && (it.kind == OutOp.FINISH || it.kind == OutOp.DELETE) }) return
        set(persistSession = true) { it.copy(session = s) }
    }

    /** Apply a change to the session (a set, a note, the rest timer…). */
    fun update(f: (LiveSession) -> LiveSession) {
        var changed = false
        set(persistSession = true, persistOutbox = true) { st ->
            val cur = st.session ?: return@set st
            val next = f(cur)
            if (next == cur) return@set st
            changed = true
            st.copy(session = next, outbox = Outbox.put(st.outbox, next, clock()))
        }
        if (changed) scheduleFlush(debounceMs)
    }

    /** Throw the session away (asks first in the UI). */
    fun discard() {
        val s = session ?: return
        set(persistSession = true, persistOutbox = true) { it.copy(session = null, outbox = Outbox.delete(it.outbox, s.id, clock())) }
        scheduleFlush(0)
    }

    /** Finish: queue the upload, clear the session, show the summary. Works offline. */
    fun finish(prs: List<String> = emptyList()) {
        val s0 = session ?: return
        val now = clock()
        val s = s0.copy(restEndsAt = null)
        val sum = Live.summary(s, now)
        val t = transport()
        val summary = FinishSummary(
            sessionId = s.id, title = s.title, unit = s.unit, sets = sum.sets, volume = sum.volume, durationSec = sum.durationSec,
            exercises = sum.exercises, prs = prs, state = FinishState.SAVING, direct = t?.direct == true, program = !s.dayId.isNullOrEmpty(),
        )
        set(persistSession = true, persistOutbox = true, persistSummary = true) {
            it.copy(session = null, outbox = Outbox.finish(it.outbox, s, now), summary = summary)
        }
        scheduleFlush(0)
    }

    fun dismissSummary() = set(persistSummary = true) { it.copy(summary = null) }

    /** Manual retry (RETRY button, back online, app opened). */
    fun retry() {
        set(persistOutbox = true) { it.copy(outbox = Outbox.unblock(it.outbox), authError = false) }
        scheduleFlush(0)
    }

    /** A failed FINISH: put the session back to fix it (e.g. after mapping a lift on the web). */
    fun restoreFailed() {
        val op = _state.value.failedFinish ?: return
        val s = op.session ?: return
        set(persistSession = true, persistOutbox = true, persistSummary = true) {
            it.copy(session = s, outbox = Outbox.remove(it.outbox, op), summary = null)
        }
    }

    /** Drop a failed FINISH entirely. */
    fun dropFailed() {
        val op = _state.value.failedFinish ?: return
        set(persistOutbox = true, persistSummary = true) { st ->
            st.copy(outbox = Outbox.remove(st.outbox, op), summary = st.summary?.takeIf { it.sessionId != op.sessionId })
        }
    }

    private fun scheduleFlush(delayMs: Long) {
        debounce?.cancel()
        debounce = scope.launch {
            if (delayMs > 0) delay(delayMs)
            flush()
        }
    }

    /** Send everything queued, oldest first. Returns true when the queue is empty afterwards. */
    suspend fun flush(): Boolean = flushLock.withLock {
        while (true) {
            val op = Outbox.next(_state.value.outbox) ?: break
            val t = transport()
            if (t == null) {
                set { it.copy(syncError = "Not connected") }
                return@withLock false
            }
            set { it.copy(syncing = true) }
            try {
                when (op.kind) {
                    OutOp.PUT -> t.put(op.session!!)
                    OutOp.DELETE -> t.delete()
                    OutOp.FINISH -> {
                        val r = t.finish(op.session!!)
                        set(persistSummary = true) { st ->
                            st.copy(summary = st.summary?.takeIf { it.sessionId == op.sessionId }
                                ?.let { it.copy(state = FinishState.SAVED, workoutId = r.workoutId, demo = r.demo, error = null, prs = r.prs ?: it.prs, prsFromServer = r.prs != null) }
                                ?: st.summary)
                        }
                        onFinished()
                    }
                }
                set(persistOutbox = true) { it.copy(outbox = Outbox.remove(it.outbox, op), syncError = null, authError = false) }
            } catch (e: Exception) {
                val msg = e.message ?: e.javaClass.simpleName
                val auth = e is AuthException
                // A server error on FINISH is retried a few times then surfaced; 409 ("still being saved") is always retried.
                val retryable = e.isRetryable() && !(op.kind == OutOp.FINISH && e is ApiException && e.code != 409 && op.attempts >= 2)
                when {
                    auth -> set(persistOutbox = true) { it.copy(syncing = false, syncError = msg, authError = true) }
                    retryable -> {
                        set(persistOutbox = true, persistSummary = true) { st ->
                            st.copy(
                                syncing = false, syncError = if (e is ApiException) msg else "Offline · will retry",
                                outbox = Outbox.markAttempt(st.outbox, op, msg, failed = false),
                                summary = st.summary?.let { if (it.sessionId == op.sessionId && it.state == FinishState.SAVING) it.copy(state = FinishState.QUEUED) else it },
                            )
                        }
                        val attempt = _state.value.outbox.firstOrNull { it.kind == op.kind && it.at == op.at }?.attempts ?: 1
                        retry?.cancel()
                        retry = scope.launch { delay(Outbox.backoffMs(attempt)); flush() }
                        onRetryLater()
                    }
                    op.kind == OutOp.FINISH -> set(persistOutbox = true, persistSummary = true) { st ->
                        st.copy(
                            syncing = false, syncError = msg,
                            outbox = Outbox.markAttempt(st.outbox, op, msg, failed = true),
                            summary = (st.summary?.takeIf { it.sessionId == op.sessionId } ?: FinishSummary(sessionId = op.sessionId, title = op.session?.title.orEmpty(), unit = op.session?.unit ?: "kg"))
                                .copy(state = FinishState.FAILED, error = msg),
                        )
                    }
                    // A PUT/DELETE the server refuses (4xx) can't succeed later: drop it.
                    else -> set(persistOutbox = true) { it.copy(syncing = false, syncError = msg, outbox = Outbox.remove(it.outbox, op)) }
                }
                return@withLock false
            }
        }
        set { it.copy(syncing = false) }
        true
    }

    /** For tests: wait until queued work has been attempted. */
    suspend fun awaitIdle() {
        debounce?.join()
    }
}

/** Thrown by transports when there's nothing to send to (never connected). */
class NotConnectedException : IOException("Not connected")
