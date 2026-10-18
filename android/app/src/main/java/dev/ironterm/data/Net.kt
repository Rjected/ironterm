package dev.ironterm.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

object Net {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

/** The credential was rejected (HTTP 401/403). The user has to reconnect. */
class AuthException(message: String = AUTH_MESSAGE) : IOException(message) {
    companion object {
        const val AUTH_MESSAGE = "Token revoked or invalid. Reconnect."
    }
}

class HttpStatusException(val code: Int, message: String) : IOException(message)

/** Normalises what the user typed into an origin like https://gym.example.com (no trailing slash). */
fun normalizeServerUrl(input: String): String? {
    var s = input.trim().trimEnd('/')
    if (s.isEmpty()) return null
    if (!s.startsWith("http://", true) && !s.startsWith("https://", true)) {
        if ("://" in s) return null // some other scheme
        s = "https://$s"
    }
    val url = s.toHttpUrlOrNull() ?: return null
    val port = if (url.port == okhttp3.HttpUrl.defaultPort(url.scheme)) "" else ":${url.port}"
    // HttpUrl.host is the bare address for IPv6 ("::1"); a URL needs it in brackets.
    val host = if (':' in url.host) "[${url.host}]" else url.host
    return "${url.scheme}://$host$port"
}

/** GET /api/snapshot with the app token. */
class ServerClient(
    private val client: OkHttpClient = Net.client,
) {
    suspend fun fetchSnapshot(serverUrl: String, token: String): Snapshot = withContext(Dispatchers.IO) {
        val base = normalizeServerUrl(serverUrl) ?: throw IOException("Invalid server URL")
        val req = Request.Builder().url("$base/api/snapshot")
            .header("Authorization", "Bearer $token")
            .header("accept", "application/json")
            .get().build()
        client.newCall(req).await().use { res ->
            val body = res.body?.string().orEmpty()
            when {
                res.code == 401 || res.code == 403 -> throw AuthException()
                !res.isSuccessful -> throw HttpStatusException(res.code, "Server error ${res.code}")
                else -> try {
                    SnapshotJson.parse(body).copy(origin = Snapshot.SOURCE_SERVER)
                } catch (e: Exception) {
                    throw IOException("Server sent an unexpected response (is this a ${dev.ironterm.Brand.NAME} server?)", e)
                }
            }
        }
    }
}

/** Runs the call so that cancelling the coroutine cancels the HTTP request (a hung server can't pin a sync). */
suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { runCatching { cancel() } }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resumeWithException(e) }
        override fun onResponse(call: Call, response: Response) {
            if (cont.isActive) cont.resume(response) else response.close()
        }
    })
}
