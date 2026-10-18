package dev.ironterm.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppGym
import dev.ironterm.gym.FinishState
import dev.ironterm.gym.FinishSummary
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveExercise
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.LiveSet
import dev.ironterm.gym.PickItem
import dev.ironterm.gym.SetType
import kotlinx.coroutines.delay
import kotlin.math.max

/** Ticking clock for the gym screens (fixed in screenshot tests). */
@Composable
fun rememberNow(start: Long, ticking: Boolean): Long {
    val t by produceState(start, ticking) {
        value = if (ticking) System.currentTimeMillis() else start
        while (ticking) { delay(250); value = System.currentTimeMillis() }
    }
    return t
}

@Composable
fun GymScreen(state: UiState, data: DataUi, gym: GymUi, actions: AppActions, now0: Long, onSetup: () -> Unit, ticking: Boolean = true) {
    LaunchedEffect(state.mode) { actions.load(Screens.GYM) }
    val now = rememberNow(now0, ticking)
    val s = gym.state.session
    val view = LocalView.current
    DisposableEffect(s != null, gym.prefs.keepScreenOn) {
        view.keepScreenOn = s != null && gym.prefs.keepScreenOn
        onDispose { view.keepScreenOn = false }
    }
    Column(Modifier.fillMaxSize()) {
        gym.state.failedFinish?.takeIf { op -> gym.state.summary?.sessionId != op.sessionId }?.let { op ->
            Column(Modifier.fillMaxWidth().background(T.down.copy(alpha = 0.10f)).padding(14.dp)) {
                Mono("COULDN'T SAVE ${op.session?.title?.uppercase().orEmpty()}", size = 12.sp, color = T.down, bold = true)
                Spacer(Modifier.height(4.dp))
                Mono(op.error.orEmpty(), size = 11.sp, color = T.dim, maxLines = 4)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TButton("Retry", primary = true, onClick = actions::gymRetry)
                    if (s == null) TButton("Edit session", onClick = actions::gymRestoreFailed)
                    TButton("Drop", onClick = actions::gymDropFailed)
                }
            }
            Line()
        }
        Box(Modifier.weight(1f)) {
            val sum = gym.state.summary
            when {
                s != null -> LiveScreen(s, state, data, gym, actions, now)
                sum != null -> FinishSummaryScreen(sum, gym, actions)
                else -> StartScreen(state, data, actions, onSetup)
            }
        }
    }
}

// ═════════════════════════════ start ═════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StartScreen(state: UiState, data: DataUi, actions: AppActions, onSetup: () -> Unit) {
    val load = data.gym
    val g: AppGym? = load.data
    if (g == null && load.error == null && state.mode == SourceMode.SERVER) { LoadingState("Gym"); return }
    var day by rememberSaveable { mutableStateOf<Int?>(null) }
    RefreshColumn(refreshing = load.loading, onRefresh = { actions.load(Screens.GYM, force = true) }) {
        if (load.error != null) StaleStrip(load.error, load.savedAt)
        val next = g?.next
        val nextDay = g?.days?.firstOrNull { it.dayName == next?.dayName }
        val chosen = day ?: nextDay?.dayIndex
        val chosenDay = g?.days?.firstOrNull { it.dayIndex == chosen }
        if (state.mode == SourceMode.SERVER && g != null && g.programName != null && g.days.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Mono(listOfNotNull(if (chosen == nextDay?.dayIndex) "NEXT" else "PICKED", g.programName, next?.weekName).joinToString(" · ").uppercase(), size = 10.sp, color = T.faint, maxLines = 1)
                Spacer(Modifier.height(6.dp))
                Mono((chosenDay?.dayName ?: next?.dayName ?: "").uppercase(), size = 22.sp, bold = true, maxLines = 2)
                if (chosen == nextDay?.dayIndex && next?.whenLabel?.isNotBlank() == true) {
                    Spacer(Modifier.height(2.dp))
                    Mono("PLANNED ${next.whenLabel}", size = 10.sp, color = T.amber)
                }
                Spacer(Modifier.height(14.dp))
                BigButton(if (data.starting) "STARTING…" else "▲ START ${chosenDay?.dayId ?: ""}".trim(), enabled = !data.starting) { actions.gymStart(chosen, empty = false) }
                Spacer(Modifier.height(12.dp))
                Mono("OR PICK ANOTHER DAY", size = 9.sp, color = T.faint)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    g.days.forEach { d ->
                        Chip(d.dayId + if (d.dayIndex == nextDay?.dayIndex) " •" else "", d.dayIndex == chosen) { day = d.dayIndex }
                    }
                }
            }
            Line()
            if (next != null && chosen == nextDay?.dayIndex) {
                Section("Plan", right = g.unit.uppercase()) {
                    next.exercises.forEachIndexed { i, e ->
                        if (i > 0) Line()
                        Column(Modifier.fillMaxWidth().padding(vertical = 9.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                TierTag(e.tier)
                                Spacer(Modifier.width(8.dp))
                                Mono(e.name.uppercase(), Modifier.weight(1f), size = 13.sp, bold = true, maxLines = 1)
                                Mono(if (e.top > 0) Fmt.w(e.top) else "BW", size = 15.sp, color = T.amber, bold = true)
                            }
                            Spacer(Modifier.height(3.dp))
                            Mono(e.summary, size = 11.sp, color = T.dim)
                            val kind = dev.ironterm.gym.LiftLibrary[e.lift]?.kind ?: "barbell"
                            if (kind == "barbell" && e.top > Live.bar(g.unit)) {
                                Spacer(Modifier.height(6.dp))
                                PlateLoader(e.top, g.unit)
                            }
                        }
                    }
                }
            } else if (chosenDay != null) {
                Section("Plan") { Mono("Targets for ${chosenDay.dayId} are set when you start (the server plans it).", size = 11.sp, color = T.dim) }
            }
        } else if (state.mode == SourceMode.SERVER && g != null) {
            Section("No active program") {
                Mono("Pick a program in SETUP → Advanced setup (web), or just start logging.", size = 12.sp, color = T.dim)
                Spacer(Modifier.height(10.dp))
                TButton("Open setup", onClick = onSetup)
            }
        } else if (state.mode == SourceMode.DIRECT) {
            Section("Direct mode") {
                Mono("No server, so no program: log a free workout. FINISH saves it straight to Hevy with your API key. Exercises come from your Hevy history.", size = 12.sp, color = T.dim)
            }
        } else if (load.error != null) {
            Section("Gym") {
                Mono(load.error, size = 12.sp, color = T.down)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TButton("Retry", primary = true) { actions.load(Screens.GYM, true) }
                    TButton("Setup", onClick = onSetup)
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            TButton("Start empty workout", modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = !data.starting) { actions.gymStart(null, empty = true) }
            Spacer(Modifier.height(12.dp))
            Mono(
                "Every set is saved on this phone as you go and synced to ${if (state.mode == SourceMode.DIRECT) "Hevy when you finish" else "your server"}, so closing the app, losing signal or the app being killed won't lose anything. Logging in Hevy instead works too: it syncs in either way.",
                size = 10.sp, color = T.faint,
            )
        }
    }
}

