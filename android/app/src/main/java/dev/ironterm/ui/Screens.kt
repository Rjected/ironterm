package dev.ironterm.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.Lift
import dev.ironterm.data.Snapshot
import dev.ironterm.data.WeekDay
import dev.ironterm.widget.ColorTheme
import java.time.LocalDate
import kotlin.math.roundToInt

// ═════════════════════════════════ TODAY ═════════════════════════════════

@Composable
fun TodayScreen(s: Snapshot) {
    val unit = s.unit.uppercase()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        val next = s.program?.next
        Section("Next session", right = next?.whenLabel, rightColor = T.amber) {
            if (next == null) {
                Mono(if (s.program == null) "NO PROGRAM" else "PROGRAM COMPLETE", size = 16.sp, bold = true)
                Spacer(Modifier.height(6.dp))
                Mono(
                    if (s.isDirect) "Programs and planned weights come from the ${dev.ironterm.Brand.NAME} server. Direct mode shows your log: graph, streak and lifts."
                    else "Pick a program in the web app (F10 SETUP) to see planned sessions here.",
                    size = 12.sp, color = T.dim,
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Mono(next.dayName.uppercase(), Modifier.weight(1f), size = 19.sp, bold = true, maxLines = 2)
                    if (next.reentry) { Spacer(Modifier.width(8.dp)); Badge("RE-ENTRY") }
                }
                Spacer(Modifier.height(4.dp))
                Mono(
                    listOfNotNull(s.program.name, next.weekName, next.date?.let { Fmt.day(it) }).joinToString(" · ").uppercase(),
                    size = 11.sp, color = T.faint,
                )
                if (next.reentry) {
                    Spacer(Modifier.height(6.dp))
                    Mono("Re-entry after a break: weights are eased back in.", size = 11.sp, color = T.amber)
                }
                Spacer(Modifier.height(12.dp))
                next.exercises.forEachIndexed { i, e ->
                    if (i > 0) Line()
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
                        Mono(e.tier.ifBlank { "·" }, Modifier.width(30.dp), size = 11.sp, color = T.faint)
                        Column(Modifier.weight(1f)) {
                            Mono(e.name.uppercase(), size = 14.sp, bold = true, maxLines = 1)
                            Spacer(Modifier.height(3.dp))
                            Mono(e.summary, size = 12.sp, color = T.dim)
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(horizontalAlignment = Alignment.End) {
                            Mono(if (e.top > 0) Fmt.w(e.top) else "BW", size = 16.sp, color = T.amber, bold = true)
                            Mono(if (e.top > 0) unit else "", size = 10.sp, color = T.faint)
                        }
                    }
                }
            }
        }
        Section("This week", right = "${s.week.done}/${s.week.target} DONE") {
            WeekStripC(s.week.days)
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("Streak", "${s.streak.current} WK", Modifier.weight(1f), sub = "BEST ${s.streak.best}", valueColor = T.amber)
                Stat("Sessions 52w", Fmt.n(s.totals.sessions52), Modifier.weight(1f), sub = "ALL TIME ${Fmt.n(s.totals.allTime)}")
                Stat("Vol 7d", Fmt.compact(s.totals.vol7), Modifier.weight(1f), sub = Fmt.change(s.totals.vol7, s.totals.volPrev7)?.let { "$it VS PREV" } ?: unit)
            }
        }
        val rec = s.recovery
        if (rec != null) {
            Section("Readiness", right = Fmt.pct(rec.overall), rightColor = readinessColor(rec.overall)) {
                BarLine(rec.overall, readinessColor(rec.overall), Modifier.fillMaxWidth(), 8.dp)
                Spacer(Modifier.height(10.dp))
                val least = rec.muscles.take(3)
                if (least.isNotEmpty()) {
                    Mono(
                        "LEAST READY  " + least.joinToString("  ") { "${it.name} ${Fmt.pct(it.readiness)}" },
                        size = 11.sp, color = T.dim,
                    )
                }
            }
        }
        val last = s.last
        if (last != null) {
            Section("Last workout", right = Fmt.day(last.date)) {
                Mono(last.title.uppercase(), size = 15.sp, bold = true, maxLines = 1)
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth()) {
                    Stat("Time", "${last.durationMin.roundToInt()}m", Modifier.weight(1f))
                    Stat("Volume", Fmt.compact(last.volume), Modifier.weight(1f), sub = unit)
                    Stat("Sets", "${last.sets}", Modifier.weight(1f))
                    Stat("Lifts", "${last.exercises}", Modifier.weight(1f))
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun WeekStripC(days: List<WeekDay>, cell: Dp = 38.dp) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        days.forEach { d ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Mono(d.dow, size = 10.sp, color = if (d.status == WeekDay.STATUS_TODAY) T.amber else T.dim)
                Spacer(Modifier.height(5.dp))
                val (border, fill, glyph) = when (d.status) {
                    WeekDay.STATUS_DONE -> Triple(T.done, T.done, "✓")
                    WeekDay.STATUS_TODAY -> Triple(T.amber, T.bg, "•")
                    WeekDay.STATUS_PLANNED -> Triple(T.faint, T.bg, "")
                    WeekDay.STATUS_MISSED -> Triple(T.down, T.bg, "×")
                    WeekDay.STATUS_TRAVEL -> Triple(T.line, T.line, "T")
                    else -> Triple(T.line, T.panel, "")
                }
                Box(Modifier.size(cell).background(fill).border(1.dp, border), contentAlignment = Alignment.Center) {
                    if (glyph.isNotEmpty()) Mono(
                        glyph, size = 13.sp, bold = true,
                        color = when (d.status) { WeekDay.STATUS_DONE -> T.bg; WeekDay.STATUS_MISSED -> T.down; WeekDay.STATUS_TODAY -> T.amber; else -> T.dim },
                    )
                }
                Spacer(Modifier.height(4.dp))
                Mono(d.date.takeLast(2).trimStart('0'), size = 9.sp, color = T.faint)
            }
        }
    }
}

