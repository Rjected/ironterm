package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.PlanExercise
import dev.ironterm.data.app.ProgramBrowse
import dev.ironterm.data.app.ProgramCatalog
import dev.ironterm.data.app.ProgramDetail
import dev.ironterm.data.app.ProgramSummary

private fun serverText() =
    "Programs (GZCLP, 5/3/1, nSuns, Starting Strength…) run on the program engine of your ${Brand.NAME} server: it writes the rules, " +
        "works out every week's weights and plans each session. Direct mode only has the Hevy API, so it logs free workouts. " +
        "Connect a server to browse and start programs."

/** Plain number for an editable field (no grouping): 1000 → "1000", 42.5 → "42.5". */
private fun plain(x: Double): String {
    val r = Math.round(x * 100) / 100.0
    return if (r == Math.floor(r)) r.toLong().toString() else r.toString()
}

// ═════════════════════════════ list ═════════════════════════════

@Composable
fun ProgramListScreen(state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit, onOpen: (String) -> Unit) {
    LaunchedEffect(state.mode) { actions.loadPrograms() }
    Column(Modifier.fillMaxSize()) {
        BackBar("Programs", onBack)
        Box(Modifier.weight(1f)) {
            Loaded(data.programs, "Programs", onRetry = { actions.loadPrograms(true) }, onSetup = onSetup, needsServerText = serverText()) { cat ->
                ProgramList(cat, data.programs.loading, onRefresh = { actions.loadPrograms(true) }, onOpen = onOpen)
            }
        }
    }
}

