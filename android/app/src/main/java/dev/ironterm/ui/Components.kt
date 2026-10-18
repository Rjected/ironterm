package dev.ironterm.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.GraphDay
import dev.ironterm.data.Snapshot
import dev.ironterm.data.WeekDay
import dev.ironterm.data.app.Load
import dev.ironterm.widget.ColorTheme
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToInt

// ───────────────────────────── layout ─────────────────────────────

/** Scrollable screen body with pull-to-refresh. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshColumn(refreshing: Boolean, onRefresh: (() -> Unit)?, content: @Composable ColumnScope.() -> Unit) {
    val scroll = rememberScrollState()
    val body = @Composable {
        Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
            content()
            Spacer(Modifier.height(32.dp))
        }
    }
    if (onRefresh == null) body() else PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) { body() }
}

/**
 * Renders a [Load]: skeleton while the first load runs, an error card with RETRY when there's
 * nothing to show, the Direct-mode explainer, or the content with an "offline" strip on top.
 */
@Composable
fun <T> Loaded(
    load: Load<T>,
    title: String,
    onRetry: () -> Unit,
    onSetup: (() -> Unit)? = null,
    needsServerText: String = "",
    content: @Composable (T) -> Unit,
) {
    val d = load.data
    when {
        load.needsServer -> NeedsServer(title, needsServerText, onSetup)
        d == null && load.error != null -> ErrorState(load.error, auth = load.auth, onRetry = onRetry, onSetup = onSetup)
        d == null -> LoadingState(title)
        else -> Column(Modifier.fillMaxSize()) {
            if (load.error != null) StaleStrip(load.error, load.savedAt)
            Box(Modifier.weight(1f)) { content(d) }
        }
    }
}

@Composable
fun StaleStrip(error: String, savedAt: Long, now: Long = System.currentTimeMillis()) {
    Row(Modifier.fillMaxWidth().background(T.panel).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Mono("×", size = 11.sp, color = T.dim, bold = true)
        Spacer(Modifier.width(8.dp))
        Mono("$error" + if (savedAt > 0) " Showing ${Fmt.ago(savedAt, now).lowercase()}." else "", Modifier.weight(1f), size = 10.sp, color = T.dim, maxLines = 2)
    }
    Line()
}

@Composable
fun LoadingState(title: String) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Label(title)
        Spacer(Modifier.height(14.dp))
        repeat(5) { i ->
            Box(Modifier.fillMaxWidth(if (i % 2 == 0) 0.92f else 0.6f).height(14.dp).background(T.line.copy(alpha = 0.6f)))
            Spacer(Modifier.height(12.dp))
        }
        Spacer(Modifier.height(8.dp))
        Mono("LOADING…", size = 11.sp, color = T.amber, bold = true)
    }
}

@Composable
fun ErrorState(message: String, auth: Boolean = false, onRetry: () -> Unit, onSetup: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Mono(if (auth) "NOT AUTHORISED" else "COULDN'T LOAD", size = 14.sp, color = T.down, bold = true)
        Spacer(Modifier.height(10.dp))
        Mono(message, size = 12.sp, color = T.dim)
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TButton("Retry", primary = true, onClick = onRetry)
            if (onSetup != null) TButton("Setup", onClick = onSetup)
        }
    }
}

@Composable
fun EmptyNote(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Mono(title, size = 13.sp, bold = true)
        Spacer(Modifier.height(4.dp))
        Mono(body, size = 11.sp, color = T.dim)
    }
}

/** Screen header for pushed screens: ‹ BACK  TITLE  [right]. */
@Composable
fun BackBar(title: String, onBack: () -> Unit, right: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.clickable(onClickLabel = "Back", onClick = onBack).padding(horizontal = 16.dp, vertical = 14.dp)) {
            Mono("‹", size = 20.sp, color = T.amber, bold = true)
        }
        Mono(title.uppercase(), Modifier.weight(1f), size = 14.sp, color = T.text, bold = true, maxLines = 1)
        right()
        Spacer(Modifier.width(8.dp))
    }
    Line()
}

