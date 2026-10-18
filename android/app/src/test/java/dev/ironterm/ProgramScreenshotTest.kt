package dev.ironterm

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureRoboImage
import dev.ironterm.data.SourceMode
import dev.ironterm.data.SyncStatus
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.ProgramBrowse
import dev.ironterm.data.app.ProgramStartBody
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.Tabs
import dev.ironterm.ui.TerminalTheme
import dev.ironterm.ui.UiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Instant

/** Program browser: list, page tabs, start sheet → docs/screens/android/programs_*.png (411dp; "_360" = 360dp). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class ProgramScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private val out = File(System.getProperty("screens.dir") ?: "build/screens").apply { mkdirs() }
    private val now = Instant.parse("2026-10-15T16:04:00Z").toEpochMilli()
    private val synced = SyncStatus(lastSuccessAt = now - 4 * 60_000, lastAttemptAt = now - 4 * 60_000)
    private val server get() = UiState(snapshot = Fixtures.home.snapshot, mode = SourceMode.SERVER, serverUrl = "https://gym.example.com", token = "ht_demo", status = synced, unit = "lb")
    private val direct get() = UiState(snapshot = Fixtures.home.snapshot, mode = SourceMode.DIRECT, apiKey = "test-key", status = synced, unit = "kg")

    private val gz get() = ProgramFixtures.gzclp
    private val pct get() = ProgramFixtures.pct
    private val data: DataUi by lazy {
        DataUi(
            home = Load.of(Fixtures.home, now), program = Load.of(Fixtures.program, now),
            programs = Load.of(ProgramFixtures.catalog, now),
            programDetail = mapOf(gz.id to Load.of(gz, now), pct.id to Load.of(pct, now), ProgramFixtures.smolov.id to Load.of(ProgramFixtures.smolov, now)),
        )
    }
    private fun page(id: String) = Nav(Tabs.MORE, listOf(Route.Program, Route.Programs, Route.ProgramPage(id)))
    private val list = Nav(Tabs.MORE, listOf(Route.Program, Route.Programs))

    private fun shot(name: String, nav: Nav, d: DataUi = data, state: UiState = server, actions: AppActions = AppActions.None, tall: Boolean = false, width: Int? = null, before: () -> Unit = {}) {
        if (tall) RuntimeEnvironment.setQualifiers("+h2600dp")
        if (width != null) RuntimeEnvironment.setQualifiers("+w${width}dp")
        compose.setContent { TerminalTheme { AppScreen(state, actions, nav, {}, d, now = now, ticking = false) } }
        compose.waitForIdle()
        before()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(File(out, "programs_$name.png").path)
    }

    private fun click(text: String) = { compose.onAllNodes(hasText(text)).onFirst().performClick(); compose.waitForIdle() }
    private fun clicks(vararg t: String) = { t.forEach { click(it)() } }

    // ── list ──
    @Test fun list() = shot("list", list)
    @Test fun list_360() = shot("list_360", list, width = 360)
    @Test fun list_full() = shot("list_full", list, tall = true)
    @Test fun list_filtered() = shot("list_filtered", list, before = clicks("3 DAYS", "BEGINNER"))
    @Test fun list_search() = shot("list_search", list, before = {
        compose.onAllNodes(androidx.compose.ui.test.hasSetTextAction()).onFirst().performTextInput("wendler")
    })
    @Test fun list_loading() = shot("list_loading", list, DataUi(programs = Load.loading()))
    @Test fun list_error() = shot("list_error", list, DataUi(programs = Load.failed("Offline or server unreachable.")))
    @Test fun list_offline() = shot("list_offline", list, data.copy(programs = Load(ProgramFixtures.catalog, error = "Offline or server unreachable.", savedAt = now - 3 * 3_600_000)))
    @Test fun list_direct() = shot("list_direct", Nav(Tabs.MORE, listOf(Route.Programs)), DataUi(programs = Load.server()), state = direct)
    @Test fun more() = shot("more", Nav(Tabs.MORE))
    @Test fun program_browse() = shot("program_browse", Nav(Tabs.MORE, listOf(Route.Program)))

    // ── GZCLP ──
    @Test fun gzclp_about() = shot("gzclp_about", page(gz.id))
    @Test fun gzclp_about_360() = shot("gzclp_about_360", page(gz.id), width = 360)
    @Test fun gzclp_rules() = shot("gzclp_rules", page(gz.id), tall = true, before = click("RULES"))
    @Test fun gzclp_rules_360() = shot("gzclp_rules_360", page(gz.id), width = 360, before = click("RULES"))
    @Test fun gzclp_workouts() = shot("gzclp_workouts", page(gz.id), tall = true, before = click("WORKOUTS"))
    @Test fun gzclp_workouts_360() = shot("gzclp_workouts_360", page(gz.id), width = 360, before = click("WORKOUTS"))
    @Test fun gzclp_workouts_week3() = shot("gzclp_workouts_week3", page(gz.id), before = clicks("WORKOUTS", "WEEK 3"))
    @Test fun gzclp_body() = shot("gzclp_body", page(gz.id), withBody, tall = true, before = click("BODY"))
    @Test fun gzclp_body_360() = shot("gzclp_body_360", page(gz.id), withBody, width = 360, before = click("BODY"))
    @Test fun gzclp_body_gaps() = shot("gzclp_body_gaps", page(gz.id), withBody, tall = true, before = clicks("BODY", "GAPS"))
    @Test fun gzclp_body_muscle_open() = shot("gzclp_body_muscle_open", page(gz.id), withBody, tall = true, before = clicks("BODY", "ERECTORS"))
    @Test fun gzclp_body_loading() = shot("gzclp_body_loading", page(gz.id), before = click("BODY"))
    @Test fun gzclp_body_error() = shot("gzclp_body_error", page(gz.id), data.copy(programBody = mapOf("gzclp#load" to Load.failed("Offline or server unreachable."))), before = click("BODY"))

    /** Opening BODY asks for the load document; GAPS asks for the gaps one, with the page's options. */
    @Test fun bodyLoadsPerMode() {
        val asked = mutableListOf<String>()
        val rec = object : AppActions { override fun loadProgramBody(id: String, options: Map<String, String>, mode: String, force: Boolean) { asked += ProgramBrowse.bodyKey(id, options, mode) } }
        shot("gzclp_body_gaps_360", page(gz.id), withBody, actions = rec, width = 360, before = clicks("BODY", "GAPS"))
        assertEquals(listOf("gzclp#load", "gzclp#gaps"), asked.distinct())
    }

    private val withBody: DataUi by lazy {
        data.copy(programBody = mapOf("gzclp#load" to Load.of(ProgramFixtures.gzclpBody, now), "gzclp#gaps" to Load.of(ProgramFixtures.gzclpBodyGaps, now)))
    }

    @Test fun gzclp_start_sheet() = shot("gzclp_start_sheet", page(gz.id), tall = true, before = click("RESTART THIS PROGRAM"))

    // ── a percent program (5/3/1) ──
    @Test fun pct_about() = shot("531_about", page(pct.id))
    @Test fun pct_rules() = shot("531_rules", page(pct.id), tall = true, before = click("RULES"))
    @Test fun pct_workouts() = shot("531_workouts", page(pct.id), tall = true, before = click("WORKOUTS"))
    @Test fun pct_workouts_360() = shot("531_workouts_360", page(pct.id), width = 360, before = click("WORKOUTS"))
    @Test fun pct_start_sheet() = shot("start_sheet", page(pct.id), before = click("START THIS PROGRAM"))
    @Test fun pct_start_sheet_360() = shot("start_sheet_360", page(pct.id), width = 360, before = click("START THIS PROGRAM"))
    @Test fun pct_confirm() = shot("confirm", page(pct.id), before = clicks("START THIS PROGRAM", "NEXT ›"))
    @Test fun pct_confirm_360() = shot("confirm_360", page(pct.id), width = 360, before = clicks("START THIS PROGRAM", "NEXT ›"))
    @Test fun pct_confirm_error() = shot("confirm_error", page(pct.id), data.copy(startError = "Couldn't start: Offline or server unreachable."), before = clicks("START THIS PROGRAM", "NEXT ›"))

    // ── a finite percent-of-1RM block (Smolov Jr) ──
    @Test fun smolov_workouts() = shot("smolov_workouts", page(ProgramFixtures.smolov.id), tall = true, before = click("WORKOUTS"))
    @Test fun smolov_start_sheet() = shot("smolov_start_sheet", page(ProgramFixtures.smolov.id), width = 360, before = click("START THIS PROGRAM"))

    // ── page states ──
    @Test fun page_loading() = shot("page_loading", page("rippler"))
    @Test fun page_error() = shot("page_error", page("rippler"), data.copy(programDetail = mapOf("rippler" to Load.failed("The server took too long to answer."))))

    /** The sheet sends what was picked: days toggled, a max bumped with +, the current options. */
    @Test fun startSendsPickedValues() {
        var sent: Pair<String, ProgramStartBody>? = null
        val rec = object : AppActions { override fun startProgram(id: String, body: ProgramStartBody, onDone: () -> Unit) { sent = id to body } }
        val firstMax = pct.start.trainingMaxes.keys.first()
        val label = ProgramBrowse.keyLabel(firstMax, pct)
        shot("start_sheet_edited", page(pct.id), actions = rec, before = {
            click("START THIS PROGRAM")()
            click("SAT")() // add Saturday
            click("MON")() // drop Monday
            compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Increase $label")).onFirst().performClick()
            compose.waitForIdle()
        })
        click("NEXT ›")()
        click("CONFIRM START")()
        val (id, body) = sent!!
        assertEquals(pct.id, id)
        val expectDays = (pct.start.trainingDays.toSet() + 5 - 0).sorted()
        assertEquals(expectDays, body.trainingDays)
        assertEquals(pct.start.trainingMaxes.getValue(firstMax) + 5.0, body.trainingMaxes!!.getValue(firstMax), 0.0)
        assertEquals(pct.selectedOptions, body.options)
        assertTrue(body.startWeights == null)
    }
}