@Composable
private fun ProgramList(cat: ProgramCatalog, refreshing: Boolean, onRefresh: () -> Unit, onOpen: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var days by rememberSaveable { mutableStateOf<Int?>(null) }
    var level by rememberSaveable { mutableStateOf<String?>(null) }
    val f = ProgramBrowse.Filter(query, days, level)
    val groups = remember(cat, f) { ProgramBrowse.groups(cat, f) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp)) {
            SearchField(query, { query = it }, "search ${cat.programs.size} programs…", Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("ALL", f.all) { days = null; level = null }
                ProgramBrowse.dayChips(cat).forEach { n -> Chip(if (n == 1) "1 DAY" else "$n DAYS", days == n) { days = if (days == n) null else n } }
                ProgramBrowse.levelChips(cat).forEach { l -> Chip(l.uppercase(), level == l) { level = if (level == l) null else l } }
            }
        }
        Line()
        Box(Modifier.weight(1f)) {
            RefreshColumn(refreshing, onRefresh) {
                if (groups.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        EmptyNote("No programs match", "Try fewer words or clear the filters.")
                        Spacer(Modifier.height(8.dp))
                        TButton("Clear filters") { query = ""; days = null; level = null }
                    }
                }
                groups.forEachIndexed { gi, (category, rows) ->
                    if (gi > 0) Line()
                    Mono(category.uppercase(), Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 2.dp), size = 11.sp, color = T.amber, bold = true)
                    rows.forEachIndexed { i, p ->
                        if (i > 0) Line(Modifier.padding(start = 16.dp))
                        ProgramRow(p, active = p.id == cat.active) { onOpen(p.id) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProgramRow(p: ProgramSummary, active: Boolean, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(p.name, Modifier.weight(1f), size = 14.sp, bold = true, maxLines = 2)
            Spacer(Modifier.width(8.dp))
            if (active) Mono("● ACTIVE", size = 11.sp, color = T.amber, bold = true, maxLines = 1)
            else Mono("›", size = 16.sp, color = T.faint)
        }
        Spacer(Modifier.height(3.dp))
        Mono(ProgramBrowse.tags(p), size = 11.sp, color = T.dim, maxLines = 1)
        if (p.summary.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Mono(p.summary, size = 12.sp, color = T.text)
        }
    }
}

// ═════════════════════════════ program page ═════════════════════════════

object ProgramTabs {
    const val ABOUT = "about"
    const val RULES = "rules"
    const val WORKOUTS = "workouts"
}

@Composable
fun ProgramPageScreen(
    id: String, state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit, onSetup: () -> Unit, onStarted: () -> Unit,
) {
    var opts by remember(id) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val key = ProgramBrowse.detailKey(id, opts)
    LaunchedEffect(key, state.mode) { actions.loadProgramDetail(id, opts) }
    LaunchedEffect(state.mode) { if (data.programs.data == null) actions.loadPrograms() }
    val load: Load<ProgramDetail> = data.programDetail[key] ?: Load()
    var lastGood by remember(id) { mutableStateOf<ProgramDetail?>(null) }
    load.data?.let { if (it !== lastGood) lastGood = it }
    val shown = load.data ?: lastGood
    val summary = data.programs.data?.programs?.firstOrNull { it.id == id }
    Column(Modifier.fillMaxSize()) {
        BackBar("Programs", onBack)
        Box(Modifier.weight(1f)) {
            when {
                load.needsServer -> NeedsServer("Programs", serverText(), onSetup)
                shown == null && load.error != null -> ErrorState(load.error, auth = load.auth, onRetry = { actions.loadProgramDetail(id, opts, true) }, onSetup = onSetup)
                shown == null -> LoadingState(summary?.name ?: "Program")
                else -> ProgramPage(
                    d = shown, summary = summary, data = data, actions = actions,
                    updating = load.data == null && load.loading, error = load.error, savedAt = load.savedAt,
                    opts = opts, onOption = { k, v -> opts = opts + (k to v) },
                    onStarted = onStarted,
                )
            }
        }
    }
}

@Composable
private fun ProgramPage(
    d: ProgramDetail, summary: ProgramSummary?, data: DataUi, actions: AppActions,
    updating: Boolean, error: String?, savedAt: Long,
    opts: Map<String, String>, onOption: (String, String) -> Unit, onStarted: () -> Unit,
) {
    var tab by rememberSaveable(d.id) { mutableStateOf(ProgramTabs.ABOUT) }
    var sheet by rememberSaveable(d.id) { mutableStateOf(false) }
    val active = data.programs.data?.active == d.id || data.program.data?.program?.templateId == d.id
    // the length can be missing when the server sends `weeks` as the browser only: fall back to the catalog
    val head = d.summaryRow.let { if (it.weeks == null && summary?.weeks != null) it.copy(weeks = summary.weeks) else it }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            if (updating) UpdatingStrip("UPDATING FOR THE NEW OPTIONS…")
            else if (error != null) StaleStrip(error, savedAt)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Mono(ProgramBrowse.header(head), Modifier.weight(1f), size = 11.sp, color = T.dim, maxLines = 2)
                        if (active) { Spacer(Modifier.width(8.dp)); Mono("● ACTIVE", size = 11.sp, color = T.amber, bold = true, maxLines = 1) }
                    }
                    Spacer(Modifier.height(6.dp))
                    Mono(d.name, size = 20.sp, bold = true)
                    if (d.author.isNotBlank()) { Spacer(Modifier.height(4.dp)); Mono(d.author, size = 11.sp, color = T.dim) }
                }
                Line()
                PageTabs(tab) { tab = it }
                Line()
                when (tab) {
                    ProgramTabs.RULES -> RulesTab(d)
                    ProgramTabs.WORKOUTS -> WorkoutsTab(d, openEnded = head.weeks == null)
                    else -> AboutTab(d, opts, onOption)
                }
                Spacer(Modifier.height(24.dp))
            }
            Line()
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                BigButton(if (active) "RESTART THIS PROGRAM" else "START THIS PROGRAM", enabled = !updating) { actions.clearStartError(); sheet = true }
            }
        }
        Sheet(sheet, onDismiss = { if (!data.startingProgram) sheet = false }) {
            StartSheet(d, head, data, active, actions, onCancel = { sheet = false }, onStarted = { sheet = false; onStarted() })
        }
    }
}

@Composable
private fun UpdatingStrip(text: String) {
    Row(Modifier.fillMaxWidth().background(T.panel).padding(horizontal = 16.dp, vertical = 8.dp)) {
        Mono(text, size = 10.sp, color = T.amber, bold = true, maxLines = 1)
    }
    Line()
}

@Composable
private fun PageTabs(tab: String, onTab: (String) -> Unit) {
    Row(Modifier.fillMaxWidth()) {
        listOf(ProgramTabs.ABOUT to "ABOUT", ProgramTabs.RULES to "RULES", ProgramTabs.WORKOUTS to "WORKOUTS").forEach { (k, label) ->
            val sel = k == tab
            Column(
                Modifier.weight(1f).semantics { selected = sel }.clickable(role = Role.Tab) { onTab(k) }.heightIn(min = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(14.dp))
                Mono(label, size = 12.sp, color = if (sel) T.amber else T.dim, bold = sel, maxLines = 1, align = TextAlign.Center)
                Spacer(Modifier.weight(1f, fill = false).height(12.dp))
                Box(Modifier.fillMaxWidth().height(2.dp).background(if (sel) T.amber else T.bg))
            }
        }
    }
}