/** Tappable row with a chevron, 56dp tall. */
@Composable
fun NavRow(title: String, sub: String? = null, right: String? = null, rightColor: Color = T.dim, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Mono(title, size = 13.sp, bold = true, maxLines = 1)
            if (sub != null) { Spacer(Modifier.height(3.dp)); Mono(sub, size = 10.sp, color = T.dim, maxLines = 2) }
        }
        if (right != null) { Spacer(Modifier.width(8.dp)); Mono(right, size = 12.sp, color = rightColor, bold = true, maxLines = 1) }
        Spacer(Modifier.width(10.dp))
        Mono("›", size = 16.sp, color = T.faint)
    }
}

/** Segmented toggle: [ A | B | C ]. */
@Composable
fun Seg(options: List<Pair<String, String>>, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    Row(modifier.border(1.dp, T.line)) {
        options.forEachIndexed { i, (k, label) ->
            val sel = k == value
            if (i > 0) Box(Modifier.width(1.dp).height(36.dp).background(T.line))
            Box(
                Modifier.background(if (sel) T.amber.copy(alpha = 0.12f) else T.bg)
                    .clickable(role = Role.Tab) { if (!sel) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onChange(k) } }
                    .heightIn(min = 36.dp).padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Mono(label, size = 11.sp, color = if (sel) T.amber else T.dim, bold = sel, maxLines = 1) }
        }
    }
}

/** Small selectable chip. */
@Composable
fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.border(1.dp, if (selected) T.amber else T.line).background(if (selected) T.amber.copy(alpha = 0.10f) else T.bg)
            .clickable(onClick = onClick).heightIn(min = 40.dp).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Mono(text, size = 11.sp, color = if (selected) T.amber else T.text, bold = selected, maxLines = 1) }
}

@Composable
fun Toggle(label: String, sub: String?, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.heightIn(min = 52.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Mono(label.uppercase(), size = 11.sp, color = T.text, bold = true)
            if (sub != null) Mono(sub, size = 10.sp, color = T.faint)
        }
        Box(Modifier.size(44.dp, 24.dp).border(1.dp, if (value) T.amber else T.line).background(if (value) T.amber.copy(alpha = 0.15f) else T.bg)) {
            Box(Modifier.align(if (value) Alignment.CenterEnd else Alignment.CenterStart).padding(3.dp).size(16.dp).background(if (value) T.amber else T.faint))
        }
    }
}

/** Search / text field in the terminal style. */
@Composable
fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, keyboard: KeyboardType = KeyboardType.Text, singleLine: Boolean = true, minHeight: Dp = 44.dp) {
    BasicTextField(
        value = value, onValueChange = onChange, singleLine = singleLine,
        textStyle = T.style(13.sp), cursorBrush = SolidColor(T.amber),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = modifier,
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth().heightIn(min = minHeight).border(1.dp, T.line).background(T.panel).padding(horizontal = 12.dp, vertical = 12.dp)) {
                if (value.isEmpty()) Mono(placeholder, size = 13.sp, color = T.faint, maxLines = 1)
                inner()
            }
        },
    )
}

// ───────────────────────────── bottom sheet ─────────────────────────────

/**
 * Bottom sheet drawn inside the screen (so it shows up in screenshots too): scrim tap, back or a
 * downward swipe on the handle dismisses it.
 */
