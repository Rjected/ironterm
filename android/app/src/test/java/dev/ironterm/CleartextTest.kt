package dev.ironterm

import dev.ironterm.data.Cleartext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CleartextTest {
    @Test fun noWarningForHttpsOrPrivateHttp() {
        listOf(
            "https://gym.example.com", "gym.example.com", // no scheme means https
            "http://localhost:8787", "http://127.0.0.1:8787", "http://10.0.2.2:8787", "http://[::1]:8787",
            "http://192.168.1.20:8787", "http://10.1.2.3", "http://172.16.0.5", "http://172.31.255.1",
            "http://100.101.102.103", "http://169.254.1.1", "http://[fd12:3456::1]:8787", "http://[fe80::1]",
            "http://nas:8787", "http://gym.local", "http://gym.lan", "http://gym.home.arpa", "http://box.tail1234.ts.net",
            "http://app.localhost",
        ).forEach { assertNull(it, Cleartext.warning(it)) }
    }

    @Test fun warnsForHttpToPublicHosts() {
        listOf(
            "http://gym.example.com", "http://8.8.8.8", "http://172.32.0.1", "http://192.169.0.1", "http://100.128.0.1",
            "http://[2001:db8::1]", "http://local.example.com", "http://evil.com/.local",
        ).forEach { assertEquals(it, Cleartext.WARNING, Cleartext.warning(it)) }
    }

    @Test fun malformedIsNotPrivate() {
        assertFalse(Cleartext.isPrivateHost(""))
        assertFalse(Cleartext.isPrivateHost("10.0.0.256.example.com"))
        assertTrue(Cleartext.isPrivateHost("LOCALHOST."))
        assertNull("invalid url: nothing to warn about", Cleartext.warning("ftp://x"))
    }
}
