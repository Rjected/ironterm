package dev.ironterm.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypts the credentials (app token, Hevy API key) before they go into SharedPreferences. */
interface SecretBox {
    fun seal(plain: String): String
    /** null when the value can't be decrypted (e.g. the key is gone); the user reconnects. */
    fun open(sealed: String): String?

    /** No encryption: unit tests, where there's no Android Keystore. */
    object Plain : SecretBox {
        override fun seal(plain: String) = plain
        override fun open(sealed: String) = sealed
    }
}

/**
 * AES-256-GCM with a key that lives in the Android Keystore and never leaves it (hardware-backed
 * where the device has it). The crypto is the platform's; this only frames the output as
 * `v1:` + base64(12-byte IV ‖ ciphertext+tag).
 */
class KeystoreBox(private val alias: String = "ironterm_settings") : SecretBox {
    private companion object {
        const val PROVIDER = "AndroidKeyStore"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val PREFIX = "v1:"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }

    private val key: SecretKey by lazy {
        val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }
        (ks.getKey(alias, null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER).run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            generateKey()
        }
    }

    override fun seal(plain: String): String {
        // The Keystore picks a fresh random IV for every encryption.
        val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key) }
        val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return PREFIX + Base64.encodeToString(out, Base64.NO_WRAP)
    }

    override fun open(sealed: String): String? = runCatching {
        require(sealed.startsWith(PREFIX))
        val bytes = Base64.decode(sealed.removePrefix(PREFIX), Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM).apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
        }
        String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    }.getOrNull()
}
