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

    const val MAX_REDIRECTS = 5

    /**
     * Sends a request and hands the status, body stream (null when there is none) and content
     * length (-1 if unknown) to [read]. The connection is closed afterwards.
     *
     * Redirects are followed here rather than by HttpURLConnection, so the rules are the same on
     * every Android version and in tests: up to [MAX_REDIRECTS] hops, to any host, never from
     * https to http, and with [httpsOnly] never to anything but https.
     */
    suspend fun <T> exchange(
        url: String,
        method: String = "GET",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        httpsOnly: Boolean = false,
        read: (code: Int, body: InputStream?, contentLength: Long) -> T,
    ): T {
        if (httpsOnly && !url.startsWith("https://", ignoreCase = true)) throw IOException("Refusing a non-HTTPS request")
        val current = java.util.concurrent.atomic.AtomicReference<HttpURLConnection?>()
        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { runCatching { current.get()?.disconnect() } }
            Dispatchers.IO.asExecutor().execute {
                val result = runCatching {
                    var target = url
                    var verb = method
                    var payload = body
                    var hops = 0
                    var sendHeaders = headers
                    while (true) {
                        val conn = open(target, verb, sendHeaders)
                        current.set(conn)
                        if (!cont.isActive) { conn.disconnect(); throw java.util.concurrent.CancellationException() }
                        try {
                            if (payload != null) {
                                val bytes = payload.toByteArray(Charsets.UTF_8)
                                conn.doOutput = true
                                if (!headers.keys.any { it.equals("content-type", true) }) conn.setRequestProperty("Content-Type", "application/json")
                                conn.setFixedLengthStreamingMode(bytes.size)
                                conn.outputStream.use { it.write(bytes) }
                            }
                            val code = conn.responseCode
                            val location = conn.getHeaderField("Location")
                            if (code in REDIRECTS && location != null) {
                                if (++hops > MAX_REDIRECTS) throw IOException("Too many redirects")
                                val next = redirectTarget(target, location, httpsOnly)
                                // credentials are for the origin they were meant for, never another host
                                if (origin(next) != origin(target)) sendHeaders = sendHeaders.filterKeys { it.lowercase() !in CREDENTIAL_HEADERS }
                                target = next
                                // 303, and 301/302 after a POST, continue as a GET without the body
                                if (code == 303 || ((code == 301 || code == 302) && verb != "GET" && verb != "HEAD")) { verb = "GET"; payload = null }
                                continue
                            }
                            // 4xx/5xx bodies come from errorStream; HEAD/204 have none
                            val stream = if (code >= 400) conn.errorStream else runCatching { conn.inputStream }.getOrNull()
                            return@runCatching read(code, stream, conn.contentLengthLong)
                        } finally {
                            conn.disconnect()
                        }
                    }
                    @Suppress("UNREACHABLE_CODE") error("unreachable")
                }
                // a cancelled continuation ignores the late result
                cont.resumeWith(result)
            }
        }
    }

    private val REDIRECTS = setOf(301, 302, 303, 307, 308)
    private val CREDENTIAL_HEADERS = setOf("authorization", "api-key", "cookie")

    private fun origin(url: String): String = runCatching {
        val u = URI(url)
        "${u.scheme?.lowercase()}://${u.host?.lowercase()}:${u.port}"
    }.getOrDefault(url)

    private fun open(url: String, method: String, headers: Map<String, String>): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            useCaches = false
            for ((k, v) in headers) setRequestProperty(k, v)
        }

    /** Where a redirect from [from] to [location] goes, or an IOException if it isn't allowed. */
    fun redirectTarget(from: String, location: String, httpsOnly: Boolean): String {
        val next = runCatching { URI(from).resolve(location.trim()) }.getOrNull() ?: throw IOException("Bad redirect")
        val scheme = next.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") throw IOException("Bad redirect")
        if (scheme != "https" && (httpsOnly || from.startsWith("https://", ignoreCase = true))) {
            throw IOException("Refusing a non-HTTPS redirect")
        }
        return next.toString()
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
                SnapshotJson.parse(res.body).copy(origin = Snapshot.SOURCE_SERVER)
            } catch (e: Exception) {
                throw IOException("Server sent an unexpected response (is this a ${dev.ironterm.Brand.NAME} server?)", e)
            }
        }
    }
}
