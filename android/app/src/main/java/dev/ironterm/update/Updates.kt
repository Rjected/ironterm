package dev.ironterm.update

import android.content.Context
import dev.ironterm.data.Net
import dev.ironterm.data.SnapshotJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException

/** A newer build published as a GitHub Release (tag `android-v<versionCode>`, asset `ironterm-*.apk`). */
@Serializable
data class UpdateInfo(
    val versionCode: Int,
    val tag: String,
    val name: String,
    val apkUrl: String,
    val apkName: String,
    val apkSize: Long = 0,
    val changelog: String = "",
    val pageUrl: String = "",
) {
    /** First non-empty line of the release notes, without Markdown heading/bullet marks. */
    val headline: String get() = changelog.lineSequence().map { it.trim().trimStart('#', '-', '*', ' ') }.firstOrNull { it.isNotBlank() }.orEmpty()
}

sealed interface CheckResult {
    data class Available(val info: UpdateInfo) : CheckResult
    data object UpToDate : CheckResult
    data class Failed(val message: String) : CheckResult
}

object ReleaseParser {
    private val TAG = Regex("""^android-v(\d+)$""")
    private val APK = Regex("""^ironterm-.*\.apk$""")

    @Serializable
    private data class Asset(val name: String = "", @SerialName("browser_download_url") val url: String = "", val size: Long = 0)

    @Serializable
    private data class Release(
        @SerialName("tag_name") val tag: String = "",
        val name: String? = null,
        val body: String? = null,
        val draft: Boolean = false,
        val prerelease: Boolean = false,
        @SerialName("html_url") val htmlUrl: String = "",
        val assets: List<Asset> = emptyList(),
    )

    /** versionCode from `android-v57`, null for any other tag. */
    fun versionCode(tag: String): Int? = TAG.matchEntire(tag.trim())?.groupValues?.get(1)?.toIntOrNull()

    /** Parses GET /repos/{repo}/releases/latest. Null when the tag or the APK asset is missing. */
    fun parse(json: String): UpdateInfo? {
        val r = runCatching { SnapshotJson.json.decodeFromString(Release.serializer(), json) }.getOrNull() ?: return null
        if (r.draft) return null
        val code = versionCode(r.tag) ?: return null
        val apk = r.assets.firstOrNull { APK.matches(it.name) && isHttps(it.url) } ?: return null
        return UpdateInfo(code, r.tag, r.name?.ifBlank { null } ?: r.tag, apk.url, apk.name, apk.size, r.body.orEmpty().trim(), r.htmlUrl)
    }

    fun isNewer(info: UpdateInfo?, currentVersionCode: Int): Boolean = info != null && info.versionCode > currentVersionCode

    /** An absolute https URL with a host. */
    private fun isHttps(url: String): Boolean =
        runCatching { java.net.URI(url) }.getOrNull()?.let { it.scheme.equals("https", true) && !it.host.isNullOrEmpty() } == true
}

class UpdateChecker(
    private val repo: String,
    private val currentVersionCode: Int,
    private val apiBase: String = "https://api.github.com",
) {
    suspend fun check(): CheckResult {
        val headers = mapOf("Accept" to "application/vnd.github+json", "X-GitHub-Api-Version" to "2022-11-28")
        return try {
            val res = Net.send("${apiBase.trimEnd('/')}/repos/$repo/releases/latest", headers = headers)
            when {
                res.code == 404 -> CheckResult.Failed("No releases published yet for $repo.")
                res.code == 403 || res.code == 429 -> CheckResult.Failed("GitHub rate limit reached. Try again later.")
                !res.isSuccessful -> CheckResult.Failed("GitHub error ${res.code}.")
                else -> {
                    val info = ReleaseParser.parse(res.body)
                        ?: return CheckResult.Failed("The latest release has no installable APK.")
                    if (ReleaseParser.isNewer(info, currentVersionCode)) CheckResult.Available(info) else CheckResult.UpToDate
                }
            }
        } catch (e: IOException) {
            CheckResult.Failed("Can't reach GitHub (${e.message ?: "offline"}).")
        }
    }
}

/** Last check time and the last update found, so app opens don't hit GitHub more than every 6 hours. */
class UpdateStore(context: Context) {
    private val p = context.applicationContext.getSharedPreferences("updates", Context.MODE_PRIVATE)
    var lastCheckAt: Long
        get() = p.getLong("last_check", 0)
        set(v) = p.edit().putLong("last_check", v).apply()
    var available: UpdateInfo?
        get() = p.getString("available", null)?.let { runCatching { SnapshotJson.json.decodeFromString(UpdateInfo.serializer(), it) }.getOrNull() }
        set(v) = p.edit().putString("available", v?.let { SnapshotJson.json.encodeToString(UpdateInfo.serializer(), it) }).apply()

    companion object { const val CHECK_EVERY_MS = 6L * 60 * 60 * 1000 }
}

object ApkDownloader {
    /**
     * Streams [info]'s APK into the app cache, reporting 0..1 progress (or -1 if size unknown).
     * HTTPS only, redirects included (GitHub answers with a 302 to its download host).
     * [requireHttps] is false only in tests, whose local server speaks plain http.
     */
    suspend fun download(context: Context, info: UpdateInfo, requireHttps: Boolean = true, onProgress: (Float) -> Unit): File =
        withContext(Dispatchers.IO) {
            if (requireHttps && !info.apkUrl.startsWith("https://", ignoreCase = true)) throw IOException("Refusing a non-HTTPS download")
            val dir = File(context.cacheDir, "updates").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() }
            val out = File(dir, "ironterm-${info.versionCode}.apk")
            Net.exchange(info.apkUrl, httpsOnly = requireHttps) { code, body, length ->
                if (code !in 200..299) throw IOException("Download failed (HTTP $code)")
                if (body == null) throw IOException("Empty download")
                val total = length.takeIf { it > 0 } ?: info.apkSize
                body.use { input ->
                    out.outputStream().use { o ->
                        val buf = ByteArray(64 * 1024)
                        var read = 0L
                        var lastReport = -1
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            o.write(buf, 0, n)
                            read += n
                            if (total > 0) {
                                val pct = (read * 100 / total).toInt()
                                if (pct != lastReport) { lastReport = pct; onProgress(read.toFloat() / total) }
                            } else onProgress(-1f)
                        }
                    }
                }
            }
            out
        }
}
