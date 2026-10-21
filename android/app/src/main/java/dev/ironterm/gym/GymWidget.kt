package dev.ironterm.gym

import android.content.Context
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.text.Text
import dev.ironterm.Fmt
import dev.ironterm.R
import dev.ironterm.ui.Tabs
import dev.ironterm.widget.Header
import dev.ironterm.widget.Placeholder
import dev.ironterm.widget.VSpace
import dev.ironterm.widget.WC
import dev.ironterm.widget.WidgetFrame
import dev.ironterm.widget.mono

/** 2×1 "current set" widget: the exercise and set you're on, and the live rest countdown. */
class GymWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = Gym.store(context)
        provideContent {
            // Read the store inside the composition: Glance keeps a session alive between
            // updates and only recomposes, so a value captured outside would go stale.
            val st by store.state.collectAsState()
            GymWidgetContent(st.session, System.currentTimeMillis())
        }
    }

    companion object {
        suspend fun refresh(context: Context) {
            runCatching { GymWidget().updateAll(context) }
        }
    }
}

class GymWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GymWidget()
}

@Composable
fun GymWidgetContent(s: LiveSession?, nowMs: Long) {
    val size = LocalSize.current
    val ctx = LocalContext.current
    WidgetFrame(Tabs.GYM, padding = 8.dp) {
        if (s == null) {
            Placeholder("GYM", "No session.\nTap to start.")
            return@WidgetFrame
        }
        val cur = Live.current(s)
        val ex = cur?.let { c -> s.exercises.firstOrNull { it.id == c.exId } }
        val set = cur?.let { ex?.sets?.getOrNull(it.set) }
        val prog = Live.progress(s)
        val end = Live.parseMs(s.restEndsAt)
        val resting = end != null && end > nowMs
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Header(if (resting) "REST" else if (cur == null) "DONE" else "GYM", "${prog.done}/${prog.total}")
            VSpace(2.dp)
            if (ex == null || set == null) {
                Text("All sets done", style = mono(12.sp, WC.text, bold = true), maxLines = 1)
                Text("Tap to finish", style = mono(9.sp, WC.dim), maxLines = 1)
                return@Column
            }
            val label = when {
                set.type == SetType.WARMUP -> "WARMUP"
                (ex.totalReps ?: 0) > 0 -> "${Live.repsDone(ex)}/${ex.totalReps} REPS"
                else -> Live.workingPosition(ex, cur.set)?.let { (n, of) -> "SET $n/$of" } ?: ""
            }
            val load = when {
                ex.isCardio -> set.durationSec?.let { "${(it / 60).toInt()} MIN" } ?: ""
                set.weight != null && set.weight != 0.0 -> "${Fmt.w(set.weight)}×${set.reps ?: "?"}"
                else -> "${set.reps ?: "?"} REPS"
            }
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text((ex.def?.short ?: ex.displayName).uppercase(), style = mono(if (size.width < 160.dp) 11.sp else 13.sp, WC.text, bold = true), maxLines = 1)
                    Text("$label · $load", style = mono(9.sp, WC.dim), maxLines = 1)
                }
                if (resting) {
                    Box(contentAlignment = Alignment.CenterEnd) {
                        val rv = RemoteViews(ctx.packageName, R.layout.widget_rest_chrono).apply {
                            setChronometer(R.id.chrono, SystemClock.elapsedRealtime() + (end!! - nowMs), null, true)
                            setChronometerCountDown(R.id.chrono, true)
                        }
                        AndroidRemoteViews(rv)
                    }
                }
            }
        }
    }
}