@Composable
fun BoxScope.Sheet(visible: Boolean, onDismiss: () -> Unit, maxHeightFraction: Float = 0.92f, content: @Composable ColumnScope.() -> Unit) {
    if (visible) BackHandler(onBack = onDismiss)
    AnimatedVisibility(visible, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.matchParentSize()) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss))
    }
    AnimatedVisibility(
        visible, enter = slideInVertically { it }, exit = slideOutVertically { it },
        modifier = Modifier.align(Alignment.BottomCenter),
    ) {
        var drag by remember { mutableFloatStateOf(0f) }
        Column(
            Modifier.fillMaxWidth().offset { IntOffset(0, drag.roundToInt().coerceAtLeast(0)) }
                .background(T.bg).border(1.dp, T.line)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .heightInFraction(maxHeightFraction),
        ) {
            Box(
                Modifier.fillMaxWidth().height(28.dp).draggable(
                    orientation = Orientation.Vertical,
                    state = rememberDraggableState { drag += it },
                    onDragStopped = { v -> if (drag > 120f || v > 1500f) onDismiss(); drag = 0f },
                ),
                contentAlignment = Alignment.Center,
            ) { Box(Modifier.size(40.dp, 4.dp).background(T.faint)) }
            content()
        }
    }
}

@Composable
private fun Modifier.heightInFraction(f: Float): Modifier {
    val h = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp
    return this.heightIn(max = (h * f).dp)
}

// ───────────────────────────── charts ─────────────────────────────

data class ChartSeries(
    val label: String,
    val color: Color,
    /** (epoch day, value), ascending */
    val points: List<Pair<Long, Double>>,
    val dashed: Boolean = false,
    val area: Boolean = false,
    /** points only (no connecting line) */
    val dots: Boolean = false,
)

/**
 * Line chart on a Canvas. One finger: scrub to read values (haptic tick per point). Two fingers:
 * pinch to zoom the time axis and pan. Double-tap resets the zoom.
 */
