package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.ProgramBody
import dev.ironterm.data.app.ProgramBodyMuscle
import dev.ironterm.data.app.ProgramBrowse

// The program page's BODY tab: what a program does to each muscle before you start it
// (GET /api/app/programs/{id}/body, docs/api/programs.md). The figures are the server's SVGs,
// drawn the way the BODY screen draws them.

@Composable
internal fun ProgramBodyTab(id: String, opts: Map<String, String>, data: DataUi, actions: AppActions) {
    var mode by rememberSaveable(id) { mutableStateOf("load") }
    val key = ProgramBrowse.bodyKey(id, opts, mode)
    LaunchedEffect(key) { actions.loadProgramBody(id, opts, mode) }
    val load: Load<ProgramBody> = data.programBody[key] ?: Load()
    // keep showing the other mode's numbers while the new figures load
    var last by remember(id) { mutableStateOf<ProgramBody?>(null) }
    load.data?.let { if (it !== last) last = it }
    val b = load.data ?: last

    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Seg(listOf("load" to "WEEKLY LOAD", "gaps" to "GAPS"), mode, { mode = it })
        Spacer(Modifier.weight(1f))
        if (load.loading && load.data == null && b != null) Mono("UPDATING…", size = 10.sp, color = T.amber, bold = true, maxLines = 1)
    }
    when {
        b == null && load.error != null -> Column(Modifier.padding(16.dp)) {
            EmptyNote("Couldn't load the body view", load.error)
            Spacer(Modifier.height(8.dp))
            TButton("Retry") { actions.loadProgramBody(id, opts, mode, true) }
        }
        b == null -> Column(Modifier.padding(16.dp)) { Mono("Modelling a week of training…", size = 12.sp, color = T.dim) }
        else -> BodyContent(b, mode)
    }
}

@Composable
private fun BodyContent(b: ProgramBody, mode: String) {
    // summary
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)) {
        b.summary.lines.forEach { line ->
            Row(Modifier.padding(vertical = 2.dp)) {
                Mono("·", Modifier.width(14.dp), size = 12.sp, color = T.amber, bold = true)
                Mono(line, Modifier.weight(1f), size = 12.sp)
            }
        }
        Spacer(Modifier.height(4.dp))
        Mono(
            "${ProgramBrowse.daysText(b.trainingDays)} · ${if (b.weeks > 1) "averaged over ${b.weeks} weeks · " else ""}as if every session goes to plan",
            size = 10.sp, color = T.faint,
        )
    }
    // figures (only those of the mode asked for: the cached one may be the other mode's)
    if (b.mode == mode && b.svgFront.isNotBlank()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SvgImage(b.svgFront, "Front figure", Modifier.weight(1f))
            SvgImage(b.svgBack, "Back figure", Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono(b.legend.getOrNull(0)?.uppercase().orEmpty(), size = 9.sp, color = T.faint)
            Spacer(Modifier.width(6.dp))
            Box(Modifier.weight(1f).height(6.dp).background(Brush.horizontalGradient(if (mode == "load") LOAD_SCALE else WARN_SCALE)))
            Spacer(Modifier.width(6.dp))
            Mono(b.legend.getOrNull(1)?.uppercase().orEmpty(), size = 9.sp, color = T.faint)
        }
    } else {
        Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) { Mono("DRAWING…", size = 10.sp, color = T.faint) }
    }
    Line()
    Section("Weekly hard sets vs range", right = "SETS · STATUS") {
        ProgramBrowse.bodyGroups(b).forEachIndexed { gi, (group, rows) ->
            if (gi > 0) Spacer(Modifier.height(10.dp))
            Mono(group, size = 10.sp, color = T.faint, bold = true)
            Spacer(Modifier.height(2.dp))
            rows.forEach { m -> RangeRow(m) }
        }
        Spacer(Modifier.height(6.dp))
        Mono("Bar = hard sets a week · band = target range. Tap a muscle for details.", size = 9.sp, color = T.faint)
    }
    Overlaps(b)
}

