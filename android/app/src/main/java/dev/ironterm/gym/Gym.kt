package dev.ironterm.gym

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dev.ironterm.data.Settings
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppCache
import dev.ironterm.data.hevy.HevyApi
import dev.ironterm.work.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/** App-wide gym wiring: one [GymStore] per process, plus the rest-timer service and the GYM widget. */
object Gym {
    @Volatile private var instance: GymStore? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun store(context: Context): GymStore = instance ?: synchronized(this) {
        instance ?: create(context.applicationContext).also { instance = it }
    }

    /** For tests. */
    fun override(s: GymStore?) { instance = s }

    private fun create(ctx: Context): GymStore {
        var lastSession: LiveSession? = null
        var lastSummary: FinishSummary? = null
        return GymStore(
            dir = ctx.filesDir,
            transport = { transportFor(ctx) },
            scope = scope,
        ).also { store ->
            lastSession = store.session
            store.onChange = { st ->
                if (st.session !== lastSession || st.summary !== lastSummary) {
                    val started = lastSession == null && st.session != null
                    lastSession = st.session
                    lastSummary = st.summary
                    if (started) RestTimerService.start(ctx)
                    scope.launch { GymWidget.refresh(ctx) }
                }
            }
            store.onRetryLater = { GymSyncWorker.enqueue(ctx) }
            store.onFinished = {
                AppCache.get(ctx).invalidateAfterWorkout()
                SyncWorker.enqueueOneTime(ctx)
            }
        }
    }

    fun transportFor(ctx: Context): GymTransport? {
        val s = Settings.get(ctx)
        return when (s.mode) {
            SourceMode.SERVER -> {
                val url = s.serverUrl
                val token = s.appToken
                if (url.isNullOrBlank() || token.isNullOrBlank()) null else ServerGymTransport(AppApi(url, token))
            }
            SourceMode.DIRECT -> s.apiKey?.takeIf { it.isNotBlank() }?.let { DirectGymTransport(HevyApi(), it) }
            SourceMode.NONE -> null
        }
    }
}

class ServerGymTransport(private val api: AppApi) : GymTransport {
    override suspend fun put(s: LiveSession) = api.putLive(s)
    override suspend fun delete() = api.deleteLive()
    override suspend fun finish(s: LiveSession): Finished = api.finishLive(s).let { r ->
        Finished(r.workout.id.ifBlank { null }, r.demo, r.prs?.map { it.line() })
    }
}

/**
 * Direct mode (no server): nothing to keep in sync while training; FINISH posts the workout
 * straight to Hevy (POST /v1/workouts) with the API key. Exercises come from your own Hevy history,
 * so every one has a template id.
 */
class DirectGymTransport(private val hevy: HevyApi, private val apiKey: String) : GymTransport {
    companion object {
        /** Hevy wants every key, nulls included (superset_id, custom_metric…). */
        val HEVY_JSON = kotlinx.serialization.json.Json { explicitNulls = true; encodeDefaults = true }
    }
    override val direct: Boolean get() = true
    override suspend fun put(s: LiveSession) = Unit
    override suspend fun delete() = Unit
    override suspend fun finish(s: LiveSession): Finished {
        val body = Live.toHevyWorkout(s, { ex -> ex.templateId ?: throw dev.ironterm.data.app.ApiException(400, "${ex.displayName} has no Hevy exercise. Remove it and add it from the list.") })
        val text = HEVY_JSON.encodeToString(HevyWorkoutBody.serializer(), body)
        return Finished(hevy.createWorkout(apiKey, text))
    }
}

/** Durable retry for queued gym writes: runs when there's network, even after the app was killed. */
class GymSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        private const val NAME = "ironterm_gym_sync"
        fun enqueue(context: Context) {
            val req = OneTimeWorkRequestBuilder<GymSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, req)
        }
    }

    override suspend fun doWork(): Result {
        val store = Gym.store(applicationContext)
        store.retry()
        val empty = store.flush()
        val st = store.state.value
        return when {
            empty -> Result.success()
            st.authError || st.failedFinish != null -> Result.failure()
            runAttemptCount > 20 -> Result.failure()
            else -> Result.retry()
        }
    }
}
