package dev.ironterm

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.xmlpull.v1.XmlPullParser
import java.io.File

/** The credentials file and its keyset must be excluded from cloud backup and device-to-device transfer. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BackupRulesTest {
    private val secrets = setOf("ironterm_prefs.xml", "__androidx_security_crypto_encrypted_prefs__.xml")

    /** section name ("cloud-backup", "device-transfer", or the root for full-backup-content) → excluded sharedpref paths */
    private fun excludes(res: Int): Map<String, Set<String>> {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val out = mutableMapOf<String, MutableSet<String>>()
        val p = ctx.resources.getXml(res)
        val stack = ArrayDeque<String>()
        while (p.next() != XmlPullParser.END_DOCUMENT) {
            when (p.eventType) {
                XmlPullParser.START_TAG -> {
                    if (p.name == "exclude" && p.getAttributeValue(null, "domain") == "sharedpref") {
                        out.getOrPut(stack.last()) { mutableSetOf() } += p.getAttributeValue(null, "path")
                    }
                    stack.addLast(p.name)
                }
                XmlPullParser.END_TAG -> stack.removeLast()
            }
        }
        return out
    }

    @Test fun dataExtractionRulesExcludeCredentials() {
        val ex = excludes(R.xml.data_extraction_rules)
        assertEquals(secrets, ex["cloud-backup"])
        assertEquals(secrets, ex["device-transfer"])
    }

    @Test fun legacyBackupRulesExcludeCredentials() {
        assertEquals(secrets, excludes(R.xml.backup_rules)["full-backup-content"])
    }

    @Test fun manifestUsesTheRules() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("android:allowBackup=\"false\""))
        assertTrue(manifest.contains("android:dataExtractionRules=\"@xml/data_extraction_rules\""))
        assertTrue(manifest.contains("android:fullBackupContent=\"@xml/backup_rules\""))
    }
}
