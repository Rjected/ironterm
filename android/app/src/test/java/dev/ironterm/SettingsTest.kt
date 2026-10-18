package dev.ironterm

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.KeystoreBox
import dev.ironterm.data.SecretBox
import dev.ironterm.testing.FakeAndroidKeyStore
import org.junit.Assert.assertNotEquals
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

    @Test fun keystoreBoxRoundTripsWithAFreshIvEachTime() {
        FakeAndroidKeyStore.install()
        FakeAndroidKeyStore.reset()
        val box = KeystoreBox("test_box")
        val a = box.seal("ht_secret")
        val b = box.seal("ht_secret")
        assertTrue(a.startsWith("v1:"))
        assertNotEquals("random IV per seal", a, b)
        assertFalse(a.contains("ht_secret"))
        assertEquals("ht_secret", box.open(a))
        assertEquals("ht_secret", KeystoreBox("test_box").open(b)) // same Keystore key, new instance
        assertNull("tampered", box.open(a.dropLast(4) + "AAAA"))
        assertNull("not ours", box.open("ht_secret"))
        FakeAndroidKeyStore.reset() // key lost (e.g. data restored to another device)
        assertNull(KeystoreBox("test_box").open(a))
    }

    /**
     * The upgrade path: credentials written by the previous version (EncryptedSharedPreferences,
     * androidx.security-crypto) are still there after the first launch of this one, sealed with the
     * Keystore key, and the old files and master key are gone.
     */
    @Test fun upgradeFromEncryptedSharedPreferencesKeepsYouSignedIn() {
        FakeAndroidKeyStore.install()
        FakeAndroidKeyStore.reset()
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val masterKey = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        val old = EncryptedSharedPreferences.create(
            ctx, "ironterm_prefs", masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
        old.edit().putString("mode", "SERVER").putString("server_url", "https://gym.example.com")
            .putString("app_token", "ht_from_old_version").putString("api_key", "hevy-old").putInt("gym_default_rest", 150).commit()
        val rawOld = ctx.getSharedPreferences("ironterm_prefs", Context.MODE_PRIVATE).all
        assertFalse("the old file really is encrypted", rawOld.values.any { it.toString().contains("ht_from_old_version") })

        Settings.override(null)
        val s = Settings.get(ctx)
        assertEquals(SourceMode.SERVER, s.mode)
        assertTrue(s.isConfigured)
        assertEquals("https://gym.example.com", s.serverUrl)
        assertEquals("ht_from_old_version", s.appToken)
        assertEquals("hevy-old", s.apiKey)
        assertEquals(150, s.defaultRest)

        val raw = ctx.getSharedPreferences("ironterm_settings", Context.MODE_PRIVATE).all
        assertTrue((raw["app_token"] as String).startsWith("v1:"))
        assertFalse(raw.values.any { it.toString().contains("ht_from_old_version") || it.toString().contains("hevy-old") })
        assertTrue("old prefs gone", ctx.getSharedPreferences("ironterm_prefs", Context.MODE_PRIVATE).all.isEmpty())
        assertTrue("old keysets gone", ctx.getSharedPreferences("__androidx_security_crypto_encrypted_prefs__", Context.MODE_PRIVATE).all.isEmpty())
        assertFalse("old master key gone", MasterKey.DEFAULT_MASTER_KEY_ALIAS in FakeAndroidKeyStore.keys)

        // a second launch reads the new file; nothing to migrate
        Settings.override(null)
        assertEquals("ht_from_old_version", Settings.get(ctx).appToken)
        Settings.override(null)
    }

    @Test fun unreadableLegacyPrefsAreDroppedNotFatal() {
        FakeAndroidKeyStore.install()
        FakeAndroidKeyStore.reset()
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        // garbage where the encrypted prefs were, and no master key (e.g. restored from a backup)
        ctx.getSharedPreferences("ironterm_prefs", Context.MODE_PRIVATE).edit().putString("AXyz", "garbage").commit()
        Settings.override(null)
        val s = Settings.get(ctx)
        assertFalse(s.isConfigured)
        assertTrue(ctx.getSharedPreferences("ironterm_prefs", Context.MODE_PRIVATE).all.isEmpty())
        Settings.override(null)
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