@Composable
fun LineChart(series: List<ChartSeries>, unit: String, modifier: Modifier = Modifier, height: Dp = 200.dp, bands: List<Triple<Long, Double, Double>> = emptyList()) {
    val all = series.flatMap { it.points } + bands.map { it.first to it.second } + bands.map { it.first to it.third }
    if (all.size < 2) {
        Box(modifier.fillMaxWidth().height(height).border(1.dp, T.line), contentAlignment = Alignment.Center) { Mono("NOT ENOUGH DATA", size = 10.sp, color = T.faint) }
        return
    }
    val x0 = all.minOf { it.first }.toFloat()
    val x1 = all.maxOf { it.first }.toFloat().let { if (it - x0 < 1f) x0 + 1f else it }
    var lo by remember(series, bands) { mutableFloatStateOf(x0) }
    var hi by remember(series, bands) { mutableFloatStateOf(x1) }
    var scrub by remember(series) { mutableStateOf<Float?>(null) }
    val measurer = rememberTextMeasurer()
    val haptic = LocalHapticFeedback.current
    var lastTick by remember { mutableStateOf<Long?>(null) }
    val labelStyle = T.style(9.sp, T.faint)
    val padL = 40.dp
    Column(modifier) {
        Canvas(
            Modifier.fillMaxWidth().height(height).clipToBounds()
                .pointerInput(series) {
                    detectTapGestures(onDoubleTap = { lo = x0; hi = x1 }, onTap = { p -> scrub = p.x })
                }
                .pointerInput(series) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        scrub = down.position.x
                        while (true) {
                            val ev = awaitPointerEvent()
                            val pressed = ev.changes.filter { it.pressed }
                            if (pressed.isEmpty()) break
                            if (pressed.size >= 2) {
                                val a = pressed[0]; val b = pressed[1]
                                val prevSpan = abs(a.previousPosition.x - b.previousPosition.x).coerceAtLeast(1f)
                                val span = abs(a.position.x - b.position.x).coerceAtLeast(1f)
                                val w = size.width - padL.toPx()
                                val center = ((a.position.x + b.position.x) / 2 - padL.toPx()) / w
                                val range = hi - lo
                                val newRange = (range * prevSpan / span).coerceIn(14f, x1 - x0)
                                val pan = -((a.positionChange().x + b.positionChange().x) / 2) / w * newRange
                                var nlo = lo + (range - newRange) * center + pan
                                nlo = nlo.coerceIn(x0, x1 - newRange)
                                lo = nlo; hi = nlo + newRange
                                scrub = null
                                ev.changes.forEach { it.consume() }
                            } else {
                                scrub = pressed[0].position.x
                                if (abs(pressed[0].positionChange().x) > 0f) pressed[0].consume()
                            }
                        }
                    }
                },
        ) {
            val left = padL.toPx()
            val w = size.width - left - 4.dp.toPx() // room for the last dot
            val h = size.height - 16.dp.toPx()
            val vis = all.filter { it.first >= lo - 1 && it.first <= hi + 1 }.ifEmpty { all }
            var vmin = vis.minOf { it.second }
            var vmax = vis.maxOf { it.second }
            if (vmax - vmin < 1e-6) { vmin -= 1; vmax += 1 }
            val padV = (vmax - vmin) * 0.08
            vmin -= padV; vmax += padV
            fun px(x: Long) = left + (x - lo) / (hi - lo) * w
            fun py(v: Double) = (h - (v - vmin) / (vmax - vmin) * h).toFloat()
            // grid + y labels
            for (k in 0..3) {
                val v = vmin + (vmax - vmin) * k / 3
                val y = py(v)
                drawLine(T.line, Offset(left, y), Offset(size.width, y), 1f)
                drawText(measurer, Fmt.compact(v), Offset(0f, (y - 6.dp.toPx()).coerceIn(0f, h - 12.dp.toPx())), labelStyle)
            }
            // x labels: first / last visible dates
            val d0 = LocalDate.ofEpochDay(lo.roundToInt().toLong())
            val d1 = LocalDate.ofEpochDay(hi.roundToInt().toLong())
            drawText(measurer, "${Fmt.month(d0)} ${d0.year % 100}", Offset(left, h + 3.dp.toPx()), labelStyle)
            val endLabel = "${Fmt.month(d1)} ${d1.year % 100}"
            drawText(measurer, endLabel, Offset(size.width - measurer.measure(endLabel, labelStyle).size.width, h + 3.dp.toPx()), labelStyle)
            // projection band
            if (bands.size >= 2) {
                val p = Path()
                bands.forEachIndexed { i, b -> if (i == 0) p.moveTo(px(b.first), py(b.third)) else p.lineTo(px(b.first), py(b.third)) }
                bands.reversed().forEach { b -> p.lineTo(px(b.first), py(b.second)) }
                p.close()
                drawPath(p, T.amber.copy(alpha = 0.12f))
            }
            for (s in series) {
                if (s.points.isEmpty()) continue
                if (s.dots) {
                    val r = 2.75.dp.toPx()
                    s.points.forEach { (x, v) -> if (x >= lo - 1 && x <= hi + 1) drawCircle(s.color, r, Offset(px(x), py(v))) }
                    continue
                }
                val path = Path()
                s.points.forEachIndexed { i, (x, v) -> if (i == 0) path.moveTo(px(x), py(v)) else path.lineTo(px(x), py(v)) }
                if (s.area && s.points.size > 1) {
                    val fill = Path().apply { addPath(path); lineTo(px(s.points.last().first), h); lineTo(px(s.points.first().first), h); close() }
                    drawPath(fill, s.color.copy(alpha = 0.10f))
                }
                drawPath(
                    path, s.color,
                    style = Stroke(if (s.dashed) 1.dp.toPx() else 1.8.dp.toPx(), join = StrokeJoin.Round, pathEffect = if (s.dashed) PathEffect.dashPathEffect(floatArrayOf(6f, 6f)) else null),
                )
            }
            // scrub cursor
            val sx = scrub
            if (sx != null && sx >= left) {
                val xDay = lo + (sx - left) / w * (hi - lo)
                val main = series.firstOrNull { it.points.isNotEmpty() && !it.dashed && !it.dots } ?: series.first { it.points.isNotEmpty() }
                val near = main.points.minByOrNull { abs(it.first - xDay) }
                if (near != null) {
                    if (lastTick != near.first) { lastTick = near.first; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
                    val cx = px(near.first)
                    drawLine(T.amber.copy(alpha = 0.7f), Offset(cx, 0f), Offset(cx, h), 1.dp.toPx())
                    series.forEach { s -> s.points.minByOrNull { abs(it.first - near.first) }?.takeIf { abs(it.first - near.first) <= 3 }?.let { drawCircle(s.color, 3.5.dp.toPx(), Offset(px(it.first), py(it.second))) } }
                    val txt = "${Fmt.day(LocalDate.ofEpochDay(near.first).toString())}  ${Fmt.w(near.second)} ${unit.uppercase()}"
                    val m = measurer.measure(txt, T.style(10.sp, T.bg, bold = true))
                    val bx = (cx - m.size.width / 2f).coerceIn(left, size.width - m.size.width - 8.dp.toPx())
                    drawRect(T.amber, Offset(bx - 4.dp.toPx(), 0f), Size(m.size.width + 8.dp.toPx(), m.size.height + 4.dp.toPx()))
                    drawText(m, topLeft = Offset(bx, 2.dp.toPx()))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            series.forEach { s ->
                if (s.dots) Box(Modifier.size(5.dp).background(s.color)) else Box(Modifier.size(10.dp, 2.dp).background(s.color))
                Mono(" ${s.label}   ", size = 9.sp, color = T.dim, maxLines = 1)
            }
            Spacer(Modifier.weight(1f))
            if (hi - lo < x1 - x0 - 0.5f) Mono("ZOOMED · 2× TAP RESETS", size = 9.sp, color = T.amber, maxLines = 1)
            else Mono("DRAG · PINCH", size = 9.sp, color = T.faint, maxLines = 1)
        }
    }
}

/** Vertical bars; the last (current) one in amber. Tap a bar to read it. */
@Composable
fun Bars(values: List<Double>, labels: List<String>, modifier: Modifier = Modifier, height: Dp = 90.dp, unit: String = "", highlightLast: Boolean = true) {
    var sel by remember(values) { mutableStateOf<Int?>(null) }
    val measurer = rememberTextMeasurer()
    val haptic = LocalHapticFeedback.current
    Column(modifier) {
        Canvas(
            Modifier.fillMaxWidth().height(height).pointerInput(values) {
                detectTapGestures { p ->
                    val i = (p.x / (size.width / values.size.coerceAtLeast(1))).toInt().coerceIn(0, values.lastIndex.coerceAtLeast(0))
                    sel = if (sel == i) null else i
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
            },
        ) {
            if (values.isEmpty()) return@Canvas
            val maxV = values.max().coerceAtLeast(1e-6)
            val step = size.width / values.size
            val gap = (step * 0.25f).coerceAtMost(4.dp.toPx())
            values.forEachIndexed { i, v ->
                val bh = (v / maxV * (size.height - 14.dp.toPx())).toFloat()
                val c = when { sel == i -> T.amber; highlightLast && i == values.lastIndex -> T.amber.copy(alpha = 0.8f); else -> T.ramp[2] }
                drawRect(c, Offset(i * step + gap / 2, size.height - bh), Size(step - gap, bh.coerceAtLeast(if (v > 0) 1f else 0f)))
            }
            sel?.let { i ->
                val txt = "${labels.getOrNull(i).orEmpty()}  ${Fmt.compact(values[i])} $unit".trim()
                val m = measurer.measure(txt, T.style(10.sp, T.amber, bold = true))
                drawText(m, topLeft = Offset((i * step - m.size.width / 2f).coerceIn(0f, size.width - m.size.width), 0f))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Mono(labels.firstOrNull().orEmpty(), Modifier.weight(1f), size = 9.sp, color = T.faint, maxLines = 1)
            Mono(labels.lastOrNull().orEmpty(), size = 9.sp, color = T.faint, maxLines = 1)
        }
    }
}

@Composable
fun Sparkline(values: List<Double>, modifier: Modifier, color: Color = T.up) {
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        val lo = values.min()
        val hi = values.max()
        val span = if (hi - lo < 1e-6) 1.0 else hi - lo
        val pad = 3.dp.toPx()
        fun x(i: Int) = pad + (size.width - 2 * pad) * i / (values.size - 1)
        fun y(v: Double) = (size.height - pad - (size.height - 2 * pad) * ((v - lo) / span)).toFloat()
        val path = Path()
        values.forEachIndexed { i, v -> if (i == 0) path.moveTo(x(i), y(v)) else path.lineTo(x(i), y(v)) }
        val fill = Path().apply { addPath(path); lineTo(x(values.size - 1), size.height); lineTo(x(0), size.height); close() }
        drawPath(fill, color.copy(alpha = 0.12f))
        drawPath(path, color, style = Stroke(1.5.dp.toPx(), join = StrokeJoin.Round))
        drawCircle(color, 2.5.dp.toPx(), Offset(x(values.size - 1), y(values.last())))
    }
}

/** Mon..Sun status squares. */
@Composable
fun WeekStripC(days: List<WeekDay>, cell: Dp = 38.dp) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        days.forEach { d ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Mono(d.dow, size = 10.sp, color = if (d.status == WeekDay.STATUS_TODAY) T.amber else T.dim)
                Spacer(Modifier.height(5.dp))
                StatusSquare(d.status, cell)
                Spacer(Modifier.height(4.dp))
                Mono(d.date.takeLast(2).trimStart('0'), size = 9.sp, color = T.faint)
            }
        }
    }
}

