package dev.ironterm.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import java.io.File

/**
 * Installs a downloaded APK through the system installer (PackageInstaller session). Android
 * always shows its own confirmation; the app needs "install unknown apps" for itself first.
 */
object Installer {
    const val ACTION_STATUS = "dev.ironterm.INSTALL_STATUS"

    fun canInstall(context: Context): Boolean = context.packageManager.canRequestPackageInstalls()

    /**
     * Android 16's Advanced Protection blocks installs from anything but an app store, including
     * this in-app updater, and the "install unknown apps" switch can't be turned on. Then the only
     * way to update is over USB (adb) or a store. Read via reflection: compileSdk predates the API.
     */
    fun blockedByAdvancedProtection(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 36) return false
        return try {
            val mgr = context.getSystemService("advanced_protection") ?: return false
            mgr.javaClass.getMethod("isAdvancedProtectionEnabled").invoke(mgr) as? Boolean ?: false
        } catch (e: Exception) {
            Log.i("Installer", "advanced protection state unavailable: ${e.message}")
            false
        }
    }

    /** Settings page where the user allows this app to install updates. */
    fun permissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Throws (SecurityException) without starting a session when [apk] fails [ApkVerifier]. */
    fun install(context: Context, apk: File) {
        ApkVerifier.verify(context, apk)
        val pi = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            s.openWrite("ironterm.apk", 0, apk.length()).use { out -> apk.inputStream().use { it.copyTo(out) }; s.fsync(out) }
            val status = Intent(context, InstallStatusReceiver::class.java).setAction(ACTION_STATUS)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(context, id, status, flags).intentSender)
        }
    }
}

/** Receives the session result; brings up the system confirmation dialog when Android asks for it. */
class InstallStatusReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.let { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i("Installer", "update installed")
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "status $st"
                Log.w("Installer", "install failed: $msg")
                lastError = if (st == PackageInstaller.STATUS_FAILURE_CONFLICT || st == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE)
                    "Install failed: this build is signed differently. Uninstall the current app once, then install the release." else "Install failed: $msg"
                listener?.invoke(lastError!!)
            }
        }
    }

    companion object {
        @Volatile var lastError: String? = null
        @Volatile var listener: ((String) -> Unit)? = null
    }
}
