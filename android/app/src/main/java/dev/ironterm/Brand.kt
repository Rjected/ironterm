package dev.ironterm

/**
 * User-visible product name, in ONE place (plus `app_name` in res/values/strings.xml).
 * Renaming the app = change these two. Factual references to Hevy as the data source
 * ("Hevy API key", "sync from Hevy") are not branding and stay as they are.
 */
object Brand {
    const val NAME = "Ironterm"
    /** Logo text: the terminal brand block (amber block, black text), like the web app. */
    val logo: String get() = NAME.uppercase()
    /** Short tag in small widget headers. */
    val tag: String get() = NAME.uppercase()
}
