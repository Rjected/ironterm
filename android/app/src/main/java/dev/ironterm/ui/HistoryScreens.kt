package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppWorkout
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.NotesEdit
import dev.ironterm.data.app.WorkoutSummary
import dev.ironterm.data.direct.DirectAggregator
import java.time.LocalDate

// ═════════════════════════════ list ═════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(state: UiState, data: DataUi, actions: AppActions, onGo: (Route) -> Unit, onSetup: () -> Unit) {
    LaunchedEffect(state.mode) { actions.load(Screens.HISTORY) }
    val h = data.history
    val unit = (state.snapshot?.unit ?: "kg").uppercase()
    val shown = if (h.day != null) h.items.filter { it.date == h.day } else h.items
    val groups = remember(shown) { shown.groupBy { runCatching { DirectAggregator.weekStart(LocalDate.parse(it.date)).toString() }.getOrDefault("") } }
    val list = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= list.layoutInfo.totalItemsCount - 4 } ?: false } }
    LaunchedEffect(list, h.next, h.day) {
        snapshotFlow { nearEnd }.collect { if (it && h.next != null && h.day == null) actions.historyMore() }
    }
    PullToRefreshBox(isRefreshing = h.loading && h.loaded, onRefresh = { actions.refresh(); actions.load(Screens.HISTORY, true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = list) {
            state.snapshot?.takeIf { it.graph.days.isNotEmpty() }?.let { s ->
                item(key = "graph") {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Label("Year", right = "${Fmt.n(s.totals.sessions52)} SESSIONS / 52W")
                        Spacer(Modifier.height(10.dp))
                        ContributionGraph(s, state.theme, selected = h.day, onSelect = { d -> actions.historyDay(if (d.date == h.day) null else d.date) })
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (h.day != null) {
                                Mono("${Fmt.day(h.day)} · ${shown.size} WORKOUT${if (shown.size == 1) "" else "S"}", Modifier.weight(1f), size = 10.sp, color = T.amber, bold = true, maxLines = 1)
                                Mono("CLEAR ×", Modifier.clickable { actions.historyDay(null) }.padding(horizontal = 8.dp, vertical = 6.dp), size = 10.sp, color = T.text, bold = true)
                            } else {
                                Mono("TAP A DAY TO FILTER", Modifier.weight(1f), size = 9.sp, color = T.faint, maxLines = 1)
                                GraphLegend(state.theme)
                            }
                        }
                    }
                    Line()
                }
            }
            item(key = "search") {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                    var q by remember { mutableStateOf(h.query) }
                    SearchField(q, { q = it; actions.historySearch(it) }, "search: title or exercise (squat…)", Modifier.fillMaxWidth())
                    Spacer(Modifier.height(6.dp))
                    Mono(if (h.loaded) "${Fmt.n(h.total)} WORKOUTS${if (h.query.isNotBlank()) " MATCH" else ""}" else "", size = 9.sp, color = T.faint)
                }
                Line()
            }
            when {
                h.needsServer -> item { NeedsServer("History", "") }
                !h.loaded && h.error != null -> item { Box(Modifier.height(320.dp)) { ErrorState(h.error, onRetry = { actions.load(Screens.HISTORY, true) }, onSetup = onSetup) } }
                !h.loaded -> item { Box(Modifier.height(260.dp)) { LoadingState("Workouts") } }
                shown.isEmpty() -> item {
                    Column(Modifier.padding(16.dp)) {
                        EmptyNote(if (h.day != null) "REST DAY" else "NOTHING FOUND", if (h.day != null) "No workout logged on ${Fmt.day(h.day)}." else "No workouts match \"${h.query}\".")
                    }
                }
            }
            groups.forEach { (week, items) ->
                item(key = "w_$week") {
                    Row(Modifier.fillMaxWidth().background(T.panel).padding(horizontal = 16.dp, vertical = 6.dp)) {
                        Mono("WEEK OF ${Fmt.day(week).substringAfter(' ')}", Modifier.weight(1f), size = 9.sp, color = T.amber, bold = true)
                        Mono("${items.size} · ${Fmt.compact(items.sumOf { it.volume })} $unit", size = 9.sp, color = T.dim)
                    }
                }
                items(items, key = { it.id }) { w -> WorkoutRow(w, unit) { onGo(Route.Workout(w.id)) } }
            }
            if (h.loadingMore) item { Mono("LOADING MORE…", Modifier.padding(16.dp), size = 10.sp, color = T.amber) }
            if (h.error != null && h.loaded) item {
                Row(Modifier.fillMaxWidth().clickable { actions.historyMore() }.padding(16.dp)) { Mono("× ${h.error} · TAP TO RETRY", size = 10.sp, color = T.down) }
            }
            if (h.loaded && h.next == null && shown.isNotEmpty() && h.day == null) item { Mono("— START OF HISTORY —", Modifier.fillMaxWidth().padding(20.dp), size = 9.sp, color = T.faint, align = TextAlign.Center) }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun WorkoutRow(w: WorkoutSummary, unit: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.width(52.dp)) {
            Mono(Fmt.day(w.date).take(3), size = 10.sp, color = T.dim)
            Mono(w.date.takeLast(2).trimStart('0'), size = 18.sp, bold = true)
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Mono(w.title.uppercase(), Modifier.weight(1f, fill = false), size = 13.sp, bold = true, maxLines = 1)
                w.programDay?.takeIf { !w.title.contains(it) }?.let { Spacer(Modifier.width(6.dp)); Badge(it, T.dim) }
                if (w.hasNotes) Mono(" ✎", size = 11.sp, color = T.amber)
            }
            Spacer(Modifier.height(2.dp))
            Mono(w.exercises.joinToString(" · ") { it.replace(Regex(" \\(.*\\)"), "") }, size = 10.sp, color = T.dim, maxLines = 2)
            Spacer(Modifier.height(3.dp))
            Mono("${w.durationMin.toInt()} MIN · ${w.sets} SETS · ${Fmt.n(w.volume)} $unit", size = 9.sp, color = T.faint, maxLines = 1)
        }
    }
    Line()
}

