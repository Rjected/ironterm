package dev.ironterm.widget

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import dev.ironterm.data.Settings
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SourceMode

/** Everything a widget needs to render. Built from the on-disk cache; no network. */
data class WidgetData(
    val snapshot: Snapshot?,
    val mode: SourceMode,
    val theme: ColorTheme = ColorTheme.BLUE,
    /** Lifts widget (small): the chosen lift key, null = first lift. */
    val liftKey: String? = null,
    val lastSyncAt: Long = 0,
    val error: String? = null,
    val authError: Boolean = false,
    /** GYM widget: the session in progress (null = none) and the clock to render it at (0 = now). */
    val gymSession: dev.ironterm.gym.LiveSession? = null,
    val now: Long = 0,
) {
    val isDirect: Boolean get() = mode == SourceMode.DIRECT || snapshot?.isDirect == true

    companion object {
        fun load(context: Context, appWidgetId: Int): WidgetData {
            val store = SnapshotStore.get(context)
            val settings = runCatching { Settings.get(context) }.getOrNull()
            val opts = WidgetOptions(context)
            val st = store.status()
            return WidgetData(
                snapshot = store.read(),
                mode = settings?.mode ?: SourceMode.NONE,
                theme = ColorTheme.fromName(opts.theme(appWidgetId) ?: settings?.themeName),
                liftKey = opts.lift(appWidgetId),
                lastSyncAt = st.lastSuccessAt,
                error = st.lastError,
                authError = st.authError,
            )
        }
    }
}

/** Per-placement widget options (not secret, so plain prefs). */
class WidgetOptions(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("widget_options", Context.MODE_PRIVATE)

    fun theme(id: Int): String? = p.getString("theme_$id", null)
    fun setTheme(id: Int, theme: String) = p.edit().putString("theme_$id", theme).apply()
    fun lift(id: Int): String? = p.getString("lift_$id", null)
    fun setLift(id: Int, key: String?) = p.edit().putString("lift_$id", key).apply()
    fun remove(id: Int) = p.edit().remove("theme_$id").remove("lift_$id").apply()
}

/** Size buckets shared by every widget. Glance hands us the breakpoint size (Responsive mode). */
enum class WSize { SMALL, MEDIUM, LARGE }

object Sizes {
    // Breakpoints. Measured on a Pixel 7 launcher: 2×2 ≈ 176×222dp, 4×2 ≈ 367×222dp, 4×3 ≈ 367×330dp.
    // Smaller launcher grids give ~ 2×2 ≈ 110–170dp, 4×2 ≈ 250–350 × 110–200dp.
    val SMALL = DpSize(110.dp, 110.dp)
    val WIDE_SHORT = DpSize(250.dp, 50.dp)
    val MEDIUM = DpSize(250.dp, 110.dp)
    val LARGE = DpSize(250.dp, 270.dp)

    fun classify(s: DpSize): WSize = when {
        s.width >= 200.dp && s.height >= 270.dp -> WSize.LARGE
        s.width >= 200.dp -> WSize.MEDIUM
        else -> WSize.SMALL
    }
}
