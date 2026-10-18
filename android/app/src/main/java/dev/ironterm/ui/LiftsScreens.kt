package dev.ironterm.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppLiftDetail
import dev.ironterm.data.app.Load
import java.time.LocalDate

// ═════════════════════════════ list ═════════════════════════════

@Composable
fun LiftsScreen(state: UiState, data: DataUi, actions: AppActions, onGo: (Route) -> Unit, onSetup: () -> Unit) {
    LaunchedEffect(state.mode) { actions.load(Screens.LIFTS) }
    val unit = (state.snapshot?.unit ?: "kg").uppercase()
    Loaded(data.lifts, "Lifts", onRetry = { actions.load(Screens.LIFTS, true) }, onSetup = onSetup) { list ->
        RefreshColumn(data.lifts.loading, onRefresh = { actions.load(Screens.LIFTS, true) }) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Label("Lifts · estimated 1RM", right = "$unit · ${list.lifts.size} LIFTS")
            }
            Line()
            if (list.lifts.isEmpty()) {
                Column(Modifier.padding(16.dp)) { EmptyNote("NO LIFTS YET", "Log squat, bench, deadlift or press in Hevy and they show up here.") }
            }
            list.lifts.forEach { l ->
                Row(
                    Modifier.fillMaxWidth().clickable { onGo(Route.Lift(l.key)) }.heightIn(min = 72.dp).padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Mono(l.short, size = 12.sp, color = T.amber, bold = true, maxLines = 1)
                            l.status?.let { st ->
                                Spacer(Modifier.width(8.dp))
                                Mono(st.uppercase(), size = 9.sp, color = statusColor(st), maxLines = 1)
                            }
                        }
                        Mono(l.name.uppercase(), size = 9.sp, color = T.faint, maxLines = 1)
                        Spacer(Modifier.height(4.dp))
                        Mono("${l.sessions} SESSIONS · LAST ${Fmt.day(l.last).substringAfter(' ')}", size = 9.sp, color = T.dim, maxLines = 1)
                    }
                    Sparkline(l.spark, Modifier.width(80.dp).height(34.dp), color = statusColor(l.status).takeIf { l.status != null } ?: T.up)
                    Spacer(Modifier.width(12.dp))
                    Column(horizontalAlignment = Alignment.End, modifier = Modifier.width(76.dp)) {
                        if (l.e1rm <= 0 && l.best <= 0) {
                            Mono("BW", size = 20.sp, color = T.dim, bold = true, maxLines = 1)
                            Mono("BODYWEIGHT", size = 9.sp, color = T.faint, maxLines = 1)
                        } else {
                            Mono(Fmt.w(l.e1rm), size = 20.sp, bold = true, maxLines = 1)
                            Mono(if (l.e1rm >= l.best) "BEST" else "BEST ${Fmt.w(l.best)}", size = 9.sp, color = if (l.e1rm >= l.best) T.amber else T.faint, maxLines = 1)
                        }
                    }
                }
                Line()
            }
            Mono("e1RM = Epley, w × (1 + reps/30). Tap a lift for its chart, rep PRs and sessions.", Modifier.padding(16.dp), size = 10.sp, color = T.faint)
        }
    }
}

// ═════════════════════════════ detail ═════════════════════════════

@Composable
fun LiftDetailScreen(key: String, state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onGo: (Route) -> Unit) {
    LaunchedEffect(key) { actions.loadLift(key) }
    val load = data.lift[key] ?: Load()
    val title = load.data?.name ?: data.lifts.data?.lifts?.firstOrNull { it.key == key }?.name ?: key
    Column(Modifier.fillMaxSize()) {
        BackBar(title, onBack)
        Box(Modifier.weight(1f)) {
            Loaded(load, title, onRetry = { actions.loadLift(key, true) }) { d ->
                LiftDetail(d, state.mode, state.snapshot?.today, load.loading, { actions.loadLift(key, true) }, onGo)
            }
        }
    }
}

