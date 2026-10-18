package dev.ironterm

import dev.ironterm.update.CheckResult
import dev.ironterm.update.ReleaseParser
import dev.ironterm.update.UpdateChecker
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class UpdateTest {
    companion object {
        fun release(tag: String = "android-v57", assets: String = """[
            {"name":"ironterm-57-release.apk","browser_download_url":"https://github.com/o/r/releases/download/android-v57/ironterm-57-release.apk","size":1234},
            {"name":"checksums.txt","browser_download_url":"https://x/checksums.txt","size":10}]""",
            body: String = "## Graph widget shows months\n- second line") =
            """{"tag_name":"$tag","name":"Ironterm $tag","draft":false,"prerelease":false,
               "html_url":"https://github.com/o/r/releases/tag/$tag","body":${kotlinx.serialization.json.JsonPrimitive(body)},
               "assets":$assets,"author":{"login":"ci"}}"""
    }

    @Test fun parsesLatestRelease() {
        val u = ReleaseParser.parse(release())!!
        assertEquals(57, u.versionCode)
        assertEquals("android-v57", u.tag)
        assertEquals("ironterm-57-release.apk", u.apkName)
        assertEquals("https://github.com/o/r/releases/download/android-v57/ironterm-57-release.apk", u.apkUrl)
        assertEquals(1234L, u.apkSize)
        assertEquals("Graph widget shows months", u.headline)
        assertTrue(u.changelog.contains("second line"))
    }

    @Test fun versionComparison() {
        val u = ReleaseParser.parse(release())!!
        assertTrue("newer", ReleaseParser.isNewer(u, 56))
        assertFalse("same", ReleaseParser.isNewer(u, 57))
        assertFalse("older", ReleaseParser.isNewer(u, 58))
        assertFalse(ReleaseParser.isNewer(null, 1))
    }

    @Test fun badTagsAndMissingApk() {
        assertEquals(57, ReleaseParser.versionCode("android-v57"))
        listOf("v57", "android-57", "android-v", "android-vX", "ios-v57", "android-v57-rc1", "").forEach {
            assertNull(it, ReleaseParser.versionCode(it))
            assertNull(it, ReleaseParser.parse(release(tag = it)))
        }
        assertNull(ReleaseParser.parse(release(assets = "[]")))
        assertNull(ReleaseParser.parse(release(assets = """[{"name":"app-release.apk","browser_download_url":"https://x/a.apk"}]""")))
        assertNull(ReleaseParser.parse(release(assets = """[{"name":"ironterm-57.aab","browser_download_url":"https://x/a.aab"}]""")))
        assertNull(ReleaseParser.parse("not json"))
        assertNull(ReleaseParser.parse(release().replace("\"draft\":false", "\"draft\":true")))
    }

    private lateinit var server: MockWebServer
    @Before fun up() { server = MockWebServer(); server.start() }
    @After fun down() = server.shutdown()
    private fun checker(current: Int) = UpdateChecker("o/r", current, server.url("/").toString())

    @Test fun checkFindsNewerRelease() = runBlocking {
        server.enqueue(MockResponse().setBody(release()))
        val r = checker(56).check()
        assertTrue(r is CheckResult.Available)
        assertEquals(57, (r as CheckResult.Available).info.versionCode)
        val req = server.takeRequest()
        assertEquals("/repos/o/r/releases/latest", req.path)
        assertEquals("application/vnd.github+json", req.getHeader("Accept"))
    }

    @Test fun checkUpToDate() = runBlocking {
        server.enqueue(MockResponse().setBody(release()))
        assertEquals(CheckResult.UpToDate, checker(57).check())
        server.enqueue(MockResponse().setBody(release()))
        assertEquals(CheckResult.UpToDate, checker(60).check())
    }

    @Test fun checkFailures() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"message":"API rate limit exceeded"}""").setHeader("x-ratelimit-remaining", "0"))
        assertEquals(CheckResult.Failed("GitHub rate limit reached. Try again later."), checker(1).check())
        server.enqueue(MockResponse().setResponseCode(429))
        assertEquals(CheckResult.Failed("GitHub rate limit reached. Try again later."), checker(1).check())
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"message":"Not Found"}"""))
        assertEquals(CheckResult.Failed("No releases published yet for o/r."), checker(1).check())
        server.enqueue(MockResponse().setResponseCode(500))
        assertEquals(CheckResult.Failed("GitHub error 500."), checker(1).check())
        server.enqueue(MockResponse().setBody(release(assets = "[]")))
        assertEquals(CheckResult.Failed("The latest release has no installable APK."), checker(1).check())
    }
}
