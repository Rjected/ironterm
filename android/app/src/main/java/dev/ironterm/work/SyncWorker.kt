package dev.ironterm.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dev.ironterm.data.Refresher
import dev.ironterm.data.RefreshResult
import dev.ironterm.data.Settings
import dev.ironterm.data.SnapshotStore
import dev.ironterm.widget.Widgets
import java.util.concurrent.TimeUnit

/** Background refresh: fetch a snapshot from the configured source, cache it, redraw widgets. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    companion object {
        private const val PERIODIC = "ironterm_sync_periodic"
        private const val ONE_TIME = "ironterm_sync_one_time"
        /** Server syncs Hevy every 15 min; 30 min keeps widgets fresh without draining battery. */
        const val PERIOD_MINUTES = 30L

        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(network)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
        }

        fun enqueueOneTime(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.REPLACE, req)
        }

        fun cancelPeriodic(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        }
    }

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val refresher = Refresher(Settings.get(ctx), SnapshotStore.get(ctx), ctx.filesDir)
        val r = refresher.refresh()
        Widgets.updateAll(ctx) // also redraws error/auth state
        if (r is RefreshResult.Ok) runCatching { SocialNotifier.check(ctx) }
        return when (r) {
            is RefreshResult.Ok, RefreshResult.NotConfigured, RefreshResult.Superseded -> Result.success()
            is RefreshResult.Failed -> if (r.auth || runAttemptCount >= 3) Result.failure() else Result.retry()
        }
    }
}