@Composable
private fun LiftDetail(d: AppLiftDetail, mode: SourceMode, todayIso: String?, refreshing: Boolean, onRefresh: () -> Unit, onGo: (Route) -> Unit) {
    val todayD = todayIso?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()
    val u = d.unit.uppercase()
    var range by rememberSaveable { mutableStateOf("1y") }
    RefreshColumn(refreshing, onRefresh) {
        val pts = d.points
        // KPIs
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Stat("e1RM now", d.e1rm?.let { Fmt.w(it) } ?: "—", Modifier.weight(1f), sub = u, valueColor = T.amber)
                Stat("Best", d.best?.let { Fmt.w(it.e1rm) } ?: "—", Modifier.weight(1f), sub = d.best?.date?.let { Fmt.day(it) })
                Stat("vs 1 year", if (d.e1rm != null && d.yearAgo != null) Fmt.delta(d.e1rm - d.yearAgo) else "—", Modifier.weight(1f), sub = d.yearAgo?.let { "FROM ${Fmt.w(it)}" } ?: "NO DATA", valueColor = deltaColor(if (d.e1rm != null && d.yearAgo != null) d.e1rm - d.yearAgo else null))
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("Heaviest", pts.maxOfOrNull { it.topWeight }?.let { Fmt.w(it) } ?: "—", Modifier.weight(1f), sub = "ANY REPS")
                Stat("Sessions", "${pts.size}", Modifier.weight(1f), sub = pts.firstOrNull()?.let { "SINCE ${Fmt.day(it.date).substringAfter(' ')}" })
                Stat("Trend", d.stall?.status?.uppercase() ?: "—", Modifier.weight(1f), valueColor = statusColor(d.stall?.status), sub = d.stall?.change6w?.let { "${Fmt.delta(it * 100)}% / 6W" })
            }
        }
        Line()
        Section("e1RM", right = u) {
            val today = todayD.toEpochDay()
            val from = when (range) { "1y" -> today - 365; "3y" -> today - 365 * 3; else -> Long.MIN_VALUE }
            fun ep(s: String) = runCatching { LocalDate.parse(s).toEpochDay() }.getOrNull()
            val vis = pts.mapNotNull { p -> ep(p.date)?.let { it to p } }.filter { it.first >= from }
            // 28-day best (deloads and light days don't dip the line), with each session dashed underneath.
            val all = pts.mapNotNull { p -> ep(p.date)?.let { it to p.e1rm } }
            val best = vis.map { (x, _) -> x to all.filter { it.first in (x - 27)..x }.maxOf { it.second } }
            val bodyweight = pts.none { it.e1rm > 0 }
            val series = if (bodyweight) listOf(
                ChartSeries("BEST SET REPS", T.up, vis.map { it.first to (it.second.sets.maxOfOrNull { s -> s.reps } ?: 0).toDouble() }, area = true),
            ) else listOf(
                ChartSeries("28D BEST", T.up, best, area = true),
                ChartSeries("SESSION", T.ramp[2], vis.map { it.first to it.second.e1rm }, dots = true),
            )
            val band = d.projection?.band.orEmpty().mapNotNull { b -> ep(b.date)?.let { Triple(it, b.lo, b.hi) } }
            Seg(listOf("1y" to "1Y", "3y" to "3Y", "all" to "ALL"), range, { range = it })
            Spacer(Modifier.height(10.dp))
            LineChart(series, if (bodyweight) "reps" else d.unit, height = 220.dp, bands = if (range == "1y" && !bodyweight) band else emptyList())
        }
        d.stall?.let { st ->
            Section("Status", right = st.status.uppercase(), rightColor = statusColor(st.status)) {
                Mono(st.reason, size = 12.sp, color = T.text)
                Spacer(Modifier.height(6.dp))
                Mono(listOfNotNull(st.change6w?.let { "6W ${Fmt.delta(it * 100)}%" }, st.change12w?.let { "12W ${Fmt.delta(it * 100)}%" }).joinToString("   "), size = 11.sp, color = T.dim)
            }
        }
        d.projection?.let { p ->
            Section("Projection", right = "12 WEEKS") {
                Row(verticalAlignment = Alignment.Bottom) {
                    Mono(p.current?.let { Fmt.w(it) } ?: "—", size = 20.sp, bold = true)
                    Mono("  →  ", size = 14.sp, color = T.faint)
                    Mono(p.projected?.let { Fmt.w(it) } ?: "—", size = 20.sp, color = T.amber, bold = true)
                    Mono(" $u", size = 10.sp, color = T.faint, modifier = Modifier.padding(bottom = 3.dp))
                }
                Spacer(Modifier.height(6.dp))
                Mono(p.note, size = 11.sp, color = T.dim)
                if (p.band.isNotEmpty()) Mono("Shaded band on the 1Y chart: likely range.", size = 9.sp, color = T.faint)
            }
        }
        if (d.repPRs.isNotEmpty()) {
            Section("Rep PRs", right = "BEST WEIGHT FOR ≥ N REPS") {
                TRow(listOf("REPS", "WEIGHT", "e1RM", "DATE"), listOf(0.7f, 1f, 1f, 1.3f), header = true)
                d.repPRs.forEach { p ->
                    Line()
                    val recent = runCatching { LocalDate.parse(p.date).isAfter(todayD.minusDays(60)) }.getOrDefault(false)
                    TRow(
                        listOf("${p.reps}", Fmt.w(p.weight), Fmt.w(if (p.reps == 1) p.weight else p.weight * (1 + p.reps / 30.0)), Fmt.day(p.date).substringAfter(' ')),
                        listOf(0.7f, 1f, 1f, 1.3f),
                        listOf(T.text, T.text, T.dim, if (recent) T.amber else T.dim),
                    )
                }
            }
        }
        if (d.prWall.isNotEmpty()) {
            Section("PR wall", right = "HOW LONG EACH HAS STOOD") {
                val maxDays = d.prWall.maxOf { it.stoodDays }.coerceAtLeast(1)
                d.prWall.forEach { p ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Mono("${p.reps}RM", Modifier.width(44.dp), size = 11.sp, bold = true)
                        Mono(Fmt.w(p.weight), Modifier.width(56.dp), size = 11.sp, align = TextAlign.End)
                        Spacer(Modifier.width(10.dp))
                        BarLine(p.stoodDays.toDouble() / maxDays, if (p.stoodDays > 180) T.down else if (p.stoodDays < 30) T.up else T.amber, Modifier.weight(1f), 6.dp)
                        Mono(stood(p.stoodDays), Modifier.width(56.dp), size = 10.sp, color = T.dim, align = TextAlign.End)
                    }
                }
            }
        }
        if (d.rpe.isNotEmpty() && d.e1rm != null) {
            Section("Your RPE chart", right = "LOAD AT e1RM ${Fmt.w(d.e1rm)}") {
                val rpes = d.rpe.map { it.rpe }.distinct().sorted()
                val reps = d.rpe.map { it.reps }.distinct().sorted()
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    Column {
                        Row { Mono("REPS", Modifier.width(44.dp), size = 9.sp, color = T.faint); rpes.forEach { Mono("@${Fmt.w(it)}", Modifier.width(52.dp), size = 9.sp, color = T.faint, align = TextAlign.End) } }
                        reps.forEach { r ->
                            Row(Modifier.padding(vertical = 3.dp)) {
                                Mono("$r", Modifier.width(44.dp), size = 11.sp, bold = true)
                                rpes.forEach { e ->
                                    val pct = d.rpe.firstOrNull { it.reps == r && it.rpe == e }?.pct
                                    Mono(pct?.let { Fmt.w(dev.ironterm.gym.Live.roundTo(d.e1rm * it, if (d.unit == "lb") 5.0 else 2.5)) } ?: "—", Modifier.width(52.dp), size = 11.sp, color = if (e >= 9) T.amber else T.text, align = TextAlign.End)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Mono("Personal % of 1RM by reps × RPE, from your own logged RPE sets.", size = 9.sp, color = T.faint)
            }
        }
        if (pts.isNotEmpty()) {
            Section("Sessions", right = "NEWEST FIRST") {
                val best = d.best?.e1rm ?: pts.maxOf { it.e1rm }
                pts.reversed().take(30).forEachIndexed { i, p ->
                    if (i > 0) Line()
                    Row(Modifier.fillMaxWidth().clickable { onGo(Route.Workout(p.workoutId)) }.heightIn(min = 52.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Mono(Fmt.day(p.date), size = 11.sp, color = T.dim, maxLines = 1)
                            Spacer(Modifier.height(2.dp))
                            Mono(p.sets.joinToString("  ") { if (it.weight > 0) "${Fmt.w(it.weight)}×${it.reps}" else "${it.reps}" }, size = 12.sp, maxLines = 2)
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(horizontalAlignment = Alignment.End) {
                            Mono(Fmt.w(p.e1rm), size = 15.sp, color = if (p.e1rm >= best - 0.01) T.amber else T.text, bold = true)
                            Mono("e1RM", size = 8.sp, color = T.faint)
                        }
                    }
                }
            }
        }
        if (mode == SourceMode.DIRECT) Mono("Direct mode: stall detection, projections and the RPE chart need the server.", Modifier.padding(16.dp), size = 10.sp, color = T.faint)
    }
}

private fun stood(days: Int): String = when {
    days < 14 -> "${days}D"
    days < 90 -> "${days / 7}W"
    days < 730 -> "${days / 30}MO"
    else -> "${days / 365}Y"
}