@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = T.amber, onClick: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Box(
        modifier.fillMaxWidth().heightIn(min = 56.dp)
            .background(if (enabled) color else T.line)
            .clickable(enabled = enabled) { haptic.performHapticFeedback(HapticFeedbackType.LongPress); onClick() },
        contentAlignment = Alignment.Center,
    ) { Mono(text, size = 15.sp, color = T.bg, bold = true, maxLines = 1) }
}

@Composable
fun TierTag(t: String?) {
    if (t.isNullOrBlank()) return
    val c = when (t) { "T1", "MAIN" -> T.amber; "T2", "SUPP" -> T.up; else -> T.dim }
    Box(Modifier.border(1.dp, c).padding(horizontal = 4.dp, vertical = 1.dp)) { Mono(t, size = 9.sp, color = c, bold = true, maxLines = 1) }
}

/** Plates per side drawn on a bar, biggest inside; sizes keep their real proportions. */
@Composable
fun PlateLoader(total: Double, unit: String, modifier: Modifier = Modifier) {
    val plates = Live.plates(total, unit)
    if (plates.isEmpty()) return
    val big = if (unit == "lb") 45.0 else 25.0
    val colors = mapOf(45.0 to T.ramp[3], 25.0 to T.ramp[3], 35.0 to T.ramp[2], 20.0 to T.ramp[2], 15.0 to T.amber.copy(alpha = 0.8f), 10.0 to T.up, 5.0 to T.dim, 2.5 to T.faint, 1.25 to T.faint)
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.width(120.dp).height(40.dp).semantics { contentDescription = "Plates per side ${plates.joinToString { Fmt.w(it) }}" }) {
            val cy = size.height / 2
            drawRect(T.dim, Offset(0f, cy - 2.dp.toPx()), Size(size.width, 4.dp.toPx()))
            drawRect(T.text, Offset(10.dp.toPx(), cy - 6.dp.toPx()), Size(4.dp.toPx(), 12.dp.toPx())) // collar
            var x = 16.dp.toPx()
            val gap = 1.5.dp.toPx()
            for (p in plates) {
                val h = (size.height * (0.38 + 0.62 * (p / big))).toFloat().coerceAtMost(size.height)
                val w = if (p >= 10) 7.dp.toPx() else 4.5.dp.toPx()
                if (x + w > size.width) break
                drawRoundRect(colors[p] ?: T.dim, Offset(x, cy - h / 2), Size(w, h), CornerRadius(1.dp.toPx()))
                x += w + gap
            }
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Mono("PER SIDE", size = 8.sp, color = T.faint)
            Mono(plates.joinToString(" · ") { Fmt.w(it) }, size = 11.sp, color = T.text, bold = true, maxLines = 2)
            Mono("BAR ${Fmt.w(Live.bar(unit))}", size = 8.sp, color = T.faint)
        }
    }
}

// ═════════════════════════════ live ═════════════════════════════

