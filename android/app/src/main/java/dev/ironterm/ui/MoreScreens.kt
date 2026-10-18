package dev.ironterm.ui

import android.graphics.Picture
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.caverock.androidsvg.SVG
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.data.WeekDay
import dev.ironterm.data.app.AppBody
import dev.ironterm.data.app.AppCalendar
import dev.ironterm.data.app.CalDay
import dev.ironterm.data.app.Load
import java.time.LocalDate
import java.time.YearMonth

// ═════════════════════════════ MORE ═════════════════════════════

@Composable
fun MoreScreen(state: UiState, gym: GymUi, social: SocialUi = SocialUi(), onGo: (Route) -> Unit) {
    val direct = state.mode == SourceMode.DIRECT
    val srv = if (direct) " · needs a server" else ""
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) { Label("More") }
        Line()
        if (Tabs.LIFTS !in Tabs.bar(state.mode)) { NavRow("LIFTS", "e1RM per lift, charts, rep PRs") { onGo(Route.Lifts) }; Line() }
        if (Tabs.FRIENDS !in Tabs.bar(state.mode)) {
            NavRow("FRIENDS", "Friends feed, reactions, compare$srv", right = social.unread.takeIf { it > 0 }?.toString(), rightColor = T.amber) { onGo(Route.Friends) }; Line()
        }
        NavRow("CALENDAR", "Month grid: done, planned, missed, travel$srv") { onGo(Route.Calendar) }; Line()
        NavRow("PROGRAM", "Slots, next steps, upcoming sessions, decision log$srv") { onGo(Route.Program) }; Line()
        NavRow("PROGRAMS", "Browse every program: rules, workouts, start one$srv") { onGo(Route.Programs) }; Line()
        NavRow("BODY", "Muscle readiness and weekly load on the figure$srv") { onGo(Route.Body) }; Line()
        NavRow("INSIGHTS", "Projections, strength balance, achievements$srv") { onGo(Route.Insights) }; Line()
        NavRow("STATS", "Weekly volume, totals, streak, cardio$srv") { onGo(Route.Stats) }; Line()
        NavRow("SETUP", "Connection, gym preferences, widgets, updates", right = if (!state.configured) "CONNECT" else null, rightColor = T.amber) { onGo(Route.Setup) }; Line()
        Spacer(Modifier.height(16.dp))
        Mono(
            "GYM: rest sound ${if (gym.prefs.restSound) "on" else "off"} · vibrate ${if (gym.prefs.restVibrate) "on" else "off"} · screen ${if (gym.prefs.keepScreenOn) "kept on" else "may sleep"} · default rest ${gym.prefs.defaultRest}s",
            Modifier.padding(horizontal = 16.dp), size = 10.sp, color = T.faint,
        )
    }
}

/** Pushed screen chrome: BackBar + body. */
@Composable
private fun Pushed(title: String, onBack: () -> Unit, right: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {}, body: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        BackBar(title, onBack, right)
        Box(Modifier.weight(1f)) { body() }
    }
}

private const val SERVER_TEXT_CAL = "Planned days come from the program engine on your server. Direct mode has your log only: see HISTORY and the year graph."

// ═════════════════════════════ CALENDAR ═════════════════════════════

@Composable
fun CalendarScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onGo: (Route) -> Unit, onSetup: () -> Unit) {
    var month by rememberSaveable { mutableStateOf((state.snapshot?.today?.takeIf { it.length >= 7 } ?: LocalDate.now().toString()).take(7)) }
    LaunchedEffect(month, state.mode) { actions.loadCalendar(month) }
    val load = data.calendar[month] ?: Load()
    var sel by remember { mutableStateOf<CalDay?>(null) }
    fun shift(n: Long) { month = YearMonth.parse(month).plusMonths(n).toString(); sel = null }
    Box(Modifier.fillMaxSize()) {
        Pushed("Calendar", onBack) {
            Loaded(load, "Calendar", onRetry = { actions.loadCalendar(month, true) }, onSetup = onSetup, needsServerText = SERVER_TEXT_CAL) { cal ->
                CalendarBody(cal, state.snapshot?.today, load.loading, { actions.loadCalendar(month, true) }, ::shift) { sel = it }
            }
        }
        Sheet(sel != null, { sel = null }) {
            sel?.let { d -> DaySheet(d, onGo) }
        }
    }
}

