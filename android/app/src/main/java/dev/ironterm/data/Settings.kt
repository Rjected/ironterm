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

    val isConfigured: Boolean
        get() = when (mode) {
            SourceMode.SERVER -> !serverUrl.isNullOrBlank() && !appToken.isNullOrBlank()
            SourceMode.DIRECT -> !apiKey.isNullOrBlank()
            SourceMode.NONE -> false
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
