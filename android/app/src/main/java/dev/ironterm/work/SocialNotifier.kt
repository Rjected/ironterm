package dev.ironterm.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dev.ironterm.R
import dev.ironterm.data.Settings
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppApi
import dev.ironterm.data.social.SocialApi
import dev.ironterm.data.social.SocialNotification
import dev.ironterm.ui.MainActivity
import dev.ironterm.ui.Tabs

/**
 * After a background sync: one system notification for new unread FRIENDS notifications (requests,
 * accepts, reactions, comments). Only with a server, only when POST_NOTIFICATIONS is granted, and
 * each server notification is announced at most once (newest `at` remembered in Settings).
 */
object SocialNotifier {
    const val CHANNEL = "social"
    private const val TAG = "SocialNotifier"
    private const val NOTIF_ID = 77

    /** Unread items newer than what was already announced, newest first. Pure. */
    fun fresh(items: List<SocialNotification>, notifiedAt: String?): List<SocialNotification> =
        items.filter { !it.read && (notifiedAt == null || it.at > notifiedAt) }.sortedByDescending { it.at }

    /** (title, text) for [items] (non-empty). Pure. */
    fun summary(items: List<SocialNotification>): Pair<String, String> {
        val first = items.first()
        val who = first.from.display
        val one = when (first.kind) {
            "request" -> "$who sent you a friend request"
            "accepted" -> "$who accepted your friend request"
            "reaction" -> "$who reacted ${first.emoji.orEmpty()} to your activity"
            "comment" -> "$who commented: ${first.text.orEmpty()}"
            else -> "$who: ${first.kind}"
        }
        return if (items.size == 1) "Friends" to one else "Friends · ${items.size} new" to one + " and ${items.size - 1} more"
    }

    fun allowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    suspend fun check(context: Context, settings: Settings = Settings.get(context)) {
        if (settings.mode != SourceMode.SERVER) return
        if (!allowed(context)) { Log.i(TAG, "notifications not allowed"); return }
        val url = settings.serverUrl ?: return
        val token = settings.appToken ?: return
        val list = try { SocialApi(AppApi(url, token)).notifications() } catch (e: Exception) { Log.i(TAG, "no social notifications: ${e.message}"); return } // not set up / old server / offline
        val new = fresh(list.items, settings.socialNotifiedAt)
        Log.i(TAG, "${list.items.size} notifications, ${new.size} new")
        if (new.isEmpty()) return
        settings.socialNotifiedAt = new.first().at
        post(context, summary(new))
    }

    private fun post(context: Context, content: Pair<String, String>) {
        ensureChannel(context)
        val open = Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, Tabs.NOTIFICATIONS).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(context, NOTIF_ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(content.first)
            .setContentText(content.second)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.second))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .build()
        try { NotificationManagerCompat.from(context).notify(NOTIF_ID, n) } catch (_: SecurityException) { }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Friend requests, reactions and comments"
            })
        }
    }
}
