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