private fun barColor(m: ProgramBodyMuscle): Color = when {
    m.status == "high" || m.overlaps > 0 -> T.down
    m.status == "low" || m.status == "none" -> T.amber
    else -> T.up
}

/** Muscle · bar with the target band · hard sets · status; tap for the details. */
@Composable
private fun RangeRow(m: ProgramBodyMuscle) {
    var open by remember(m.id) { mutableStateOf(false) }
    val bar = ProgramBrowse.rangeBar(m)
    Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(vertical = 5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Mono(m.short.ifBlank { m.name }.uppercase(), Modifier.width(96.dp).padding(end = 8.dp), size = 11.sp, maxLines = 1)
            BoxWithConstraints(Modifier.weight(1f).height(12.dp)) {
                val w = maxWidth
                Box(Modifier.fillMaxWidth().height(6.dp).align(Alignment.CenterStart).background(T.line))
                if (bar.lo != null && bar.hi != null) {
                    Box(Modifier.offset(x = w * bar.lo).width(w * (bar.hi - bar.lo)).fillMaxHeight().background(T.faint.copy(alpha = 0.35f)))
                }
                Box(Modifier.width(w * bar.fill).height(6.dp).align(Alignment.CenterStart).background(barColor(m)))
            }
            Mono(Fmt.w(m.hardSets), Modifier.width(40.dp), size = 11.sp, color = T.text, align = TextAlign.End)
            Mono(ProgramBrowse.bodyStatus(m.status), Modifier.width(64.dp), size = 9.sp, color = statusColor(m.status), align = TextAlign.End, maxLines = 1)
        }
        if (open) {
            Spacer(Modifier.height(3.dp))
            Mono(
                listOfNotNull(
                    m.name,
                    "${Fmt.w(m.sets)} sets/wk (${Fmt.w(m.hardSets)} hard)",
                    m.target?.takeIf { it.size == 2 }?.let { "range ${Fmt.w(it[0])}–${Fmt.w(it[1])}" },
                    "${Fmt.w(m.hits)} hits/wk",
                    m.minGapH?.let { "shortest gap ${Fmt.hours(it)}" },
                    m.recoverH?.let { "needs ~${Fmt.hours(it)}" },
                    "lowest readiness ${Fmt.pct(m.minReadiness)}",
                    m.overlaps.takeIf { it > 0 }?.let { "${Fmt.w(it)} overlaps/wk" },
                    m.lifts.takeIf { it.isNotEmpty() }?.joinToString(", "),
                ).joinToString(" · "),
                size = 10.sp, color = T.dim,
            )
        }
    }
}

@Composable
private fun Overlaps(b: ProgramBody) {
    var wi by rememberSaveable(b.id) { mutableStateOf(0) }
    val week = wi.coerceIn(0, (b.weeks - 1).coerceAtLeast(0)) + 1
    val list = ProgramBrowse.overlapsIn(b, week)
    Section("Overlaps", right = "${Fmt.w(b.summary.overlapsPerWeek)} A WEEK", rightColor = if (b.overlaps.isEmpty()) T.dim else T.down) {
        Mono("A muscle hit again before it recovered from the last session.", size = 10.sp, color = T.faint)
        if (b.weeks > 1) {
            Spacer(Modifier.height(8.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..b.weeks).forEach { w -> Chip("WEEK $w · ${b.overlapsByWeek.getOrNull(w - 1) ?: 0}", w == week) { wi = w - 1 } }
            }
        }
        Spacer(Modifier.height(8.dp))
        if (list.isEmpty()) Mono(if (b.weeks > 1) "None in week $week: every muscle recovers before its next hit." else "None: every muscle recovers before its next hit.", size = 12.sp, color = T.dim)
        list.forEachIndexed { i, o ->
            if (i > 0) Line()
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                Mono(o.short, Modifier.width(96.dp).padding(end = 8.dp), size = 11.sp, color = T.down, bold = true, maxLines = 1)
                Mono(ProgramBrowse.overlapLine(o), Modifier.weight(1f), size = 10.sp, color = T.dim)
                Mono(Fmt.pct(o.share), Modifier.width(44.dp), size = 11.sp, align = TextAlign.End)
            }
        }
    }
}
