package dev.ironterm.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * The foreground sync: at most one at a time. [restart] (after connecting to another source) cancels
 * the running one, which may be stuck on the old server, and starts a fresh one right away.
 * Results of a cancelled or superseded run never reach [onDone].
 */
class SyncRunner(private val scope: CoroutineScope, private val refresher: () -> Refresher) {
    private var job: Job? = null
    private var generation = 0

    val running: Boolean get() = job?.isActive == true

    /** Starts a sync unless one is running. Returns the job, or null when one was already running. */
    fun start(onDone: suspend (RefreshResult) -> Unit): Job? = if (running) null else launch(onDone)

    /** Cancels any running sync and starts a new one. */
    fun restart(onDone: suspend (RefreshResult) -> Unit): Job {
        job?.cancel()
        return launch(onDone)
    }

    private fun launch(onDone: suspend (RefreshResult) -> Unit): Job {
        val g = ++generation
        return scope.launch {
            val r = refresher().refresh()
            if (g == generation && r != RefreshResult.Superseded) onDone(r)
        }.also { job = it }
    }
}