@Composable
private fun CalendarBody(cal: AppCalendar, todayIso: String?, refreshing: Boolean, onRefresh: () -> Unit, shift: (Long) -> Unit, onDay: (CalDay) -> Unit) {
    val ym = runCatching { YearMonth.parse(cal.month) }.getOrNull()
    RefreshColumn(refreshing, onRefresh) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.clickable { shift(-1) }.size(52.dp), contentAlignment = Alignment.Center) { Mono("‹", size = 22.sp, color = T.amber, bold = true) }
            Mono(ym?.let { "${Fmt.month(it.atDay(1))} ${it.year}" } ?: cal.month, Modifier.weight(1f), size = 15.sp, bold = true, align = TextAlign.Center)
            Box(Modifier.clickable { shift(1) }.size(52.dp), contentAlignment = Alignment.Center) { Mono("›", size = 22.sp, color = T.amber, bold = true) }
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp).pointerInput(cal.month) {
                var dx = 0f
                detectHorizontalDragGestures(onDragEnd = { if (dx > 120) shift(-1) else if (dx < -120) shift(1); dx = 0f }) { _, d -> dx += d }
            },
        ) {
            Row(Modifier.fillMaxWidth()) {
                listOf("M", "T", "W", "T", "F", "S", "S").forEach { Mono(it, Modifier.weight(1f), size = 10.sp, color = T.faint, align = TextAlign.Center) }
            }
            Spacer(Modifier.height(4.dp))
            cal.days.chunked(7).forEach { week ->
                Row(Modifier.fillMaxWidth()) {
                    week.forEach { d ->
                        Column(
                            Modifier.weight(1f).clickable { onDay(d) }.padding(vertical = 3.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(Modifier.size(40.dp).let { if (!d.inMonth) it.background(T.bg) else it }, contentAlignment = Alignment.Center) {
                                StatusSquare(d.status, 38.dp, label = d.date.takeLast(2).trimStart('0'))
                                if (!d.inMonth) Box(Modifier.size(38.dp).background(T.bg.copy(alpha = 0.65f)))
                                if (d.date == todayIso) Box(Modifier.size(42.dp).border(2.dp, T.amber))
                            }
                            Mono(
                                d.planned?.dayId ?: d.workouts.firstOrNull()?.title?.substringAfterLast("·")?.trim()?.take(4) ?: d.trip?.take(4) ?: "",
                                size = 8.sp, color = if (d.status == "done") T.up else T.faint, maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf(WeekDay.STATUS_DONE to "DONE", WeekDay.STATUS_PLANNED to "PLAN", WeekDay.STATUS_MISSED to "MISSED", WeekDay.STATUS_TRAVEL to "TRAVEL").forEach { (s, l) ->
                Row(verticalAlignment = Alignment.CenterVertically) { StatusSquare(s, 10.dp, label = ""); Mono(" $l", size = 9.sp, color = T.faint) }
            }
        }
        Spacer(Modifier.height(8.dp))
        Line()
        Section("This week", right = "${cal.week.done}/${cal.week.planned} DONE") {
            Mono(cal.week.label.uppercase(), size = 12.sp, color = if (cal.week.left == 0) T.up else T.amber, bold = true)
        }
        if (cal.trips.isNotEmpty()) {
            Section("Trips", right = "PROGRAM PAUSES") {
                cal.trips.forEach { t -> KV(t.name, "${Fmt.day(t.start)} → ${Fmt.day(t.end)} · ${t.gym}") }
            }
        }
        Mono("Swipe the grid or use ‹ › to change month. Tap a day for details.", Modifier.padding(16.dp), size = 10.sp, color = T.faint)
    }
}

@Composable
private fun DaySheet(d: CalDay, onGo: (Route) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(Fmt.day(d.date), Modifier.weight(1f), size = 15.sp, color = T.amber, bold = true)
            Mono(d.status.uppercase(), size = 11.sp, color = when (d.status) { "done" -> T.up; "missed" -> T.down; "today" -> T.amber; else -> T.dim }, bold = true)
        }
        Spacer(Modifier.height(10.dp))
        d.trip?.let { Mono("✈ $it · program paused", size = 12.sp, color = T.dim); Spacer(Modifier.height(8.dp)) }
        d.planned?.let { Mono("PLANNED  ${it.dayName}", size = 12.sp); Spacer(Modifier.height(8.dp)) }
        if (d.workouts.isEmpty() && d.planned == null && d.trip == null) Mono(if (d.status == "missed") "A planned session that didn't happen." else "Rest day.", size = 12.sp, color = T.dim)
        d.workouts.forEach { w ->
            Line()
            NavRow(w.title.uppercase(), "Logged workout") { onGo(Route.Workout(w.id)) }
        }
    }
}

// ═════════════════════════════ PROGRAM ═════════════════════════════

@Composable
fun ProgramScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit, onBrowse: () -> Unit = {}, onOpenProgram: (String) -> Unit = {}) {
    LaunchedEffect(state.mode) { actions.load(Screens.PROGRAM) }
    Pushed("Program", onBack) {
        Loaded(data.program, "Program", onRetry = { actions.load(Screens.PROGRAM, true) }, onSetup = onSetup,
            needsServerText = "Programs (GZCLP, 5/3/1, nSuns…) run on your server's program engine. Direct mode logs free workouts only.") { doc ->
            val p = doc.program
            if (p == null) {
                Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
                    Mono("NO ACTIVE PROGRAM", size = 14.sp, color = T.amber, bold = true)
                    Spacer(Modifier.height(10.dp))
                    Mono("Pick one from the catalog: GZCLP, 5/3/1, nSuns, Starting Strength and more. Read the rules, page through the workouts with your weights, then start it.", size = 12.sp, color = T.dim)
                    Spacer(Modifier.height(16.dp))
                    TButton("Browse programs", primary = true, onClick = onBrowse)
                }
                return@Loaded
            }
            RefreshColumn(data.program.loading, { actions.load(Screens.PROGRAM, true) }) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Mono(p.name.uppercase(), size = 18.sp, bold = true, maxLines = 2)
                    p.author?.let { Mono(it, size = 10.sp, color = T.faint, maxLines = 2) }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Mono("WEEK ${p.week}" + (p.weekName?.let { " · ${it.uppercase()}" } ?: ""), size = 11.sp, color = T.amber, bold = true)
                        if (p.complete) { Spacer(Modifier.width(8.dp)); Badge("COMPLETE", T.up) }
                        p.reentry?.let { Spacer(Modifier.width(8.dp)); Badge("RE-ENTRY ${it.done + 1}/${it.total}") }
                    }
                    p.reentry?.let { r ->
                        r.summary?.let {
                            Spacer(Modifier.height(8.dp))
                            Mono(it, size = 11.sp, color = T.amber)
                        }
                        r.suggest.forEach { s ->
                            Spacer(Modifier.height(6.dp))
                            TButton("${s.name} ›", modifier = Modifier.fillMaxWidth(), onClick = { onOpenProgram(s.templateId) })
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    BigButton(if (data.pushing) "PUSHING…" else "PUSH TO HEVY", enabled = !data.pushing && state.snapshot?.demo != true, onClick = actions::pushRoutines)
                    Spacer(Modifier.height(6.dp))
                    Mono(
                        if (state.snapshot?.demo == true) "Demo server: pushing routines needs a Hevy API key on the server."
                        else if (p.pushed) "Routines are in Hevy; pushing again updates them with the latest weights." else "Creates Hevy routines with today's weights, so you can log in the Hevy app too.",
                        size = 10.sp, color = T.faint,
                    )
                    Spacer(Modifier.height(12.dp))
                    TButton("Browse programs ›", modifier = Modifier.fillMaxWidth(), onClick = onBrowse)
                }
                Line()
                Section("Slots", right = "STAGE · WEIGHT · NEXT") {
                    p.slots.forEachIndexed { i, s ->
                        if (i > 0) Line()
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            TierTag(s.tier)
                            Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Mono(s.name.uppercase(), size = 12.sp, bold = true, maxLines = 1)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Mono(s.scheme, size = 10.sp, color = T.dim)
                                    if (s.stages.size > 1) {
                                        Spacer(Modifier.width(8.dp))
                                        s.stages.indices.forEach { k -> Box(Modifier.padding(end = 3.dp).size(6.dp).background(if (k == s.stage) T.amber else if (k < s.stage) T.dim else T.line)) }
                                    }
                                }
                            }
                            Mono(if (s.weight > 0) Fmt.w(s.weight) else "—", size = 15.sp, color = T.amber, bold = true)
                        }
                        if (s.ifSuccess != null || s.ifFail != null || s.note != null) {
                            Column(Modifier.fillMaxWidth().padding(start = 34.dp, bottom = 8.dp)) {
                                s.note?.let { Mono(it, size = 10.sp, color = T.amber) }
                                s.ifSuccess?.let { Mono("▲ $it", size = 10.sp, color = T.up) }
                                s.ifFail?.let { Mono("▼ $it", size = 10.sp, color = T.down) }
                            }
                        }
                    }
                }
                if (p.upcoming.isNotEmpty()) {
                    Section("Upcoming") {
                        p.upcoming.forEachIndexed { i, u ->
                            if (i > 0) Line()
                            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                                Row {
                                    Mono(Fmt.day(u.date), Modifier.width(110.dp), size = 11.sp, color = if (i == 0) T.amber else T.dim, bold = i == 0)
                                    Mono(u.dayName.uppercase(), Modifier.weight(1f), size = 11.sp, bold = true, maxLines = 1)
                                }
                                Spacer(Modifier.height(3.dp))
                                Mono(u.exercises.joinToString("   ") { "${it.short} ${it.summary.substringAfter("@").trim().let { w -> if (it.summary.contains("@")) w else it.summary }}" }, size = 10.sp, color = T.dim, maxLines = 2)
                            }
                        }
                    }
                }
                if (p.log.isNotEmpty()) {
                    Section("Decision log", right = "NEWEST FIRST") {
                        p.log.forEachIndexed { i, e ->
                            if (i > 0) Line()
                            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                                Mono("${Fmt.day(e.date.take(10))} · ${e.dayId}", size = 10.sp, color = T.dim)
                                e.results.forEach { r ->
                                    Row(Modifier.fillMaxWidth().padding(top = 3.dp), verticalAlignment = Alignment.Top) {
                                        Mono(dev.ironterm.gym.LiftLibrary[r.lift]?.short ?: r.lift, Modifier.width(80.dp), size = 11.sp, bold = true, maxLines = 1)
                                        Mono(r.note.ifBlank { "${r.scheme} @ ${Fmt.w(r.weight)}" }, Modifier.weight(1f), size = 11.sp, color = T.text, maxLines = 2)
                                        Mono(r.outcome.uppercase(), size = 9.sp, color = statusColor(r.outcome), bold = true, maxLines = 1)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═════════════════════════════ BODY ═════════════════════════════

@Composable
fun BodyScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit) {
    var mode by rememberSaveable { mutableStateOf("ready") }
    LaunchedEffect(mode, state.mode) { actions.loadBody(mode) }
    val load = data.body[mode] ?: Load()
    Pushed("Body", onBack) {
        Loaded(load, "Body", onRetry = { actions.loadBody(mode, true) }, onSetup = onSetup,
            needsServerText = "Muscle recovery and load are modelled by the server from every set you log (volume, intensity and time since). Direct mode only has the Hevy API.") { b ->
            RefreshColumn(load.loading, { actions.loadBody(mode, true) }) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Seg(listOf("ready" to "READINESS", "load" to "WEEKLY LOAD"), mode, { mode = it })
                }
                BodyFigures(b)
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Mono(b.legend.getOrNull(0)?.uppercase().orEmpty(), size = 9.sp, color = T.faint)
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.weight(1f).height(6.dp).background(androidx.compose.ui.graphics.Brush.horizontalGradient(if (mode == "load") LOAD_SCALE else WARN_SCALE)))
                    Spacer(Modifier.width(6.dp))
                    Mono(b.legend.getOrNull(1)?.uppercase().orEmpty(), size = 9.sp, color = T.faint)
                }
                Line()
                Section(if (mode == "ready") "Muscles · least ready first" else "Muscles · most loaded first", right = if (mode == "ready") "READY IN" else "SETS 7D · 28D/WK") {
                    b.muscles.forEach { m -> MuscleRow(m, mode) }
                    Spacer(Modifier.height(6.dp))
                    Mono("Tap a muscle for its full name and weekly sets.", size = 9.sp, color = T.faint)
                }
            }
        }
    }
}