// ── ABOUT ──

@Composable
private fun AboutTab(d: ProgramDetail, opts: Map<String, String>, onOption: (String, String) -> Unit) {
    if (d.summary.isNotBlank()) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) { Mono(d.summary, size = 13.sp) }
        Line()
    }
    if (d.options.isNotEmpty()) {
        Section("Options", right = "CHANGES THE PLAN") {
            d.options.forEachIndexed { i, o ->
                if (i > 0) Spacer(Modifier.height(12.dp))
                Mono(o.label.uppercase(), size = 10.sp, color = T.dim, bold = true)
                Spacer(Modifier.height(6.dp))
                val cur = opts[o.key] ?: o.selected.ifBlank { o.default }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    o.choices.forEach { c -> Chip(c.label, c.value == cur) { if (c.value != cur) onOption(o.key, c.value) } }
                }
            }
        }
    }
    if (d.notes.isNotEmpty()) {
        Section("Notes") {
            d.notes.forEachIndexed { i, n ->
                if (i > 0) Spacer(Modifier.height(8.dp))
                Row {
                    Mono("·", Modifier.width(14.dp), size = 12.sp, color = T.amber, bold = true)
                    Mono(n, Modifier.weight(1f), size = 12.sp)
                }
            }
        }
    }
    if (d.source.isNotBlank()) {
        Section("Source") { Mono(d.source, size = 11.sp, color = T.dim) }
    }
}

// ── RULES ──

@Composable
private fun RulesTab(d: ProgramDetail) {
    val r = d.rules
    if (r.overview.isNotEmpty()) {
        Section("Overview") {
            r.overview.forEach { line ->
                Row(Modifier.padding(vertical = 2.dp)) {
                    Mono("·", Modifier.width(14.dp), size = 12.sp, color = T.amber, bold = true)
                    Mono(line, Modifier.weight(1f), size = 12.sp)
                }
            }
        }
    }
    if (r.rotation.isNotEmpty()) {
        Section("Rotation", right = "REPEATS") {
            r.rotation.forEach { day ->
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = T.text)) { append(day.day); append(": ") }
                        withStyle(SpanStyle(color = T.text)) { append(day.lifts.joinToString(" · ")) }
                    },
                    Modifier.padding(vertical = 3.dp), style = T.style(12.sp),
                )
            }
        }
    }
    if (r.tiers.isNotEmpty()) {
        Section("How each lift progresses") {
            r.tiers.forEachIndexed { i, t ->
                if (i > 0) Spacer(Modifier.height(14.dp))
                Mono(t.title, size = 13.sp, bold = true)
                Spacer(Modifier.height(4.dp))
                Mono(t.text, size = 12.sp, color = T.text)
            }
        }
    }
    if (r.overview.isEmpty() && r.rotation.isEmpty() && r.tiers.isEmpty()) {
        Column(Modifier.padding(16.dp)) { EmptyNote("No rules", "The server sent no rules for this program (update the server?).") }
        Line()
    }
    Mono(
        "Generated from the program definition the engine runs, so it always matches what the app does.",
        Modifier.padding(16.dp), size = 10.sp, color = T.faint,
    )
}

// ── WORKOUTS ──

@Composable
private fun WorkoutsTab(d: ProgramDetail, openEnded: Boolean) {
    if (d.plan.isEmpty()) {
        Column(Modifier.padding(16.dp)) { EmptyNote("No workouts", "The server sent no weeks for this program (update the server?).") }
        return
    }
    var wi by rememberSaveable(d.id) { mutableStateOf(0) }
    val idx = wi.coerceIn(0, d.plan.lastIndex)
    val week = d.plan[idx]
    // one name column for the whole program: "T1" tags are narrow, "MAIN" / "SUPP" wide
    val longest = d.plan.flatMap { w -> w.days.flatMap { it.exercises } }.maxOfOrNull { it.tier.length } ?: 2
    val tagWidth = if (longest > 2) (8 + 6 * longest).dp else 26.dp
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            d.plan.forEachIndexed { i, w -> Chip("WEEK ${w.week}", i == idx) { wi = i } }
        }
        Spacer(Modifier.height(10.dp))
        week.name?.takeIf { it.isNotBlank() }?.let { Mono("WEEK ${week.week} · $it", size = 11.sp, color = T.amber, bold = true); Spacer(Modifier.height(3.dp)) }
        Mono(ProgramBrowse.basisLine(d.basis, d.unit), size = 11.sp, color = T.dim)
        if (openEnded) {
            Spacer(Modifier.height(3.dp))
            Mono("Open-ended: these weeks assume every session succeeds.", size = 10.sp, color = T.faint)
        }
    }
    Line()
    week.days.forEach { day ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
            Mono(day.name.ifBlank { "Day ${day.dayId}" }.uppercase(), size = 11.sp, color = T.dim, bold = true)
            day.exercises.forEachIndexed { i, e ->
                Spacer(Modifier.height(10.dp))
                if (i > 0) { Line(); Spacer(Modifier.height(10.dp)) }
                PlanExerciseRow(e, tagWidth)
            }
        }
        Line()
    }
}