@Composable
fun StatusSquare(status: String, cell: Dp, label: String? = null) {
    val (border, fill, glyph) = when (status) {
        WeekDay.STATUS_DONE -> Triple(T.done, T.done, "✓")
        WeekDay.STATUS_TODAY -> Triple(T.amber, T.bg, "•")
        WeekDay.STATUS_PLANNED -> Triple(T.faint, T.bg, "")
        WeekDay.STATUS_MISSED -> Triple(T.down, T.bg, "×")
        WeekDay.STATUS_TRAVEL -> Triple(T.line, T.line, "T")
        else -> Triple(T.line, T.panel, "")
    }
    Box(Modifier.size(cell).background(fill).border(1.dp, border), contentAlignment = Alignment.Center) {
        val g = label ?: glyph
        if (g.isNotEmpty()) Mono(
            g, size = if (label != null) 11.sp else 13.sp, bold = true,
            color = when (status) { WeekDay.STATUS_DONE -> T.bg; WeekDay.STATUS_MISSED -> T.down; WeekDay.STATUS_TODAY -> T.amber; else -> T.dim },
        )
    }
}

/** 53 × 7 grid, horizontally scrollable, opens scrolled to today. Tap a day to select it. */
@Composable
fun ContributionGraph(s: Snapshot, theme: ColorTheme, cell: Dp = 13.dp, gap: Dp = 3.dp, selected: String? = null, onSelect: (GraphDay) -> Unit = {}) =
    ContributionGraph(s.graph.days, s.today, theme, cell, gap, selected, onSelect)

