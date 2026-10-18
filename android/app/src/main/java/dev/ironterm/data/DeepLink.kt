package dev.ironterm.data

import java.net.URI
import java.net.URLDecoder

/** ironterm://connect?server=<urlencoded origin>&token=<ht_…> */
data class ConnectLink(val server: String, val token: String)

object DeepLink {
    const val SCHEME = "ironterm"
    const val HOST = "connect"

    /** Returns null for anything that isn't a well-formed connect link. Pure JVM, unit tested. */
    fun parse(link: String?): ConnectLink? {
        if (link.isNullOrBlank()) return null
        val uri = runCatching { URI(link.trim()) }.getOrNull() ?: return null
        if (!uri.scheme.equals(SCHEME, ignoreCase = true)) return null
        // ironterm://connect?… has host "connect"; tolerate ironterm:connect?… too
        val target = uri.host ?: uri.schemeSpecificPart?.substringBefore('?')?.trimStart('/')
        if (!target.equals(HOST, ignoreCase = true)) return null
        val query = uri.rawQuery ?: return null
        val params = query.split('&').mapNotNull { part ->
            val i = part.indexOf('=')
            if (i <= 0) null else {
                val k = URLDecoder.decode(part.substring(0, i), "UTF-8")
                val v = URLDecoder.decode(part.substring(i + 1), "UTF-8")
                k to v
            }
        }.toMap()
        val server = params["server"]?.let { normalizeServerUrl(it) } ?: return null
        val token = params["token"]?.trim()?.takeIf { it.startsWith("ht_") && it.length > 3 && it.none(Char::isWhitespace) } ?: return null
        return ConnectLink(server, token)
    }
}
