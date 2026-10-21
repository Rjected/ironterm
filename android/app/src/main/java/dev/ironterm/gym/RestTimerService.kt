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
            if (nm.getNotificationChannel(ALERT_CHANNEL) == null) {
                nm.createNotificationChannel(
                    // High importance so it pops up over whatever is on screen; the beep/vibration is RestAlert's
                    // (it follows the SETUP toggles and the ringer mode), so the channel itself stays quiet.
                    NotificationChannel(ALERT_CHANNEL, "Rest over", NotificationManager.IMPORTANCE_HIGH).apply {
                        setSound(null, null)
                        enableVibration(false)
                        description = "Pops up when a rest ends"
                        setShowBadge(false)
                        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    },
                )
            }
        }

        /** Heads-up "rest over" alert: its own high-importance channel (it pops up), no channel sound or vibration (RestAlert does those). */
        const val ALERT_CHANNEL = "gym_rest_over"
        const val ALERT_ID = 43
        /** The rest-over alert goes away by itself after this long. */
        const val ALERT_TIMEOUT_MS = 30_000L
        /** How often the rest progress bar is refreshed (the countdown chronometer ticks by itself). */
        const val TICK_MS = 5_000L

        /** The set to do next, as the notification words it. */
        data class Next(val name: String, val label: String, val load: String) {
            /** "Back Squat · Set 3/5 · 225 lb × 5" */
            val line: String get() = listOf(name, label, load).filter { it.isNotEmpty() }.joinToString(" · ")
        }

        fun next(s: LiveSession): Next? {
            val cur = Live.current(s) ?: return null
            val ex = s.exercises.firstOrNull { it.id == cur.exId } ?: return null
            val set = ex.sets.getOrNull(cur.set) ?: return null
            val total = ex.totalReps?.takeIf { it > 0 }
            val label = when {
                set.type == SetType.WARMUP -> "Warmup"
                total != null -> "${Live.repsDone(ex)}/$total reps"
                else -> Live.workingPosition(ex, cur.set)?.let { (n, of) -> "Set $n/$of" } ?: ""
            }
            val load = when {
                ex.isCardio -> set.durationSec?.let { "${(it / 60).toInt()} min" } ?: ""
                set.weight != null && set.weight != 0.0 -> "${Fmt.w(set.weight)} ${s.unit} × ${set.reps ?: "?"}"
                else -> "${set.reps ?: "?"} reps"
            }
            return Next(ex.displayName, label, load)
        }

        /** Rest length for the progress bar: the exercise's rest (60 s cap after a warm-up), never less than what's left. */
        private fun restTotalMs(s: LiveSession, leftMs: Long): Long {
            val ex = s.exercises.firstOrNull { it.id == s.restFor }
            val last = ex?.sets?.filter { it.done }?.maxByOrNull { Live.parseMs(it.doneAt) ?: 0L }
            val sec = ex?.restSeconds?.takeIf { it > 0 }?.let { if (last?.type == SetType.WARMUP) minOf(60, it) else it } ?: 90
            return maxOf(sec * 1000L, leftMs)
        }

        /**
         * The ongoing notification for a session at [nowMs]. Pure, unit tested. Three states:
         * resting (REST + countdown + progress), working after a rest (SET n/N · LIFT + overtime count-up),
         * working (SET n/N · LIFT + workout clock); or all done.
         */
        fun content(s: LiveSession, nowMs: Long): NotifContent {
            val nx = next(s)
            val prog = Live.progress(s)
            val sets = "${prog.done}/${prog.total} sets"
            val end = Live.parseMs(s.restEndsAt)
            if (end != null && end > nowMs) {
                val total = restTotalMs(s, end - nowMs)
                return NotifContent(
                    title = "REST", text = nx?.let { "Next: ${it.line}" } ?: "Next: all sets done · tap FINISH",
                    whenMs = end, countDown = true, state = NotifState.RESTING, hasNext = nx != null, subText = "rest left",
                    progressMax = (total / 1000).toInt(), progress = ((total - (end - nowMs)) / 1000).toInt().coerceIn(0, (total / 1000).toInt()),
                )
            }
            if (nx == null) {
                return NotifContent("ALL SETS DONE", "Tap to FINISH and save ${s.title}", Live.parseMs(s.startedAt) ?: nowMs, countDown = false, state = NotifState.DONE, hasNext = false, subText = sets)
            }
            val title = (if (nx.label.isNotEmpty()) "${nx.label.uppercase()} · " else "") + nx.name.uppercase()
            return if (end != null) {
                // rest is over and the next set isn't done: count the overtime up from the end of the rest
                NotifContent(title, "Go: ${nx.line}", end, countDown = false, state = NotifState.OVERTIME, hasNext = true, subText = "overtime")
            } else {
                NotifContent(title, nx.line, Live.parseMs(s.startedAt) ?: nowMs, countDown = false, state = NotifState.WORKING, hasNext = true, subText = sets)
            }
        }

        /** The heads-up when a rest ends: ("Rest over", "Go: Back Squat · Set 3/5 · 225 lb × 5"). */
        fun restOver(s: LiveSession): Pair<String, String> =
            "Rest over" to (next(s)?.let { "Go: ${it.line}" } ?: "All sets done · tap FINISH")
    }

    enum class NotifState { RESTING, OVERTIME, WORKING, DONE }

    data class NotifContent(
        val title: String,
        val text: String,
        /** chronometer base: rest end (counting down, or up for overtime) or the workout start */
        val whenMs: Long,
        val countDown: Boolean,
        val state: NotifState,
        val hasNext: Boolean,
        /** shown next to the chronometer: "rest left", "overtime" (counting up since the rest ended), "3/14 sets" */
        val subText: String,
        /** rest progress in seconds (resting only) */
        val progressMax: Int = 0,
        val progress: Int = 0,
    ) {
        val resting: Boolean get() = state == NotifState.RESTING
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var alarm: Job? = null
    private var alarmFor: String? = null
    /** restEndsAt the rest-over alert was posted for (one per rest) */
    private var alertFor: String? = null
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
                    cancelAlert()
                    stopForegroundCompat()
                    stopSelf()
                    return@collect
                }
                // a set done, +30 s or skip: the rest-over alert (if any) is for a rest that's gone
                if (alertFor != null && session.restEndsAt != alertFor) cancelAlert()
                notifyFor(session)
                armAlarm(session)
            }
        }
    }

    private fun cancelAlert() {
        alertFor = null
        runCatching { NotificationManagerCompat.from(this).cancel(ALERT_ID) }
    }

    /** Heads-up "Rest over · Go: …", once per rest; gone after [ALERT_TIMEOUT_MS] or when the session moves on. */
    private fun postAlert(s: LiveSession) {
        if (alertFor == s.restEndsAt) return
        alertFor = s.restEndsAt
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val (title, text) = restOver(s)
        val b = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setColor(0xFFFFB000.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setTimeoutAfter(ALERT_TIMEOUT_MS)
            .setContentIntent(openIntent())
        if (Live.current(s) != null) b.addAction(0, "Set done", pending(ACTION_DONE, 5))
        runCatching { NotificationManagerCompat.from(this).notify(ALERT_ID, b.build()) }
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

    private fun openIntent(): PendingIntent = PendingIntent.getActivity(
        this, 1,
        Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, Tabs.GYM).setAction("dev.ironterm.OPEN_GYM")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun build(s: LiveSession?): android.app.Notification {
        val open = openIntent()
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
            .setSubText(c.subText)
        if (c.resting) b.setProgress(c.progressMax, c.progress, false)
        // resting reads as quiet grey, a set to do as the app's amber
        b.setColorized(false).setColor(if (c.resting) 0xFF8A8A8A.toInt() else 0xFFFFB000.toInt())
        if (c.resting) {
            b.addAction(0, "+30s", pending(ACTION_PLUS30, 2))
            b.addAction(0, "Skip rest", pending(ACTION_SKIP, 3))
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
            val store = Gym.store(this@RestTimerService)
            // the rest progress bar moves every few seconds (the countdown itself is a chronometer)
            while (end - System.currentTimeMillis() > TICK_MS) {
                delay(TICK_MS)
                store.session?.takeIf { it.restEndsAt == endIso }?.let { notifyFor(it) } ?: return@launch
            }
            val rest = end - System.currentTimeMillis()
            if (rest > 0) delay(rest)
            val s = store.session?.takeIf { it.restEndsAt == endIso }
            if (s != null) {
                RestAlert.fire(this@RestTimerService)
                postAlert(s)
                notifyFor(s) // REST → SET n/N with the overtime count-up
            }
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
