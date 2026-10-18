package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode

/**
 * The whole app UI as a pure function of [UiState]: top bar, status banner, the current tab and
 * the bottom tab bar. MainActivity feeds it from the ViewModel; screenshot tests feed it the fixture.
 */
@Composable
fun AppScreen(
    state: UiState,
    actions: AppActions,
    tab: String,
    onTab: (String) -> Unit,
    now: Long = System.currentTimeMillis(),
    initialGallery: Boolean = false,
    webContent: @Composable (serverUrl: String, token: String) -> Unit = { u, t -> WebView(u, t) },
) {
    var gallery by remember { mutableStateOf(initialGallery) }
    Column(Modifier.fillMaxSize().background(T.bg).windowInsetsPadding(WindowInsets.safeDrawing)) {
        if (gallery) {
            GalleryScreen(state, onBack = { gallery = false })
            return@Column
        }
        TopBar(state, actions, now)
        Line()
        UpdateBanner(state.update, actions)
        StatusBanner(state, now, onReconnect = { onTab(Tabs.SETUP) })
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val s = state.snapshot
            when {
                tab == Tabs.SETUP -> SetupScreen(state, actions, now, onGallery = { gallery = true })
                s == null -> EmptyState(state, onSetup = { onTab(Tabs.SETUP) }, onRetry = actions::refresh, onScan = actions::scanQr)
                tab == Tabs.TODAY -> TodayScreen(s)
                tab == Tabs.GRAPH -> GraphScreen(s, state.theme)
                tab == Tabs.LIFTS -> LiftsScreen(s)
                tab == Tabs.BODY -> BodyScreen(s)
                tab == Tabs.WEB -> if (state.mode == SourceMode.SERVER && state.configured) webContent(state.serverUrl, state.token)
                    else NeedsServer("WEB", "The full web app runs on your ${dev.ironterm.Brand.NAME} server. Direct mode talks to Hevy only, so there is nothing to open here.\n\nConnect a server in SETUP to get the web app, programs and recovery.", onSetup = { onTab(Tabs.SETUP) })
            }
        }
        Line()
        TabBar(tab, onTab)
    }
}

@Composable
private fun TopBar(state: UiState, actions: AppActions, now: Long) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.background(T.amber).padding(horizontal = 7.dp, vertical = 2.dp)) {
            Mono(dev.ironterm.Brand.logo, size = 15.sp, color = T.bg, bold = true, maxLines = 1)
        }
        if (state.snapshot?.demo == true) {
            Spacer(Modifier.width(8.dp))
            Badge("DEMO", T.dim)
        }
        Spacer(Modifier.weight(1f))
        val src = when (state.mode) {
            SourceMode.SERVER -> "SERVER"
            SourceMode.DIRECT -> "DIRECT"
            SourceMode.NONE -> "OFFLINE"
        }
        Mono(src, size = 10.sp, color = T.faint)
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier.border(1.dp, T.line).clickable(enabled = state.configured && !state.loading) { actions.refresh() }
                .padding(horizontal = 8.dp, vertical = 5.dp),
        ) {
            Mono(
                if (state.loading) "SYNCING…" else "↻ " + Fmt.ago(state.status.lastSuccessAt, now),
                size = 10.sp, color = if (state.loading) T.amber else T.dim, maxLines = 1,
            )
        }
    }
}

@Composable
private fun StatusBanner(state: UiState, now: Long, onReconnect: () -> Unit) {
    val st = state.status
    if (!state.configured && !st.authError) return
    val failedLast = st.lastError != null && st.lastAttemptAt >= st.lastSuccessAt
    if (!failedLast) return
    val auth = st.authError
    Row(
        Modifier.fillMaxWidth().background(if (auth) T.down.copy(alpha = 0.10f) else T.panel)
            .clickable(enabled = auth, onClick = onReconnect)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Mono(if (auth) "!" else "×", size = 12.sp, color = if (auth) T.down else T.dim, bold = true)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Mono(
                if (auth) dev.ironterm.data.AuthException.AUTH_MESSAGE.takeIf { state.mode == SourceMode.SERVER } ?: st.lastError.orEmpty()
                else "Sync failed: ${st.lastError}",
                size = 12.sp, color = if (auth) T.down else T.dim,
            )
            if (state.snapshot != null) Mono("Showing the last good sync (${Fmt.ago(st.lastSuccessAt, now)}).", size = 10.sp, color = T.faint)
        }
        if (auth) Mono("SETUP ›", size = 11.sp, color = T.amber, bold = true)
    }
    Line()
}

@Composable
private fun EmptyState(state: UiState, onSetup: () -> Unit, onRetry: () -> Unit, onScan: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when {
            !state.configured -> {
                Mono("NOT CONNECTED", size = 14.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(10.dp))
                Mono(
                    "Connect your ${dev.ironterm.Brand.NAME} server, or use Direct mode with just a Hevy API key.",
                    size = 12.sp, color = T.dim, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(20.dp))
                TButton("▣ Scan QR code", primary = true, modifier = Modifier.fillMaxWidth(), onClick = onScan)
                Spacer(Modifier.height(10.dp))
                TButton("Set up manually", modifier = Modifier.fillMaxWidth(), onClick = onSetup)
                Spacer(Modifier.height(10.dp))
                Mono("The QR is in the web app: F10 SETUP → APPS & WIDGETS.", size = 10.sp, color = T.faint)
            }
            state.loading -> {
                Mono("SYNCING…", size = 14.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(8.dp))
                Mono(if (state.mode == SourceMode.DIRECT) "Downloading your workouts from Hevy." else "Fetching your snapshot.", size = 12.sp, color = T.dim)
            }
            else -> {
                Mono("NO DATA YET", size = 14.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(8.dp))
                Mono(state.status.lastError ?: "Pull to sync.", size = 12.sp, color = T.dim)
                Spacer(Modifier.height(20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TButton("Retry", primary = true, onClick = onRetry)
                    TButton("Setup", onClick = onSetup)
                }
            }
        }
    }
}

/** Friendly explanation for server-only tabs in Direct mode. */
@Composable
fun NeedsServer(title: String, body: String, onSetup: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Mono("$title NEEDS A SERVER", size = 14.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(12.dp))
        Mono(body, size = 12.sp, color = T.dim)
        if (onSetup != null) {
            Spacer(Modifier.height(20.dp))
            TButton("Open setup", onClick = onSetup)
        }
    }
}

@Composable
private fun TabBar(tab: String, onTab: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(T.bg)) {
        Tabs.all.forEach { t ->
            val sel = t == tab
            Column(
                Modifier.weight(1f).clickable { onTab(t) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.fillMaxWidth().height(2.dp).background(if (sel) T.amber else T.bg))
                Mono(
                    t.uppercase(),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 14.dp),
                    size = 11.sp, color = if (sel) T.amber else T.dim, bold = sel, maxLines = 1, align = TextAlign.Center,
                )
            }
        }
    }
}
