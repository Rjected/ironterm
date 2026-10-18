package dev.ironterm.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dev.ironterm.data.WeekDay
import dev.ironterm.ui.MainActivity

/** Terminal palette for widgets (docs/api/README.md → Look). */
object WC {
    val bg = Color(0xFF000000)
    val panel = Color(0xFF050506)
    val line = Color(0xFF222428)
    val text = Color(0xFFDCDCDC)
    val dim = Color(0xFF8A8D93)
    val faint = Color(0xFF55585E)
    val amber = Color(0xFFFFB000)
    val up = Color(0xFF8CB4FF)
    val down = Color(0xFFFF6B5E)
    val done = Color(0xFF5082DC)
}

fun cp(c: Color) = ColorProvider(c)

fun mono(size: TextUnit = 11.sp, color: Color = WC.text, bold: Boolean = false, align: TextAlign = TextAlign.Start) =
    TextStyle(
        color = cp(color), fontSize = size, fontFamily = FontFamily.Monospace,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, textAlign = align,
    )

fun openApp(context: Context, tab: String): Action = actionStartActivity(
    Intent(context, MainActivity::class.java).apply {
        action = "dev.ironterm.OPEN_$tab"
        putExtra(MainActivity.EXTRA_TAB, tab)
        putExtra(MainActivity.EXTRA_REFRESH, true)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
)

/** Black terminal panel filling the widget, tapping opens the app on [tab] (which also refreshes). */
@Composable
fun WidgetFrame(tab: String, padding: Dp = 10.dp, content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .appWidgetBackground()
            .cornerRadius(android.R.dimen.system_app_widget_background_radius)
            .background(WC.bg)
            .clickable(openApp(ctx, tab))
            .padding(padding),
    ) { content() }
}

/** "LABEL ………… right" header line: amber label, dim right text. */
@Composable
fun Header(label: String, right: String? = null, rightColor: Color = WC.dim) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = mono(10.sp, WC.amber, bold = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        if (right != null) Text(right, style = mono(10.sp, rightColor, bold = rightColor == WC.amber), maxLines = 1)
    }
}

@Composable
fun Divider() {
    Spacer(GlanceModifier.fillMaxWidth().height(1.dp).background(WC.line))
}

@Composable
fun VSpace(h: Dp) = Spacer(GlanceModifier.height(h))

@Composable
fun HSpace(w: Dp) = Spacer(GlanceModifier.width(w))

/** Horizontal bar: [fraction] filled in [color] over the line colour. */
@Composable
fun Bar(fraction: Double, color: Color, width: Dp, height: Dp = 4.dp) {
    val f = fraction.coerceIn(0.0, 1.0)
    val filled = (width.value * f).dp
    Row(modifier = GlanceModifier.width(width).height(height).background(WC.line)) {
        if (filled.value >= 1f) Spacer(GlanceModifier.width(filled).height(height).background(color))
    }
}

fun readinessColor(r: Double): Color = when {
    r < 0.5 -> WC.down
    r < 0.8 -> WC.amber
    else -> WC.up
}

/** Mon..Sun cells with statuses. [cell] = square size. */
@Composable
fun WeekStrip(days: List<WeekDay>, cell: Dp, showLabels: Boolean = true, labelSize: TextUnit = 9.sp) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        days.forEach { d ->
            Column(modifier = GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                if (showLabels) {
                    Text(
                        d.dow.take(if (cell >= 22.dp) 3 else 1),
                        style = mono(labelSize, if (d.status == WeekDay.STATUS_TODAY) WC.amber else WC.dim, align = TextAlign.Center),
                        maxLines = 1,
                    )
                    VSpace(3.dp)
                }
                StatusCell(d.status, cell)
            }
        }
    }
}

@Composable
fun StatusCell(status: String, size: Dp) {
    val (outline, fill, glyph) = when (status) {
        WeekDay.STATUS_DONE -> Triple(WC.done, WC.done, "")
        WeekDay.STATUS_TODAY -> Triple(WC.amber, WC.bg, "")
        WeekDay.STATUS_PLANNED -> Triple(WC.faint, WC.bg, "")
        WeekDay.STATUS_MISSED -> Triple(WC.down, WC.bg, "×")
        WeekDay.STATUS_TRAVEL -> Triple(WC.line, WC.line, "T")
        else -> Triple(WC.line, WC.panel, "")
    }
    Box(modifier = GlanceModifier.size(size).background(outline).padding(1.dp)) {
        Box(modifier = GlanceModifier.fillMaxSize().background(fill), contentAlignment = Alignment.Center) {
            if (glyph.isNotEmpty()) Text(glyph, style = mono(9.sp, if (status == WeekDay.STATUS_MISSED) WC.down else WC.dim, align = TextAlign.Center))
        }
    }
}

/** Centered message used for empty / not connected / needs-server states. */
@Composable
fun Placeholder(title: String, body: String) {
    Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = mono(11.sp, WC.amber, bold = true, align = TextAlign.Center), maxLines = 2)
        VSpace(4.dp)
        Text(body, style = mono(9.sp, WC.dim, align = TextAlign.Center), maxLines = 4)
    }
}
