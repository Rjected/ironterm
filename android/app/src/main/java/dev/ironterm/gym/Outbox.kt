package dev.ironterm.gym

import kotlinx.serialization.Serializable

/**
 * Pending server writes for gym mode, persisted so they survive process death and go out when the
 * network is back. Pure list operations (unit tested); [GymStore] owns the file and the sending.
 *
 * The server keeps ONE live session, so writes coalesce:
 *  - PUT replaces an older PUT (only the latest state matters),
 *  - DELETE drops pending PUTs,
 *  - FINISH drops that session's PUTs/DELETEs (finishing clears the server's live session too).
 * Operations are sent in order, oldest first.
 */
@Serializable
data class OutOp(
    val kind: String,
    val sessionId: String,
    val session: LiveSession? = null,
    val at: Long = 0,
    val attempts: Int = 0,
    /** server rejected it (not a network error): stays queued but isn't retried automatically */
    val failed: Boolean = false,
    val error: String? = null,
) {
    companion object {
        const val PUT = "put"
        const val DELETE = "delete"
        const val FINISH = "finish"
    }
}

@Serializable
data class OutboxFile(val ops: List<OutOp> = emptyList())

object Outbox {
    fun put(ops: List<OutOp>, s: LiveSession, now: Long): List<OutOp> {
        if (ops.any { it.kind == OutOp.FINISH && it.sessionId == s.id }) return ops // already finished
        return ops.filterNot { it.kind == OutOp.PUT } + OutOp(OutOp.PUT, s.id, s, now)
    }

    fun delete(ops: List<OutOp>, sessionId: String, now: Long): List<OutOp> {
        val rest = ops.filterNot { it.kind == OutOp.PUT || it.kind == OutOp.DELETE }
        return rest + OutOp(OutOp.DELETE, sessionId, null, now)
    }

    fun finish(ops: List<OutOp>, s: LiveSession, now: Long): List<OutOp> {
        val rest = ops.filterNot { (it.kind == OutOp.PUT || it.kind == OutOp.DELETE) && it.sessionId == s.id || it.kind == OutOp.FINISH && it.sessionId == s.id }
        // A DELETE for another (older) session still has to go out first; a PUT for another one is moot.
        return rest.filterNot { it.kind == OutOp.PUT } + OutOp(OutOp.FINISH, s.id, s, now)
    }

    /** Next op to send automatically, or null (empty, or blocked behind a failed one). */
    fun next(ops: List<OutOp>): OutOp? = ops.firstOrNull()?.takeIf { !it.failed }

    fun remove(ops: List<OutOp>, op: OutOp): List<OutOp> = ops.filterNot { it.kind == op.kind && it.sessionId == op.sessionId && it.at == op.at }

    fun markAttempt(ops: List<OutOp>, op: OutOp, error: String?, failed: Boolean): List<OutOp> = ops.map {
        if (it.kind == op.kind && it.sessionId == op.sessionId && it.at == op.at) it.copy(attempts = it.attempts + 1, error = error, failed = failed) else it
    }

    /** Manual retry: clear the failed flags. */
    fun unblock(ops: List<OutOp>): List<OutOp> = ops.map { it.copy(failed = false) }

    fun pendingFinishes(ops: List<OutOp>): List<OutOp> = ops.filter { it.kind == OutOp.FINISH }

    /** Backoff before automatic retry number [attempt] (1-based): 2s, 5s, 15s, 30s, then every 60s. */
    fun backoffMs(attempt: Int): Long = when (attempt) {
        0, 1 -> 2_000
        2 -> 5_000
        3 -> 15_000
        4 -> 30_000
        else -> 60_000
    }
}
