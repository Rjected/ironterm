package dev.ironterm.testing

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * A tiny HTTP/1.1 server for tests on a plain [ServerSocket] (one request per connection,
 * `Connection: close`), with the slice of OkHttp MockWebServer's API the tests use: a dispatcher
 * or queued responses, and recorded requests.
 */
class MockWebServer {
    private var socket: ServerSocket? = null
    private var pool: ExecutorService? = null
    private val queue = LinkedBlockingQueue<MockResponse>()
    private val requests = LinkedBlockingQueue<RecordedRequest>()
    private val count = AtomicInteger()

    /** Answers each request; defaults to the [enqueue]d responses in order (404 when none are left). */
    var dispatcher: Dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse = queue.poll() ?: MockResponse().setResponseCode(404)
    }

    val requestCount: Int get() = count.get()

    fun enqueue(response: MockResponse) { queue.add(response) }

    fun start() {
        val s = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
        val p = Executors.newCachedThreadPool { r -> Thread(r, "mock-web-server").apply { isDaemon = true } }
        socket = s
        pool = p
        p.execute {
            while (!s.isClosed) {
                val client = try { s.accept() } catch (_: Exception) { break }
                p.execute { handle(client) }
            }
        }
    }

    fun shutdown() {
        runCatching { socket?.close() }
        pool?.shutdownNow()
    }

    val port: Int get() = socket!!.localPort

    fun url(path: String): HttpUrl = HttpUrl("http://127.0.0.1:$port" + (if (path.startsWith("/")) path else "/$path"))

    fun takeRequest(): RecordedRequest = requests.take()

    fun takeRequest(timeout: Long, unit: TimeUnit): RecordedRequest? = requests.poll(timeout, unit)

    private fun handle(client: Socket) {
        client.use { sock ->
            try {
                val input = BufferedInputStream(sock.getInputStream())
                val (method, target) = readLine(input).split(' ').let { it[0] to it[1] }
                val headers = LinkedHashMap<String, String>()
                while (true) {
                    val line = readLine(input)
                    if (line.isEmpty()) break
                    val i = line.indexOf(':')
                    if (i > 0) headers[line.substring(0, i).trim()] = line.substring(i + 1).trim()
                }
                val length = headers.entries.firstOrNull { it.key.equals("content-length", true) }?.value?.toInt() ?: 0
                val body = ByteArray(length)
                var read = 0
                while (read < length) {
                    val n = input.read(body, read, length - read)
                    if (n < 0) break
                    read += n
                }
                val q = target.indexOf('?')
                val req = RecordedRequest(method, if (q < 0) target else target.substring(0, q), if (q < 0) null else target.substring(q + 1), headers, body)
                count.incrementAndGet()
                requests.add(req)
                val res = dispatcher.dispatch(req)
                val bytes = res.body.toByteArray(Charsets.UTF_8)
                val head = StringBuilder("HTTP/1.1 ${res.code} ${reason(res.code)}\r\n")
                for ((k, v) in res.headers) head.append("$k: $v\r\n")
                head.append("Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n")
                val out = sock.getOutputStream()
                out.write(head.toString().toByteArray(Charsets.UTF_8))
                out.write(bytes)
                out.flush()
            } catch (_: Exception) {
                // shutdown mid-request or the client went away
            }
        }
    }

    private fun readLine(input: InputStream): String {
        val buf = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b < 0 || b == '\n'.code) break
            if (b != '\r'.code) buf.write(b)
        }
        return buf.toString("UTF-8")
    }

    private fun reason(code: Int) = when (code) {
        200 -> "OK"; 201 -> "Created"; 204 -> "No Content"; 400 -> "Bad Request"; 401 -> "Unauthorized"; 403 -> "Forbidden"
        404 -> "Not Found"; 409 -> "Conflict"; 429 -> "Too Many Requests"; 500 -> "Internal Server Error"; 502 -> "Bad Gateway"
        else -> "Status"
    }
}

abstract class Dispatcher {
    abstract fun dispatch(request: RecordedRequest): MockResponse
}

class MockResponse {
    var code = 200
        private set
    var body = ""
        private set
    val headers = mutableListOf<Pair<String, String>>()

    fun setResponseCode(code: Int) = apply { this.code = code }
    fun setBody(body: String) = apply { this.body = body }
    fun setHeader(name: String, value: String) = apply { headers.removeAll { it.first.equals(name, true) }; headers.add(name to value) }
}

class HttpUrl(private val url: String) {
    private val uri = java.net.URI(url)
    val encodedPath: String get() = uri.rawPath
    fun queryParameter(name: String): String? = uri.rawQuery?.split('&')
        ?.map { it.split('=', limit = 2) }
        ?.firstOrNull { URLDecoder.decode(it[0], "UTF-8") == name }
        ?.let { URLDecoder.decode(it.getOrElse(1) { "" }, "UTF-8") }
    override fun toString() = url
}

class RecordedRequest(
    val method: String,
    private val rawPath: String,
    private val rawQuery: String?,
    private val headers: Map<String, String>,
    bodyBytes: ByteArray,
) {
    /** Path plus query, like MockWebServer's. */
    val path: String get() = rawPath + (rawQuery?.let { "?$it" } ?: "")
    val requestUrl: HttpUrl? get() = HttpUrl("http://127.0.0.1$path")
    val body = Body(bodyBytes)

    fun getHeader(name: String): String? = headers.entries.firstOrNull { it.key.equals(name, true) }?.value

    class Body(private val bytes: ByteArray) {
        fun readUtf8(): String = bytes.toString(Charsets.UTF_8)
    }
}