private enum class GymSheet { NONE, FINISH, DISCARD, PICKER, TITLE, KEYPAD }

private data class KeypadTarget(val exId: String, val set: Int, val field: String, val label: String, val initial: Double?, val decimals: Boolean)

@Composable
private fun LiveScreen(s: LiveSession, state: UiState, data: DataUi, gym: GymUi, actions: AppActions, now: Long) {
    var sheet by remember { mutableStateOf(GymSheet.NONE) }
    var keypad by remember { mutableStateOf<KeypadTarget?>(null) }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val cur = Live.current(s)
    val openId = when (open) { null -> cur?.exId ?: s.exercises.firstOrNull()?.id; "__none" -> null; else -> open }
    val prog = Live.progress(s)
    val elapsed = (now - (Live.parseMs(s.startedAt) ?: now)) / 1000.0
    val restLeft = Live.restLeft(s, now)
    val list = rememberLazyListState()
    val haptic = LocalHapticFeedback.current
    val unitLabel = s.unit.uppercase()

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // ── header ──
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 10.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).clickable { sheet = GymSheet.TITLE }) {
                    Mono(s.title.uppercase(), size = 15.sp, bold = true, maxLines = 1)
                    Mono(
                        if (s.programName != null) listOfNotNull(s.programName, s.dayName?.substringAfter("·")?.trim()).joinToString(" · ") else "free session · tap to rename",
                        size = 10.sp, color = T.dim, maxLines = 1,
                    )
                }
                Spacer(Modifier.width(8.dp))
                Mono(clock(elapsed), size = 18.sp, color = T.text, bold = true, maxLines = 1)
                Spacer(Modifier.width(10.dp))
                Box(
                    Modifier.background(T.amber).clickable { sheet = GymSheet.FINISH }.heightIn(min = 44.dp).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Mono("FINISH", size = 12.sp, color = T.bg, bold = true) }
            }
            BarLine(prog.fraction.toDouble(), T.amber, Modifier.fillMaxWidth(), 3.dp)
            // ── rest timer ──
            if (restLeft != null) RestBar(restLeft, s, actions)
            SyncLine(gym, actions)
            Line()
            LazyColumn(Modifier.fillMaxSize(), state = list) {
                items(s.exercises, key = { it.id }) { ex ->
                    ExerciseCard(
                        ex = ex, unit = s.unit, open = ex.id == openId,
                        currentSet = if (cur?.exId == ex.id) cur.set else -1,
                        onOpen = { open = if (ex.id == openId) "__none" else ex.id },
                        actions = actions,
                        onKeypad = { keypad = it; sheet = GymSheet.KEYPAD },
                    )
                    Line()
                }
                item {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        TButton("+ Add exercise", modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { sheet = GymSheet.PICKER }
                        Spacer(Modifier.height(16.dp))
                        Mono("WORKOUT NOTE", size = 9.sp, color = T.faint)
                        Spacer(Modifier.height(4.dp))
                        var note by remember(s.id) { mutableStateOf(s.notes.orEmpty()) }
                        SearchField(note, { note = it; actions.gym { x -> x.copy(notes = it) } }, "notes (saved with the workout)", singleLine = false, minHeight = 72.dp, modifier = Modifier.fillMaxWidth())
                        Spacer(Modifier.height(40.dp))
                    }
                }
            }
        }

        // ── sheets ──
        Sheet(sheet == GymSheet.FINISH, { sheet = GymSheet.NONE }) {
            val sum = Live.summary(s, now)
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                Mono("FINISH ${s.title.uppercase()}?", size = 15.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth()) {
                    Stat("Sets", "${prog.done}/${prog.total}", Modifier.weight(1f))
                    Stat("Volume", Fmt.compact(sum.volume), Modifier.weight(1f), sub = unitLabel)
                    Stat("Time", clock(elapsed), Modifier.weight(1f))
                }
                Spacer(Modifier.height(12.dp))
                Mono(
                    "Only completed sets are saved" + when {
                        state.mode == SourceMode.DIRECT -> ", straight to Hevy."
                        state.snapshot?.demo == true -> " (demo server)."
                        else -> " to Hevy through your server; the program advances."
                    } + if (prog.done < prog.total) " ${prog.total - prog.done} work sets aren't done." else "",
                    size = 11.sp, color = T.dim,
                )
                Spacer(Modifier.height(16.dp))
                BigButton(if (state.mode == SourceMode.DIRECT || state.snapshot?.demo != true) "SAVE TO HEVY" else "SAVE", enabled = prog.done > 0 || s.exercises.any { e -> e.sets.any { it.done } }) {
                    sheet = GymSheet.NONE; actions.gymFinish()
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TButton("Keep going", Modifier.weight(1f).heightIn(min = 48.dp)) { sheet = GymSheet.NONE }
                    Box(
                        Modifier.weight(1f).heightIn(min = 48.dp).border(1.dp, T.down).clickable { sheet = GymSheet.DISCARD },
                        contentAlignment = Alignment.Center,
                    ) { Mono("DISCARD", size = 12.sp, color = T.down, bold = true) }
                }
            }
        }
        Sheet(sheet == GymSheet.DISCARD, { sheet = GymSheet.NONE }) {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                Mono("DISCARD THIS WORKOUT?", size = 15.sp, color = T.down, bold = true)
                Spacer(Modifier.height(8.dp))
                Mono("${prog.done} logged sets will be thrown away, here and on the server. This can't be undone.", size = 12.sp, color = T.dim)
                Spacer(Modifier.height(16.dp))
                BigButton("DISCARD", color = T.down) { sheet = GymSheet.NONE; actions.gymDiscard() }
                Spacer(Modifier.height(10.dp))
                TButton("Cancel", Modifier.fillMaxWidth().heightIn(min = 48.dp)) { sheet = GymSheet.NONE }
            }
        }
        Sheet(sheet == GymSheet.TITLE, { sheet = GymSheet.NONE }) {
            var t by remember(s.id) { mutableStateOf(s.title) }
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                Mono("WORKOUT NAME", size = 11.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(8.dp))
                SearchField(t, { t = it }, "Workout name", Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                BigButton("SAVE") { actions.gym { x -> x.copy(title = t.trim().ifEmpty { x.title }) }; sheet = GymSheet.NONE }
            }
        }
        Sheet(sheet == GymSheet.PICKER, { sheet = GymSheet.NONE }) {
            Picker(data.picker.ifEmpty { if (state.mode == SourceMode.SERVER) PickItem.cardio() + PickItem.library() else emptyList() }, state.mode == SourceMode.DIRECT) { item ->
                sheet = GymSheet.NONE
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                actions.gym { x ->
                    val added = Live.addExercise(x, item.lift, cardio = item.cardio, title = item.title, templateId = item.templateId)
                    val ex = added.exercises.last()
                    if (item.cardio) added else Live.mapEx(added, ex.id) { it.copy(restSeconds = gym.prefs.defaultRest) }
                }
            }
        }
        Sheet(sheet == GymSheet.KEYPAD, { sheet = GymSheet.NONE }) {
            val k = keypad
            if (k != null) Keypad(k) { v ->
                sheet = GymSheet.NONE
                actions.gym { x ->
                    Live.updateSet(x, k.exId, k.set) { set ->
                        when (k.field) {
                            "weight" -> set.copy(weight = v)
                            "reps" -> set.copy(reps = v?.let { Live.jsRound(it).toInt() })
                            "min" -> set.copy(durationSec = v?.let { it * 60 })
                            else -> set.copy(distanceM = v?.let { it * if (s.unit == "lb") 1609.344 else 1000.0 })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RestBar(left: Double, s: LiveSession, actions: AppActions) {
    val over = left <= 0
    val total = s.exercises.firstOrNull { it.id == s.restFor }?.restSeconds?.takeIf { it > 0 } ?: 90
    Column(Modifier.fillMaxWidth().background(if (over) T.amber else T.panel)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Mono(if (over) "GO" else "REST", size = 10.sp, color = if (over) T.bg else T.dim, bold = true)
                Mono(if (over) "+${clock(-left)}" else clock(left), size = 30.sp, color = if (over) T.bg else T.amber, bold = true, maxLines = 1)
            }
            val c = if (over) T.bg else T.text
            RestBtn("−15", c) { actions.gym { Live.restMinus(it) } }
            Spacer(Modifier.width(6.dp))
            RestBtn("+30", c) { actions.gym { Live.restPlus(it, System.currentTimeMillis()) } }
            Spacer(Modifier.width(6.dp))
            RestBtn(if (over) "OK" else "SKIP", c) { actions.gym { Live.skipRest(it) } }
        }
        if (!over) BarLine(1.0 - (left / max(total.toDouble(), left)), T.amber, Modifier.fillMaxWidth(), 2.dp)
    }
}

@Composable
private fun RestBtn(text: String, color: Color, onClick: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Box(
        Modifier.border(1.dp, color.copy(alpha = 0.6f)).clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() }
            .size(width = 56.dp, height = 48.dp),
        contentAlignment = Alignment.Center,
    ) { Mono(text, size = 13.sp, color = color, bold = true) }
}

@Composable
private fun SyncLine(gym: GymUi, actions: AppActions) {
    val st = gym.state
    if (st.pending == 0 && st.syncError == null) return
    Row(Modifier.fillMaxWidth().background(T.panel).clickable(onClick = actions::gymRetry).padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Mono(
            when {
                st.authError -> "! ${st.syncError} · changes kept on this phone"
                st.syncing -> "⇅ SAVING…"
                st.pending > 0 -> "⇅ ${st.pending} CHANGE${if (st.pending > 1) "S" else ""} QUEUED · ${st.syncError ?: "saving"} · TAP TO RETRY"
                else -> st.syncError.orEmpty()
            },
            size = 9.sp, color = if (st.authError) T.down else T.dim, maxLines = 1,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ExerciseCard(
    ex: LiveExercise, unit: String, open: Boolean, currentSet: Int, onOpen: () -> Unit,
    actions: AppActions, onKeypad: (KeypadTarget) -> Unit,
) {
    val done = ex.sets.count { it.done }
    val complete = done == ex.sets.size && ex.sets.isNotEmpty()
    var focus by remember(ex.id) { mutableStateOf<Int?>(null) }
    val f = (focus?.takeIf { it < ex.sets.size }) ?: currentSet.takeIf { it >= 0 } ?: ex.sets.indexOfFirst { !it.done }.takeIf { it >= 0 }
    var noteOpen by remember(ex.id) { mutableStateOf(!ex.userNote.isNullOrEmpty()) }
    var confirmRemove by remember(ex.id) { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current
    Column(Modifier.fillMaxWidth().background(if (currentSet >= 0) T.panel else T.bg)) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TierTag(ex.tier)
            if (ex.tier != null) Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Mono(ex.displayName.uppercase(), size = 13.sp, color = if (complete) T.dim else T.text, bold = true, maxLines = 1)
                val sub = listOfNotNull(ex.scheme, if (!open && !ex.userNote.isNullOrEmpty()) "✎ note" else null).joinToString(" · ")
                if (sub.isNotEmpty()) Mono(sub, size = 10.sp, color = T.dim, maxLines = 1)
            }
            Mono("$done/${ex.sets.size}", size = 12.sp, color = if (complete) T.up else if (currentSet >= 0) T.amber else T.dim, bold = true)
            Spacer(Modifier.width(8.dp))
            Mono(if (open) "▾" else "▸", size = 12.sp, color = T.faint)
        }
        if (!open) return@Column
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 12.dp)) {
            ex.note?.let { Mono(it, Modifier.padding(horizontal = 4.dp, vertical = 2.dp), size = 11.sp, color = T.amber) }
            if (ex.ifSuccess != null || ex.ifFail != null) {
                Column(Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
                    ex.ifSuccess?.let { Mono("▲ $it", size = 10.sp, color = T.up) }
                    ex.ifFail?.let { Mono("▼ $it", size = 10.sp, color = T.down) }
                }
            }
            if (f != null) {
                FocusPanel(ex, f, unit, isCurrent = f == currentSet, actions = actions, onKeypad = onKeypad, onCompleted = { focus = null })
                Spacer(Modifier.height(8.dp))
            }
            ex.sets.forEachIndexed { i, x ->
                SetRow(
                    ex, i, x, unit, current = i == currentSet, focused = i == f,
                    onFocus = { focus = i; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
                    onToggle = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        if (x.done) actions.gym { Live.undoSet(it, ex.id, i) } else { focus = null; actions.gym { Live.completeSet(it, ex.id, i, System.currentTimeMillis()) } }
                    },
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TButton("+ Set", Modifier.heightIn(min = 44.dp)) { actions.gym { Live.addSet(it, ex.id) } }
                TButton(if (noteOpen) "✎ Hide note" else "✎ Note", Modifier.heightIn(min = 44.dp)) { noteOpen = !noteOpen }
                Spacer(Modifier.weight(1f))
                if (ex.slotId.isNullOrEmpty()) {
                    Box(Modifier.border(1.dp, T.down.copy(alpha = 0.6f)).clickable { if (confirmRemove) actions.gym { Live.removeExercise(it, ex.id) } else confirmRemove = true }.heightIn(min = 44.dp).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                        Mono(if (confirmRemove) "SURE?" else "REMOVE", size = 11.sp, color = T.down, bold = true)
                    }
                }
            }
            if (noteOpen) {
                Spacer(Modifier.height(8.dp))
                var note by remember(ex.id) { mutableStateOf(ex.userNote.orEmpty()) }
                SearchField(note, { note = it.take(2000); actions.gym { x -> Live.setUserNote(x, ex.id, note) } }, "note for this exercise (saved to Hevy)", Modifier.fillMaxWidth(), singleLine = false)
            }
        }
    }
}

/** Big controls for one set: weight and reps steppers (tap the number to type), RPE, type, DONE. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FocusPanel(ex: LiveExercise, i: Int, unit: String, isCurrent: Boolean, actions: AppActions, onKeypad: (KeypadTarget) -> Unit, onCompleted: () -> Unit) {
    val x = ex.sets[i]
    val step = Live.loadStep(ex.kind, unit)
    val label = Live.setLabel(ex, i).let { if (it == "W") "WARMUP" else "SET $it" }
    Column(Modifier.fillMaxWidth().border(1.dp, if (isCurrent) T.amber else T.line).background(T.bg).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(label, size = 11.sp, color = if (isCurrent) T.amber else T.text, bold = true)
            x.target?.let { targetText(x) }?.let { Mono("  TARGET $it", size = 10.sp, color = T.dim, maxLines = 1) }
            Spacer(Modifier.weight(1f))
            if (x.done) Mono("✓ DONE", size = 10.sp, color = T.up, bold = true)
        }
        Spacer(Modifier.height(10.dp))
        if (ex.isCardio) {
            val per = if (unit == "lb") 1609.344 else 1000.0
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BigStepper("MIN", x.durationSec?.let { it / 60 }, 5.0, Modifier.weight(1f), onTap = { onKeypad(KeypadTarget(ex.id, i, "min", "MINUTES", x.durationSec?.let { it / 60 }, true)) }) { v ->
                    actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(durationSec = v?.let { m -> m * 60 }) } }
                }
                BigStepper(if (unit == "lb") "MI" else "KM", x.distanceM?.let { it / per }, 0.5, Modifier.weight(1f), onTap = { onKeypad(KeypadTarget(ex.id, i, "dist", if (unit == "lb") "MILES" else "KM", x.distanceM?.let { it / per }, true)) }) { v ->
                    actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(distanceM = v?.let { d -> d * per }) } }
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BigStepper(unit.uppercase(), x.weight, step, Modifier.weight(1.15f), placeholder = if (ex.kind == "bodyweight") "BW" else "—", onTap = { onKeypad(KeypadTarget(ex.id, i, "weight", "WEIGHT ${unit.uppercase()}", x.weight, true)) }) { v ->
                    actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(weight = v) } }
                }
                BigStepper("REPS", x.reps?.toDouble(), 1.0, Modifier.weight(1f), onTap = { onKeypad(KeypadTarget(ex.id, i, "reps", "REPS", x.reps?.toDouble(), false)) }) { v ->
                    actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(reps = v?.let { r -> Live.jsRound(r).toInt() }) } }
                }
            }
            if (ex.kind == "barbell" && (x.weight ?: 0.0) > Live.bar(unit)) {
                Spacer(Modifier.height(8.dp))
                PlateLoader(x.weight!!, unit)
            }
        }
        Spacer(Modifier.height(10.dp))
        // RPE (optional) and set type
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono("RPE", size = 9.sp, color = T.faint)
            Spacer(Modifier.width(2.dp))
            listOf(6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0).forEach { r ->
                SmallChip(Fmt.w(r), x.rpe == r) { actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(rpe = if (s.rpe == r) null else r) } } }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono("TYPE", size = 9.sp, color = T.faint)
            Spacer(Modifier.width(2.dp))
            listOf(SetType.WARMUP to "WARM", SetType.NORMAL to "NORMAL", SetType.FAILURE to "FAIL", SetType.DROPSET to "DROP").forEach { (t, l) ->
                SmallChip(l, x.type == t) { actions.gym { Live.updateSet(it, ex.id, i) { s -> s.copy(type = t) } } }
            }
            Spacer(Modifier.weight(1f))
            if (!x.done && x.target == null) {
                Box(Modifier.clickable { actions.gym { Live.removeSet(it, ex.id, i) } }.size(40.dp), contentAlignment = Alignment.Center) {
                    Mono("×", size = 18.sp, color = T.down, bold = true)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        val haptic = LocalHapticFeedback.current
        if (x.done) {
            TButton("Undo set", Modifier.fillMaxWidth().heightIn(min = 48.dp)) { haptic.performHapticFeedback(HapticFeedbackType.LongPress); actions.gym { Live.undoSet(it, ex.id, i) } }
        } else {
            BigButton("✓ DONE ${label}") { onCompleted(); actions.gym { Live.completeSet(it, ex.id, i, System.currentTimeMillis()) } }
        }
    }
}

private fun targetText(x: LiveSet): String? {
    val t = x.target ?: return if (x.type == SetType.WARMUP) "warm-up" else null
    val load = when {
        t.ofTop != null && t.ofTop != 0.0 -> "${Math.round(t.ofTop * 100)}% top"
        t.weight != 0.0 -> Fmt.w(t.weight)
        t.rpe != null -> "@${Fmt.w(t.rpe)}"
        else -> ""
    }
    return "$load×${t.reps}${t.repsMax?.let { "–$it" } ?: ""}${if (t.amrap) "+" else ""}"
}

@Composable
private fun SmallChip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.border(1.dp, if (selected) T.amber else T.line).background(if (selected) T.amber.copy(alpha = 0.15f) else T.bg)
            .clickable(onClick = onClick).heightIn(min = 36.dp).padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) { Mono(text, size = 11.sp, color = if (selected) T.amber else T.dim, bold = selected, maxLines = 1) }
}

/** − value + with 56dp-tall buttons; tapping the value opens the keypad. */
@Composable
private fun BigStepper(label: String, value: Double?, step: Double, modifier: Modifier, placeholder: String = "—", onTap: () -> Unit, onChange: (Double?) -> Unit) {
    val haptic = LocalHapticFeedback.current
    Column(modifier) {
        Mono(label, size = 9.sp, color = T.faint)
        Spacer(Modifier.height(3.dp))
        Row(Modifier.fillMaxWidth().height(56.dp).border(1.dp, T.line), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.width(44.dp).fillMaxHeight().clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onChange(max(0.0, (value ?: 0.0) - step)) }
                    .semantics { contentDescription = "less $label" },
                contentAlignment = Alignment.Center,
            ) { Mono("−", size = 22.sp, color = T.text, bold = true) }
            Box(Modifier.width(1.dp).fillMaxHeight().background(T.line))
            Box(Modifier.weight(1f).fillMaxHeight().clickable(onClick = onTap).semantics { contentDescription = "$label value" }, contentAlignment = Alignment.Center) {
                Mono(value?.let { Fmt.w(it) } ?: placeholder, size = 22.sp, color = if (value == null) T.faint else T.text, bold = true, maxLines = 1, align = TextAlign.Center)
            }
            Box(Modifier.width(1.dp).fillMaxHeight().background(T.line))
            Box(
                Modifier.width(44.dp).fillMaxHeight().clickable { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onChange((value ?: 0.0) + step) }
                    .semantics { contentDescription = "more $label" },
                contentAlignment = Alignment.Center,
            ) { Mono("+", size = 22.sp, color = T.text, bold = true) }
        }
    }
}

