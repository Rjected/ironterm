package dev.ironterm.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.Locale

enum class SourceMode { NONE, SERVER, DIRECT }

/**
 * App settings and credentials. Backed by EncryptedSharedPreferences in the app; tests pass plain prefs.
 */
class Settings(private val prefs: SharedPreferences) {
    companion object {
        private const val FILE = "ironterm_prefs"
        private const val K_MODE = "mode"
        private const val K_SERVER = "server_url"
        private const val K_TOKEN = "app_token"
        private const val K_API_KEY = "api_key"
        private const val K_THEME = "color_theme"
        private const val K_UNIT = "direct_unit"
        private const val K_TARGET = "direct_weekly_target"
        private const val K_KEEP_ON = "gym_keep_screen_on"
        private const val K_REST_SOUND = "gym_rest_sound"
        private const val K_REST_VIBRATE = "gym_rest_vibrate"
        private const val K_DEFAULT_REST = "gym_default_rest"
        private const val K_SOCIAL_SEEN = "social_notified_at"

        @Volatile private var instance: Settings? = null

        fun get(context: Context): Settings = instance ?: synchronized(this) {
            instance ?: Settings(openEncrypted(context.applicationContext)).also { instance = it }
        }

        /** For tests. */
        fun override(s: Settings?) { instance = s }

        private fun openEncrypted(context: Context): SharedPreferences {
            fun open(): SharedPreferences {
                val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
                return EncryptedSharedPreferences.create(
                    context, FILE, key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            }
            return try {
                open()
            } catch (e: Exception) {
                // Keystore key lost (e.g. restored backup): the encrypted file is unreadable. Start over.
                Log.w("Settings", "encrypted prefs unreadable, resetting", e)
                context.deleteSharedPreferences(FILE)
                open()
            }
        }

        fun defaultUnit(locale: Locale = Locale.getDefault()): String =
            if (locale.country in setOf("US", "LR", "MM")) "lb" else "kg"
    }

    var mode: SourceMode
        get() = prefs.getString(K_MODE, null)?.let { runCatching { SourceMode.valueOf(it) }.getOrNull() }
            ?: if (!apiKey.isNullOrBlank()) SourceMode.DIRECT else SourceMode.NONE
        set(v) = prefs.edit().putString(K_MODE, v.name).apply()

    var serverUrl: String?
        get() = prefs.getString(K_SERVER, null)
        set(v) = prefs.edit().putString(K_SERVER, v).apply()

    var appToken: String?
        get() = prefs.getString(K_TOKEN, null)
        set(v) = prefs.edit().putString(K_TOKEN, v).apply()

    var apiKey: String?
        get() = prefs.getString(K_API_KEY, null)
        set(v) = prefs.edit().putString(K_API_KEY, v).apply()

    var themeName: String
        get() = prefs.getString(K_THEME, "BLUE") ?: "BLUE"
        set(v) = prefs.edit().putString(K_THEME, v).apply()

    var directUnit: String
        get() = prefs.getString(K_UNIT, null) ?: defaultUnit()
        set(v) = prefs.edit().putString(K_UNIT, v).apply()

    var weeklyTarget: Int
        get() = prefs.getInt(K_TARGET, 3)
        set(v) = prefs.edit().putInt(K_TARGET, v.coerceIn(1, 7)).apply()

    /** GYM: keep the screen on while a session is open. */
    var keepScreenOn: Boolean
        get() = prefs.getBoolean(K_KEEP_ON, true)
        set(v) = prefs.edit().putBoolean(K_KEEP_ON, v).apply()

    /** GYM: beep when rest ends (never in silent / vibrate mode). */
    var restSound: Boolean
        get() = prefs.getBoolean(K_REST_SOUND, true)
        set(v) = prefs.edit().putBoolean(K_REST_SOUND, v).apply()

    /** GYM: vibrate when rest ends (not in silent mode). */
    var restVibrate: Boolean
        get() = prefs.getBoolean(K_REST_VIBRATE, true)
        set(v) = prefs.edit().putBoolean(K_REST_VIBRATE, v).apply()

    /** GYM: rest for exercises you add yourself (program exercises use the program's rest). */
    var defaultRest: Int
        get() = prefs.getInt(K_DEFAULT_REST, 90)
        set(v) = prefs.edit().putInt(K_DEFAULT_REST, v.coerceIn(0, 600)).apply()

    /** FRIENDS: newest notification time already shown as a system notification (ISO). */
    var socialNotifiedAt: String?
        get() = prefs.getString(K_SOCIAL_SEEN, null)
        set(v) = prefs.edit().putString(K_SOCIAL_SEEN, v).apply()

    val isConfigured: Boolean
        get() = when (mode) {
            SourceMode.SERVER -> !serverUrl.isNullOrBlank() && !appToken.isNullOrBlank()
            SourceMode.DIRECT -> !apiKey.isNullOrBlank()
            SourceMode.NONE -> false
        }

    /**
     * Identity of the configured source (mode + server + token, or the API key). A sync started for
     * one source must not write its result once the user has connected to another.
     */
    val sourceKey: String
        get() = when (mode) {
            SourceMode.SERVER -> "server|${serverUrl.orEmpty()}|${appToken.orEmpty().hashCode()}"
            SourceMode.DIRECT -> "direct|${apiKey.orEmpty().hashCode()}"
            SourceMode.NONE -> "none"
        }

    fun connectServer(url: String, token: String) {
        prefs.edit().putString(K_MODE, SourceMode.SERVER.name).putString(K_SERVER, url).putString(K_TOKEN, token).apply()
    }

    fun connectDirect(key: String) {
        prefs.edit().putString(K_MODE, SourceMode.DIRECT.name).putString(K_API_KEY, key).apply()
    }

    fun disconnect() {
        prefs.edit().putString(K_MODE, SourceMode.NONE.name).remove(K_TOKEN).remove(K_API_KEY).apply()
    }
}
