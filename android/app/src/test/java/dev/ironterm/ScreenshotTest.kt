package dev.ironterm

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SourceMode
import dev.ironterm.data.SyncStatus
import dev.ironterm.data.app.AppProgram
import dev.ironterm.data.app.Load
import dev.ironterm.data.direct.DirectAggregator
import dev.ironterm.data.direct.DirectApp
import dev.ironterm.gym.FinishState
import dev.ironterm.gym.FinishSummary
import dev.ironterm.gym.GymState
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.OutOp
import dev.ironterm.gym.PickItem
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.GymUi
import dev.ironterm.ui.HistoryUi
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.Tabs
import dev.ironterm.ui.TerminalTheme
import dev.ironterm.ui.UiState
import dev.ironterm.widget.ColorTheme
import dev.ironterm.widget.WidgetCatalog
import dev.ironterm.widget.WidgetData
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Instant
import java.time.LocalDate

/**
 * Every screen and state, rendered to docs/screens/android/ (411dp phone, xhdpi; "_360" = 360dp).
 * Fixtures are the server's own (docs/api/app). Widgets go through the real Glance → RemoteViews →
 * View path, the same as on a home screen.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class ScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private val out = File(System.getProperty("screens.dir") ?: "build/screens").apply { mkdirs() }
    private val previews = System.getProperty("previews.dir")?.let(::File)

    private val now = Instant.parse("2026-10-15T16:04:00Z").toEpochMilli()
    private val synced = SyncStatus(lastSuccessAt = now - 4 * 60_000, lastAttemptAt = now - 4 * 60_000)
    private val snap: Snapshot get() = Fixtures.home.snapshot
    private val server get() = UiState(snapshot = snap, mode = SourceMode.SERVER, serverUrl = "https://gym.example.com", token = "ht_demo", status = synced, unit = "lb")

    private val serverData: DataUi by lazy {
        val h = Fixtures.history
        DataUi(
            home = Load.of(Fixtures.home, now), gym = Load.of(Fixtures.gym, now), lifts = Load.of(Fixtures.lifts, now),
            lift = mapOf("squat" to Load.of(Fixtures.squat, now)),
            history = HistoryUi(items = h.workouts, next = h.next, total = h.total, loaded = true),
            workout = mapOf(Fixtures.workout.summary.id to Load.of(Fixtures.workout, now)),
            calendar = mapOf("2026-10" to Load.of(Fixtures.calendar, now)),
            program = Load.of(Fixtures.program, now),
            body = mapOf("ready" to Load.of(Fixtures.body, now), "load" to Load.of(Fixtures.bodyLoad, now)),
            insights = Load.of(Fixtures.insights, now), stats = Load.of(Fixtures.stats, now),
            picker = PickItem.cardio() + Fixtures.gym.catalog.map(PickItem::fromCatalog),
            bests = Fixtures.lifts.lifts.associate { it.key to it.best },
        )
    }

    // ── direct mode: computed on the phone from the Hevy history fixture ──
    private val today = LocalDate.parse("2026-10-15")
    private val directSnap: Snapshot by lazy { DirectAggregator.build(TestData.history(today), today, TestData.zone, "kg", 3, Instant.ofEpochMilli(now)) }
    private val directApp by lazy {
        val ws = TestData.history(today).map { w -> w.copy(exercises = w.exercises.map { it.copy(exerciseTemplateId = "tpl-" + it.title.hashCode()) }) }
        DirectApp(ws, "kg", TestData.zone, today)
    }
    private val direct by lazy { UiState(snapshot = directSnap, mode = SourceMode.DIRECT, apiKey = "test-key", status = synced, unit = "kg", weeklyTarget = 3) }
    private val directData by lazy {
        val h = directApp.history(null, 30, null)
        DataUi(
            home = Load.of(directApp.home(directSnap), now), lifts = Load.of(directApp.lifts(), now),
            lift = mapOf("squat" to Load.of(directApp.lift("squat")!!, now)),
            history = HistoryUi(items = h.workouts, next = h.next, total = h.total, loaded = true),
            workout = mapOf(h.workouts[0].id to Load.of(directApp.workout(h.workouts[0].id)!!, now)),
            gym = Load.of(dev.ironterm.data.app.AppGym(unit = "kg"), now), picker = directApp.catalog(),
            calendar = mapOf("2026-10" to Load.server()), program = Load.server(), body = mapOf("ready" to Load.server()),
            insights = Load.server(), stats = Load.server(),
        )
    }

    // ── a session mid-workout: warmups + two work sets done, resting ──
    private val live: LiveSession by lazy {
        var s = Fixtures.gymStart.copy(startedAt = Live.iso(now - 23 * 60_000 - 14_000))
        val ex = s.exercises[0]
        for (i in 0..5) s = Live.completeSet(s, ex.id, i, now - (6 - i) * 120_000L)
        s = Live.updateSet(s, ex.id, 5) { it.copy(rpe = 8.0) }
        s.copy(restEndsAt = Live.iso(now + 97_000))
    }
    private val liveGym get() = GymUi(GymState(session = live))

    private fun shot(
        name: String, state: UiState, nav: Nav, data: DataUi = DataUi(), gym: GymUi = GymUi(),
        tall: Boolean = false, width: Int? = null, before: () -> Unit = {},
    ) {
        if (tall) RuntimeEnvironment.setQualifiers("+h2400dp")
        if (width != null) RuntimeEnvironment.setQualifiers("+w${width}dp")
        compose.setContent {
            TerminalTheme { AppScreen(state, AppActions.None, nav, {}, data, gym, now = now, ticking = false) }
        }
        compose.waitForIdle()
        before()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(File(out, "$name.png").path)
    }

    private fun click(text: String) = { compose.onAllNodes(hasText(text)).onFirst().performClick(); Unit }

    // ═════════════ TODAY ═════════════
    @Test fun today() = shot("today", server, Nav(Tabs.TODAY), serverData)
    @Test fun today_full() = shot("today_full", server, Nav(Tabs.TODAY), serverData, tall = true)
    @Test fun today_360() = shot("today_360", server, Nav(Tabs.TODAY), serverData, width = 360)
    @Test fun today_in_progress() = shot("today_in_progress", server, Nav(Tabs.TODAY), serverData, liveGym)
    @Test fun today_loading() = shot("today_loading", server.copy(snapshot = null), Nav(Tabs.TODAY), DataUi(home = Load.loading()))
    @Test fun today_error() = shot("today_error", server.copy(snapshot = null), Nav(Tabs.TODAY), DataUi(home = Load.failed("Offline or server unreachable.")))
    @Test fun today_offline_stale() = shot(
        "today_offline_stale", server.copy(status = synced.copy(lastAttemptAt = now, lastError = "Offline or server unreachable. Showing the last sync.")),
        Nav(Tabs.TODAY), serverData.copy(home = Load(Fixtures.home, error = "Offline or server unreachable.", savedAt = now - 3 * 3_600_000)),
    )

    // ═════════════ GYM ═════════════
    @Test fun gym_start() = shot("gym_start", server, Nav(Tabs.GYM), serverData)
    @Test fun gym_start_360() = shot("gym_start_360", server, Nav(Tabs.GYM), serverData, width = 360)
    @Test fun gym_start_loading() = shot("gym_start_loading", server, Nav(Tabs.GYM), DataUi(gym = Load.loading()))
    @Test fun gym_start_offline() = shot("gym_start_offline", server, Nav(Tabs.GYM), serverData.copy(gym = Load(Fixtures.gym, error = "Offline or server unreachable.", savedAt = now - 600_000)))
    @Test fun gym_start_no_program() = shot("gym_start_no_program", server, Nav(Tabs.GYM), serverData.copy(gym = Load.of(Fixtures.gym.copy(programName = null, next = null, days = emptyList()))))
    @Test fun gym_live_rest() = shot("gym_live_rest", server, Nav(Tabs.GYM), serverData, liveGym)
    @Test fun gym_live_rest_360() = shot("gym_live_rest_360", server, Nav(Tabs.GYM), serverData, liveGym, width = 360)
    @Test fun gym_live_full() = shot("gym_live_full", server, Nav(Tabs.GYM), serverData, liveGym, tall = true)
    @Test fun gym_live_rest_over() = shot("gym_live_rest_over", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = live.copy(restEndsAt = Live.iso(now - 12_000)))))
    @Test fun gym_live_offline_queue() = shot(
        "gym_live_offline_queue", server, Nav(Tabs.GYM), serverData,
        GymUi(GymState(session = live.copy(restEndsAt = null), outbox = listOf(OutOp(OutOp.PUT, live.id, live, now)), syncError = "Offline · will retry")),
    )
    @Test fun gym_live_second_exercise() {
        var s = live.copy(restEndsAt = null)
        val ex = s.exercises[0]
        for (i in ex.sets.indices) if (!s.exercises[0].sets[i].done) s = Live.completeSet(s, ex.id, i, now)
        s = s.copy(restEndsAt = null)
        shot("gym_live_second_exercise", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = s)), width = 360)
    }
    @Test fun gym_finish_sheet() = shot("gym_finish_sheet", server, Nav(Tabs.GYM), serverData, liveGym, before = click("FINISH"))
    @Test fun gym_discard_confirm() = shot("gym_discard_confirm", server, Nav(Tabs.GYM), serverData, liveGym, before = { click("FINISH")(); compose.waitForIdle(); click("DISCARD")() })
    @Test fun gym_add_exercise() = shot("gym_add_exercise", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = live.copy(restEndsAt = null))), tall = true, before = click("+ ADD EXERCISE"))
    @Test fun gym_keypad() = shot("gym_keypad", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = live.copy(restEndsAt = null))), before = {
        compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("LB value")).onFirst().performClick()
    })
    @Test fun gym_remove_set_is_named() {
        val s = Live.addExercise(Live.emptySession("lb", Live.iso(now - 60_000)).copy(id = "e2"), "bench")
        compose.setContent { TerminalTheme { AppScreen(server, AppActions.None, Nav(Tabs.GYM), {}, serverData, GymUi(GymState(session = s)), now = now, ticking = false) } }
        compose.waitForIdle()
        compose.onAllNodes(hasContentDescription("Remove set")).assertCountEquals(1)
    }
    // ── rep totals and skips: 5/3/1 Building the Monolith, squat and OHP cut short, chin-ups in sets of 5 ──
    private val monolith: LiveSession by lazy {
        val plan = Live.json.decodeFromString(dev.ironterm.gym.PlannedSession.serializer(), javaClass.classLoader!!.getResource("app/plan-monolith-day0.json")!!.readText())
        var s = Live.sessionFromPlan(plan, "lb", "5/3/1 Building the Monolith", Live.iso(now - 41 * 60_000))
        val sq = s.exercises.first { it.lift == "squat" }
        sq.sets.indices.take(5).forEach { s = Live.completeSet(s, sq.id, it, now - 30 * 60_000L) }
        s = Live.skipExercise(s, sq.id)
        val ohp = s.exercises.first { it.lift == "ohp" }
        s = Live.skipExercise(s, ohp.id)
        val c = s.exercises.first { it.lift == "chinUp" }
        repeat(3) { k ->
            val i = s.exercises.first { it.id == c.id }.sets.indexOfFirst { it.isOpen }
            s = Live.completeSet(Live.setReps(s, c.id, i, 5), c.id, i, now - (3 - k) * 120_000L)
        }
        // the 4th chin-up set skipped: shown dimmed in place, UNDO brings it back
        s = Live.skipSet(s, c.id, s.exercises.first { it.id == c.id }.sets.indexOfFirst { it.isOpen })
        s.copy(restEndsAt = null)
    }
    @Test fun gym_live_rep_total() = shot("gym_live_rep_total", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = monolith)), tall = true)
    @Test fun gym_live_rep_total_360() = shot("gym_live_rep_total_360", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = monolith)), width = 360)
    @Test fun gym_skip_controls_are_named() {
        compose.setContent { TerminalTheme { AppScreen(server, AppActions.None, Nav(Tabs.GYM), {}, serverData, GymUi(GymState(session = monolith)), now = now, ticking = false) } }
        compose.waitForIdle()
        compose.onAllNodes(hasContentDescription("Bring back skipped set 4")).assertCountEquals(1)
        compose.onAllNodes(hasContentDescription("Skip the remaining sets of Chin Up")).assertCountEquals(1)
        compose.onAllNodes(hasContentDescription("Skip set 5")).assertCountEquals(1)
        compose.onAllNodes(hasText("20/100 REPS", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("15/100 REPS")).assertCountEquals(1)
        compose.onAllNodes(hasText("85 reps to go · sets are added as you go")).assertCountEquals(1)
    }
    @Test fun gym_start_skip() = shot("gym_start_skip", server, Nav(Tabs.GYM), serverData, before = click("SKIP ${Fixtures.gym.days.first { it.dayName == Fixtures.gym.next?.dayName }.dayId}"))
    @Test fun gym_start_skipped() = shot(
        "gym_start_skipped", server, Nav(Tabs.GYM),
        serverData.copy(gym = Load.of(Fixtures.gym.copy(skipped = dev.ironterm.data.app.SkippedDay("A1", "Day A1 · Squat", "2026-10-21T12:00:00Z")), now)),
    )
    @Test fun gym_empty_session() = shot("gym_empty_session", server, Nav(Tabs.GYM), serverData, GymUi(GymState(session = Live.emptySession("lb", Live.iso(now - 60_000)).copy(id = "e1"))))
    private fun summary(state: String, error: String? = null) = FinishSummary(
        sessionId = live.id, title = live.title, unit = "lb", sets = 14, volume = 11355.0, durationSec = 66 * 60, exercises = 3,
        prs = listOf("BENCH 325×1 · e1RM 325 (was 320)", "SQUAT 190×9 · e1RM 247 (was 240)").takeIf { state == FinishState.SAVED }.orEmpty(),
        state = state, workoutId = "w1", error = error,
    )
    @Test fun gym_summary_saved() = shot("gym_summary_saved", server, Nav(Tabs.GYM), serverData, GymUi(GymState(summary = summary(FinishState.SAVED))))
    @Test fun gym_summary_queued() = shot("gym_summary_queued", server, Nav(Tabs.GYM), serverData, GymUi(GymState(summary = summary(FinishState.QUEUED), outbox = listOf(OutOp(OutOp.FINISH, live.id, live, now)))))
    @Test fun gym_summary_failed() {
        val err = "No Hevy exercise found for cableFly. Map it in Settings › Lifts."
        shot("gym_summary_failed", server, Nav(Tabs.GYM), serverData, GymUi(GymState(summary = summary(FinishState.FAILED, err), outbox = listOf(OutOp(OutOp.FINISH, live.id, live, now, attempts = 3, failed = true, error = err)))))
    }

    // ── local mode: the server has no Hevy key, so nothing may claim it went to Hevy ──
    private val local get() = server.copy(snapshot = snap.copy(demo = false, source = Snapshot.LOG_LOCAL))
    private fun noHevy() = listOf("to Hevy", "in Hevy", "Hevy instead").forEach { compose.onAllNodes(hasText(it, substring = true, ignoreCase = true)).assertCountEquals(0) }
    @Test fun gym_finish_sheet_local() = shot("gym_finish_sheet_local", local, Nav(Tabs.GYM), serverData, liveGym, before = {
        click("FINISH")(); compose.waitForIdle()
        noHevy()
        compose.onAllNodes(hasText("SAVE")).assertCountEquals(1)
    })
    @Test fun gym_summary_local() = shot("gym_summary_local", local, Nav(Tabs.GYM), serverData, GymUi(GymState(summary = summary(FinishState.SAVED).copy(local = true, program = true))), before = {
        noHevy()
        compose.onAllNodes(hasText("SAVED")).assertCountEquals(1)
    })
    @Test fun gym_start_local() = shot("gym_start_local", local, Nav(Tabs.GYM), serverData, before = { noHevy() })

    // ═════════════ LIFTS ═════════════
    @Test fun lifts() = shot("lifts", server, Nav(Tabs.LIFTS), serverData)
    @Test fun lifts_empty() = shot("lifts_empty", server, Nav(Tabs.LIFTS), DataUi(lifts = Load.of(dev.ironterm.data.app.AppLiftList())))
    @Test fun lifts_error() = shot("lifts_error", server, Nav(Tabs.LIFTS), DataUi(lifts = Load.failed("The server took too long to answer.")))
    @Test fun lift_detail() = shot("lift_detail", server, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), serverData)
    @Test fun lift_detail_full() = shot("lift_detail_full", server, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), serverData, tall = true)
    @Test fun lift_detail_360() = shot("lift_detail_360", server, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), serverData, width = 360)
    @Test fun lift_detail_3y() = shot("lift_detail_3y", server, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), serverData, before = click("3Y"))
    @Test fun lift_detail_all() = shot("lift_detail_all", server, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), serverData, before = click("ALL"))
    @Test fun lift_detail_loading() = shot("lift_detail_loading", server, Nav(Tabs.LIFTS, listOf(Route.Lift("bench"))), serverData)

    // ═════════════ HISTORY ═════════════
    @Test fun history() = shot("history", server, Nav(Tabs.HISTORY), serverData)
    @Test fun history_360() = shot("history_360", server, Nav(Tabs.HISTORY), serverData, width = 360)
    @Test fun history_day() = shot("history_day", server, Nav(Tabs.HISTORY), serverData.copy(history = serverData.history.copy(day = "2026-10-13")))
    @Test fun history_rest_day() = shot("history_rest_day", server, Nav(Tabs.HISTORY), serverData.copy(history = serverData.history.copy(day = "2026-10-14")))
    @Test fun history_loading() = shot("history_loading", server, Nav(Tabs.HISTORY), DataUi(history = HistoryUi(loading = true)))
    @Test fun history_error() = shot("history_error", server, Nav(Tabs.HISTORY), DataUi(history = HistoryUi(error = "Offline or server unreachable.")))
    @Test fun workout_detail() = shot("workout_detail", server, Nav(Tabs.HISTORY, listOf(Route.Workout(Fixtures.workout.summary.id))), serverData, tall = true)
    @Test fun workout_notes() = shot("workout_notes", server, Nav(Tabs.HISTORY, listOf(Route.Workout(Fixtures.workout.summary.id))), serverData, before = click("EDIT NOTES"))

    // ═════════════ MORE ═════════════
    @Test fun more() = shot("more", server, Nav(Tabs.MORE), serverData)
    @Test fun calendar() = shot("calendar", server, Nav(Tabs.MORE, listOf(Route.Calendar)), serverData, before = {
        // icon-only controls are named for TalkBack
        listOf("Back", "Previous month", "Next month").forEach { compose.onAllNodes(hasContentDescription(it)).assertCountEquals(1) }
    })
    @Test fun calendar_360() = shot("calendar_360", server, Nav(Tabs.MORE, listOf(Route.Calendar)), serverData, width = 360)
    @Test fun calendar_day() = shot("calendar_day", server, Nav(Tabs.MORE, listOf(Route.Calendar)), serverData, before = click("13"))
    @Test fun program() = shot("program", server, Nav(Tabs.MORE, listOf(Route.Program)), serverData)
    @Test fun program_full() = shot("program_full", server, Nav(Tabs.MORE, listOf(Route.Program)), serverData, tall = true)
    @Test fun program_none() = shot("program_none", server, Nav(Tabs.MORE, listOf(Route.Program)), serverData.copy(program = Load.of(AppProgram(null))))
    @Test fun body() = shot("body", server, Nav(Tabs.MORE, listOf(Route.Body)), serverData)
    @Test fun body_full() = shot("body_full", server, Nav(Tabs.MORE, listOf(Route.Body)), serverData, tall = true)
    @Test fun body_load() = shot("body_load", server, Nav(Tabs.MORE, listOf(Route.Body)), serverData, before = click("WEEKLY LOAD"))
    @Test fun body_muscle_open() = shot("body_muscle_open", server, Nav(Tabs.MORE, listOf(Route.Body)), serverData, tall = true, before = click("ERECTORS"))
    @Test fun body_360() = shot("body_360", server, Nav(Tabs.MORE, listOf(Route.Body)), serverData, width = 360)
    @Test fun insights() = shot("insights", server, Nav(Tabs.MORE, listOf(Route.Insights)), serverData, tall = true)
    @Test fun stats() = shot("stats", server, Nav(Tabs.MORE, listOf(Route.Stats)), serverData)
    @Test fun setup() = shot("setup", server, Nav(Tabs.MORE, listOf(Route.Setup)), serverData)
    @Test fun setup_full() = shot("setup_full", server, Nav(Tabs.MORE, listOf(Route.Setup)), serverData, tall = true)
    @Test fun setup_360() = shot("setup_360", server, Nav(Tabs.MORE, listOf(Route.Setup)), serverData, width = 360)
    @Test fun gallery() {
        shot("gallery", server, Nav(Tabs.MORE, listOf(Route.Setup, Route.Gallery)), serverData, before = {
            compose.waitUntil(20_000) { compose.onAllNodes(hasText("RENDERING…")).fetchSemanticsNodes().isEmpty() }
        })
    }

    // ═════════════ Direct mode ═════════════
    @Test fun direct_today() = shot("direct_today", direct, Nav(Tabs.TODAY), directData)
    @Test fun direct_gym_start() = shot("direct_gym_start", direct, Nav(Tabs.GYM), directData)
    @Test fun direct_gym_add_exercise() = shot("direct_gym_add_exercise", direct, Nav(Tabs.GYM), directData, GymUi(GymState(session = Live.emptySession("kg", Live.iso(now - 300_000)).copy(id = "d1"))), before = click("+ ADD EXERCISE"))
    @Test fun direct_lifts() = shot("direct_lifts", direct, Nav(Tabs.LIFTS), directData)
    @Test fun direct_lift_detail() = shot("direct_lift_detail", direct, Nav(Tabs.LIFTS, listOf(Route.Lift("squat"))), directData, tall = true)
    @Test fun direct_history() = shot("direct_history", direct.copy(theme = ColorTheme.GREEN), Nav(Tabs.HISTORY), directData)
    @Test fun direct_calendar() = shot("direct_calendar", direct, Nav(Tabs.MORE, listOf(Route.Calendar)), directData)
    @Test fun direct_body() = shot("direct_body", direct, Nav(Tabs.MORE, listOf(Route.Body)), directData)
    @Test fun direct_more() = shot("direct_more", direct, Nav(Tabs.MORE), directData)
    @Test fun direct_setup() = shot("direct_setup", direct, Nav(Tabs.MORE, listOf(Route.Setup)), directData)

    // ═════════════ connection states ═════════════
    @Test fun state_not_connected() = shot("state_not_connected", UiState(), Nav(Tabs.TODAY))
    @Test fun state_first_setup() = shot("state_first_setup", UiState(), Nav(Tabs.MORE, listOf(Route.Setup)), tall = true)
    @Test fun state_auth_error() = shot(
        "state_auth_error", server.copy(status = synced.copy(lastAttemptAt = now, lastError = "Token revoked or invalid. Reconnect.", authError = true)),
        Nav(Tabs.TODAY), serverData,
    )
    @Test fun state_scan_not_ironterm() = shot("state_scan_not_ironterm", UiState(notice = dev.ironterm.data.ConnectCode.NOT_IRONTERM, noticeError = true), Nav(Tabs.MORE, listOf(Route.Setup)))
    @Test fun state_test_ok() = shot("state_test_ok", server.copy(testResult = ""), Nav(Tabs.MORE, listOf(Route.Setup)), serverData)
    private val update57 by lazy { dev.ironterm.update.ReleaseParser.parse(UpdateTest.release())!! }
    @Test fun update_banner() = shot("update_banner", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57)), Nav(Tabs.TODAY), serverData)
    @Test fun update_downloading() = shot("update_downloading", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57, phase = dev.ironterm.ui.UpdatePhase.DOWNLOADING, progress = 0.42f)), Nav(Tabs.TODAY), serverData)

    // ═════════════ widgets: every kind × size, server + direct ═════════════
    @Test fun widgets() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val serverW = WidgetData(TestData.fixture, SourceMode.SERVER, ColorTheme.BLUE, lastSyncAt = synced.lastSuccessAt, gymSession = live, now = now)
        val directW = WidgetData(directSnap, SourceMode.DIRECT, ColorTheme.BLUE, lastSyncAt = synced.lastSuccessAt)
        for (k in WidgetCatalog.all) for (v in k.variants) {
            saveWidget(ctx, "widget_${k.id}_${v.name}", k, v.size, serverW)
            if (k.id in setOf("next", "recovery", "lifts", "graph")) saveWidget(ctx, "widget_${k.id}_${v.name}_direct", k, v.size, directW)
        }
        val gymKind = WidgetCatalog.all.first { it.id == "gym" }
        saveWidget(ctx, "widget_gym_small_set", gymKind, gymKind.variants[0].size, serverW.copy(gymSession = live.copy(restEndsAt = null)))
        saveWidget(ctx, "widget_gym_small_none", gymKind, gymKind.variants[0].size, serverW.copy(gymSession = null))
        for (th in listOf(ColorTheme.GREEN, ColorTheme.PURPLE, ColorTheme.ORANGE)) {
            saveWidget(ctx, "widget_graph_medium_${th.name.lowercase()}", WidgetCatalog.all[0], WidgetCatalog.M.size, serverW.copy(theme = th))
        }
        saveWidget(ctx, "widget_lifts_small_deadlift", WidgetCatalog.all[3], WidgetCatalog.S.size, serverW.copy(liftKey = "deadlift"))
        saveWidget(ctx, "widget_graph_medium_not_connected", WidgetCatalog.all[0], WidgetCatalog.M.size, WidgetData(null, SourceMode.NONE))
        saveWidget(ctx, "widget_graph_small_tight", WidgetCatalog.all[0], androidx.compose.ui.unit.DpSize(130.dp, 130.dp), serverW)
        saveWidget(ctx, "widget_week_wide_tight", WidgetCatalog.all[2], androidx.compose.ui.unit.DpSize(300.dp, 60.dp), serverW)
        saveWidget(ctx, "widget_next_medium_tight", WidgetCatalog.all[1], androidx.compose.ui.unit.DpSize(300.dp, 130.dp), serverW)
        saveWidget(ctx, "widget_gym_small_tight", gymKind, androidx.compose.ui.unit.DpSize(140.dp, 70.dp), serverW)

        // Widget-picker previews (res/drawable-nodpi), rendered from the demo fixture.
        val pv = previews ?: return
        val pick = mapOf("graph" to WidgetCatalog.M, "next" to WidgetCatalog.M, "week" to WidgetCatalog.S, "lifts" to WidgetCatalog.M, "recovery" to WidgetCatalog.S, "gym" to gymKind.variants[0])
        for (k in WidgetCatalog.all) {
            val v = pick.getValue(k.id)
            File(pv, "widget_preview_${k.id}.png").outputStream().use { renderWidget(ctx, k, v.size, serverW.copy(gymSession = if (k.id == "gym") live.copy(restEndsAt = null) else null), margin = 0).compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    private val Int.dp get() = androidx.compose.ui.unit.Dp(this.toFloat())

    private fun saveWidget(ctx: Context, name: String, k: dev.ironterm.widget.WidgetKind, size: androidx.compose.ui.unit.DpSize, data: WidgetData) {
        val bmp = renderWidget(ctx, k, size, data)
        File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Glance → RemoteViews → View, laid out at the exact placed size on a dark "wallpaper". */
    private fun renderWidget(ctx: Context, k: dev.ironterm.widget.WidgetKind, size: androidx.compose.ui.unit.DpSize, data: WidgetData, margin: Int = 24): Bitmap {
        val d = ctx.resources.displayMetrics.density
        val w = (size.width.value * d).toInt()
        val h = (size.height.value * d).toInt()
        val host = FrameLayout(ctx)
        val view: View = runBlocking { WidgetCatalog.render(ctx, k, size, data, host) }
        host.addView(view, FrameLayout.LayoutParams(w, h))
        host.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        host.layout(0, 0, w, h)
        val bmp = Bitmap.createBitmap(w + 2 * margin, h + 2 * margin, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        if (margin > 0) c.drawColor(0xFF3A3F47.toInt())
        c.translate(margin.toFloat(), margin.toFloat())
        host.draw(c)
        return bmp
    }
}
