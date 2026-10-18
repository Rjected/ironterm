package dev.ironterm.data

/**
 * Text from a scanned QR code. The web app's SETUP → APPS & WIDGETS shows a QR holding exactly the
 * connect deep link, so scanning and tapping "Open in app" go through the same [DeepLink] parser.
 */
object ConnectCode {
    const val NOT_IRONTERM = "That QR isn't an Ironterm connect code. Open SETUP → APPS & WIDGETS in the web app and scan the code there."
    const val SCANNER_UNAVAILABLE = "QR scanner unavailable (needs Google Play services). Enter the server URL and app token below instead."

    sealed interface Result {
        data class Connect(val link: ConnectLink) : Result
        data class Invalid(val message: String) : Result
    }

    fun handle(scanned: String?): Result =
        DeepLink.parse(scanned?.trim())?.let { Result.Connect(it) } ?: Result.Invalid(NOT_IRONTERM)
}

/**
 * A connect link (deep link or QR) waiting for the user's OK. Nothing is stored and no request is
 * sent until they confirm: a link on a web page or a QR code can point at anyone's server.
 */
data class ConnectPrompt(
    val link: ConnectLink,
    /** host[:port], shown big in the dialog so a look-alike server is easy to spot */
    val host: String,
    /** plain http: the token and workouts travel unencrypted */
    val insecure: Boolean,
    /** what this would replace, when connected to something else */
    val replaces: String?,
) {
    companion object {
        fun of(link: ConnectLink, currentMode: SourceMode, currentServer: String?): ConnectPrompt {
            val current = currentServer?.takeIf { currentMode == SourceMode.SERVER && it.isNotBlank() }
            val replaces = when {
                currentMode == SourceMode.DIRECT -> "your Hevy API key connection"
                current != null && !current.equals(link.server, ignoreCase = true) -> current.substringAfter("://")
                else -> null
            }
            return ConnectPrompt(link, link.server.substringAfter("://"), link.server.startsWith("http://", ignoreCase = true), replaces)
        }
    }
}
