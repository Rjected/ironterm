package dev.ironterm.data.app

import android.content.Context
import kotlinx.serialization.KSerializer
import java.io.File

/**
 * Last good copy of every /api/app document on disk, so each screen opens instantly and works
 * offline (with an "offline · last sync" note). Body is ~260 KB, so it's cached per mode and only
 * refetched on pull-to-refresh or when stale.
 */
class AppCache(private val dir: File) {
    companion object {
        @Volatile private var instance: AppCache? = null
        fun get(context: Context): AppCache = instance ?: synchronized(this) {
            instance ?: AppCache(File(context.applicationContext.filesDir, "appcache")).also { instance = it }
        }
        fun override(c: AppCache?) { instance = c }
    }

    data class Entry<T>(val value: T, val savedAt: Long)

    private fun file(key: String) = File(dir, key.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".json")

    fun <T> read(key: String, ser: KSerializer<T>): Entry<T>? {
        val f = file(key)
        if (!f.exists()) return null
        return runCatching { Entry(AppJson.json.decodeFromString(ser, f.readText()), f.lastModified()) }.getOrNull()
    }

    fun <T> write(key: String, ser: KSerializer<T>, value: T) {
        dir.mkdirs()
        val f = file(key)
        val tmp = File(dir, f.name + ".tmp")
        tmp.writeText(AppJson.json.encodeToString(ser, value))
        if (!tmp.renameTo(f)) { f.writeText(tmp.readText()); tmp.delete() }
    }

    /** A workout was added: everything derived from history is stale (body figures included). */
    fun invalidateAfterWorkout() {
        dir.listFiles()?.forEach { it.setLastModified(0) }
    }

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
