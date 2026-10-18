package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.Graph
import dev.ironterm.data.Snapshot
import dev.ironterm.data.app.AppHome
import dev.ironterm.gym.Live
import kotlin.math.roundToInt

@Composable
fun TodayScreen(state: UiState, data: DataUi, gym: GymUi, actions: AppActions, now: Long, onGym: () -> Unit, onGo: (Route) -> Unit, onHistory: () -> Unit) {
    LaunchedEffect(state.mode) { actions.load(Screens.HOME) }
    val home: AppHome? = data.home.data
    val s: Snapshot? = home?.snapshot?.takeIf { it.today.isNotEmpty() }?.copy(source = state.snapshot?.source ?: Snapshot.SOURCE_SERVER) ?: state.snapshot
    if (s == null) {
        if (data.home.error != null) ErrorState(data.home.error, data.home.auth, onRetry = { actions.refresh(); actions.load(Screens.HOME, true) })
        else LoadingState("Today")
        return
    }
    val unit = s.unit.uppercase()
    RefreshColumn(refreshing = state.loading || data.home.loading, onRefresh = { actions.refresh(); actions.load(Screens.HOME, force = true) }) {
        if (data.home.error != null && home != null) StaleStrip(data.home.error, data.home.savedAt, now)
        gym.state.session?.let { live ->
            val p = Live.progress(live)
            Column(Modifier.fillMaxWidth().background(T.amber.copy(alpha = 0.10f)).clickable(onClick = onGym).padding(16.dp)) {
                Label("Workout in progress", right = "RESUME ›", rightColor = T.amber)
                Spacer(Modifier.height(6.dp))
                Mono(live.title.uppercase(), size = 16.sp, bold = true, maxLines = 1)
                Spacer(Modifier.height(8.dp))
                BarLine(p.fraction.toDouble(), T.amber, Modifier.fillMaxWidth(), 6.dp)
                Spacer(Modifier.height(6.dp))
                Mono("${p.done}/${p.total} SETS · ${clock(((now - (Live.parseMs(live.startedAt) ?: now)) / 1000.0))}", size = 11.sp, color = T.dim)
            }
            Line()
        }
        NextCard(s, unit, onGym)
        Section("This week", right = "${s.week.done}/${s.week.target} DONE") {
            WeekStripC(s.week.days)
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("Streak", "${s.streak.current} WK", Modifier.weight(1f), sub = "BEST ${s.streak.best}", valueColor = T.amber)
                Stat("Sessions 52w", Fmt.n(s.totals.sessions52), Modifier.weight(1f), sub = "ALL TIME ${Fmt.n(s.totals.allTime)}")
                Stat("Vol 7d", Fmt.compact(s.totals.vol7), Modifier.weight(1f), sub = Fmt.change(s.totals.vol7, s.totals.volPrev7)?.let { "$it VS PREV" } ?: unit)
            }
        }
        s.recovery?.let { rec ->
            Section("Readiness", right = Fmt.pct(rec.overall), rightColor = readinessColor(rec.overall)) {
                BarLine(rec.overall, readinessColor(rec.overall), Modifier.fillMaxWidth(), 8.dp)
                Spacer(Modifier.height(10.dp))
                rec.muscles.take(3).forEach { m ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Mono(m.name, Modifier.width(110.dp), size = 11.sp, maxLines = 1)
                        BarLine(m.readiness, readinessColor(m.readiness), Modifier.weight(1f), 5.dp)
                        Mono(Fmt.pct(m.readiness), Modifier.width(44.dp), size = 11.sp, color = T.dim, align = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Mono("BODY ›", Modifier.clickable { onGo(Route.Body) }.padding(vertical = 6.dp), size = 11.sp, color = T.amber, bold = true)
            }
        }
        if (home != null && home.watch.isNotEmpty()) {
            Section("Watch", right = "STALLS · PROGRESS") {
                home.watch.take(6).forEachIndexed { i, w ->
                    if (i > 0) Line()
                    Row(Modifier.fillMaxWidth().clickable { onGo(Route.Lift(w.lift)) }.heightIn(min = 48.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.Top) {
                        Mono(w.short, Modifier.width(84.dp), size = 11.sp, bold = true, maxLines = 1)
                        Column(Modifier.weight(1f)) {
                            Mono(w.status.uppercase() + (w.rate?.let { "  ${if (it >= 0) "+" else ""}${Fmt.w(it)}% / 6W" } ?: ""), size = 10.sp, color = statusColor(w.status), bold = true, maxLines = 1)
                            Mono(w.text, size = 10.sp, color = T.dim, maxLines = 3)
                        }
                    }
                }
            }
        }
        if (home != null && home.recentPRs.isNotEmpty()) {
            Section("Recent PRs", right = "30 DAYS") {
                home.recentPRs.sortedByDescending { it.date }.take(6).forEach { p ->
                    Row(Modifier.fillMaxWidth().clickable { onGo(Route.Lift(p.lift)) }.heightIn(min = 36.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Mono("★", Modifier.width(20.dp), size = 11.sp, color = T.amber)
                        Mono(p.short, Modifier.width(90.dp), size = 11.sp, bold = true, maxLines = 1)
                        Mono("${Fmt.w(p.weight)} × ${p.reps}", Modifier.weight(1f), size = 12.sp, color = T.text, maxLines = 1)
                        Mono(p.kind.uppercase(), Modifier.width(48.dp), size = 9.sp, color = T.faint, maxLines = 1)
                        Mono(Fmt.day(p.date).substringAfter(' '), size = 10.sp, color = T.dim, maxLines = 1)
                    }
                }
            }
        }
        Section("Activity", right = "FULL GRAPH ›", rightColor = T.amber) {
            val recent = s.copy(graph = Graph(days = s.graph.days.chunked(7).takeLast(26).flatten()))
            Box(Modifier.clickable(onClick = onHistory)) {
                ContributionGraph(recent, state.theme, cell = 9.dp, gap = 3.dp, onSelect = { onHistory() })
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Mono("26 WEEKS · TAP FOR THE YEAR", Modifier.weight(1f), size = 9.sp, color = T.faint, maxLines = 1)
                GraphLegend(state.theme)
            }
        }
        if (home != null && home.e1rm.isNotEmpty()) {
            Section("e1RM", right = "$unit · Δ4W · Δ12W") {
                TRow(listOf("LIFT", "NOW", "4W", "12W", "BEST"), listOf(1.4f, 1f, 1f, 1f, 1f), header = true)
                home.e1rm.take(8).forEach { r ->
                    Line()
                    TRow(
                        listOf(r.short, Fmt.w(r.now), r.d4w?.let(Fmt::delta) ?: "—", r.d12w?.let(Fmt::delta) ?: "—", Fmt.w(r.best)),
                        listOf(1.4f, 1f, 1f, 1f, 1f),
                        listOf(T.text, T.text, deltaColor(r.d4w), deltaColor(r.d12w), if (r.now >= r.best) T.amber else T.dim),
                        onClick = { onGo(Route.Lift(r.lift)) },
                    )
                }
            }
        } else if (s.lifts.isNotEmpty()) {
            Section("e1RM", right = "$unit · Δ28D") {
                s.lifts.take(6).forEach { l ->
                    TRow(listOf(l.short, Fmt.w(l.e1rm), l.delta28?.let(Fmt::delta) ?: "NEW"), listOf(1.4f, 1f, 1f), listOf(T.text, T.text, deltaColor(l.delta28)), onClick = { onGo(Route.Lift(l.key)) })
                }
            }
        }
        s.last?.let { last ->
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
    }
}

@Composable
private fun NextCard(s: Snapshot, unit: String, onGym: () -> Unit) {
    val next = s.program?.next
    Column(Modifier.fillMaxWidth().clickable(enabled = next != null || s.isDirect, onClick = onGym).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Label("Next session", right = next?.whenLabel, rightColor = T.amber)
        Spacer(Modifier.height(10.dp))
        if (next == null) {
            Mono(if (s.program == null) "NO PROGRAM" else "PROGRAM COMPLETE", size = 16.sp, bold = true)
            Spacer(Modifier.height(6.dp))
            Mono(
                if (s.isDirect) "Programs and planned weights come from the ${Brand.NAME} server. You can still log a free workout in GYM."
                else "Pick a program in the web app (SETUP → Advanced setup) to see planned sessions here.",
                size = 12.sp, color = T.dim,
            )
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(next.dayName.uppercase(), Modifier.weight(1f), size = 19.sp, bold = true, maxLines = 2)
            if (next.reentry) { Spacer(Modifier.width(8.dp)); Badge("RE-ENTRY") }
        }
        Spacer(Modifier.height(4.dp))
        Mono(listOfNotNull(s.program.name, next.weekName, next.date?.let { Fmt.day(it) }).joinToString(" · ").uppercase(), size = 11.sp, color = T.faint)
        if (next.reentry) {
            Spacer(Modifier.height(6.dp))
            Mono("Re-entry after a break: weights are eased back in.", size = 11.sp, color = T.amber)
        }
        Spacer(Modifier.height(10.dp))
        next.exercises.forEachIndexed { i, e ->
            if (i > 0) Line()
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.Top) {
                Mono(e.tier.ifBlank { "·" }, Modifier.width(34.dp), size = 11.sp, color = T.faint)
                Column(Modifier.weight(1f)) {
                    Mono(e.name.uppercase(), size = 13.sp, bold = true, maxLines = 1)
                    Spacer(Modifier.height(2.dp))
                    Mono(e.summary, size = 11.sp, color = T.dim)
                }
                Spacer(Modifier.width(8.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Mono(if (e.top > 0) Fmt.w(e.top) else "BW", size = 16.sp, color = T.amber, bold = true)
                    Mono(if (e.top > 0) unit else "", size = 10.sp, color = T.faint)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().border(1.dp, T.amber).background(T.amber.copy(alpha = 0.10f)).heightIn(min = 48.dp), contentAlignment = Alignment.Center) {
            Mono("▲ START IN GYM", size = 13.sp, color = T.amber, bold = true)
        }
    }
    Line()
}

/** 754 s → "12:34", 3754 → "1:02:34" */
fun clock(sec: Double): String {
    val s = kotlin.math.max(0, kotlin.math.round(sec).toInt())
    val h = s / 3600
    val m = (s % 3600) / 60
    val r = s % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}" else "$m:${r.toString().padStart(2, '0')}"
}
