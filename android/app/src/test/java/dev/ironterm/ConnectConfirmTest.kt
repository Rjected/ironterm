package dev.ironterm

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.ironterm.data.ConnectCode
import dev.ironterm.data.ConnectLink
import dev.ironterm.data.ConnectPrompt
import dev.ironterm.data.Settings
import dev.ironterm.data.SourceMode
import dev.ironterm.ui.AppViewModel
import dev.ironterm.testing.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import androidx.work.Configuration
import androidx.work.WorkManager
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** A connect link or QR must not store its token or reach its server until the user confirms the host. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConnectConfirmTest {
    private lateinit var settings: Settings
    private lateinit var attacker: MockWebServer

    @Before fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        settings = Settings(ctx.getSharedPreferences("confirm_${System.nanoTime()}", Context.MODE_PRIVATE))
        Settings.override(settings)
        // connecting schedules the periodic sync
        runCatching { WorkManager.initialize(ctx, Configuration.Builder().setExecutor(Executors.newSingleThreadExecutor()).build()) }
        attacker = MockWebServer().apply { start() }
    }

    @After fun tearDown() {
        Settings.override(null)
        attacker.shutdown()
    }

    private fun link(server: String, token: String = "ht_attacker") =
        "ironterm://connect?server=${URLEncoder.encode(server, "UTF-8")}&token=$token"

    @Test fun promptShowsHostAndWhatItReplaces() {
        val l = ConnectLink("https://evil.example.net:8443", "ht_x")
        val p = ConnectPrompt.of(l, SourceMode.SERVER, "https://gym.example.com")
        assertEquals("evil.example.net:8443", p.host)
        assertFalse(p.insecure)
        assertEquals("gym.example.com", p.replaces)

        assertNull(ConnectPrompt.of(l, SourceMode.SERVER, "https://evil.example.net:8443").replaces) // same server: new token only
        assertNull(ConnectPrompt.of(l, SourceMode.NONE, "https://gym.example.com").replaces) // not connected
        assertNotNull(ConnectPrompt.of(l, SourceMode.DIRECT, null).replaces)
        assertTrue(ConnectPrompt.of(ConnectLink("http://192.168.1.5:8787", "ht_x"), SourceMode.NONE, null).insecure)
    }

    @Test fun deepLinkWaitsForConfirmation() {
        settings.connectServer("https://gym.example.com", "ht_mine")
        val vm = AppViewModel(ApplicationProvider.getApplicationContext<Application>())
        val server = attacker.url("/").toString()
        val parsed = (ConnectCode.handle(link(server)) as ConnectCode.Result.Connect).link

        vm.connectFromLink(parsed)
        val pending = vm.state.value.pendingConnect
        assertNotNull(pending)
        assertEquals("https://gym.example.com", settings.serverUrl)
        assertEquals("ht_mine", settings.appToken)

        vm.cancelConnect()
        assertNull(vm.state.value.pendingConnect)
        assertEquals("https://gym.example.com", settings.serverUrl)
        assertEquals("ht_mine", settings.appToken)
        assertNull("no request may reach the link's server", attacker.takeRequest(500, TimeUnit.MILLISECONDS))
    }

    @Test fun scannedQrWaitsForConfirmationThenConnects() {
        val vm = AppViewModel(ApplicationProvider.getApplicationContext<Application>())
        val server = attacker.url("/").toString().trimEnd('/')
        vm.onScanned(link(server, "ht_scanned"))
        assertNotNull(vm.state.value.pendingConnect)
        assertNull(settings.appToken)

        vm.confirmConnect()
        assertNull(vm.state.value.pendingConnect)
        assertEquals(server, settings.serverUrl)
        assertEquals("ht_scanned", settings.appToken)
        assertEquals(SourceMode.SERVER, settings.mode)
    }
}