/** One compact set row: label + target, weight × reps, RPE, done toggle (48dp). Tap to edit it above. */
@Composable
private fun SetRow(ex: LiveExercise, i: Int, x: LiveSet, unit: String, current: Boolean, focused: Boolean, onFocus: () -> Unit, onToggle: () -> Unit) {
    val lbl = Live.setLabel(ex, i)
    Row(
        Modifier.fillMaxWidth().background(if (focused) T.amber.copy(alpha = 0.06f) else Color.Transparent).clickable(onClick = onFocus).heightIn(min = 48.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(28.dp), contentAlignment = Alignment.CenterStart) {
            Mono(lbl, size = 13.sp, color = when { current -> T.amber; x.isWarmup -> T.faint; else -> T.text }, bold = true)
        }
        Column(Modifier.weight(1f)) {
            val main = when {
                ex.isCardio -> listOfNotNull(x.durationSec?.let { "${Fmt.w(it / 60)} min" }, x.distanceM?.let { "${Fmt.w(it / if (unit == "lb") 1609.344 else 1000.0)} ${if (unit == "lb") "mi" else "km"}" }).joinToString(" · ").ifEmpty { "—" }
                else -> "${x.weight?.let { Fmt.w(it) } ?: if (ex.kind == "bodyweight") "BW" else "—"} × ${x.reps ?: "—"}"
            }
            Mono(main + (x.rpe?.let { "  @${Fmt.w(it)}" } ?: ""), size = 14.sp, color = if (x.done) T.dim else T.text, bold = !x.done, maxLines = 1)
            val sub = listOfNotNull(targetText(x)?.let { "target $it" }, when (x.type) { SetType.FAILURE -> "to failure"; SetType.DROPSET -> "drop set"; else -> null }).joinToString(" · ")
            if (sub.isNotEmpty()) Mono(sub, size = 9.sp, color = T.faint, maxLines = 1)
        }
        Box(
            Modifier.size(48.dp).clickable(onClick = onToggle).semantics { contentDescription = if (x.done) "undo set" else "complete set" },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(30.dp).background(if (x.done) T.done else Color.Transparent).border(1.5.dp, if (x.done) T.done else if (current) T.amber else T.faint),
                contentAlignment = Alignment.Center,
            ) { if (x.done) Mono("✓", size = 15.sp, color = T.bg, bold = true) }
        }
    }
}

