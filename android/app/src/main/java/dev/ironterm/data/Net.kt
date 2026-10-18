package dev.ironterm.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** One finished HTTP exchange: status and the body as text (error bodies included). */
class HttpResponse(val code: Int, val body: String) {
    val isSuccessful: Boolean get() = code in 200..299
}

/**
 * The app's HTTP client: the platform's [HttpURLConnection] (TLS, proxies and HTTP/1.1 keep-alive
 * come from Android). Requests run on [Dispatchers.IO]; cancelling the coroutine disconnects the
 * socket, so a hung server can't pin a sync.
 */
object Net {
    const val CONNECT_TIMEOUT_MS = 20_000
    const val READ_TIMEOUT_MS = 30_000

    /** Sends a request and reads the whole body as UTF-8. */
    suspend fun send(url: String, method: String = "GET", headers: Map<String, String> = emptyMap(), body: String? = null): HttpResponse =
        exchange(url, method, headers, body) { code, stream, _ -> HttpResponse(code, stream?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()) }

    /**
     * Sends a request and hands the status, body stream (null when there is none) and content
     * length (-1 if unknown) to [read]. The connection is closed afterwards.
     */
    suspend fun <T> exchange(
        url: String,
        method: String = "GET",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        read: (code: Int, body: InputStream?, contentLength: Long) -> T,
    ): T {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            useCaches = false
            for ((k, v) in headers) setRequestProperty(k, v)
        }
        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { runCatching { conn.disconnect() } }
            Dispatchers.IO.asExecutor().execute {
                val result = runCatching {
                    try {
                        if (body != null) {
                            val bytes = body.toByteArray(Charsets.UTF_8)
                            conn.doOutput = true
                            if (!headers.keys.any { it.equals("content-type", true) }) conn.setRequestProperty("Content-Type", "application/json")
                            conn.setFixedLengthStreamingMode(bytes.size)
                            conn.outputStream.use { it.write(bytes) }
                        }
                        val code = conn.responseCode
                        // 4xx/5xx bodies come from errorStream; HEAD/204 have none
                        val stream = if (code >= 400) conn.errorStream else runCatching { conn.inputStream }.getOrNull()
                        read(code, stream, conn.contentLengthLong)
                    } finally {
                        conn.disconnect()
                    }
                }
                // a cancelled continuation ignores the late result
                cont.resumeWith(result)
            }
        }
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
    val uri = runCatching { URI(s) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase() ?: return null
    if (uri.rawAuthority?.endsWith(":") != false) return null // "host:" with no port
    val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
    val port = uri.port.takeIf { it != -1 && it != (if (scheme == "https") 443 else 80) }?.let { ":$it" } ?: ""
    return "$scheme://$host$port"
}

/** GET /api/snapshot with the app token. */
class ServerClient {
    suspend fun fetchSnapshot(serverUrl: String, token: String): Snapshot {
        val base = normalizeServerUrl(serverUrl) ?: throw IOException("Invalid server URL")
        val res = Net.send("$base/api/snapshot", headers = mapOf("Authorization" to "Bearer $token", "accept" to "application/json"))
        return when {
            res.code == 401 || res.code == 403 -> throw AuthException()
            !res.isSuccessful -> throw HttpStatusException(res.code, "Server error ${res.code}")
            else -> try {
                SnapshotJson.parse(res.body).copy(source = Snapshot.SOURCE_SERVER)
            } catch (e: Exception) {
                throw IOException("Server sent an unexpected response (is this a ${dev.ironterm.Brand.NAME} server?)", e)
            }
        }
    }
}
