package dev.ironterm.gym

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.ironterm.Fmt
import dev.ironterm.R
import dev.ironterm.data.Settings
import dev.ironterm.ui.MainActivity
import dev.ironterm.ui.Tabs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin

/**
 * Foreground service that runs while a gym session is open: an ongoing, lock-screen-visible
 * notification with the rest countdown (+30s / SKIP), or the next set (DONE). It fires the
 * rest-over alert (vibration + beep, respecting silent mode and the SETUP toggles) even with the
 * screen off: a partial wake lock is held only for the length of a rest.
 */
class RestTimerService : Service() {
    companion object {
        /** Default importance (silent: no sound, no vibration) so it shows on the lock screen, not under "Silent". */
        const val CHANNEL = "gym_session_v2"
        const val NOTIF_ID = 42
        const val ACTION_PLUS30 = "dev.ironterm.gym.PLUS30"
        const val ACTION_SKIP = "dev.ironterm.gym.SKIP"
        const val ACTION_DONE = "dev.ironterm.gym.DONE"
        private const val TAG = "RestTimer"

        /** Start (or keep) the service; called from the foreground when a session starts or the app opens. */
        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, RestTimerService::class.java))
            } catch (e: Exception) {
                // Background start not allowed (Android 12+): the next app open starts it.
                Log.w(TAG, "can't start from background", e)
            }
        }

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.deleteNotificationChannel("gym_session")
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Gym session", NotificationManager.IMPORTANCE_DEFAULT).apply {
                        setSound(null, null)
                        enableVibration(false)
                        description = "Rest timer and next set while you train"
                        setShowBadge(false)
                        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    },
                )
            }
        }

        /** Notification text for a session: (title, body, chronometer base or null, counting down). Pure, unit tested. */
        fun content(s: LiveSession, nowMs: Long): NotifContent {
            val cur = Live.current(s)
            val ex = cur?.let { c -> s.exercises.firstOrNull { it.id == c.exId } }
            val set = cur?.let { ex?.sets?.getOrNull(it.set) }
            val nextLine = if (ex != null && set != null) {
                val n = ex.sets.count { it.type != SetType.WARMUP }
                val label = Live.setLabel(ex, cur.set).let { if (it == "W") "Warmup" else "Set $it/$n" }
                val load = when {
                    ex.isCardio -> set.durationSec?.let { "${(it / 60).toInt()} min" } ?: ""
                    set.weight != null && set.weight != 0.0 -> "${Fmt.w(set.weight)} ${s.unit} × ${set.reps ?: "?"}"
                    else -> "${set.reps ?: "?"} reps"
                }
                "${ex.displayName} · $label · $load"
            } else "All sets done · tap FINISH"
            val end = Live.parseMs(s.restEndsAt)
            return if (end != null && end > nowMs) {
                NotifContent("REST", "Next: $nextLine", end, countDown = true, resting = true, hasNext = cur != null)
            } else {
                val start = Live.parseMs(s.startedAt) ?: nowMs
                NotifContent(if (end != null) "GO · ${s.title}" else s.title, nextLine, start, countDown = false, resting = false, hasNext = cur != null)
            }
        }
    }

    data class NotifContent(val title: String, val text: String, val whenMs: Long, val countDown: Boolean, val resting: Boolean, val hasNext: Boolean)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var alarm: Job? = null
    private var alarmFor: String? = null
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel(this)
        val store = Gym.store(this)
        val s = store.session
        startInForeground(s)
        scope.launch {
            store.state.map { it.session }.distinctUntilChanged().collect { session ->
                if (session == null) {
                    stopForegroundCompat()
                    stopSelf()
                    return@collect
                }
                notifyFor(session)
                armAlarm(session)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = Gym.store(this)
        val now = System.currentTimeMillis()
        when (intent?.action) {
            ACTION_PLUS30 -> store.update { Live.restPlus(it, now) }
            ACTION_SKIP -> store.update { Live.skipRest(it) }
            ACTION_DONE -> store.update { s -> Live.current(s)?.let { c -> Live.completeSet(s, c.exId, c.set, now) } ?: s }
        }
        if (store.session == null) {
            stopForegroundCompat()
            stopSelf()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        releaseWake()
        super.onDestroy()
    }

    private fun startInForeground(s: LiveSession?) {
        val n = build(s)
        try {
            ServiceCompat.startForeground(
                this, NOTIF_ID, n,
                if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground failed", e)
            stopSelf()
        }
    }

    private fun stopForegroundCompat() = ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)

    private fun notifyFor(s: LiveSession) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        runCatching { NotificationManagerCompat.from(this).notify(NOTIF_ID, build(s)) }
    }

    private fun pending(action: String, code: Int) = PendingIntent.getService(
        this, code, Intent(this, RestTimerService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun build(s: LiveSession?): android.app.Notification {
        val open = PendingIntent.getActivity(
            this, 1,
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, Tabs.GYM).setAction("dev.ironterm.OPEN_GYM")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val b = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setColor(0xFFFFB000.toInt())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
        if (s == null) return b.setContentTitle("Gym").setContentText("Loading…").build()
        val c = content(s, System.currentTimeMillis())
        b.setContentTitle(c.title).setContentText(c.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(c.text))
            .setWhen(c.whenMs).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(c.countDown)
            .setSubText(Live.progress(s).let { "${it.done}/${it.total} sets" })
        if (c.resting) {
            b.addAction(0, "+30s", pending(ACTION_PLUS30, 2))
            b.addAction(0, "Skip", pending(ACTION_SKIP, 3))
        } else if (c.hasNext) {
            b.addAction(0, "Set done", pending(ACTION_DONE, 4))
        }
        return b.build()
    }

    /** Rest-over alert at restEndsAt; a wake lock keeps the CPU up for just that long. */
    private fun armAlarm(s: LiveSession) {
        val endIso = s.restEndsAt
        val end = Live.parseMs(endIso)
        if (endIso == alarmFor) return
        alarm?.cancel()
        releaseWake()
        alarmFor = endIso
        if (end == null) return
        val left = end - System.currentTimeMillis()
        if (left < -5_000) return // long over (e.g. service restarted): don't beep late
        acquireWake(left.coerceAtLeast(0) + 10_000)
        alarm = scope.launch {
            if (left > 0) delay(left)
            RestAlert.fire(this@RestTimerService)
            Gym.store(this@RestTimerService).session?.let { notifyFor(it) } // REST → GO
            GymWidget.refresh(this@RestTimerService)
            releaseWake()
        }
    }

    private fun acquireWake(ms: Long) {
        val pm = getSystemService(PowerManager::class.java) ?: return
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ironterm:rest").apply { setReferenceCounted(false); acquire(ms) }
    }

    private fun releaseWake() {
        runCatching { wake?.takeIf { it.isHeld }?.release() }
        wake = null
    }
}

/** Haptic + sound when rest ends. Silent mode: nothing; vibrate mode: vibration only. */
object RestAlert {
    enum class Output { NONE, VIBRATE, SOUND_AND_VIBRATE, SOUND }

    /** Pure decision, unit tested. */
    fun decide(ringerMode: Int, sound: Boolean, vibrate: Boolean): Output {
        val canSound = sound && ringerMode == AudioManager.RINGER_MODE_NORMAL
        val canVibrate = vibrate && ringerMode != AudioManager.RINGER_MODE_SILENT
        return when {
            canSound && canVibrate -> Output.SOUND_AND_VIBRATE
            canSound -> Output.SOUND
            canVibrate -> Output.VIBRATE
            else -> Output.NONE
        }
    }

    fun fire(context: Context) {
        val settings = Settings.get(context)
        val am = context.getSystemService(AudioManager::class.java)
        val out = decide(am?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL, settings.restSound, settings.restVibrate)
        Log.i("RestTimer", "rest over: ringer=${am?.ringerMode} alert=$out")
        if (out == Output.VIBRATE || out == Output.SOUND_AND_VIBRATE) vibrate(context)
        if (out == Output.SOUND || out == Output.SOUND_AND_VIBRATE) beep()
    }

    private fun vibrate(context: Context) {
        val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
        runCatching { v?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200, 100, 350), -1)) }
    }

    /** Three short tones (880, 880, 1320 Hz) like the web app, on the notification stream. */
    private fun beep() {
        Thread {
            runCatching {
                val rate = 44100
                val tones = listOf(880.0 to 0.15, 0.0 to 0.03, 880.0 to 0.15, 0.0 to 0.03, 1320.0 to 0.22)
                val total = tones.sumOf { (it.second * rate).toInt() }
                val pcm = ShortArray(total)
                var i = 0
                for ((f, d) in tones) {
                    val n = (d * rate).toInt()
                    for (k in 0 until n) {
                        val env = minOf(1.0, k / 400.0, (n - k) / 400.0)
                        pcm[i++] = if (f == 0.0) 0 else (sin(2 * PI * f * k / rate) * 0.35 * env * Short.MAX_VALUE).toInt().toShort()
                    }
                }
                val track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.size * 2)
                    .build()
                track.write(pcm, 0, pcm.size)
                track.play()
                Thread.sleep((total * 1000L / rate) + 200)
                track.release()
            }
        }.start()
    }
}