/** The figure's colour scales (web/shared/anatomy-svg.ts): warn = near-black → red, load = navy → light blue. */
private val WARN_SCALE = listOf(androidx.compose.ui.graphics.Color(0xFF16181D), androidx.compose.ui.graphics.Color(0xFFFF6B5E))
private val LOAD_SCALE = listOf(0xFF0F3278, 0xFF285AB4, 0xFF5082DC, 0xFF8CB4FF).map { androidx.compose.ui.graphics.Color(it) }

/** One muscle: short label + bars; tap shows the anatomical name, sets and target range. */
@Composable
private fun MuscleRow(m: dev.ironterm.data.app.BodyMuscle, mode: String) {
    var open by remember(m.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(vertical = 5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Mono(m.short.ifBlank { m.name }.uppercase(), Modifier.width(104.dp).padding(end = 8.dp), size = 11.sp, maxLines = 1)
            if (mode == "ready") {
                BarLine(m.readiness, readinessColor(m.readiness), Modifier.weight(1f), 6.dp)
                Mono(Fmt.pct(m.readiness), Modifier.width(44.dp), size = 11.sp, color = T.dim, align = TextAlign.End)
                Mono(Fmt.hours(m.readyInH), Modifier.width(52.dp), size = 11.sp, color = if (m.readyInH > 0) T.text else T.faint, align = TextAlign.End)
            } else {
                Box(Modifier.weight(1f)) { BarLine(m.value, T.ramp[2], Modifier.fillMaxWidth(), 6.dp) }
                Mono(Fmt.w(m.sets7), Modifier.width(40.dp), size = 11.sp, color = T.text, align = TextAlign.End)
                Mono(Fmt.w(m.sets28), Modifier.width(40.dp), size = 11.sp, color = T.dim, align = TextAlign.End)
                Mono(m.status?.uppercase()?.take(4) ?: "", Modifier.width(40.dp), size = 9.sp, color = statusColor(m.status), align = TextAlign.End)
            }
        }
        if (open) {
            Spacer(Modifier.height(3.dp))
            Mono(
                listOfNotNull(
                    m.name,
                    "${Fmt.w(m.sets7)} sets 7d · ${Fmt.w(m.sets28)}/wk over 28d",
                    m.target?.takeIf { it.size == 2 }?.let { "range ${Fmt.w(it[0])}–${Fmt.w(it[1])}/wk" },
                    m.status?.takeIf { it != "n/a" },
                ).joinToString(" · "),
                size = 10.sp, color = T.dim,
            )
        }
    }
}

