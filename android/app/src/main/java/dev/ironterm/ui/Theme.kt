package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Terminal look (docs/api/README.md): black, monospace, amber accent, thin lines, uppercase labels. */
object T {
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
    val ramp = listOf(Color(0xFF16181D), Color(0xFF8CB4FF), Color(0xFF5082DC), Color(0xFF285AB4), Color(0xFF0F3278))
    val mono = FontFamily.Monospace

    fun style(size: TextUnit = 13.sp, color: Color = text, bold: Boolean = false) =
        TextStyle(fontFamily = mono, fontSize = size, color = color, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, letterSpacing = 0.sp)
}

object Tabs {
    const val TODAY = "today"
    const val GRAPH = "graph"
    const val LIFTS = "lifts"
    const val BODY = "body"
    const val WEB = "web"
    const val SETUP = "setup"
    val all = listOf(TODAY, GRAPH, LIFTS, BODY, WEB, SETUP)
}

@Composable
fun TerminalTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = T.amber, onPrimary = T.bg, background = T.bg, onBackground = T.text,
            surface = T.bg, onSurface = T.text, outline = T.line,
        ),
        content = content,
    )
}

@Composable
fun Mono(
    text: String,
    modifier: Modifier = Modifier,
    size: TextUnit = 13.sp,
    color: Color = T.text,
    bold: Boolean = false,
    maxLines: Int = Int.MAX_VALUE,
    align: TextAlign? = null,
) {
    Text(
        text, modifier = modifier, style = T.style(size, color, bold).let { if (align != null) it.copy(textAlign = align) else it },
        maxLines = maxLines, overflow = TextOverflow.Ellipsis,
    )
}

/** Amber uppercase section label with an optional right-hand note. */
@Composable
fun Label(text: String, modifier: Modifier = Modifier, right: String? = null, rightColor: Color = T.dim) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Mono(text.uppercase(), Modifier.weight(1f), size = 11.sp, color = T.amber, bold = true, maxLines = 1)
        if (right != null) Mono(right, size = 11.sp, color = rightColor, bold = rightColor == T.amber, maxLines = 1)
    }
}

@Composable
fun Line(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(T.line))
}

/** A titled block separated by a thin line. */
@Composable
fun Section(title: String, right: String? = null, rightColor: Color = T.dim, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
        Label(title, right = right, rightColor = rightColor)
        Spacer(Modifier.height(10.dp))
        content()
    }
    Line()
}

/** Bordered terminal button: [ LABEL ]. */
@Composable
fun TButton(text: String, modifier: Modifier = Modifier, primary: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val c = when {
        !enabled -> T.faint
        primary -> T.amber
        else -> T.text
    }
    Box(
        modifier
            .border(1.dp, if (primary && enabled) T.amber else T.line)
            .background(if (primary && enabled) T.amber.copy(alpha = 0.08f) else T.bg)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) { Mono(text.uppercase(), size = 12.sp, color = c, bold = true, maxLines = 1) }
}

@Composable
fun Badge(text: String, color: Color = T.amber) {
    Box(Modifier.background(color).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Mono(text, size = 10.sp, color = T.bg, bold = true, maxLines = 1)
    }
}

/** Horizontal readiness / progress bar. */
@Composable
fun BarLine(fraction: Double, color: Color, modifier: Modifier = Modifier, height: Dp = 6.dp) {
    Box(modifier.height(height).background(T.line)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat()).height(height).background(color))
    }
}

/** Label over value, for stat grids. */
@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier, sub: String? = null, valueColor: Color = T.text, subColor: Color = T.dim) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Mono(label.uppercase(), size = 10.sp, color = T.faint, maxLines = 1)
        Mono(value, size = 18.sp, color = valueColor, bold = true, maxLines = 1)
        if (sub != null) Mono(sub, size = 10.sp, color = subColor, maxLines = 1)
    }
}

fun readinessColor(r: Double): Color = when {
    r < 0.5 -> T.down
    r < 0.8 -> T.amber
    else -> T.up
}

fun deltaColor(x: Double?): Color = when {
    x == null -> T.faint
    x > 0.05 -> T.up
    x < -0.05 -> T.down
    else -> T.dim
}
