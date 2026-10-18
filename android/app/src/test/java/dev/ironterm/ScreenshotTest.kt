package dev.ironterm

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SourceMode
import dev.ironterm.data.SyncStatus
import dev.ironterm.data.direct.DirectAggregator
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.T
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
 * Renders every app tab and every widget variant to docs/screens/android/ (411dp phone, xhdpi).
 * Widgets go through the real Glance → RemoteViews → View path, the same as on a home screen.
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
    private val server = UiState(
        snapshot = TestData.fixture, mode = SourceMode.SERVER, serverUrl = "https://gym.example.com",
        token = "ht_demo", status = synced, unit = "lb",
    )
    private val directSnap: Snapshot by lazy {
        val today = LocalDate.parse("2026-10-15")
        DirectAggregator.build(TestData.history(today), today, TestData.zone, "kg", 3, Instant.ofEpochMilli(now))
    }
    private val direct by lazy {
        UiState(snapshot = directSnap, mode = SourceMode.DIRECT, apiKey = "test-key", status = synced, unit = "kg", weeklyTarget = 3)
    }

    private fun app(name: String, state: UiState, tab: String, gallery: Boolean = false, tall: Boolean = false) {
        if (tall) RuntimeEnvironment.setQualifiers("+h2000dp")
        compose.setContent {
            TerminalTheme {
                AppScreen(state, AppActions.None, tab, {}, now = now, initialGallery = gallery, webContent = { _, _ -> FakeWeb() })
            }
        }
        compose.waitForIdle()
        if (gallery) compose.waitUntil(20_000) { compose.onAllNodes(androidx.compose.ui.test.hasText("RENDERING…")).fetchSemanticsNodes().isEmpty() }
        compose.onRoot().captureRoboImage(File(out, "$name.png").path)
    }

    // ── app: server mode, every tab ──
    @Test fun app_today() = app("app_today", server, Tabs.TODAY)
    @Test fun app_today_full() = app("app_today_full", server, Tabs.TODAY, tall = true)
    @Test fun app_graph() = app("app_graph", server, Tabs.GRAPH)
    @Test fun app_lifts() = app("app_lifts", server, Tabs.LIFTS)
    @Test fun app_body() = app("app_body", server, Tabs.BODY)
    @Test fun app_body_full() = app("app_body_full", server, Tabs.BODY, tall = true)
    @Test fun app_web() = app("app_web", server, Tabs.WEB)
    @Test fun app_setup() = app("app_setup", server, Tabs.SETUP)
    @Test fun app_setup_full() = app("app_setup_full", server, Tabs.SETUP, tall = true)
    @Test fun app_gallery() = app("app_gallery", server, Tabs.SETUP, gallery = true)

    // ── app: direct mode ──
    @Test fun direct_today() = app("direct_today", direct, Tabs.TODAY)
    @Test fun direct_graph() = app("direct_graph", direct.copy(theme = ColorTheme.GREEN), Tabs.GRAPH)
    @Test fun direct_lifts() = app("direct_lifts", direct, Tabs.LIFTS)
    @Test fun direct_body() = app("direct_body", direct, Tabs.BODY)
    @Test fun direct_web() = app("direct_web", direct, Tabs.WEB)
    @Test fun direct_setup() = app("direct_setup", direct, Tabs.SETUP)

    // ── app: states ──
    @Test fun state_not_connected() = app("state_not_connected", UiState(), Tabs.TODAY)
    @Test fun state_first_setup() = app("state_first_setup", UiState(), Tabs.SETUP)
    @Test fun state_loading() = app("state_loading", UiState(mode = SourceMode.SERVER, serverUrl = "https://gym.example.com", token = "ht_x", loading = true), Tabs.TODAY)
    @Test fun state_auth_error() = app(
        "state_auth_error",
        server.copy(status = synced.copy(lastAttemptAt = now, lastError = "Token revoked or invalid. Reconnect.", authError = true)),
        Tabs.TODAY,
    )
    @Test fun state_offline_error() = app(
        "state_offline_error",
        server.copy(status = synced.copy(lastAttemptAt = now, lastError = "Offline or server unreachable. Showing the last sync.")),
        Tabs.GRAPH,
    )
    @Test fun state_first_setup_scan_qr_full() = app("state_first_setup_scan_qr_full", UiState(), Tabs.SETUP, tall = true)
    @Test fun state_scan_not_ironterm() = app(
        "state_scan_not_ironterm",
        UiState(notice = dev.ironterm.data.ConnectCode.NOT_IRONTERM, noticeError = true), Tabs.SETUP,
    )
    @Test fun state_scanner_unavailable() = app(
        "state_scanner_unavailable",
        UiState(notice = dev.ironterm.data.ConnectCode.SCANNER_UNAVAILABLE, noticeError = true), Tabs.SETUP,
    )
    private val update57 by lazy { dev.ironterm.update.ReleaseParser.parse(UpdateTest.release())!! }
    @Test fun update_banner() = app("update_banner", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57)), Tabs.TODAY)
    @Test fun update_downloading() = app("update_downloading", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57, phase = dev.ironterm.ui.UpdatePhase.DOWNLOADING, progress = 0.42f)), Tabs.TODAY)
    @Test fun update_needs_permission() = app("update_needs_permission", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57, phase = dev.ironterm.ui.UpdatePhase.NEEDS_PERMISSION)), Tabs.TODAY)
    @Test fun update_setup() = app("update_setup", server.copy(update = dev.ironterm.ui.UpdateUi(available = update57, lastCheckAt = now - 3_600_000)), Tabs.SETUP, tall = true)
    @Test fun state_test_ok() = app("state_test_ok", server.copy(testResult = ""), Tabs.SETUP)

    // ── widgets: every kind × size, server + direct ──
    @Test fun widgets() {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val serverData = WidgetData(TestData.fixture, SourceMode.SERVER, ColorTheme.BLUE, lastSyncAt = synced.lastSuccessAt)
        val directData = WidgetData(directSnap, SourceMode.DIRECT, ColorTheme.BLUE, lastSyncAt = synced.lastSuccessAt)
        for (k in WidgetCatalog.all) for (v in k.variants) {
            saveWidget(ctx, "widget_${k.id}_${v.name}", k, v.size, serverData)
            if (k.id in setOf("next", "recovery", "lifts", "graph")) saveWidget(ctx, "widget_${k.id}_${v.name}_direct", k, v.size, directData)
        }
        // theme variants + lift choice + empty state
        for (th in listOf(ColorTheme.GREEN, ColorTheme.PURPLE, ColorTheme.ORANGE)) {
            saveWidget(ctx, "widget_graph_medium_${th.name.lowercase()}", WidgetCatalog.all[0], WidgetCatalog.M.size, serverData.copy(theme = th))
        }
        saveWidget(ctx, "widget_lifts_small_deadlift", WidgetCatalog.all[3], WidgetCatalog.S.size, serverData.copy(liftKey = "deadlift"))
        saveWidget(ctx, "widget_graph_medium_not_connected", WidgetCatalog.all[0], WidgetCatalog.M.size, WidgetData(null, SourceMode.NONE))
        // small real-launcher sizes (Pixel 4-col grid, 2×2 ≈ 150dp; 4×1 ≈ 320×60)
        saveWidget(ctx, "widget_graph_small_tight", WidgetCatalog.all[0], androidx.compose.ui.unit.DpSize(130.dp, 130.dp), serverData)
        saveWidget(ctx, "widget_week_wide_tight", WidgetCatalog.all[2], androidx.compose.ui.unit.DpSize(300.dp, 60.dp), serverData)
        saveWidget(ctx, "widget_next_medium_tight", WidgetCatalog.all[1], androidx.compose.ui.unit.DpSize(300.dp, 130.dp), serverData)

        // Widget-picker previews (res/drawable-nodpi), rendered from the demo fixture.
        val pv = previews ?: return
        val pick = mapOf("graph" to WidgetCatalog.M, "next" to WidgetCatalog.M, "week" to WidgetCatalog.S, "lifts" to WidgetCatalog.M, "recovery" to WidgetCatalog.S)
        for (k in WidgetCatalog.all) {
            val v = pick.getValue(k.id)
            File(pv, "widget_preview_${k.id}.png").outputStream().use { renderWidget(ctx, k, v.size, serverData, margin = 0).compress(Bitmap.CompressFormat.PNG, 100, it) }
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

/** WebView doesn't render under Robolectric; screenshots show this stand-in instead. */
@androidx.compose.runtime.Composable
private fun FakeWeb() {
    Box(Modifier.fillMaxSize().background(T.panel)) {
        Text("[WebView: full web app at gym.example.com, signed in via POST /auth/app]", color = T.faint)
    }
}
