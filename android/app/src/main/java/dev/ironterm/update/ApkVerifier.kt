package dev.ironterm.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.security.MessageDigest

/**
 * Checks a downloaded update before it reaches the system installer: same package name, a newer
 * version, and signed by the key the installed app is signed with (or a rotated key whose lineage
 * includes it). Android would refuse a differently signed update too, but checking first means a
 * swapped or tampered APK is never handed to the installer at all.
 */
object ApkVerifier {
    /** What we know about one package's signing: SHA-256 of each cert, hex. */
    data class Signing(
        /** certs the APK is currently signed with (several only for multi-signer APKs) */
        val current: Set<String>,
        /** current certs plus past ones in the rotation lineage */
        val lineage: Set<String>,
        val multipleSigners: Boolean,
    )

    data class Apk(val packageName: String, val versionCode: Long, val signing: Signing?)

    /** Null when [apk] may be installed over the app ([installed]), else why not. Pure: unit tested. */
    fun check(packageName: String, installedVersion: Long, installed: Signing, apk: Apk?): String? {
        if (apk == null) return "the download isn't a valid APK"
        if (apk.packageName != packageName) return "the APK is a different app (${apk.packageName})"
        if (apk.versionCode <= installedVersion) return "the APK isn't newer than the installed version"
        val s = apk.signing ?: return "the APK isn't signed"
        if (s.current.isEmpty() || installed.current.isEmpty()) return "the APK isn't signed"
        val ok = if (installed.multipleSigners || s.multipleSigners) s.current == installed.current
        else installed.current.all { it in s.lineage }
        return if (ok) null else "the APK isn't signed with this app's key"
    }

    /** Throws when [file] fails [check]; the file is deleted so it can't be retried. */
    fun verify(context: Context, file: File) {
        val pm = context.packageManager
        val installed = pm.getPackageInfo(context.packageName, flags())
        val archive = pm.getPackageArchiveInfo(file.absolutePath, flags())
        val problem = check(context.packageName, versionCode(installed), signing(installed) ?: Signing(emptySet(), emptySet(), false),
            archive?.let { Apk(it.packageName, versionCode(it), signing(it)) })
        if (problem != null) {
            file.delete()
            throw SecurityException("Update rejected: $problem.")
        }
    }

    @Suppress("DEPRECATION")
    private fun flags(): Int = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

    @Suppress("DEPRECATION")
    private fun versionCode(p: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else p.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun signing(p: PackageInfo): Signing? {
        if (Build.VERSION.SDK_INT >= 28) {
            val info = p.signingInfo ?: return null
            return if (info.hasMultipleSigners()) {
                val c = digests(info.apkContentsSigners)
                Signing(c, c, true)
            } else {
                val history = digests(info.signingCertificateHistory)
                // history[0] is the original key; the current one is last
                val current = info.signingCertificateHistory?.lastOrNull()?.let { digests(arrayOf(it)) }.orEmpty()
                Signing(current, history, false)
            }
        }
        val c = digests(p.signatures)
        return if (c.isEmpty()) null else Signing(c, c, c.size > 1)
    }

    private fun digests(sigs: Array<Signature>?): Set<String> =
        sigs.orEmpty().map { sha256(it.toByteArray()) }.toSet()

    fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
