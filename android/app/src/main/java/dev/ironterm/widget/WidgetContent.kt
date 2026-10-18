package dev.ironterm.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.Lift
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SourceMode
import dev.ironterm.ui.Tabs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// The widget layouts. Pure functions of WidgetData + LocalSize, shared by the real widgets, the
// in-app widget gallery and the screenshot tests (all go through Glance → RemoteViews).
//
// Glance renders at most 10 children per Row/Column/Box, so lists always live in their own
// Column and each list item is a single child.

private const val PAD = 10

@Composable
private fun NotConnected(d: WidgetData) {
    if (d.mode == SourceMode.NONE) Placeholder(Brand.NAME.uppercase(), "Not connected.\nTap to set up.")
    else Placeholder("NO DATA YET", d.error ?: "Tap to sync.")
}

private fun density(ctx: android.content.Context) = ctx.resources.displayMetrics.density

/** Bitmaps are drawn at ≥2.5 px/dp so they stay crisp when the launcher scales them. */
private fun scale(ctx: android.content.Context) = max(density(ctx), 2.5f)

@Composable
private fun ColumnScope.Fill() = Spacer(GlanceModifier.defaultWeight())

// ───────────────────────────── Activity graph ─────────────────────────────

@Composable
fun GraphWidgetContent(d: WidgetData) {
    val size = LocalSize.current
    val ctx = LocalContext.current
    val bucket = Sizes.classify(size)
    WidgetFrame(Tabs.GRAPH) {
        val s = d.snapshot
        if (s == null) { NotConnected(d); return@WidgetFrame }
        val weeks = when (bucket) { WSize.SMALL -> if (size.width >= 150.dp) 16 else 12; WSize.MEDIUM -> 26; WSize.LARGE -> 53 }
        val inner = size.width - (PAD * 2).dp
        Column(modifier = GlanceModifier.fillMaxSize()) {
            when (bucket) {
                WSize.SMALL -> Header(Brand.tag, "${weeks}W")
                WSize.MEDIUM -> Header("${Brand.tag} · ACTIVITY", "$weeks WEEKS")
                WSize.LARGE -> Header("${Brand.tag} · ACTIVITY", "${Fmt.n(s.totals.sessions52)} SESSIONS / YEAR")
            }
            VSpace(6.dp)
            Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
                GraphImage(s, weeks, d.theme, inner, scale(ctx), months = bucket == WSize.LARGE)
            }
            VSpace(6.dp)
            when (bucket) {
                WSize.SMALL -> Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Text("▲${s.streak.current}W", style = mono(10.sp, WC.amber, bold = true), modifier = GlanceModifier.defaultWeight(), maxLines = 1)
                    Text("${s.week.done}/${s.week.target}", style = mono(10.sp, WC.text), maxLines = 1)
                }
                WSize.MEDIUM -> Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Stat("STREAK", "${s.streak.current}W", WC.amber, GlanceModifier.defaultWeight())
                    Stat("THIS WEEK", "${s.week.done}/${s.week.target}", WC.text, GlanceModifier.defaultWeight())
                    Stat("52 WEEKS", Fmt.n(s.totals.sessions52), WC.text, GlanceModifier.defaultWeight())
                }
                WSize.LARGE -> Column(modifier = GlanceModifier.fillMaxWidth()) {
                    WeekStrip(s.week.days, 14.dp, labelSize = 8.sp)
                    VSpace(8.dp)
                    Divider()
                    VSpace(6.dp)
                    Row(modifier = GlanceModifier.fillMaxWidth()) {
                        Stat("STREAK", "${s.streak.current}W", WC.amber, GlanceModifier.defaultWeight(), sub = "BEST ${s.streak.best}")
                        Stat("WEEK", "${s.week.done}/${s.week.target}", WC.text, GlanceModifier.defaultWeight(), sub = "SESSIONS")
                        Stat("AVG", "${s.totals.avgMin.roundToInt()}M", WC.text, GlanceModifier.defaultWeight(), sub = "PER SESSION")
                        Stat("VOL 7D", Fmt.compact(s.totals.vol7), WC.text, GlanceModifier.defaultWeight(), sub = Fmt.change(s.totals.vol7, s.totals.volPrev7) ?: s.unit.uppercase())
                    }
                }
            }
        }
    }
}

