package dev.ironterm.data


/**
 * Plain-http servers. The app allows them (a self-hosted server on a home network is often http),
 * but over the internet the app token and workouts would travel readable by anyone on the path.
 * [warning] tells the user before they connect; private and loopback addresses don't get one.
 */
object Cleartext {
    const val WARNING = "! Plain http to a public address: your app token and workouts travel unencrypted. Use https, or http only on your own network or VPN."

    /** A warning for http:// to a host that isn't on a private network, else null. */
    fun warning(serverUrl: String): String? {
        // no scheme typed means https (normalizeServerUrl)
        val url = serverUrl.trim().takeIf { it.startsWith("http://", ignoreCase = true) } ?: return null
        val host = hostOf(url) ?: return null
        return if (isPrivateHost(host)) null else WARNING
    }

    /** The host of an http(s) URL (IPv6 keeps its brackets), or null if there is none. */
    internal fun hostOf(url: String): String? {
        val authority = url.substringAfter("://").takeWhile { it != '/' && it != '?' && it != '#' }.substringAfterLast('@')
        val host = if (authority.startsWith("[")) authority.substringBefore(']') + "]" else authority.substringBefore(':')
        return host.takeIf { it.isNotEmpty() && it != "[]" }
    }

    /** Loopback, LAN, link-local, CGNAT/Tailscale, and names that only resolve locally. */
    fun isPrivateHost(host: String): Boolean {
        val h = host.lowercase().trimEnd('.').removePrefix("[").removeSuffix("]")
        if (h.isEmpty()) return false
        ipv4(h)?.let { (a, b) ->
            return a == 10 || a == 127 || (a == 172 && b in 16..31) || (a == 192 && b == 168) ||
                (a == 169 && b == 254) || (a == 100 && b in 64..127)
        }
        if (':' in h) { // IPv6 literal
            return h == "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe8") ||
                h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")
        }
        if ('.' !in h) return true // single-label LAN name ("nas", "localhost")
        return LOCAL_SUFFIXES.any { h.endsWith(it) }
    }

    private val LOCAL_SUFFIXES = listOf(".localhost", ".local", ".lan", ".home.arpa", ".internal", ".ts.net")

    /** First two octets of a dotted-quad IPv4 address, or null. */
    private fun ipv4(h: String): Pair<Int, Int>? {
        val parts = h.split('.')
        if (parts.size != 4) return null
        val n = parts.map { p -> p.toIntOrNull()?.takeIf { it in 0..255 && p.isNotEmpty() && p.all(Char::isDigit) } ?: return null }
        return n[0] to n[1]
    }
}
