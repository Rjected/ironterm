package dev.ironterm.data

import android.content.Context
import kotlinx.serialization.Serializable
import java.io.File

/** Status of the most recent refresh attempt, kept next to the cached snapshot. */
@Serializable
data class SyncStatus(
    val lastSuccessAt: Long = 0,
    val lastAttemptAt: Long = 0,
    val lastError: String? = null,
    val authError: Boolean = false,
)

/**
 * The last good snapshot on disk, so the app and the widgets render offline. Widgets never hit the
 * network themselves: they read this file, and refreshes rewrite it then update the widgets.
 */
class SnapshotStore(private val dir: File) {
    companion object {
        fun get(context: Context) = SnapshotStore(context.applicationContext.filesDir)
    }

    private val snapFile get() = File(dir, "snapshot.json")
    private val statusFile get() = File(dir, "sync_status.json")

    fun read(): Snapshot? = runCatching { SnapshotJson.parse(snapFile.readText()) }.getOrNull()

    fun write(s: Snapshot) = atomicWrite(snapFile, SnapshotJson.encode(s))

    fun status(): SyncStatus = runCatching {
        SnapshotJson.json.decodeFromString(SyncStatus.serializer(), statusFile.readText())
    }.getOrDefault(SyncStatus())

    fun writeStatus(s: SyncStatus) = atomicWrite(statusFile, SnapshotJson.json.encodeToString(SyncStatus.serializer(), s))

    fun clear() {
        snapFile.delete()
        statusFile.delete()
    }

    private fun atomicWrite(f: File, text: String) {
        dir.mkdirs()
        val tmp = File(dir, f.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(f)) { f.writeText(text); tmp.delete() }
    }
}
