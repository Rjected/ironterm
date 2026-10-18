package dev.ironterm

import dev.ironterm.data.ConnectLink
import dev.ironterm.data.DeepLink
import dev.ironterm.data.normalizeServerUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkTest {
    @Test fun parsesEncodedServerAndToken() {
        assertEquals(
            ConnectLink("https://gym.example.com", "ht_abc123"),
            DeepLink.parse("ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc123"),
        )
    }

    @Test fun acceptsUnencodedPortsAndTrailingSlash() {
        assertEquals(ConnectLink("http://10.0.2.2:8787", "ht_x"), DeepLink.parse("ironterm://connect?server=http://10.0.2.2:8787/&token=ht_x"))
        assertEquals(ConnectLink("https://gym.example.com", "ht_x"), DeepLink.parse("ironterm://connect?token=ht_x&server=gym.example.com"))
        assertEquals(ConnectLink("https://gym.example.com", "ht_x"), DeepLink.parse("IRONTERM://CONNECT?server=https%3A%2F%2Fgym.example.com&token=ht_x"))
    }

    @Test fun rejectsBadLinks() {
        assertNull(DeepLink.parse(null))
        assertNull(DeepLink.parse(""))
        assertNull(DeepLink.parse("ironterm://connect"))
        assertNull(DeepLink.parse("ironterm://connect?server=https%3A%2F%2Fa.com"))
        assertNull(DeepLink.parse("ironterm://connect?token=ht_abc"))
        assertNull(DeepLink.parse("ironterm://connect?server=https%3A%2F%2Fa.com&token=abc")) // not an app token
        assertNull(DeepLink.parse("ironterm://connect?server=https%3A%2F%2Fa.com&token=ht_"))
        assertNull(DeepLink.parse("ironterm://other?server=https%3A%2F%2Fa.com&token=ht_abc"))
        assertNull(DeepLink.parse("hevyterminal://connect?server=https%3A%2F%2Fa.com&token=ht_abc"))
        assertNull(DeepLink.parse("https://connect?server=https%3A%2F%2Fa.com&token=ht_abc"))
        assertNull(DeepLink.parse("ironterm://connect?server=ftp%3A%2F%2Fa.com&token=ht_abc"))
    }

    @Test fun normalizesServerUrls() {
        assertEquals("https://gym.example.com", normalizeServerUrl(" gym.example.com/ "))
        assertEquals("https://gym.example.com", normalizeServerUrl("https://gym.example.com:443/app"))
        assertEquals("http://192.168.1.5:3000", normalizeServerUrl("http://192.168.1.5:3000"))
        assertEquals("http://[::1]:8787", normalizeServerUrl("http://[::1]:8787/"))
        assertEquals("http://[fd00::5]:8787", normalizeServerUrl("http://[fd00::5]:8787"))
        assertEquals("https://[2001:db8::1]", normalizeServerUrl("[2001:db8::1]"))
        assertNull(normalizeServerUrl(""))
        assertNull(normalizeServerUrl("ftp://x"))
        assertEquals("https://gym.example.com", normalizeServerUrl("HTTPS://Gym.Example.com"))
        assertEquals("http://gym.example.com", normalizeServerUrl("http://gym.example.com:80/x?y=1#z"))
        assertEquals("http://[::1]:8787", normalizeServerUrl("http://[::1]:8787"))
        assertNull(normalizeServerUrl("https://bad host"))
        assertNull(normalizeServerUrl("https://"))
    }
}