// ═════════════════════════════ detail ═════════════════════════════

@Composable
fun WorkoutScreen(id: String, state: UiState, data: DataUi, actions: AppActions, onBack: () -> Unit) {
    LaunchedEffect(id) { actions.loadWorkout(id) }
    val load = data.workout[id] ?: Load()
    var editing by remember { mutableStateOf(false) }
    val title = load.data?.summary?.title ?: data.history.items.firstOrNull { it.id == id }?.title ?: "Workout"
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BackBar(title, onBack) {
                if (load.data != null && state.mode == SourceMode.SERVER) {
                    Mono("EDIT NOTES", Modifier.clickable { editing = true }.padding(horizontal = 8.dp, vertical = 14.dp), size = 11.sp, color = T.amber, bold = true)
                }
            }
            Box(Modifier.weight(1f)) {
                Loaded(load, title, onRetry = { actions.loadWorkout(id, true) }) { w -> WorkoutDetail(w, load.loading) { actions.loadWorkout(id, true) } }
            }
        }
        val w = load.data
        if (w != null) Sheet(editing, { editing = false }) { NotesEditor(w, data.savingNotes, local = state.snapshot?.isLocal == true) { edit -> actions.saveNotes(id, edit); editing = false } }
    }
}

@Composable
private fun WorkoutDetail(w: AppWorkout, refreshing: Boolean, onRefresh: () -> Unit) {
    val u = w.unit.uppercase()
    RefreshColumn(refreshing, onRefresh) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Mono(Fmt.day(w.summary.date) + (w.summary.programDay?.let { " · PROGRAM DAY $it" } ?: ""), size = 10.sp, color = T.dim)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat("Time", "${w.summary.durationMin.toInt()}m", Modifier.weight(1f))
                Stat("Volume", Fmt.compact(w.summary.volume), Modifier.weight(1f), sub = u)
                Stat("Sets", "${w.summary.sets}", Modifier.weight(1f))
                Stat("Lifts", "${w.exercises.size}", Modifier.weight(1f))
            }
            if (w.note.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Mono("✎ ${w.note}", size = 12.sp, color = T.amber)
            }
        }
        Line()
        w.program?.let { p ->
            Section("Program · ${p.dayId}", right = "HOW IT COUNTED") {
                p.results.forEach { r ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                        TierTag(r.tier)
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Mono("${dev.ironterm.gym.LiftLibrary[r.lift]?.short ?: r.lift} ${r.scheme} @ ${Fmt.w(r.weight)}", size = 12.sp, bold = true, maxLines = 1)
                            Mono(r.note, size = 10.sp, color = T.dim)
                        }
                        Mono(r.outcome.uppercase(), size = 10.sp, color = statusColor(r.outcome), bold = true)
                    }
                }
            }
        }
        w.exercises.forEach { e ->
            Section(e.title, right = e.lift?.let { dev.ironterm.gym.LiftLibrary[it]?.short }) {
                e.note?.takeIf { it.isNotBlank() }?.let { Mono("✎ $it", size = 11.sp, color = T.amber); Spacer(Modifier.height(6.dp)) }
                TRow(listOf("SET", "LOAD", "RPE", "e1RM"), listOf(0.6f, 1.6f, 0.7f, 0.9f), header = true)
                var n = 0
                e.sets.forEach { s ->
                    val label = if (s.type == "warmup") "W" else (++n).toString() + when (s.type) { "failure" -> "F"; "dropset" -> "D"; else -> "" }
                    val load = when {
                        s.durationSec != null || s.distanceM != null -> listOfNotNull(s.durationSec?.let { "${Fmt.w(it / 60)} min" }, s.distanceM?.let { "${Fmt.w(it / 1000)} km" }).joinToString(" · ")
                        else -> "${s.weight?.let { Fmt.w(it) } ?: "BW"} × ${s.reps?.let { Fmt.w(it) } ?: "—"}"
                    }
                    TRow(
                        listOf(label, load, s.rpe?.let { Fmt.w(it) } ?: "", s.e1rm?.let { Fmt.w(it) } ?: ""),
                        listOf(0.6f, 1.6f, 0.7f, 0.9f),
                        listOf(if (s.type == "warmup") T.faint else T.text, if (s.type == "warmup") T.dim else T.text, T.dim, T.amber),
                    )
                }
            }
        }
    }
}