@Composable
private fun GraphImage(s: Snapshot, weeks: Int, theme: ColorTheme, width: Dp, scale: Float, months: Boolean) {
    val gapRatio = 0.22f
    val cellDp = width.value / (weeks + gapRatio * (weeks - 1))
    val cellPx = max(2f, cellDp * scale)
    val bmp = Bitmaps.graph(s.graph.days, weeks, theme, cellPx, max(1f, cellPx * gapRatio), s.today, labelPx = if (months) 8f * scale else 0f)
    Image(
        provider = ImageProvider(bmp),
        contentDescription = "Workout graph, last $weeks weeks",
        modifier = GlanceModifier.fillMaxSize(),
        contentScale = ContentScale.Fit,
    )
}

@Composable
private fun Stat(label: String, value: String, color: Color, modifier: GlanceModifier, sub: String? = null) {
    Column(modifier = modifier) {
        Text(label, style = mono(8.sp, WC.faint), maxLines = 1)
        Text(value, style = mono(12.sp, color, bold = true), maxLines = 1)
        if (sub != null) Text(sub, style = mono(8.sp, WC.dim), maxLines = 1)
    }
}

// ───────────────────────────── Next workout ─────────────────────────────

@Composable
fun NextWorkoutWidgetContent(d: WidgetData) {
    val size = LocalSize.current
    val bucket = Sizes.classify(size)
    WidgetFrame(Tabs.TODAY) {
        val s = d.snapshot
        if (s == null) { NotConnected(d); return@WidgetFrame }
        val next = s.program?.next
        Column(modifier = GlanceModifier.fillMaxSize()) {
            if (next == null) {
                Header("NEXT SESSION", if (s.isDirect) "DIRECT" else null)
                VSpace(6.dp)
                Text(if (s.isDirect) "No program in Direct mode" else "No program set", style = mono(10.sp, WC.dim), maxLines = 2)
                s.last?.let { last ->
                    VSpace(8.dp)
                    Column {
                        Text("LAST WORKOUT", style = mono(8.sp, WC.faint))
                        Text(last.title.uppercase(), style = mono(12.sp, WC.text, bold = true), maxLines = 1)
                        Text("${Fmt.day(last.date)} · ${last.durationMin.roundToInt()} MIN", style = mono(9.sp, WC.dim), maxLines = 1)
                        if (bucket != WSize.SMALL) Text("${Fmt.n(last.volume)} ${s.unit.uppercase()} · ${last.sets} SETS", style = mono(9.sp, WC.dim), maxLines = 1)
                    }
                }
                Fill()
                if (bucket == WSize.LARGE) WeekFooter(s)
                return@Column
            }
            // header block
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Header(if (bucket == WSize.SMALL) "NEXT" else "NEXT SESSION", next.whenLabel, WC.amber)
                VSpace(4.dp)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
                    Text(next.dayName.uppercase(), style = mono(if (bucket == WSize.SMALL) 11.sp else 13.sp, WC.text, bold = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                    if (next.reentry) Badge("RE-ENTRY")
                }
                if (bucket != WSize.SMALL && s.program?.name?.isNotBlank() == true) {
                    Text(s.program.name.uppercase() + (next.weekName?.let { " · ${it.uppercase()}" } ?: ""), style = mono(8.sp, WC.faint), maxLines = 1)
                }
                VSpace(5.dp)
                Divider()
                VSpace(4.dp)
            }
            // exercise list
            val max = when (bucket) {
                WSize.SMALL -> ((size.height.value - 20 - 52) / 17).toInt().coerceIn(1, 4)
                WSize.MEDIUM -> ((size.height.value - 20 - 56) / 16).toInt().coerceIn(1, 7)
                WSize.LARGE -> ((size.height.value - 20 - 62 - 56) / 19).toInt().coerceIn(2, 8)
            }
            val shown = next.exercises.take(max)
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                shown.forEach { e ->
                    if (bucket == WSize.SMALL) {
                        Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp)) {
                            Text(e.short, style = mono(10.sp, WC.text), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                            Text(if (e.top > 0) Fmt.w(e.top) else "BW", style = mono(10.sp, WC.amber, bold = true), maxLines = 1)
                        }
                    } else {
                        Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = if (bucket == WSize.LARGE) 2.dp else 1.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(e.tier.ifBlank { "·" }, style = mono(8.sp, WC.faint), maxLines = 1, modifier = GlanceModifier.width(18.dp))
                            Text(e.short, style = mono(10.sp, WC.text, bold = true), maxLines = 1, modifier = GlanceModifier.width(66.dp))
                            Text(e.summary, style = mono(10.sp, WC.dim), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                        }
                    }
                }
                if (next.exercises.size > shown.size) Text("+${next.exercises.size - shown.size} MORE", style = mono(8.sp, WC.faint))
            }
            Fill()
            if (bucket == WSize.LARGE) WeekFooter(s)
            if (bucket == WSize.SMALL && size.height >= 160.dp) {
                Column(modifier = GlanceModifier.fillMaxWidth()) {
                    Divider()
                    VSpace(5.dp)
                    Row(modifier = GlanceModifier.fillMaxWidth()) {
                        Text("WEEK ${s.week.done}/${s.week.target}", style = mono(9.sp, WC.dim), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                        Text("▲${s.streak.current}W", style = mono(9.sp, WC.amber, bold = true), maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekFooter(s: Snapshot) {
    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Divider()
        VSpace(6.dp)
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text("THIS WEEK", style = mono(8.sp, WC.faint), modifier = GlanceModifier.defaultWeight())
            Text("${s.week.done}/${s.week.target} · ▲${s.streak.current}W", style = mono(8.sp, WC.dim))
        }
        VSpace(4.dp)
        WeekStrip(s.week.days, 20.dp, labelSize = 8.sp)
    }
}

@Composable
private fun Badge(text: String) {
    Box(modifier = GlanceModifier.background(WC.amber).padding(horizontal = 4.dp, vertical = 1.dp)) {
        Text(text, style = mono(8.sp, WC.bg, bold = true), maxLines = 1)
    }
}

// ───────────────────────────── This week ─────────────────────────────

@Composable
fun WeekWidgetContent(d: WidgetData) {
    val size = LocalSize.current
    val ctx = LocalContext.current
    WidgetFrame(Tabs.TODAY, padding = if (size.height < 90.dp) 8.dp else 10.dp) {
        val s = d.snapshot
        if (s == null) { NotConnected(d); return@WidgetFrame }
        val wide = size.width >= 200.dp
        if (!wide) {
            val ring = (min(size.width.value, size.height.value) - 20 - 46).coerceIn(44f, 110f)
            val px = (ring * scale(ctx)).toInt()
            Column(modifier = GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                Header("THIS WEEK", "▲${s.streak.current}W", WC.amber)
                Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
                    Image(
                        ImageProvider(Bitmaps.segments(s.week.done, s.week.target, px, px * 0.1f, Bitmaps.UP)),
                        contentDescription = "${s.week.done} of ${s.week.target} sessions",
                        modifier = GlanceModifier.size(ring.dp),
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${s.week.done}/${s.week.target}", style = mono(if (ring > 70) 16.sp else 13.sp, WC.text, bold = true, align = TextAlign.Center))
                        Text("DONE", style = mono(8.sp, WC.dim, align = TextAlign.Center))
                    }
                }
                Text("STREAK ${s.streak.current}W · BEST ${s.streak.best}W", style = mono(8.sp, WC.faint, align = TextAlign.Center), maxLines = 1)
            }
            return@WidgetFrame
        }
        if (size.height < 100.dp) {
            // 4×1 strip
            Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = GlanceModifier.width(54.dp)) {
                    Text("WEEK", style = mono(8.sp, WC.amber, bold = true), maxLines = 1)
                    Text("${s.week.done}/${s.week.target}", style = mono(13.sp, WC.text, bold = true), maxLines = 1)
                    Text("▲${s.streak.current}W", style = mono(8.sp, WC.dim), maxLines = 1)
                }
                Box(modifier = GlanceModifier.defaultWeight()) {
                    WeekStrip(s.week.days, cell = ((size.height.value - 16 - 14).coerceIn(12f, 26f)).dp, labelSize = 8.sp)
                }
            }
            return@WidgetFrame
        }
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Header("THIS WEEK", "${s.week.done}/${s.week.target} DONE")
            VSpace(4.dp)
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text("STREAK ${s.streak.current}W", style = mono(10.sp, WC.amber, bold = true), modifier = GlanceModifier.defaultWeight(), maxLines = 1)
                Text("BEST ${s.streak.best}W", style = mono(9.sp, WC.dim), maxLines = 1)
            }
            Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
                val cell = ((size.width.value - 20) / 7 - 8).coerceAtMost(size.height.value - 80).coerceIn(14f, 34f)
                WeekStrip(s.week.days, cell.dp, labelSize = 9.sp)
            }
            Legend()
        }
    }
}

