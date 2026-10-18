package dev.ironterm.data.app

import android.content.Context
import dev.ironterm.data.AuthException
import dev.ironterm.data.Settings
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SourceMode
import dev.ironterm.data.direct.DirectApp
import dev.ironterm.data.direct.WorkoutsRepository
import kotlinx.serialization.KSerializer
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.time.LocalDate
import java.time.ZoneId

/**
 * Screen state for one document: what to show and how fresh it is.
 *  - loading with no data → skeleton; error with no data → error card with RETRY;
 *  - data + error → the cached copy with an "offline" note; [needsServer] → Direct-mode explainer.
 */
data class Load<out T>(
    val data: T? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val savedAt: Long = 0,
    val needsServer: Boolean = false,
    val auth: Boolean = false,
) {
    companion object {
        fun <T> loading() = Load<T>(loading = true)
        fun <T> of(v: T, savedAt: Long = 0) = Load(data = v, savedAt = savedAt)
        fun <T> failed(msg: String) = Load<T>(error = msg)
        fun <T> server() = Load<T>(needsServer = true)
    }
}

fun friendly(e: Throwable): String = when (e) {
    is AuthException -> e.message ?: AuthException.AUTH_MESSAGE
    is UnknownHostException, is ConnectException -> "Offline or server unreachable."
    is SocketTimeoutException -> "The server took too long to answer."
    is ApiException -> if (e.code == 404) "Not found on the server (update the server?)" else e.message ?: "Server error ${e.code}"
    is IOException -> e.message ?: "Network error"
    else -> e.message ?: e.javaClass.simpleName
}

/** Fetches screen documents from the configured source, caching server responses on disk. */
class AppRepo(
    private val settings: Settings,
    private val cache: AppCache,
    private val filesDir: java.io.File,
    private val snapshots: SnapshotStore,
    private val apiFactory: (String, String) -> AppApi = { u, t -> AppApi(u, t) },
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val today: () -> LocalDate = { LocalDate.now(zone()) },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        fun get(context: Context) = AppRepo(Settings.get(context), AppCache.get(context), context.applicationContext.filesDir, SnapshotStore.get(context))
    }

    val mode: SourceMode get() = settings.mode

    fun api(): AppApi? {
        if (settings.mode != SourceMode.SERVER) return null
        val u = settings.serverUrl ?: return null
        val t = settings.appToken ?: return null
        return runCatching { apiFactory(u, t) }.getOrNull()
    }

    private var directCache: Pair<Long, DirectApp>? = null

    /** Direct mode: documents from the cached Hevy workouts (rebuilt when the cache file changes). */
    fun direct(): DirectApp {
        val f = java.io.File(filesDir, "direct_workouts.json")
        val stamp = f.lastModified() xor settings.directUnit.hashCode().toLong()
        directCache?.takeIf { it.first == stamp }?.let { return it.second }
        val d = DirectApp(WorkoutsRepository(filesDir).cached(), settings.directUnit, zone(), today())
        directCache = stamp to d
        return d
    }

    fun <T> cached(key: String, ser: KSerializer<T>): Load<T>? = cache.read(key, ser)?.let { Load.of(it.value, it.savedAt) }

    /**
     * Server document [key]: cached copy if younger than [maxAgeMs] (unless [force]), else fetch.
     * On failure the cached copy is returned with the error.
     */
    suspend fun <T> server(key: String, ser: KSerializer<T>, force: Boolean, maxAgeMs: Long, fetch: suspend (AppApi) -> T): Load<T> {
        val c = cache.read(key, ser)
        if (!force && c != null && clock() - c.savedAt < maxAgeMs) return Load.of(c.value, c.savedAt)
        val api = api() ?: return c?.let { Load(it.value, savedAt = it.savedAt, error = "Not connected") } ?: Load.failed("Not connected. Open SETUP.")
        return try {
            val v = fetch(api)
            cache.write(key, ser, v)
            Load.of(v, clock())
        } catch (e: Exception) {
            Load(data = c?.value, savedAt = c?.savedAt ?: 0, error = friendly(e), auth = e is AuthException)
        }
    }

    /** Same, for Direct mode or [SourceMode.NONE]: compute locally or explain. */
    suspend fun <T> load(key: String, ser: KSerializer<T>, force: Boolean, maxAgeMs: Long, direct: ((DirectApp) -> T?)?, fetch: suspend (AppApi) -> T): Load<T> =
        when (settings.mode) {
            SourceMode.SERVER -> server(key, ser, force, maxAgeMs, fetch)
            SourceMode.DIRECT -> if (direct == null) Load.server() else direct(direct())?.let { Load.of(it, snapshots.status().lastSuccessAt) } ?: Load.failed("No data yet. Pull to sync.")
            SourceMode.NONE -> Load.failed("Not connected. Open SETUP.")
        }
}