@Composable
private fun PlanExerciseRow(e: PlanExercise, tagWidth: androidx.compose.ui.unit.Dp) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.width(tagWidth).padding(top = 2.dp)) { TierTag(e.tier) }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Mono(e.name, size = 14.sp, maxLines = 2)
                    Spacer(Modifier.height(2.dp))
                    Mono(e.scheme, size = 11.sp, color = T.dim)
                }
                Spacer(Modifier.width(8.dp))
                Mono(if (e.top > 0) Fmt.w(e.top) else if (e.sets.any { it.rpe != null }) "RPE" else "BW", size = 16.sp, color = T.amber, bold = true, maxLines = 1)
            }
            ProgramBrowse.setsLine(e)?.let { Spacer(Modifier.height(2.dp)); Mono(it, size = 10.sp, color = T.faint) }
            val up = e.ifSuccess?.takeIf { it.isNotBlank() }
            val down = e.ifFail?.takeIf { it.isNotBlank() }
            if (up != null || down != null || !e.note.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                e.note?.takeIf { it.isNotBlank() }?.let { Mono(it, size = 10.sp, color = T.amber) }
                if (up != null && down != null && up.length + down.length < 34) {
                    Row {
                        Mono("▲ $up", size = 11.sp, color = T.up, maxLines = 1)
                        Spacer(Modifier.width(14.dp))
                        Mono("▼ $down", size = 11.sp, color = T.down, maxLines = 1)
                    }
                } else {
                    up?.let { Mono("▲ $it", size = 11.sp, color = T.up) }
                    down?.let { Mono("▼ $it", size = 11.sp, color = T.down) }
                }
            }
        }
    }
}

// ═════════════════════════════ start sheet ═════════════════════════════

