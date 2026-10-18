package dev.ironterm.widget

import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews

/** One placement size shown in the gallery (≈ Pixel launcher cell sizes in portrait). */
data class Variant(val name: String, val cells: String, val size: DpSize)

data class WidgetKind(
    val id: String,
    val title: String,
    val description: String,
    val receiver: Class<out AppWidgetProvider>,
    val variants: List<Variant>,
    val content: @Composable (WidgetData) -> Unit,
)

object WidgetCatalog {
    // Pixel 7 launcher cell sizes (measured on the emulator).
    val S = Variant("small", "2×2", DpSize(176.dp, 210.dp))
    val W = Variant("wide", "4×1", DpSize(360.dp, 92.dp))
    val M = Variant("medium", "4×2", DpSize(360.dp, 210.dp))
    val L = Variant("large", "4×3", DpSize(360.dp, 320.dp))

    val all: List<WidgetKind> = listOf(
        WidgetKind(
            "graph", "Activity graph", "Your training year. 2×2: last 16 weeks · 4×2: 26 weeks + streak · 4×3: full year + stats. Colour theme per widget.",
            GraphWidgetReceiver::class.java, listOf(S, M, L),
        ) { GraphWidgetContent(it) },
        WidgetKind(
            "next", "Next workout", "The next planned session with weights. 2×2: top lifts · 4×2: every exercise · 4×3: plus this week. Tap opens TODAY.",
            NextWorkoutWidgetReceiver::class.java, listOf(S, M, L),
        ) { NextWorkoutWidgetContent(it) },
        WidgetKind(
            "week", "This week", "Sessions done vs target. 2×2: ring + streak · 4×1 / 4×2: Mon–Sun strip.",
            WeekWidgetReceiver::class.java, listOf(S, W, M),
        ) { WeekWidgetContent(it) },
        WidgetKind(
            "lifts", "Lifts", "Estimated 1RMs. 2×2: one lift you choose + trend · 4×2: big four · 4×3: up to 8 with sparklines.",
            LiftsWidgetReceiver::class.java, listOf(S, M, L),
        ) { LiftsWidgetContent(it) },
        WidgetKind(
            "recovery", "Recovery", "Muscle readiness (server mode). 2×2: overall gauge · 4×2 / 4×3: least-ready muscles.",
            RecoveryWidgetReceiver::class.java, listOf(S, M, L),
        ) { RecoveryWidgetContent(it) },
        WidgetKind(
            "gym", "Gym · current set", "While you train: the exercise and set you're on, and the live rest countdown. 2×1. Tap opens GYM.",
            dev.ironterm.gym.GymWidgetReceiver::class.java, listOf(Variant("small", "2×1", DpSize(176.dp, 92.dp)), W),
        ) { dev.ironterm.gym.GymWidgetContent(it.gymSession, if (it.now > 0) it.now else System.currentTimeMillis()) },
    )

    fun byReceiver(cls: String?): WidgetKind? = all.firstOrNull { it.receiver.name == cls }

    /**
     * Renders a widget exactly like the launcher would: Glance → RemoteViews → inflated View.
     * Used by the in-app gallery and the screenshot tests.
     */
    @OptIn(ExperimentalGlanceRemoteViewsApi::class)
    suspend fun render(context: Context, kind: WidgetKind, size: DpSize, data: WidgetData, parent: FrameLayout? = null): View {
        val rv = GlanceRemoteViews().compose(context, size) { kind.content(data) }.remoteViews
        val host = parent ?: FrameLayout(context)
        return rv.apply(context, host)
    }
}