/** Same grid from plain days (a friend's profile graph: levels only, no values). */
@Composable
fun ContributionGraph(days: List<GraphDay>, today: String?, theme: ColorTheme, cell: Dp = 13.dp, gap: Dp = 3.dp, selected: String? = null, onSelect: (GraphDay) -> Unit = {}) {
    val cols = days.chunked(7)
    val measurer = rememberTextMeasurer()
    val labelStyle = T.style(9.sp, T.faint)
    val scroll = rememberScrollState(Int.MAX_VALUE)
    val haptic = LocalHapticFeedback.current
    Row {
        Column(Modifier.padding(top = 16.dp, end = 6.dp)) {
            listOf("M", "", "W", "", "F", "", "").forEach {
                Box(Modifier.height(cell + gap), contentAlignment = Alignment.CenterStart) { Mono(it, size = 9.sp, color = T.faint) }
            }
        }
        Box(Modifier.horizontalScroll(scroll)) {
            val w = cell * cols.size + gap * (cols.size - 1).coerceAtLeast(0)
            Canvas(
                Modifier.width(w).height(16.dp + cell * 7 + gap * 6).pointerInput(cols) {
                    detectTapGestures { p ->
                        val step = (cell + gap).toPx()
                        val c = (p.x / step).toInt()
                        val r = ((p.y - 16.dp.toPx()) / step).toInt()
                        cols.getOrNull(c)?.getOrNull(r)?.let { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onSelect(it) }
                    }
                },
            ) {
                val step = (cell + gap).toPx()
                val cs = cell.toPx()
                val top = 16.dp.toPx()
                monthLabels(cols).forEach { (ci, label) -> drawText(measurer, label, Offset(ci * step, 0f), labelStyle) }
                cols.forEachIndexed { ci, col ->
                    col.forEachIndexed { ri, d ->
                        val o = Offset(ci * step, top + ri * step)
                        drawRoundRect(Color(theme.level(d.level)), o, Size(cs, cs), CornerRadius(2.dp.toPx()))
                        if (d.date == selected) drawRoundRect(T.text, o, Size(cs, cs), CornerRadius(2.dp.toPx()), style = Stroke(2.dp.toPx()))
                        else if (d.date == today) drawRoundRect(T.amber, o, Size(cs, cs), CornerRadius(2.dp.toPx()), style = Stroke(1.5.dp.toPx()))
                    }
                }
            }
        }
    }
}

