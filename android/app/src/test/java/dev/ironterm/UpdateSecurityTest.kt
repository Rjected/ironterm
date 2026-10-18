package dev.ironterm

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.Net
import dev.ironterm.update.ApkDownloader
import dev.ironterm.update.ApkVerifier
import dev.ironterm.update.ApkVerifier.Apk
import dev.ironterm.update.ApkVerifier.Signing
import dev.ironterm.update.Installer
import dev.ironterm.update.ReleaseParser
import dev.ironterm.update.UpdateInfo
import kotlinx.coroutines.runBlocking
import dev.ironterm.testing.MockResponse
import dev.ironterm.testing.MockWebServer
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

    @Test fun redirectRules() {
        // GitHub: github.com 302 → its download host, https all the way
        assertEquals(
            "https://release-assets.githubusercontent.com/x/ironterm-57.apk?sig=1",
            Net.redirectTarget("https://github.com/o/r/releases/download/v/ironterm-57.apk", "https://release-assets.githubusercontent.com/x/ironterm-57.apk?sig=1", httpsOnly = true),
        )
        assertEquals("https://github.com/o/r/b.apk", Net.redirectTarget("https://github.com/o/r/a.apk", "b.apk", httpsOnly = true)) // relative
        for ((from, to, httpsOnly) in listOf(
            Triple("https://github.com/a.apk", "http://evil.example/a.apk", true), // downgrade
            Triple("https://github.com/a.apk", "http://evil.example/a.apk", false), // never https → http, even for API calls
            Triple("http://127.0.0.1/a.apk", "http://127.0.0.1/b.apk", true),
            Triple("https://github.com/a.apk", "file:///sdcard/evil.apk", true),
            Triple("https://github.com/a.apk", "ftp://x/a.apk", false),
        )) {
            try { Net.redirectTarget(from, to, httpsOnly); fail("followed $from → $to") } catch (_: IOException) {}
        }
        assertEquals("http://nas:8787/api/x", Net.redirectTarget("http://nas:8787/api/y", "/api/x", httpsOnly = false)) // LAN server
    }

    /** A cross-host 302 (like github.com → its asset host) still downloads the file. */
    @Test fun downloadFollowsACrossHostRedirect() = runBlocking {
        val assets = MockWebServer().apply { start() }
        val github = MockWebServer().apply { start() }
        try {
            // "localhost" vs "127.0.0.1": a different host, as on GitHub
            val target = assets.url("/ironterm-99.apk").toString().replace("127.0.0.1", "localhost")
            github.enqueue(MockResponse().setResponseCode(302).setHeader("Location", target))
            assets.enqueue(MockResponse().setBody("APK BYTES"))
            val ctx = ApplicationProvider.getApplicationContext<Context>()
            val info = UpdateInfo(99, "android-v99", "x", github.url("/o/r/releases/download/android-v99/ironterm-99.apk").toString(), "ironterm-99.apk", 9)
            val progress = mutableListOf<Float>()
            val f = ApkDownloader.download(ctx, info, requireHttps = false) { progress += it }
            assertEquals("APK BYTES", f.readText())
            assertEquals(1f, progress.last())
            assertEquals(1, github.requestCount)
            assertEquals("/ironterm-99.apk", assets.takeRequest().path)
            // what reaches the installer is still checked against our signer: these bytes aren't an APK
            try { Installer.install(ctx, f); fail("installed an unverified file") } catch (e: SecurityException) {}
        } finally {
            github.shutdown(); assets.shutdown()
        }
    }

    /** Credentials stay with their origin: a redirect to another host drops Authorization / api-key. */
    @Test fun redirectsDropCredentialsAcrossHosts() = runBlocking {
        val other = MockWebServer().apply { start() }
        val server = MockWebServer().apply { start() }
        try {
            val elsewhere = other.url("/landing").toString().replace("127.0.0.1", "localhost")
            server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", "/moved")) // same origin
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", elsewhere))
            other.enqueue(MockResponse().setBody("ok"))
            val r = Net.send(server.url("/start").toString(), headers = mapOf("Authorization" to "Bearer ht_secret", "api-key" to "k", "accept" to "application/json"))
            assertEquals(200, r.code)
            assertEquals("ok", r.body)
            server.takeRequest()
            val moved = server.takeRequest()
            assertEquals("/moved", moved.path)
            assertEquals("same origin keeps the token", "Bearer ht_secret", moved.getHeader("Authorization"))
            val landed = other.takeRequest()
            assertNull(landed.getHeader("Authorization"))
            assertNull(landed.getHeader("api-key"))
            assertEquals("application/json", landed.getHeader("accept"))
        } finally {
            other.shutdown(); server.shutdown()
        }
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
