package dev.ironterm

import dev.ironterm.data.ConnectCode
import dev.ironterm.data.ConnectLink
import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectCodeTest {
    @Test fun acceptsTheConnectLinkFromTheWebAppQr() {
        assertEquals(
            ConnectCode.Result.Connect(ConnectLink("https://gym.example.com", "ht_abc123")),
            ConnectCode.handle("ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc123"),
        )
        // scanners sometimes keep a trailing newline
        assertEquals(
            ConnectCode.Result.Connect(ConnectLink("http://10.0.2.2:8799", "ht_x")),
            ConnectCode.handle("  ironterm://connect?server=http%3A%2F%2F10.0.2.2%3A8799&token=ht_x\n"),
        )
    }

    @Test fun rejectsOtherText() {
        val bad = ConnectCode.Result.Invalid(ConnectCode.NOT_IRONTERM)
        listOf(
            null, "", "hello", "https://gym.example.com", "ht_abc123",
            "https://gym.example.com/?token=ht_abc", "WIFI:S:gym;T:WPA;P:secret;;",
            "ironterm://connect?server=https%3A%2F%2Fgym.example.com", // no token
            "hevyterminal://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc",
        ).forEach { assertEquals(it.toString(), bad, ConnectCode.handle(it)) }
        assertEquals("That QR isn't an Ironterm connect code. Open SETUP → APPS & WIDGETS in the web app and scan the code there.", ConnectCode.NOT_IRONTERM)
    }
}
