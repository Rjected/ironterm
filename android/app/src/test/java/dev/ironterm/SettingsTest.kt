package dev.ironterm

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.SecretBox
import dev.ironterm.data.Settings
import dev.ironterm.data.SourceMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Credentials are sealed at rest, and the one-time import from the old encrypted prefs keeps everyone signed in. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SettingsTest {
    /** Stands in for the Keystore (Robolectric has none): reversible, but never stores the plain text. */
    private object FakeBox : SecretBox {
        override fun seal(plain: String) = "sealed:" + plain.reversed()
        override fun open(sealed: String) = if (sealed.startsWith("sealed:")) sealed.removePrefix("sealed:").reversed() else null
    }

    private fun prefs(name: String): SharedPreferences =
        ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("${name}_${System.nanoTime()}", Context.MODE_PRIVATE)

    @Test fun credentialsAreSealedAtRest() {
        val p = prefs("sealed")
        val s = Settings(p, FakeBox)
        s.connectServer("https://gym.example.com", "ht_token")
        assertEquals("ht_token", s.appToken)
        assertEquals("sealed:nekot_th", p.getString("app_token", null))
        s.connectDirect("hevy-key")
        assertEquals("hevy-key", s.apiKey)
        assertFalse(p.all.values.contains("hevy-key"))
        s.apiKey = null
        assertNull(s.apiKey)
    }

    @Test fun undecryptableCredentialsMeanSignedOut() {
        val p = prefs("lost")
        p.edit().putString("mode", "SERVER").putString("server_url", "https://gym.example.com").putString("app_token", "garbage").commit()
        val s = Settings(p, FakeBox)
        assertNull(s.appToken)
        assertFalse(s.isConfigured)
    }

    @Test fun importsEverythingFromTheLegacyPrefs() {
        val legacy = prefs("legacy") // what EncryptedSharedPreferences hands back: plain values
        legacy.edit()
            .putString("mode", "SERVER").putString("server_url", "https://gym.example.com").putString("app_token", "ht_old")
            .putString("api_key", "key-1").putString("color_theme", "AMBER").putInt("direct_weekly_target", 5)
            .putBoolean("gym_rest_sound", false).putInt("gym_default_rest", 120).putString("social_notified_at", "2026-10-01T00:00:00Z")
            .commit()
        val p = prefs("new")
        val s = Settings(p, FakeBox)
        s.importFrom(legacy)

        assertEquals(SourceMode.SERVER, s.mode)
        assertTrue(s.isConfigured)
        assertEquals("https://gym.example.com", s.serverUrl)
        assertEquals("ht_old", s.appToken)
        assertEquals("key-1", s.apiKey)
        assertEquals("AMBER", s.themeName)
        assertEquals(5, s.weeklyTarget)
        assertFalse(s.restSound)
        assertEquals(120, s.defaultRest)
        assertEquals("2026-10-01T00:00:00Z", s.socialNotifiedAt)
        // the import wrote the credentials sealed, never in the clear
        assertEquals("sealed:dlo_th", p.getString("app_token", null))
        assertEquals("sealed:1-yek", p.getString("api_key", null))
    }
}