// ═════════════════════════════════ GRAPH ═════════════════════════════════

@Composable
fun GraphScreen(s: Snapshot, theme: ColorTheme) {
    val unit = s.unit.uppercase()
    var selected by remember(s) { mutableStateOf(s.graph.days.lastOrNull()) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Section("Activity · 53 weeks", right = "${Fmt.n(s.totals.sessions52)} SESSIONS") {
            ContributionGraph(s, theme, onSelect = { selected = it })
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val sel = selected
                Mono(
                    if (sel == null) "" else Fmt.day(sel.date) + "  " + if (sel.level == 0) "REST" else "${Fmt.n(sel.value)} $unit",
                    Modifier.weight(1f), size = 11.sp, color = T.text,
                )
                Mono("LESS ", size = 10.sp, color = T.faint)
                (0..4).forEach { l ->
                    Box(Modifier.padding(horizontal = 1.dp).size(10.dp).background(Color(theme.level(l))))
                }
                Mono(" MORE", size = 10.sp, color = T.faint)
            }
        }
        Section("Totals") {
            Row(Modifier.fillMaxWidth()) {
                Stat("Sessions 52w", Fmt.n(s.totals.sessions52), Modifier.weight(1f), sub = if (s.totals.sessionsPrev52 > 0) "PREV ${s.totals.sessionsPrev52}" else "ALL TIME ${s.totals.allTime}")
                Stat("Volume 7d", Fmt.n(s.totals.vol7), Modifier.weight(1f), sub = (Fmt.change(s.totals.vol7, s.totals.volPrev7)?.let { "$it · " } ?: "") + unit,
                    subColor = if (s.totals.vol7 >= s.totals.volPrev7) T.up else T.down)
            }
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("Avg session", "${s.totals.avgMin.roundToInt()} MIN", Modifier.weight(1f))
                Stat("Streak", "${s.streak.current} WK", Modifier.weight(1f), sub = "BEST ${s.streak.best} · ${s.week.target}/WK", valueColor = T.amber)
            }
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("All time", Fmt.n(s.totals.allTime), Modifier.weight(1f), sub = "SESSIONS")
                Stat("This week", "${s.week.done}/${s.week.target}", Modifier.weight(1f), sub = "DONE")
            }
        }
    }
}

/** 53 × 7 grid, horizontally scrollable, opens scrolled to today. Month labels on top, M/W/F on the left. */
@Composable
fun ContributionGraph(s: Snapshot, theme: ColorTheme, cell: Dp = 13.dp, gap: Dp = 3.dp, onSelect: (dev.ironterm.data.GraphDay) -> Unit = {}) {
    val cols = s.graph.days.chunked(7)
    val measurer = rememberTextMeasurer()
    val labelStyle = T.style(9.sp, T.faint)
    val scroll = rememberScrollState(Int.MAX_VALUE) // clamps to the end = today
    Row {
        Column(Modifier.padding(top = 16.dp, end = 6.dp)) {
            listOf("M", "", "W", "", "F", "", "").forEach {
                Box(Modifier.height(cell + gap), contentAlignment = Alignment.CenterStart) { Mono(it, size = 9.sp, color = T.faint) }
            }
        }
        Box(Modifier.horizontalScroll(scroll)) {
            val w = cell * cols.size + gap * (cols.size - 1)
            Canvas(
                Modifier.width(w).height(16.dp + cell * 7 + gap * 6).pointerInput(cols) {
                    detectTapGestures { p ->
                        val step = (cell + gap).toPx()
                        val c = (p.x / step).toInt()
                        val r = ((p.y - 16.dp.toPx()) / step).toInt()
                        cols.getOrNull(c)?.getOrNull(r)?.let(onSelect)
                    }
                },
            ) {
                val step = (cell + gap).toPx()
                val cs = cell.toPx()
                val top = 16.dp.toPx()
                monthLabels(cols).forEach { (ci, label) ->
                    drawText(measurer, label, Offset(ci * step, 0f), labelStyle)
                }
                cols.forEachIndexed { ci, col ->
                    col.forEachIndexed { ri, d ->
                        val o = Offset(ci * step, top + ri * step)
                        drawRoundRect(Color(theme.level(d.level)), o, Size(cs, cs), CornerRadius(2.dp.toPx()))
                        if (d.date == s.today) {
                            drawRoundRect(T.amber, o, Size(cs, cs), CornerRadius(2.dp.toPx()), style = Stroke(1.5.dp.toPx()))
                        }
                    }
                }
            }
        }
    }
}