@Composable
private fun BodyFigures(b: AppBody) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SvgImage(b.svgFront, "Front figure", Modifier.weight(1f))
        SvgImage(b.svgBack, "Back figure", Modifier.weight(1f))
    }
}

/** Server-rendered SVG drawn natively (AndroidSVG → Picture), parsed once per document. */
@Composable
fun SvgImage(svg: String, description: String, modifier: Modifier) {
    val parsed = remember(svg) {
        runCatching {
            val s = SVG.getFromString(svg)
            val vb = s.documentViewBox
            val ratio = if (vb != null && vb.height() > 0) vb.width() / vb.height() else 0.52f
            s.renderToPicture() to ratio
        }.getOrNull()
    }
    if (parsed == null) {
        Box(modifier.aspectRatio(0.52f).border(1.dp, T.line), contentAlignment = Alignment.Center) { Mono("FIGURE UNAVAILABLE", size = 9.sp, color = T.faint) }
        return
    }
    val (pic: Picture, ratio) = parsed
    Canvas(modifier.aspectRatio(ratio).semantics { contentDescription = description }) {
        drawIntoCanvas { c ->
            val nc = c.nativeCanvas
            nc.save()
            nc.scale(size.width / pic.width.coerceAtLeast(1), size.height / pic.height.coerceAtLeast(1))
            nc.drawPicture(pic)
            nc.restore()
        }
    }
}