/** (column, "OCT") where a new month starts; drops a label that would collide with the next one. */
fun monthLabels(cols: List<List<GraphDay>>): List<Pair<Int, String>> {
    val starts = ArrayList<Pair<Int, LocalDate>>()
    var prev = -1
    cols.forEachIndexed { ci, col ->
        val d = runCatching { LocalDate.parse(col.first().date) }.getOrNull() ?: return@forEachIndexed
        if (d.monthValue != prev) { starts.add(ci to d); prev = d.monthValue }
    }
    return starts.filterIndexed { i, (ci, _) -> i == starts.lastIndex || starts[i + 1].first - ci >= 3 }
        .map { (ci, d) -> ci to Fmt.month(d) }
}

/** Legend for the activity graph. */
@Composable
fun GraphLegend(theme: ColorTheme) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Mono("LESS ", size = 9.sp, color = T.faint)
        (0..4).forEach { l -> Box(Modifier.padding(horizontal = 1.dp).size(9.dp).background(Color(theme.level(l)))) }
        Mono(" MORE", size = 9.sp, color = T.faint)
    }
}

/** Two-column key/value row. */
@Composable
fun KV(k: String, v: String, color: Color = T.text, keyWidth: Dp = 110.dp) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Mono(k.uppercase(), Modifier.width(keyWidth), size = 11.sp, color = T.dim)
        Mono(v, Modifier.weight(1f), size = 11.sp, color = color)
    }
}

/** Table row of fixed-width mono cells. */
@Composable
fun TRow(cells: List<String>, weights: List<Float>, colors: List<Color> = emptyList(), header: Boolean = false, onClick: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }.heightIn(min = if (header) 24.dp else 36.dp).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        cells.forEachIndexed { i, c ->
            Mono(
                c, Modifier.weight(weights[i]), size = if (header) 9.sp else 12.sp,
                color = if (header) T.faint else colors.getOrNull(i) ?: T.text, bold = !header && i == 0,
                maxLines = 1, align = if (i == 0) TextAlign.Start else TextAlign.End,
            )
        }
    }
}

fun statusColor(status: String?): Color = when (status) {
    "progressing", "ok", "success", "balanced", "tm-up" -> T.up
    "stalled", "plateau", "hold", "warn", "warning", "retest-next", "retested" -> T.amber
    "regressing", "fail", "stage-down", "deload", "reset", "error", "low", "high", "tm-down", "missed" -> T.down
    else -> T.dim
}
