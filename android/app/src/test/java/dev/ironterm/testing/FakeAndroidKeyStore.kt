package dev.ironterm.testing

import android.security.keystore.KeyGenParameterSpec
import java.io.InputStream
import java.io.OutputStream
import java.security.Key
import java.security.KeyStore
import java.security.KeyStoreSpi
import java.security.Provider
import java.security.SecureRandom
import java.security.Security
import java.security.cert.Certificate
import java.security.spec.AlgorithmParameterSpec
import java.util.Collections
import java.util.Date
import java.util.Enumeration
import javax.crypto.KeyGenerator
import javax.crypto.KeyGeneratorSpi
import javax.crypto.SecretKey

/**
 * A software stand-in for the "AndroidKeyStore" JCA provider, which Robolectric doesn't have:
 * AES keys generated from a KeyGenParameterSpec and kept in memory by alias. The keys are plain
 * JCE keys, so Cipher("AES/GCM/NoPadding") from the JDK uses them. Enough for KeystoreBox,
 * MasterKey and Tink (EncryptedSharedPreferences) to run in unit tests.
 */
object FakeAndroidKeyStore {
    val keys: MutableMap<String, SecretKey> = Collections.synchronizedMap(LinkedHashMap())

    fun install() {
        if (Security.getProvider("AndroidKeyStore") == null) Security.addProvider(FakeProvider())
    }

    fun reset() = keys.clear()

    private class FakeProvider : Provider("AndroidKeyStore", 1.0, "test-only fake AndroidKeyStore") {
        init {
            putService(object : Service(this, "KeyStore", "AndroidKeyStore", FakeKeyStore::class.java.name, null, null) {
                override fun newInstance(constructorParameter: Any?): Any = FakeKeyStore()
            })
            putService(object : Service(this, "KeyGenerator", "AES", FakeAesKeyGenerator::class.java.name, null, null) {
                override fun newInstance(constructorParameter: Any?): Any = FakeAesKeyGenerator()
            })
        }
    }

    class FakeAesKeyGenerator : KeyGeneratorSpi() {
        private var spec: KeyGenParameterSpec? = null
        override fun engineInit(random: SecureRandom?) = throw UnsupportedOperationException("needs a KeyGenParameterSpec")
        override fun engineInit(params: AlgorithmParameterSpec?, random: SecureRandom?) { spec = params as KeyGenParameterSpec }
        override fun engineInit(keysize: Int, random: SecureRandom?) = throw UnsupportedOperationException("needs a KeyGenParameterSpec")
        override fun engineGenerateKey(): SecretKey {
            val s = spec ?: throw IllegalStateException("not initialised")
            val key = KeyGenerator.getInstance("AES", "SunJCE").apply { init(s.keySize.takeIf { it > 0 } ?: 256) }.generateKey()
            keys[s.keystoreAlias] = key
            return key
        }
    }

    class FakeKeyStore : KeyStoreSpi() {
        override fun engineGetKey(alias: String, password: CharArray?): Key? = keys[alias]
        override fun engineGetCertificateChain(alias: String?): Array<Certificate>? = null
        override fun engineGetCertificate(alias: String?): Certificate? = null
        override fun engineGetCreationDate(alias: String?): Date = Date()
        override fun engineSetKeyEntry(alias: String, key: Key, password: CharArray?, chain: Array<out Certificate>?) { keys[alias] = key as SecretKey }
        override fun engineSetKeyEntry(alias: String?, key: ByteArray?, chain: Array<out Certificate>?) = throw UnsupportedOperationException()
        override fun engineSetCertificateEntry(alias: String?, cert: Certificate?) = throw UnsupportedOperationException()
        override fun engineDeleteEntry(alias: String) { keys.remove(alias) }
        override fun engineAliases(): Enumeration<String> = Collections.enumeration(keys.keys.toList())
        override fun engineContainsAlias(alias: String): Boolean = alias in keys
        override fun engineSize(): Int = keys.size
        override fun engineIsKeyEntry(alias: String): Boolean = alias in keys
        override fun engineIsCertificateEntry(alias: String?): Boolean = false
        override fun engineGetCertificateAlias(cert: Certificate?): String? = null
        override fun engineStore(stream: OutputStream?, password: CharArray?) {}
        override fun engineLoad(stream: InputStream?, password: CharArray?) {}
        override fun engineLoad(param: KeyStore.LoadStoreParameter?) {}
    }
}