// ═════════════════════════════ INSIGHTS ═════════════════════════════

@Composable
fun InsightsScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit) {
    LaunchedEffect(state.mode) { actions.load(Screens.INSIGHTS) }
    val u = (state.snapshot?.unit ?: "kg").uppercase()
    Pushed("Insights", onBack) {
        Loaded(data.insights, "Insights", onRetry = { actions.load(Screens.INSIGHTS, true) }, onSetup = onSetup) { ins ->
            RefreshColumn(data.insights.loading, { actions.load(Screens.INSIGHTS, true) }) {
                if (ins.projections.isNotEmpty()) {
                    Section("Projection", right = "12 WEEKS · $u") {
                        ins.projections.forEachIndexed { i, p ->
                            if (i > 0) Line()
                            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Mono(p.short, Modifier.width(84.dp), size = 12.sp, bold = true)
                                    Mono(p.current?.let { Fmt.w(it) } ?: "—", size = 14.sp, bold = true)
                                    Mono(" → ", size = 12.sp, color = T.faint)
                                    Mono(p.projected?.let { Fmt.w(it) } ?: "—", Modifier.weight(1f), size = 14.sp, color = T.amber, bold = true)
                                    if (p.current != null && p.projected != null) Mono(Fmt.delta(p.projected - p.current), size = 11.sp, color = deltaColor(p.projected - p.current))
                                }
                                Spacer(Modifier.height(3.dp))
                                Mono(p.note, size = 10.sp, color = if (p.status == "ok") T.dim else T.amber, maxLines = 3)
                            }
                        }
                    }
                }
                ins.balance?.let { b ->
                    Section("Strength balance", right = "LAST 12 MONTHS") {
                        Mono(b.summary, size = 11.sp, color = T.text)
                        Spacer(Modifier.height(10.dp))
                        b.ratios.forEach { r ->
                            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Row {
                                    Mono(r.name.uppercase(), Modifier.weight(1f), size = 11.sp, bold = true, maxLines = 1)
                                    Mono("${Fmt.w(r.value)}  ${r.status.uppercase()}", size = 11.sp, color = statusColor(r.status), bold = true)
                                }
                                Spacer(Modifier.height(4.dp))
                                RangeBar(r.value, r.lo, r.hi)
                                Mono("TYPICAL ${Fmt.w(r.lo)}–${Fmt.w(r.hi)}", size = 9.sp, color = T.faint)
                            }
                        }
                        if (b.lagging.isNotEmpty()) Mono("LAGGING: " + b.lagging.joinToString(", ") { dev.ironterm.gym.LiftLibrary[it]?.short ?: it }, size = 10.sp, color = T.amber)
                    }
                }
                val a = ins.achievements
                Section("Achievements", right = "${a.unlocked}/${a.total} UNLOCKED", rightColor = T.amber) {
                    BarLine(if (a.total > 0) a.unlocked.toDouble() / a.total else 0.0, T.amber, Modifier.fillMaxWidth(), 6.dp)
                    if (a.recent.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Mono("RECENT", size = 9.sp, color = T.faint)
                        a.recent.forEach { x ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
                                Mono("★", Modifier.width(20.dp), size = 12.sp, color = tierColor(x.tier))
                                Column(Modifier.weight(1f)) {
                                    Mono(x.title.uppercase(), size = 12.sp, bold = true, maxLines = 1)
                                    Mono(x.description, size = 10.sp, color = T.dim, maxLines = 2)
                                }
                                Mono(x.unlockedAt?.let { Fmt.day(it).substringAfter(' ') } ?: "", size = 9.sp, color = T.faint)
                            }
                        }
                    }
                    if (a.next.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Mono("UP NEXT", size = 9.sp, color = T.faint)
                        a.next.forEach { x ->
                            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Row {
                                    Mono(x.title.uppercase(), Modifier.weight(1f), size = 11.sp, bold = true, maxLines = 1)
                                    Mono("${Fmt.w(x.current)} / ${Fmt.w(x.target)} ${x.measure}".trim(), size = 10.sp, color = T.dim, maxLines = 1)
                                }
                                Spacer(Modifier.height(3.dp))
                                BarLine(x.progress, tierColor(x.tier), Modifier.fillMaxWidth(), 4.dp)
                                Mono(x.description, size = 9.sp, color = T.faint, maxLines = 2)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun tierColor(t: String) = when (t) { "gold" -> T.amber; "silver" -> T.text; else -> androidx.compose.ui.graphics.Color(0xFFC08457) }

/** Value marker on a scale with the typical range shaded. */
@Composable
private fun RangeBar(v: Double, lo: Double, hi: Double) {
    val min = minOf(v, lo) * 0.85
    val max = maxOf(v, hi) * 1.1
    Canvas(Modifier.fillMaxWidth().height(10.dp)) {
        fun x(a: Double) = ((a - min) / (max - min) * size.width).toFloat()
        drawRect(T.line, Offset(0f, size.height / 2 - 1.dp.toPx()), Size(size.width, 2.dp.toPx()))
        drawRect(T.up.copy(alpha = 0.35f), Offset(x(lo), 0f), Size(x(hi) - x(lo), size.height))
        drawRect(T.amber, Offset(x(v) - 1.5.dp.toPx(), 0f), Size(3.dp.toPx(), size.height))
    }
}

// ═════════════════════════════ STATS ═════════════════════════════

@Composable
fun StatsScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit) {
    LaunchedEffect(state.mode) { actions.load(Screens.STATS) }
    var range by rememberSaveable { mutableStateOf("52") }
    Pushed("Stats", onBack) {
        Loaded(data.stats, "Stats", onRetry = { actions.load(Screens.STATS, true) }, onSetup = onSetup) { st ->
            val u = st.unit.uppercase()
            RefreshColumn(data.stats.loading, { actions.load(Screens.STATS, true) }) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(Modifier.fillMaxWidth()) {
                        Stat("Workouts", Fmt.n(st.totals.workouts), Modifier.weight(1f), sub = "ALL TIME")
                        Stat("52 weeks", Fmt.n(st.totals.sessions52), Modifier.weight(1f), sub = "SESSIONS")
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Stat("Avg session", "${st.totals.avgMin.toInt()} MIN", Modifier.weight(1f))
                        Stat("Streak", "${st.totals.streak.current} WK", Modifier.weight(1f), sub = "BEST ${st.totals.streak.best}", valueColor = T.amber)
                    }
                }
                Line()
                val weeks = if (range == "52") st.weekly.takeLast(52) else st.weekly
                Section("Weekly volume", right = u) {
                    Seg(listOf("52" to "1Y", "all" to "2Y"), range, { range = it })
                    Spacer(Modifier.height(10.dp))
                    if (weeks.isEmpty()) EmptyNote("NO DATA", "No training weeks yet.")
                    else Bars(weeks.map { it.volume }, weeks.map { Fmt.day(it.week).substringAfter(' ') }, height = 120.dp, unit = u)
                    Spacer(Modifier.height(10.dp))
                    if (weeks.isNotEmpty()) {
                        val avg = weeks.map { it.volume }.average()
                        Row(Modifier.fillMaxWidth()) {
                            Stat("Avg / wk", Fmt.compact(avg), Modifier.weight(1f), sub = u)
                            Stat("Best wk", Fmt.compact(weeks.maxOf { it.volume }), Modifier.weight(1f), sub = u)
                            Stat("Sets / wk", Fmt.w(weeks.map { it.sets }.average()), Modifier.weight(1f))
                        }
                    }
                }
                Section("Sessions per week") {
                    Bars(weeks.map { it.sessions.toDouble() }, weeks.map { Fmt.day(it.week).substringAfter(' ') }, height = 70.dp, unit = "sessions", highlightLast = true)
                }
                st.cardio?.let { c ->
                    Section("Cardio", right = "ALL TIME") {
                        Row(Modifier.fillMaxWidth()) {
                            Stat("Sessions", "${c.sessions}", Modifier.weight(1f))
                            Stat("Distance", Fmt.w(c.distance), Modifier.weight(1f), sub = c.unit.uppercase())
                            Stat("Time", "${Fmt.w(c.durationMin / 60)} H", Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}