@Composable
private fun Picker(items: List<PickItem>, direct: Boolean, onPick: (PickItem) -> Unit) {
    var q by remember { mutableStateOf("") }
    val shown = remember(q, items) { PickItem.filter(items, q, 200) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Mono("ADD EXERCISE", size = 12.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(8.dp))
        SearchField(q, { q = it }, "search exercises", Modifier.fillMaxWidth())
        Spacer(Modifier.height(4.dp))
        if (shown.isEmpty()) {
            Mono(if (direct && items.isEmpty()) "No exercises yet: Direct mode lists the exercises in your Hevy history. Sync first." else "No match.", Modifier.padding(vertical = 16.dp), size = 11.sp, color = T.dim)
        }
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
            var lastSec = ""
            shown.forEach { it ->
                val sec = when { it.cardio -> "CARDIO"; direct -> "FROM YOUR HEVY HISTORY"; it.templateId != null -> "OTHER HEVY EXERCISES"; else -> "LIFTS" }
                if (sec != lastSec) {
                    lastSec = sec
                    item(key = "sec_$sec") { Mono(sec, Modifier.padding(top = 12.dp, bottom = 4.dp), size = 9.sp, color = T.amber, bold = true) }
                }
                item(key = "${it.lift}|${it.name}|${it.templateId}") {
                    Row(Modifier.fillMaxWidth().clickable { onPick(it) }.heightIn(min = 52.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Mono(it.name, size = 13.sp, maxLines = 1)
                            it.sub?.let { s -> Mono(s, size = 9.sp, color = T.faint, maxLines = 1) }
                        }
                        Mono("+", size = 18.sp, color = T.amber, bold = true)
                    }
                    Line()
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

/** Terminal number pad: no system keyboard covering the screen. */
@Composable
private fun Keypad(k: KeypadTarget, onDone: (Double?) -> Unit) {
    var text by remember(k) { mutableStateOf(k.initial?.let { Fmt.w(it).replace(",", "") } ?: "") }
    // The first key replaces the old value (like a selected field); ⌫ edits it.
    var fresh by remember(k) { mutableStateOf(true) }
    val haptic = LocalHapticFeedback.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(k.label, Modifier.weight(1f), size = 11.sp, color = T.amber, bold = true)
            Mono("CLEAR", Modifier.clickable { text = ""; fresh = false }.padding(8.dp), size = 11.sp, color = T.dim, bold = true)
        }
        Box(Modifier.fillMaxWidth().height(64.dp).border(1.dp, T.amber), contentAlignment = Alignment.CenterEnd) {
            Mono(text.ifEmpty { "—" }, Modifier.background(if (fresh && text.isNotEmpty()) T.amber.copy(alpha = 0.25f) else Color.Transparent).padding(horizontal = 16.dp), size = 32.sp, color = if (text.isEmpty()) T.faint else T.text, bold = true)
        }
        Spacer(Modifier.height(10.dp))
        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", if (k.decimals) "." else "", "0", "⌫")
        keys.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    Box(
                        Modifier.weight(1f).height(54.dp).border(1.dp, if (key.isEmpty()) Color.Transparent else T.line)
                            .clickable(enabled = key.isNotEmpty()) {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                val base = if (fresh && key != "⌫") "" else text
                                fresh = false
                                text = when (key) {
                                    "⌫" -> base.dropLast(1)
                                    "." -> if ('.' in base) base else (base.ifEmpty { "0" } + ".")
                                    else -> if (base.length >= 6) base else if (base == "0") key else base + key
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) { Mono(key, size = 20.sp, color = T.text, bold = true) }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        BigButton("OK") { onDone(text.toDoubleOrNull()) }
    }
}

// ═════════════════════════════ finish summary ═════════════════════════════

@Composable
private fun FinishSummaryScreen(sum: FinishSummary, gym: GymUi, actions: AppActions) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        val (title, color, body) = when (sum.state) {
            FinishState.SAVED -> Triple(
                if (sum.demo) "SAVED (DEMO)" else "SAVED TO HEVY", T.up,
                when {
                    sum.demo -> "Demo server: kept on the server, not sent to Hevy." + if (sum.program) " The program has advanced." else ""
                    sum.program -> "In Hevy, and the program has advanced."
                    else -> "Your workout is in Hevy."
                },
            )
            FinishState.QUEUED -> Triple("SAVED ON THIS PHONE", T.amber, "No connection right now. It uploads automatically when you're back online (even if you close the app).")
            FinishState.FAILED -> Triple("NOT SAVED YET", T.down, sum.error ?: "The server refused it.")
            else -> Triple("SAVING…", T.amber, "Uploading your workout.")
        }
        Mono(title, size = 20.sp, color = color, bold = true)
        Spacer(Modifier.height(6.dp))
        Mono(body, size = 12.sp, color = T.dim)
        Spacer(Modifier.height(18.dp))
        Mono(sum.title.uppercase(), size = 15.sp, bold = true, maxLines = 2)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth()) {
            Stat("Sets", "${sum.sets}", Modifier.weight(1f))
            Stat("Volume", Fmt.compact(sum.volume), Modifier.weight(1f), sub = sum.unit.uppercase())
            Stat("Time", clock(sum.durationSec.toDouble()), Modifier.weight(1f))
            Stat("Lifts", "${sum.exercises}", Modifier.weight(1f))
        }
        Spacer(Modifier.height(18.dp))
        if (sum.prs.isNotEmpty()) {
            Label("New PRs", right = "${sum.prs.size} PR${if (sum.prs.size > 1) "S" else ""}", rightColor = T.amber)
            if (!sum.prsFromServer) Mono("Estimated on this phone against your last known bests; the server confirms after upload.", size = 9.sp, color = T.faint)
            Spacer(Modifier.height(8.dp))
            sum.prs.forEach { p ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Mono("★ ", size = 12.sp, color = T.amber, bold = true)
                    Mono(p, size = 12.sp, color = T.text)
                }
            }
            Spacer(Modifier.height(18.dp))
        }
        when (sum.state) {
            FinishState.QUEUED -> TButton("Retry now", Modifier.fillMaxWidth().heightIn(min = 48.dp), onClick = actions::gymRetry)
            FinishState.FAILED -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TButton("Retry", Modifier.weight(1f).heightIn(min = 48.dp), primary = true, onClick = actions::gymRetry)
                TButton("Edit session", Modifier.weight(1f).heightIn(min = 48.dp), onClick = actions::gymRestoreFailed)
            }
            else -> Unit
        }
        Spacer(Modifier.height(10.dp))
        BigButton("DONE", enabled = sum.state != FinishState.SAVING || gym.state.pending == 0, onClick = actions::gymDismissSummary)
        Spacer(Modifier.height(12.dp))
        if (sum.state != FinishState.SAVED) Mono("${Brand.NAME} keeps the workout on this phone until the upload succeeds.", size = 10.sp, color = T.faint)
    }
}
