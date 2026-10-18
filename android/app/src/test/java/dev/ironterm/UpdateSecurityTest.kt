package dev.ironterm

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.update.ApkDownloader
import dev.ironterm.update.ApkVerifier
import dev.ironterm.update.ApkVerifier.Apk
import dev.ironterm.update.ApkVerifier.Signing
import dev.ironterm.update.Installer
import dev.ironterm.update.ReleaseParser
import dev.ironterm.update.UpdateInfo
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.IOException

/** In-app updater: HTTPS only, and only an APK signed like the installed app reaches the installer. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UpdateSecurityTest {
    private val pkg = "dev.ironterm"
    private val mine = Signing(setOf("aa"), setOf("aa"), false)

    @Test fun acceptsSameKeyNewerVersion() {
        assertNull(ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, Signing(setOf("aa"), setOf("aa"), false))))
    }

    @Test fun acceptsRotatedKeyWhoseLineageHasOurs() {
        assertNull(ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, Signing(setOf("bb"), setOf("aa", "bb"), false))))
    }

    @Test fun rejectsOtherKeysPackagesAndDowngrades() {
        assertNotNull("other key", ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, Signing(setOf("ee"), setOf("ee"), false))))
        assertNotNull("other app", ApkVerifier.check(pkg, 5, mine, Apk("com.evil", 6, Signing(setOf("aa"), setOf("aa"), false))))
        assertNotNull("same version", ApkVerifier.check(pkg, 6, mine, Apk(pkg, 6, Signing(setOf("aa"), setOf("aa"), false))))
        assertNotNull("downgrade", ApkVerifier.check(pkg, 7, mine, Apk(pkg, 6, Signing(setOf("aa"), setOf("aa"), false))))
        assertNotNull("unsigned", ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, null)))
        assertNotNull("unsigned", ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, Signing(emptySet(), emptySet(), false))))
        assertNotNull("not an apk", ApkVerifier.check(pkg, 5, mine, null))
        assertNotNull("installed unsigned", ApkVerifier.check(pkg, 5, Signing(emptySet(), emptySet(), false), Apk(pkg, 6, Signing(setOf("aa"), setOf("aa"), false))))
        // multi-signer: the exact set has to match
        val multi = Signing(setOf("aa", "cc"), setOf("aa", "cc"), true)
        assertNull(ApkVerifier.check(pkg, 5, multi, Apk(pkg, 6, multi)))
        assertNotNull(ApkVerifier.check(pkg, 5, multi, Apk(pkg, 6, Signing(setOf("aa"), setOf("aa"), false))))
        assertNotNull(ApkVerifier.check(pkg, 5, mine, Apk(pkg, 6, Signing(setOf("aa", "ee"), setOf("aa", "ee"), true))))
    }

    @Test fun garbageFileNeverReachesTheInstaller() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val f = File(ctx.cacheDir, "ironterm-99.apk").apply { writeText("not an apk") }
        try {
            Installer.install(ctx, f)
            fail("installed an unverified file")
        } catch (e: SecurityException) {
            assertTrue(e.message!!.startsWith("Update rejected"))
        }
        assertFalse("rejected file is deleted", f.exists())
        assertTrue(ctx.packageManager.packageInstaller.mySessions.isEmpty())
    }

    @Test fun releaseApkMustBeHttps() {
        val http = UpdateTest.release(assets = """[{"name":"ironterm-57.apk","browser_download_url":"http://github.com/o/r/ironterm-57.apk","size":1}]""")
        assertNull(ReleaseParser.parse(http))
        val both = UpdateTest.release(assets = """[
            {"name":"ironterm-57-a.apk","browser_download_url":"http://evil.example/ironterm-57.apk","size":1},
            {"name":"ironterm-57-b.apk","browser_download_url":"https://github.com/o/r/ironterm-57.apk","size":1}]""")
        assertEquals("https://github.com/o/r/ironterm-57.apk", ReleaseParser.parse(both)!!.apkUrl)
    }

    @Test fun downloaderRefusesHttp() = runBlocking {
        val server = MockWebServer().apply { start() }
        try {
            server.enqueue(MockResponse().setBody("apk"))
            val ctx = ApplicationProvider.getApplicationContext<Context>()
            val info = UpdateInfo(99, "android-v99", "x", server.url("/ironterm-99.apk").toString(), "ironterm-99.apk")
            try {
                ApkDownloader.download(ctx, info) {}
                fail("downloaded over http")
            } catch (e: IOException) {
                assertTrue(e.message!!.contains("HTTPS"))
            }
            assertEquals(0, server.requestCount)
        } finally {
            server.shutdown()
        }
    }
}
