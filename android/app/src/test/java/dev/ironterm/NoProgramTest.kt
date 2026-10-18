package dev.ironterm

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.AppGym
import dev.ironterm.data.app.Load
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.GymUi
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.Tabs
import dev.ironterm.ui.TerminalTheme
import dev.ironterm.ui.UiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** With no program, GYM sends you to the phone's program catalog (not to the web's setup page). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class NoProgramTest {
    @get:Rule val compose = createComposeRule()

    @Test fun gymWithoutAProgramOffersTheCatalog() {
        var nav = Nav(Tabs.GYM)
        val state = UiState(mode = SourceMode.SERVER, serverUrl = "https://gym.example.com", token = "ht_x")
        compose.setContent {
            TerminalTheme { AppScreen(state, AppActions.None, nav, { nav = it }, DataUi(gym = Load.of(AppGym(unit = "kg"))), GymUi(), now = 0L, ticking = false) }
        }
        compose.waitForIdle()
        compose.onAllNodes(hasText("Advanced setup", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("BROWSE PROGRAMS", ignoreCase = true)).onFirst().performClick()
        compose.waitForIdle()
        assertEquals(listOf<Route>(Route.Programs), nav.stack)
    }
}
