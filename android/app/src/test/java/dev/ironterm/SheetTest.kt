package dev.ironterm

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.test.junit4.createComposeRule
import dev.ironterm.ui.SearchField
import dev.ironterm.ui.Sheet
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Closing a sheet must drop focus, or the keyboard from its text field stays up over the screen. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SheetTest {
    @get:Rule val compose = createComposeRule()

    private class CountingFocus : FocusManager {
        var forcedClears = 0
        override fun clearFocus(force: Boolean) { if (force) forcedClears++ }
        override fun moveFocus(focusDirection: FocusDirection) = false
    }

    @Test fun closingASheetClearsFocus() {
        val focus = CountingFocus()
        var visible by mutableStateOf(false)
        compose.setContent {
            CompositionLocalProvider(LocalFocusManager provides focus) {
                Box(Modifier.fillMaxSize()) {
                    Sheet(visible, { visible = false }) { SearchField("", {}, "search exercises") }
                }
            }
        }
        compose.waitForIdle()
        assertEquals("nothing to clear on first show", 0, focus.forcedClears)
        visible = true
        compose.waitForIdle()
        assertEquals(0, focus.forcedClears)
        visible = false
        compose.waitForIdle()
        assertEquals(1, focus.forcedClears)
    }
}
