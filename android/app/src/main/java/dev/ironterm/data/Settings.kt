package dev.ironterm.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.Locale

enum class SourceMode { NONE, SERVER, DIRECT }

/**
 * App settings and credentials in app-private SharedPreferences. The credentials (app token, Hevy
 * API key) are encrypted with an Android Keystore key ([KeystoreBox]); tests pass [SecretBox.Plain].
 */
class Settings(private val prefs: SharedPreferences, private val box: SecretBox = SecretBox.Plain) {
    companion object {
        private const val FILE = "ironterm_settings"
        /** Before Keystore: EncryptedSharedPreferences (androidx.security-crypto). Migrated once, then deleted. */
        private const val LEGACY_FILE = "ironterm_prefs"
        /** Where EncryptedSharedPreferences kept its Tink keysets. */
        private const val LEGACY_KEYSETS = "__androidx_security_crypto_encrypted_prefs__"
        private val SECRETS = setOf("app_token", "api_key")
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
            instance ?: open(context.applicationContext).also { instance = it }
        }

        /** For tests. */
        fun override(s: Settings?) { instance = s }

        private fun open(context: Context): Settings {
            val settings = Settings(context.getSharedPreferences(FILE, Context.MODE_PRIVATE), KeystoreBox())
            migrateLegacy(context, settings)
            return settings
        }

        /**
         * One-time move from the old EncryptedSharedPreferences file, so nobody is signed out by the
         * switch. TODO: remove with the androidx.security-crypto dependency once every installed
         * app has run this (the app updates itself, so a few releases are enough).
         */
        internal fun migrateLegacy(context: Context, settings: Settings) {
            val raw = context.getSharedPreferences(LEGACY_FILE, Context.MODE_PRIVATE)
            if (raw.all.isEmpty()) return
            try {
                val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
                val legacy = EncryptedSharedPreferences.create(
                    context, LEGACY_FILE, key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
                settings.importFrom(legacy)
            } catch (e: Exception) {
                // Keystore key lost (e.g. restored backup): the old file is unreadable. Start over.
                Log.w("Settings", "legacy encrypted prefs unreadable, dropping them", e)
            }
            // clear before deleting: a SharedPreferences object cached in this process would otherwise
            // keep the old values
            for (file in listOf(LEGACY_FILE, LEGACY_KEYSETS)) {
                context.getSharedPreferences(file, Context.MODE_PRIVATE).edit().clear().commit()
                context.deleteSharedPreferences(file)
            }
            runCatching { java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS) }
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
        get() = secret(K_TOKEN)
        set(v) = prefs.edit().putString(K_TOKEN, v?.let(box::seal)).apply()

    var apiKey: String?
        get() = secret(K_API_KEY)
        set(v) = prefs.edit().putString(K_API_KEY, v?.let(box::seal)).apply()

    private fun secret(key: String): String? = prefs.getString(key, null)?.let(box::open)

    /** Copies every value from [old] (credentials get sealed). Synchronous, so it's on disk before [old] is deleted. */
    fun importFrom(old: SharedPreferences) {
        val e = prefs.edit()
        for ((k, v) in old.all) {
            when (v) {
                is String -> e.putString(k, if (k in SECRETS) box.seal(v) else v)
                is Int -> e.putInt(k, v)
                is Long -> e.putLong(k, v)
                is Float -> e.putFloat(k, v)
                is Boolean -> e.putBoolean(k, v)
                is Set<*> -> e.putStringSet(k, v.filterIsInstance<String>().toSet())
            }
        }
        e.commit()
    }

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
        prefs.edit().putString(K_MODE, SourceMode.SERVER.name).putString(K_SERVER, url).putString(K_TOKEN, box.seal(token)).apply()
    }

    fun connectDirect(key: String) {
        prefs.edit().putString(K_MODE, SourceMode.DIRECT.name).putString(K_API_KEY, box.seal(key)).apply()
    }

    fun disconnect() {
        prefs.edit().putString(K_MODE, SourceMode.NONE.name).remove(K_TOKEN).remove(K_API_KEY).apply()
    }
}
