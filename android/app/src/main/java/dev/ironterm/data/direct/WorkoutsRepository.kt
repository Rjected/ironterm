package dev.ironterm.data.direct

import dev.ironterm.data.SnapshotJson
import dev.ironterm.data.hevy.HevyApi
import dev.ironterm.data.hevy.Workout
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.time.OffsetDateTime

/**
 * Direct mode workout store: keeps every workout from the Hevy API in a JSON file so a refresh only
 * fetches what's new. Hevy returns workouts newest first, so an incremental refresh pages until
 * it reaches a workout it already has. Once a day it re-fetches everything to pick up edits and
 * deletions of older workouts.
 */
class WorkoutsRepository(
    private val dir: File,
    private val api: HevyApi = HevyApi(),
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        private const val FILE = "direct_workouts.json"
        const val FULL_EVERY_MS = 24L * 60 * 60 * 1000
        private const val MAX_PAGES = 500
    }

    @Serializable
    private data class Cache(val lastFullAt: Long = 0, val apiKeyHash: Int = 0, val workouts: List<Workout> = emptyList())

    private val file get() = File(dir, FILE)

    private fun load(): Cache = runCatching {
        SnapshotJson.json.decodeFromString(Cache.serializer(), file.readText())
    }.getOrDefault(Cache())

    private fun save(c: Cache) {
        dir.mkdirs()
        val tmp = File(dir, "$FILE.tmp")
        tmp.writeText(SnapshotJson.json.encodeToString(Cache.serializer(), c))
        tmp.renameTo(file)
    }

    fun cached(): List<Workout> = load().workouts

    fun clear() { file.delete() }

    /** Returns all workouts (cached + new). Throws on network/auth errors. */
    suspend fun sync(apiKey: String, forceFull: Boolean = false): List<Workout> {
        val cache = load()
        val sameKey = cache.apiKeyHash == apiKey.hashCode()
        val full = forceFull || !sameKey || cache.workouts.isEmpty() || clock() - cache.lastFullAt > FULL_EVERY_MS
        val result = if (full) fetchAll(apiKey) else fetchNew(apiKey, cache.workouts)
        save(Cache(if (full) clock() else cache.lastFullAt, apiKey.hashCode(), result))
        return result
    }

    private suspend fun fetchAll(apiKey: String): List<Workout> {
        val all = ArrayList<Workout>()
        var page = 1
        var pageCount = 1
        while (page <= pageCount && page <= MAX_PAGES) {
            val res = api.getWorkouts(apiKey, page)
            all.addAll(res.workouts)
            pageCount = res.pageCount
            if (res.workouts.isEmpty()) break
            page++
        }
        return all.distinctBy { it.id }
    }

    private suspend fun fetchNew(apiKey: String, have: List<Workout>): List<Workout> {
        val known = have.associateBy { it.id }
        val newestKnown = have.maxOfOrNull { startMillis(it) } ?: Long.MIN_VALUE
        val fresh = ArrayList<Workout>()
        var page = 1
        var pageCount = 1
        while (page <= pageCount && page <= MAX_PAGES) {
            val res = api.getWorkouts(apiKey, page)
            fresh.addAll(res.workouts)
            pageCount = res.pageCount
            // Stop once this page reaches workouts we already have (and nothing on it changed).
            val reachedOld = res.workouts.any { w -> startMillis(w) < newestKnown || (known[w.id]?.updatedAt == w.updatedAt && w.id in known) }
            if (res.workouts.isEmpty() || reachedOld) break
            page++
        }
        val merged = LinkedHashMap<String, Workout>()
        for (w in fresh) merged[w.id] = w
        for (w in have) merged.putIfAbsent(w.id, w)
        return merged.values.sortedByDescending { startMillis(it) }
    }

    private fun startMillis(w: Workout): Long =
        runCatching { OffsetDateTime.parse(w.startTime).toInstant().toEpochMilli() }.getOrDefault(0L)
}
