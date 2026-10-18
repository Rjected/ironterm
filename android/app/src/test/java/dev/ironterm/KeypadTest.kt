package dev.ironterm

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import dev.ironterm.data.SourceMode
import dev.ironterm.gym.GymState
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSession
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.GymUi
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Tabs
import dev.ironterm.ui.TerminalTheme
import dev.ironterm.ui.UiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The keypad shows values rounded to 0.1; OK without typing must not round the set's real value. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class KeypadTest {
    @get:Rule val compose = createComposeRule()

    @Test fun okWithoutTypingKeepsTheExactWeight() {
        val now = 1_760_000_000_000L
        var s = Live.addExercise(Live.emptySession("kg", Live.iso(now - 60_000)).copy(id = "k1"), "bench")
        s = Live.updateSet(s, s.exercises[0].id, 0) { it.copy(weight = 1.25) }
        var session: LiveSession = s
        val actions = object : AppActions {
            override fun gym(f: (LiveSession) -> LiveSession) { session = f(session) }
        }
        compose.setContent {
            TerminalTheme {
                AppScreen(UiState(mode = SourceMode.SERVER, serverUrl = "https://gym.example.com", token = "ht_x"), actions, Nav(Tabs.GYM), {}, DataUi(), GymUi(GymState(session = s)), now = now, ticking = false)
            }
        }
        compose.waitForIdle()
        compose.onAllNodes(hasContentDescription("KG value")).onFirst().performClick()
        compose.waitForIdle()
        compose.onAllNodes(hasText("OK")).onFirst().performClick()
        compose.waitForIdle()
        assertEquals(1.25, session.exercises[0].sets[0].weight!!, 0.0)
    }
}