@Composable
private fun NotesEditor(w: AppWorkout, saving: Boolean, local: Boolean, onSave: (NotesEdit) -> Unit) {
    var desc by remember(w) { mutableStateOf(w.note) }
    val notes = remember(w) { mutableStateListOf(*w.exercises.map { it.note.orEmpty() }.toTypedArray()) }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
        Mono("EDIT NOTES", size = 12.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(4.dp))
        Mono(if (local) "Saved on your server. Only the notes change; sets stay as logged." else "Saved to Hevy. Only the notes change; sets stay as logged.", size = 10.sp, color = T.faint)
        Spacer(Modifier.height(12.dp))
        Mono("WORKOUT", size = 9.sp, color = T.dim)
        Spacer(Modifier.height(4.dp))
        SearchField(desc, { desc = it }, "workout note", Modifier.fillMaxWidth(), singleLine = false, minHeight = 64.dp)
        w.exercises.forEachIndexed { i, e ->
            Spacer(Modifier.height(10.dp))
            Mono(e.title.uppercase(), size = 9.sp, color = T.dim, maxLines = 1)
            Spacer(Modifier.height(4.dp))
            SearchField(notes[i], { notes[i] = it }, "note", Modifier.fillMaxWidth(), singleLine = false)
        }
        Spacer(Modifier.height(16.dp))
        BigButton(if (saving) "SAVING…" else "SAVE NOTES", enabled = !saving) {
            onSave(NotesEdit(desc.trim(), notes.map { it.trim().ifEmpty { null } }))
        }
    }
}