@Composable
private fun Legend() {
    Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
        StatusCell("done", 7.dp); Text(" DONE  ", style = mono(7.sp, WC.faint))
        StatusCell("today", 7.dp); Text(" TODAY  ", style = mono(7.sp, WC.faint))
        StatusCell("planned", 7.dp); Text(" PLAN  ", style = mono(7.sp, WC.faint))
        StatusCell("missed", 7.dp); Text(" MISSED", style = mono(7.sp, WC.faint))
    }
}

// ───────────────────────────── Lifts ─────────────────────────────

private fun deltaColor(x: Double?) = when {
    x == null -> WC.faint
    x > 0.05 -> WC.up
    x < -0.05 -> WC.down
    else -> WC.dim
}

@Composable
fun LiftsWidgetContent(d: WidgetData) {
    val size = LocalSize.current
    val ctx = LocalContext.current
    val bucket = Sizes.classify(size)
    WidgetFrame(Tabs.LIFTS) {
        val s = d.snapshot
        if (s == null) { NotConnected(d); return@WidgetFrame }
        if (s.lifts.isEmpty()) { Placeholder("NO LIFTS YET", "Log a barbell lift in Hevy."); return@WidgetFrame }
        val unit = s.unit.uppercase()
        val sc = scale(ctx)
        when (bucket) {
            WSize.SMALL -> {
                val l = s.lifts.firstOrNull { it.key == d.liftKey } ?: s.lifts.first()
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    Header(l.short, "E1RM")
                    VSpace(2.dp)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(Fmt.w(l.e1rm), style = mono(20.sp, WC.text, bold = true), maxLines = 1)
                        Text(" $unit", style = mono(9.sp, WC.dim), maxLines = 1)
                    }
                    Text(l.delta28?.let { "${Fmt.delta(it)} / 28D" } ?: "NEW", style = mono(9.sp, deltaColor(l.delta28)), maxLines = 1)
                    VSpace(6.dp)
                    val w = (size.width.value - 20).coerceAtLeast(40f)
                    val h = (size.height.value - 20 - 64).coerceIn(16f, 80f)
                    Image(
                        ImageProvider(Bitmaps.spark(l.spark, (w * sc).toInt(), (h * sc).toInt(), Bitmaps.UP, 1.6f * sc)),
                        contentDescription = "${l.name} trend",
                        modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
                        contentScale = ContentScale.FillBounds,
                    )
                }
            }
            WSize.MEDIUM -> {
                val four = s.lifts.take(4)
                val cellW = (size.width.value - 20) / 2 - 10
                val sparkH = ((size.height.value - 20 - 20) / 2 - 36).coerceIn(0f, 30f)
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    Header("LIFTS · E1RM", "$unit · 28D")
                    VSpace(4.dp)
                    four.chunked(2).forEachIndexed { i, row ->
                        Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                            if (i > 0) Divider()
                            Row(modifier = GlanceModifier.fillMaxSize()) {
                                row.forEachIndexed { j, l ->
                                    if (j > 0) Spacer(GlanceModifier.width(1.dp).fillMaxHeight().background(WC.line))
                                    LiftCell(l, cellW, sparkH, sc, GlanceModifier.defaultWeight().fillMaxHeight().padding(horizontal = 5.dp, vertical = 3.dp))
                                }
                                if (row.size == 1) Spacer(GlanceModifier.defaultWeight())
                            }
                        }
                    }
                }
            }
            WSize.LARGE -> {
                val rows = ((size.height.value - 20 - 22) / 26).toInt().coerceIn(3, 8)
                val list = s.lifts.take(rows)
                val sparkW = ((size.width.value - 20) * 0.32f).coerceIn(50f, 120f)
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    Header("LIFTS · E1RM", "$unit · 28D")
                    VSpace(4.dp)
                    Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                        list.forEachIndexed { i, l ->
                            Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                                if (i > 0) Divider()
                                Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                                    Text(l.short, style = mono(10.sp, WC.text, bold = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                                    Image(
                                        ImageProvider(Bitmaps.spark(l.spark, (sparkW * sc).toInt(), (16 * sc).toInt(), Bitmaps.UP, 1.4f * sc)),
                                        contentDescription = null,
                                        modifier = GlanceModifier.width(sparkW.dp).height(16.dp),
                                        contentScale = ContentScale.FillBounds,
                                    )
                                    Text(Fmt.w(l.e1rm), style = mono(11.sp, WC.text, bold = true, align = TextAlign.End), maxLines = 1, modifier = GlanceModifier.width(52.dp))
                                    Text(l.delta28?.let { Fmt.delta(it) } ?: "—", style = mono(9.sp, deltaColor(l.delta28), align = TextAlign.End), maxLines = 1, modifier = GlanceModifier.width(44.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LiftCell(l: Lift, widthDp: Float, sparkH: Float, sc: Float, modifier: GlanceModifier) {
    Column(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(l.short, style = mono(9.sp, WC.dim), maxLines = 1)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(Fmt.w(l.e1rm), style = mono(14.sp, WC.text, bold = true), maxLines = 1)
            Text(" " + (l.delta28?.let { Fmt.delta(it) } ?: ""), style = mono(9.sp, deltaColor(l.delta28)), maxLines = 1)
        }
        if (sparkH >= 12f) {
            VSpace(3.dp)
            Image(
                ImageProvider(Bitmaps.spark(l.spark, (widthDp * sc).toInt(), (sparkH * sc).toInt(), Bitmaps.UP, 1.3f * sc)),
                contentDescription = null,
                modifier = GlanceModifier.fillMaxWidth().height(sparkH.dp),
                contentScale = ContentScale.FillBounds,
            )
        }
    }
}

// ───────────────────────────── Recovery ─────────────────────────────

@Composable
fun RecoveryWidgetContent(d: WidgetData) {
    val size = LocalSize.current
    val ctx = LocalContext.current
    val bucket = Sizes.classify(size)
    WidgetFrame(Tabs.BODY) {
        val s = d.snapshot
        if (s == null) { NotConnected(d); return@WidgetFrame }
        val rec = s.recovery
        if (rec == null) {
            if (s.isDirect || d.isDirect) Placeholder("NEEDS SERVER", "Recovery is computed by the ${Brand.NAME} server. Connect one in SETUP.")
            else Placeholder("NO RECOVERY DATA", "Log a workout to see readiness.")
            return@WidgetFrame
        }
        if (bucket == WSize.SMALL) {
            val ring = (min(size.width.value, size.height.value) - 20 - 46).coerceIn(44f, 110f)
            val px = (ring * scale(ctx)).toInt()
            val low = rec.muscles.firstOrNull()
            Column(modifier = GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                Header("READINESS")
                Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
                    Image(
                        ImageProvider(Bitmaps.ring(rec.overall, px, px * 0.1f, readinessColor(rec.overall).toArgbInt())),
                        contentDescription = "Overall readiness ${Fmt.pct(rec.overall)}",
                        modifier = GlanceModifier.size(ring.dp),
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(Fmt.pct(rec.overall), style = mono(if (ring > 70) 16.sp else 13.sp, WC.text, bold = true, align = TextAlign.Center))
                        Text("OVERALL", style = mono(7.sp, WC.dim, align = TextAlign.Center))
                    }
                }
                if (low != null) Text("LOW ${low.name} ${Fmt.pct(low.readiness)}", style = mono(8.sp, readinessColor(low.readiness), align = TextAlign.Center), maxLines = 1)
            }
            return@WidgetFrame
        }
        val headerH = if (bucket == WSize.LARGE) 44 else 18
        val rows = ((size.height.value - 20 - headerH) / 19).toInt().coerceIn(2, if (bucket == WSize.LARGE) 10 else 6)
        val nameW = 80.dp
        val valueW = 56.dp
        val barW = (size.width - (PAD * 2).dp - nameW - valueW - 8.dp).coerceAtLeast(30.dp)
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                Header("RECOVERY", "OVERALL ${Fmt.pct(rec.overall)}", readinessColor(rec.overall))
                if (bucket == WSize.LARGE) {
                    VSpace(4.dp)
                    Bar(rec.overall, readinessColor(rec.overall), size.width - (PAD * 2).dp, 6.dp)
                    VSpace(6.dp)
                    Text("LEAST READY", style = mono(8.sp, WC.faint))
                }
                VSpace(2.dp)
            }
            Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                rec.muscles.take(rows).forEach { m ->
                    Row(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
                        Text(m.name, style = mono(9.sp, WC.text), maxLines = 1, modifier = GlanceModifier.width(nameW))
                        Bar(m.readiness, readinessColor(m.readiness), barW, 5.dp)
                        HSpace(8.dp)
                        Text(
                            if (m.readyInH > 0) "${Fmt.pct(m.readiness)} ${Fmt.hours(m.readyInH)}" else Fmt.pct(m.readiness),
                            style = mono(8.sp, WC.dim, align = TextAlign.End), maxLines = 1, modifier = GlanceModifier.width(valueW),
                        )
                    }
                }
            }
        }
    }
}

private fun Color.toArgbInt(): Int = android.graphics.Color.argb(
    (alpha * 255).roundToInt(), (red * 255).roundToInt(), (green * 255).roundToInt(), (blue * 255).roundToInt(),
)
