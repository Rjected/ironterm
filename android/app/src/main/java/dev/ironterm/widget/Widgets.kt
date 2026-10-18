package dev.ironterm.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import dev.ironterm.work.SyncWorker

/**
 * Every widget is a Glance widget that renders [WidgetData] from the on-disk snapshot.
 * SizeMode.Exact: LocalSize is the real placed size, so each layout adapts to how big it is.
 */
abstract class BaseWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    @Composable
    abstract fun Content(data: WidgetData)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(-1)
        val data = WidgetData.load(context, appWidgetId)
        provideContent { Content(data) }
    }
}

class GraphWidget : BaseWidget() {
    @Composable override fun Content(data: WidgetData) = GraphWidgetContent(data)
}

class NextWorkoutWidget : BaseWidget() {
    @Composable override fun Content(data: WidgetData) = NextWorkoutWidgetContent(data)
}

class WeekWidget : BaseWidget() {
    @Composable override fun Content(data: WidgetData) = WeekWidgetContent(data)
}

class LiftsWidget : BaseWidget() {
    @Composable override fun Content(data: WidgetData) = LiftsWidgetContent(data)
}

class RecoveryWidget : BaseWidget() {
    @Composable override fun Content(data: WidgetData) = RecoveryWidgetContent(data)
}

/** Shared receiver behaviour: keep the periodic refresh scheduled while any widget exists. */
abstract class BaseWidgetReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        SyncWorker.schedulePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        if (!Widgets.any(context)) SyncWorker.cancelPeriodic(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        val opts = WidgetOptions(context)
        appWidgetIds.forEach(opts::remove)
    }
}

/** The activity graph. */
class GraphWidgetReceiver : BaseWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GraphWidget()
}

class NextWorkoutWidgetReceiver : BaseWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextWorkoutWidget()
}

class WeekWidgetReceiver : BaseWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekWidget()
}

class LiftsWidgetReceiver : BaseWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = LiftsWidget()
}

class RecoveryWidgetReceiver : BaseWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RecoveryWidget()
}

/** Run from a widget: refresh now. */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        SyncWorker.enqueueOneTime(context)
    }
}

object Widgets {
    val receivers = listOf(
        GraphWidgetReceiver::class.java,
        NextWorkoutWidgetReceiver::class.java,
        WeekWidgetReceiver::class.java,
        LiftsWidgetReceiver::class.java,
        RecoveryWidgetReceiver::class.java,
    )

    fun any(context: Context): Boolean {
        val m = AppWidgetManager.getInstance(context) ?: return false
        return receivers.any { m.getAppWidgetIds(ComponentName(context, it)).isNotEmpty() }
    }

    /** Re-render every placed widget from the cache. */
    suspend fun updateAll(context: Context) {
        listOf(GraphWidget(), NextWorkoutWidget(), WeekWidget(), LiftsWidget(), RecoveryWidget()).forEach {
            runCatching { it.updateAll(context) }
        }
    }
}