@Composable
private fun ColumnScope.StartSheet(d: ProgramDetail, head: ProgramSummary, data: DataUi, active: Boolean, actions: AppActions, onCancel: () -> Unit, onStarted: () -> Unit) {
    var confirm by rememberSaveable(d.id) { mutableStateOf(false) }
    var days by remember(d) { mutableStateOf(ProgramBrowse.normDays(d.start.trainingDays).toSet()) }
    var weights by remember(d) { mutableStateOf(d.start.startWeights.mapValues { plain(it.value) }) }
    var maxes by remember(d) { mutableStateOf(d.start.trainingMaxes.mapValues { plain(it.value) }) }
    val parse = { m: Map<String, String> -> m.mapNotNull { (k, v) -> v.replace(',', '.').toDoubleOrNull()?.let { k to it } }.toMap() }
    val invalid = weights.values.any { it.replace(',', '.').toDoubleOrNull() == null } || maxes.values.any { it.replace(',', '.').toDoubleOrNull() == null }
    val current = data.program.data?.program?.name?.takeIf { it.isNotBlank() }
        ?: data.programs.data?.let { c -> c.programs.firstOrNull { it.id == c.active }?.name }

    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Mono(if (confirm) "CONFIRM" else "START ${d.name.uppercase()}", size = 14.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(12.dp))
        if (!confirm) {
            Label("Training days", right = "${days.size} PICKED")
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ProgramBrowse.DOW.forEachIndexed { i, dow ->
                    DayChip(dow, i in days, Modifier.weight(1f)) { days = if (i in days) days - i else days + i }
                }
            }
            ProgramBrowse.daysHint(days, head)?.let { Spacer(Modifier.height(6.dp)); Mono(it, size = 10.sp, color = T.amber) }
            if (weights.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Label("Starting weights", right = d.unit.uppercase())
                Spacer(Modifier.height(4.dp))
                weights.forEach { (k, v) -> Stepper(ProgramBrowse.keyLabel(k, d), v, d.unit) { weights = weights + (k to it) } }
            }
            if (maxes.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Label(d.start.maxLabel.ifBlank { "Training max" }, right = d.unit.uppercase())
                Spacer(Modifier.height(4.dp))
                maxes.forEach { (k, v) -> Stepper(ProgramBrowse.keyLabel(k, d), v, d.unit) { maxes = maxes + (k to it) } }
            }
            if (weights.isEmpty() && maxes.isEmpty()) {
                Spacer(Modifier.height(12.dp))
                Mono("No starting numbers needed: the program works them out.", size = 11.sp, color = T.dim)
            }
            Spacer(Modifier.height(10.dp))
            Mono(
                when (d.basis) {
                    "active" -> "Prefilled from your running program."
                    "e1rm" -> "Prefilled from your current e1RMs."
                    else -> "Prefilled with the program's default starting weights."
                } + " Starts today.",
                size = 10.sp, color = T.faint,
            )
        } else {
            Mono(
                when {
                    active -> "This restarts ${d.name} from today with these settings. Your past workouts are kept."
                    current != null -> "This replaces $current. Your past workouts are kept."
                    else -> "Nothing is running now. Your past workouts are kept."
                },
                size = 13.sp,
            )
            Spacer(Modifier.height(14.dp))
            KV("Program", d.name, keyWidth = 90.dp)
            d.options.takeIf { it.isNotEmpty() }?.let { os ->
                KV("Options", os.joinToString(" · ") { o -> o.choices.firstOrNull { it.value == o.selected }?.label ?: o.selected }, keyWidth = 90.dp)
            }
            KV("Days", ProgramBrowse.daysText(days).ifBlank { "—" }, keyWidth = 90.dp)
            KV("Starts", "today", keyWidth = 90.dp)
            data.startError?.let { Spacer(Modifier.height(12.dp)); Mono(it, size = 12.sp, color = T.down) }
        }
        Spacer(Modifier.height(16.dp))
    }
    Line()
    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (!confirm) {
            TButton("Cancel", Modifier.heightIn(min = 56.dp), onClick = onCancel)
            BigButton("NEXT ›", Modifier.weight(1f), enabled = days.isNotEmpty() && !invalid) { confirm = true }
        } else {
            TButton("‹ Back", Modifier.heightIn(min = 56.dp), enabled = !data.startingProgram) { actions.clearStartError(); confirm = false }
            BigButton(if (data.startingProgram) "STARTING…" else "CONFIRM START", Modifier.weight(1f), enabled = !data.startingProgram) {
                actions.startProgram(d.id, ProgramBrowse.startBody(d, days, parse(weights), parse(maxes)), onDone = onStarted)
            }
        }
    }
}

@Composable
private fun DayChip(text: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.border(1.dp, if (selected) T.amber else T.line).background(if (selected) T.amber.copy(alpha = 0.12f) else T.bg)
            .semantics { this.selected = selected }
            .clickable(onClick = onClick).heightIn(min = 44.dp),
        contentAlignment = Alignment.Center,
    ) { Mono(text, size = 11.sp, color = if (selected) T.amber else T.dim, bold = selected, maxLines = 1) }
}

/** label · [−] value [+], the value editable with the number keyboard. */
@Composable
private fun Stepper(label: String, value: String, unit: String, onChange: (String) -> Unit) {
    val step = ProgramBrowse.step(unit)
    val num = value.replace(',', '.').toDoubleOrNull()
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
        Mono(label, Modifier.weight(1f), size = 12.sp, maxLines = 2)
        StepButton("−", "Decrease $label") { onChange(plain(((num ?: 0.0) - step).coerceAtLeast(0.0))) }
        BasicTextField(
            value = value, onValueChange = { s -> onChange(s.filter { it.isDigit() || it == '.' || it == ',' }.take(7)) }, singleLine = true,
            textStyle = T.style(15.sp, if (num == null) T.down else T.amber, bold = true).copy(textAlign = TextAlign.Center),
            cursorBrush = SolidColor(T.amber), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.width(76.dp).semantics { contentDescription = "$label value" },
            decorationBox = { inner -> Box(Modifier.border(1.dp, T.line).heightIn(min = 44.dp).padding(horizontal = 4.dp), contentAlignment = Alignment.Center) { inner() } },
        )
        StepButton("+", "Increase $label") { onChange(plain((num ?: 0.0) + step)) }
    }
}

@Composable
private fun StepButton(glyph: String, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).semantics { contentDescription = description }.clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Mono(glyph, size = 18.sp, color = T.text, bold = true) }
}