// ═════════════════════════════════ LIFTS ═════════════════════════════════

@Composable
fun LiftsScreen(s: Snapshot) {
    val unit = s.unit.uppercase()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Section("Lifts · estimated 1RM", right = "$unit · Δ28D") {
            if (s.lifts.isEmpty()) {
                Mono("NO LIFTS YET", size = 14.sp, bold = true)
                Spacer(Modifier.height(6.dp))
                Mono("Log squat, bench, deadlift or press in Hevy and they show up here.", size = 12.sp, color = T.dim)
            } else {
                s.lifts.chunked(2).forEachIndexed { i, row ->
                    if (i > 0) Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { LiftCard(it, unit, Modifier.weight(1f)) }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Mono("e1RM = Epley, w × (1 + reps/30), best of the last 4 weeks. Line = 12 weeks.", size = 10.sp, color = T.faint)
            }
        }
    }
}

@Composable
fun LiftCard(l: Lift, unit: String, modifier: Modifier = Modifier) {
    Column(modifier.border(1.dp, T.line).background(T.panel).padding(12.dp)) {
        Mono(l.short, size = 11.sp, color = T.amber, bold = true, maxLines = 1)
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Mono(Fmt.w(l.e1rm), size = 22.sp, bold = true, maxLines = 1)
            Mono(" $unit", size = 10.sp, color = T.faint, modifier = Modifier.padding(bottom = 3.dp))
        }
        Mono(l.delta28?.let { "${Fmt.delta(it)} / 28D" } ?: "NEW", size = 11.sp, color = deltaColor(l.delta28))
        Spacer(Modifier.height(8.dp))
        Sparkline(l.spark, Modifier.fillMaxWidth().height(34.dp))
        Spacer(Modifier.height(4.dp))
        Mono(l.name.uppercase(), size = 9.sp, color = T.faint, maxLines = 1)
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

// ═════════════════════════════════ BODY ═════════════════════════════════

@Composable
fun BodyScreen(s: Snapshot) {
    val rec = s.recovery
    if (rec == null) {
        if (s.isDirect) NeedsServer(
            "RECOVERY",
            "Muscle recovery is modelled by the ${dev.ironterm.Brand.NAME} server from every set you log (volume, intensity and time since).\n\nDirect mode only has the Hevy API, so this tab stays empty. Your graph, streak and lifts still work.",
        ) else NeedsServer("RECOVERY", "No recovery data yet. Log a workout in Hevy and sync.")
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Section("Overall readiness", right = "BIG MUSCLES") {
            Row(verticalAlignment = Alignment.Bottom) {
                Mono(Fmt.pct(rec.overall), size = 34.sp, color = readinessColor(rec.overall), bold = true)
                Spacer(Modifier.width(12.dp))
                Mono(
                    when { rec.overall >= 0.8 -> "READY TO TRAIN HARD"; rec.overall >= 0.5 -> "TRAIN, MIND THE SORE SPOTS"; else -> "TAKE IT EASY" },
                    size = 11.sp, color = T.dim, modifier = Modifier.padding(bottom = 8.dp),
                )
            }
            Spacer(Modifier.height(8.dp))
            BarLine(rec.overall, readinessColor(rec.overall), Modifier.fillMaxWidth(), 8.dp)
        }
        Section("Muscles · least ready first", right = "READY IN") {
            rec.muscles.forEach { m ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Mono(m.name, Modifier.width(104.dp), size = 11.sp, maxLines = 1)
                    BarLine(m.readiness, readinessColor(m.readiness), Modifier.weight(1f), 6.dp)
                    Mono(Fmt.pct(m.readiness), Modifier.width(48.dp), size = 11.sp, color = T.dim, align = TextAlign.End)
                    Mono(Fmt.hours(m.readyInH), Modifier.width(56.dp), size = 11.sp, color = if (m.readyInH > 0) T.text else T.faint, align = TextAlign.End)
                }
            }
        }
    }
}

/** (column, "OCT") where a new month starts; drops a label that would collide with the next one. */
fun monthLabels(cols: List<List<dev.ironterm.data.GraphDay>>): List<Pair<Int, String>> {
    val starts = ArrayList<Pair<Int, LocalDate>>()
    var prev = -1
    cols.forEachIndexed { ci, col ->
        val d = runCatching { LocalDate.parse(col.first().date) }.getOrNull() ?: return@forEachIndexed
        if (d.monthValue != prev) { starts.add(ci to d); prev = d.monthValue }
    }
    return starts.filterIndexed { i, (ci, _) -> i == starts.lastIndex || starts[i + 1].first - ci >= 3 }
        .map { (ci, d) -> ci to Fmt.month(d) }
}
