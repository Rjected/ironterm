package dev.ironterm.data

import dev.ironterm.data.direct.DirectAggregator
import dev.ironterm.data.hevy.HevyApi
import dev.ironterm.data.direct.WorkoutsRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.IOException
import java.net.UnknownHostException
import java.time.Instant
import java.time.ZoneId

sealed interface RefreshResult {
    data class Ok(val snapshot: Snapshot) : RefreshResult
    data class Failed(val message: String, val auth: Boolean) : RefreshResult
    data object NotConfigured : RefreshResult
    /** The user connected to another source while this ran: nothing was written. */
    data object Superseded : RefreshResult
}

/**
 * Fetches a fresh snapshot from whichever source is configured, writes it to the [SnapshotStore]
 * and records the outcome. A failure keeps the previous snapshot so widgets keep rendering.
 */
class Refresher(
    private val settings: Settings,
    private val store: SnapshotStore,
    private val filesDir: File,
    private val server: ServerClient = ServerClient(),
    private val hevyApi: HevyApi = HevyApi(),
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        /** One sync at a time per source; a sync to an old server never blocks one to the new server. */
        private val locks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()
    }

    suspend fun refresh(forceFull: Boolean = false): RefreshResult {
        val key = settings.sourceKey
        return locks.getOrPut(key) { Mutex() }.withLock { refreshLocked(key, forceFull) }
    }

    private suspend fun refreshLocked(key: String, forceFull: Boolean): RefreshResult {
        val now = clock()
        val result = try {
            when (settings.mode) {
                SourceMode.SERVER -> {
                    val url = settings.serverUrl
                    val token = settings.appToken
                    if (url.isNullOrBlank() || token.isNullOrBlank()) RefreshResult.NotConfigured
                    else RefreshResult.Ok(server.fetchSnapshot(url, token))
                }
                SourceMode.DIRECT -> {
                    val key = settings.apiKey
                    if (key.isNullOrBlank()) RefreshResult.NotConfigured
                    else RefreshResult.Ok(buildDirect(key, forceFull))
                }
                SourceMode.NONE -> RefreshResult.NotConfigured
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e // cancelled (e.g. the user connected elsewhere): record nothing
        } catch (e: AuthException) {
            RefreshResult.Failed(e.message ?: AuthException.AUTH_MESSAGE, auth = true)
        } catch (e: UnknownHostException) {
            RefreshResult.Failed("Offline or server unreachable. Showing the last sync.", auth = false)
        } catch (e: IOException) {
            RefreshResult.Failed(e.message ?: "Network error", auth = false)
        } catch (e: Exception) {
            RefreshResult.Failed(e.message ?: e.javaClass.simpleName, auth = false)
        }
        // Connected to another source meanwhile: this result belongs to the old one, drop it.
        if (settings.sourceKey != key) return RefreshResult.Superseded
        val prev = store.status()
        when (result) {
            is RefreshResult.Ok -> {
                store.write(result.snapshot)
                store.writeStatus(SyncStatus(lastSuccessAt = now, lastAttemptAt = now))
            }
            is RefreshResult.Failed -> store.writeStatus(prev.copy(lastAttemptAt = now, lastError = result.message, authError = result.auth))
            RefreshResult.NotConfigured, RefreshResult.Superseded -> Unit
        }
        return result
    }

    private suspend fun buildDirect(apiKey: String, forceFull: Boolean): Snapshot {
        val repo = WorkoutsRepository(filesDir, hevyApi, clock)
        val workouts = repo.sync(apiKey, forceFull)
        val z = zone()
        val today = Instant.ofEpochMilli(clock()).atZone(z).toLocalDate()
        return DirectAggregator.build(workouts, today, z, settings.directUnit, settings.weeklyTarget, Instant.ofEpochMilli(clock()))
    }

    /** Checks credentials without touching the cache. Returns null on success, else an error message. */
    suspend fun test(mode: SourceMode, serverUrl: String?, token: String?, apiKey: String?): String? = try {
        when (mode) {
            SourceMode.SERVER -> { server.fetchSnapshot(serverUrl.orEmpty(), token.orEmpty()); null }
            SourceMode.DIRECT -> { hevyApi.getWorkouts(apiKey.orEmpty(), 1, 1); null }
            SourceMode.NONE -> "Choose a source"
        }
    } catch (e: AuthException) {
        e.message
    } catch (e: UnknownHostException) {
        "Can't reach ${serverUrl ?: "api.hevyapp.com"}"
    } catch (e: Exception) {
        e.message ?: e.javaClass.simpleName
    }
}
