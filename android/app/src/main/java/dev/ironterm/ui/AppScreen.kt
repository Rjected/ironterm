package dev.ironterm.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import kotlinx.coroutines.delay

/** Which tab is selected and what's pushed on top of it. */
data class Nav(val tab: String = Tabs.TODAY, val stack: List<Route> = emptyList()) {
    val top: Route? get() = stack.lastOrNull()
    fun push(r: Route) = copy(stack = stack + r)
    fun pop() = copy(stack = stack.dropLast(1))
    fun select(t: String) = if (t == tab) copy(stack = emptyList()) else Nav(t)

    companion object {
        /** Widget / notification deep-link target (MainActivity.EXTRA_TAB) → where to land. */
        fun resolve(target: String?): Nav? = when (target) {
            null -> null
            in Tabs.tabs -> Nav(target)
            Tabs.NOTIFICATIONS -> Nav(Tabs.FRIENDS, listOf(Route.Notifications))
            Tabs.GRAPH -> Nav(Tabs.HISTORY)
            Tabs.SETUP -> Nav(Tabs.MORE, listOf(Route.Setup))
            Tabs.BODY -> Nav(Tabs.MORE, listOf(Route.Body))
            Tabs.CALENDAR -> Nav(Tabs.MORE, listOf(Route.Calendar))
            Tabs.PROGRAM -> Nav(Tabs.MORE, listOf(Route.Program))
            Tabs.INSIGHTS -> Nav(Tabs.MORE, listOf(Route.Insights))
            Tabs.STATS -> Nav(Tabs.MORE, listOf(Route.Stats))
            else -> null
        }
    }

    /** A tab that isn't in [bar] (LIFTS with a server, FRIENDS in Direct mode) opens under MORE. */
    fun normalize(bar: List<String>): Nav = when {
        tab in bar -> this
        tab == Tabs.LIFTS -> Nav(Tabs.MORE, listOf(Route.Lifts) + stack)
        tab == Tabs.FRIENDS -> Nav(Tabs.MORE, listOf(Route.Friends) + stack)
        else -> Nav(Tabs.MORE, stack)
    }
}

/**
 * The whole app UI as a pure function of its state: top bar, banners, the current screen and the
 * bottom bar. MainActivity feeds it from the ViewModel; screenshot tests feed it fixtures.
 */
@Composable
fun AppScreen(
    state: UiState,
    actions: AppActions,
    nav: Nav,
    onNav: (Nav) -> Unit,
    data: DataUi = DataUi(),
    gym: GymUi = GymUi(),
    now: Long = System.currentTimeMillis(),
    /** clocks tick (false in screenshot tests) */
    ticking: Boolean = true,
) {
    val bar = Tabs.bar(state.mode)
    @Suppress("NAME_SHADOWING") val nav = nav.normalize(bar)
    val top = nav.top
    if (top != null) BackHandler { onNav(nav.pop()) }
    else if (nav.tab != Tabs.TODAY) BackHandler { onNav(Nav(Tabs.TODAY)) }
    val go: (Route) -> Unit = { onNav(nav.push(it)) }
    val back: () -> Unit = { onNav(nav.pop()) }
    val setup: () -> Unit = { onNav(Nav(Tabs.MORE, listOf(Route.Setup))) }
    state.pendingConnect?.let { ConnectConfirmDialog(it, onConfirm = actions::confirmConnect, onCancel = actions::cancelConnect) }
    Column(Modifier.fillMaxSize().background(T.bg).windowInsetsPadding(WindowInsets.safeDrawing)) {
        if (top == Route.Gallery) {
            GalleryScreen(state, onBack = back)
            return@Column
        }
        if (top == null) {
            TopBar(state, actions, now, nav.tab, gym)
            Line()
        }
        UpdateBanner(state.update, actions)
        StatusBanner(state, now, onReconnect = setup)
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val needsConnect = !state.configured && top != Route.Setup && nav.tab != Tabs.MORE
            when {
                needsConnect -> EmptyState(state, onSetup = setup, onRetry = actions::refresh, onScan = actions::scanQr)
                top != null -> RouteScreen(top, state, data, gym, actions, back, go, setup, now, replace = { onNav(Nav(nav.tab, it)) })
                nav.tab == Tabs.TODAY -> TodayScreen(state, data, gym, actions, now, onGym = { onNav(Nav(Tabs.GYM)) }, onGo = go, onHistory = { onNav(Nav(Tabs.HISTORY)) })
                nav.tab == Tabs.GYM -> GymScreen(state, data, gym, actions, now, onSetup = setup, ticking = ticking)
                nav.tab == Tabs.LIFTS -> LiftsScreen(state, data, actions, onGo = go, onSetup = setup)
                nav.tab == Tabs.FRIENDS -> FriendsScreen(state, data, actions, now, onGo = go, onSetup = setup)
                nav.tab == Tabs.HISTORY -> HistoryScreen(state, data, actions, onGo = go, onSetup = setup)
                else -> MoreScreen(state, gym, data.social, onGo = go)
            }
            Toast(data.toast, actions::toastShown)
        }
        Line()
        TabBar(nav, bar, gym, data.social, onSelect = { onNav(nav.select(it)) })
    }
}

@Composable
private fun RouteScreen(r: Route, state: UiState, data: DataUi, gym: GymUi, actions: AppActions, back: () -> Unit, go: (Route) -> Unit, setup: () -> Unit, now: Long, replace: (List<Route>) -> Unit) {
    when (r) {
        is Route.Lift -> LiftDetailScreen(r.key, state, data, actions, back, go)
        is Route.Workout -> WorkoutScreen(r.id, state, data, actions, back)
        Route.Calendar -> CalendarScreen(state, data, actions, back, go, setup)
        Route.Program -> ProgramScreen(state, data, actions, back, setup, onBrowse = { go(Route.Programs) })
        Route.Programs -> ProgramListScreen(state, data, actions, back, setup, onOpen = { go(Route.ProgramPage(it)) })
        is Route.ProgramPage -> ProgramPageScreen(r.id, state, data, actions, back, setup, onStarted = { replace(listOf(Route.Program)) })
        Route.Body -> BodyScreen(state, data, actions, back, setup)
        Route.Insights -> InsightsScreen(state, data, actions, back, setup)
        Route.Stats -> StatsScreen(state, data, actions, back, setup)
        Route.Setup -> Column(Modifier.fillMaxSize()) {
            BackBar("Setup", back)
            Box(Modifier.weight(1f)) { SetupScreen(state, actions, now, gym.prefs, onGallery = { go(Route.Gallery) }) }
        }
        Route.Gallery -> Unit
        Route.Lifts -> Column(Modifier.fillMaxSize()) {
            BackBar("Lifts", back)
            Box(Modifier.weight(1f)) { LiftsScreen(state, data, actions, onGo = go, onSetup = setup) }
        }
        Route.Friends -> FriendsScreen(state, data, actions, now, onGo = go, onSetup = setup, onBack = back)
        is Route.Friend -> FriendProfileScreen(r.id, state, data, actions, now, back)
        Route.AddFriend -> AddFriendScreen(data, actions, back)
        Route.Notifications -> NotificationsScreen(data, actions, now, back, go)
    }
}

@Composable
private fun TopBar(state: UiState, actions: AppActions, now: Long, tab: String, gym: GymUi) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.background(T.amber).padding(horizontal = 7.dp, vertical = 2.dp)) {
            Mono(Brand.logo, size = 14.sp, color = T.bg, bold = true, maxLines = 1)
        }
        if (state.snapshot?.demo == true) {
            Spacer(Modifier.width(8.dp))
            Badge("DEMO", T.dim)
        }
        Spacer(Modifier.width(10.dp))
        Mono(tab.uppercase(), size = 11.sp, color = T.faint, maxLines = 1)
        Spacer(Modifier.weight(1f))
        val q = gym.state.pending
        if (q > 0) {
            Mono("⇅$q", size = 10.sp, color = T.amber, maxLines = 1)
            Spacer(Modifier.width(8.dp))
        }
        Mono(when (state.mode) { SourceMode.SERVER -> "SERVER"; SourceMode.DIRECT -> "DIRECT"; SourceMode.NONE -> "OFFLINE" }, size = 10.sp, color = T.faint)
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier.border(1.dp, T.line).clickable(enabled = state.configured && !state.loading) { actions.refresh() }
                .heightIn(min = 32.dp).padding(horizontal = 8.dp),
            contentAlignment = Alignment.Center,
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
private fun EmptyState(state: UiState, onSetup: () -> Unit, @Suppress("UNUSED_PARAMETER") onRetry: () -> Unit, onScan: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Mono("NOT CONNECTED", size = 14.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(10.dp))
        Mono("Connect your ${Brand.NAME} server, or use Direct mode with just a Hevy API key.", size = 12.sp, color = T.dim, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(20.dp))
        TButton("▣ Scan QR code", primary = true, modifier = Modifier.fillMaxWidth(), onClick = onScan)
        Spacer(Modifier.height(10.dp))
        TButton("Set up manually", modifier = Modifier.fillMaxWidth(), onClick = onSetup)
        Spacer(Modifier.height(10.dp))
        Mono("The QR is in the web app: F10 SETUP → APPS & WIDGETS.", size = 10.sp, color = T.faint)
        if (state.loading) { Spacer(Modifier.height(10.dp)); Mono("SYNCING…", size = 11.sp, color = T.amber) }
    }
}

/** Friendly explanation for server-only screens in Direct mode. */
@Composable
fun NeedsServer(title: String, body: String, onSetup: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Mono("${title.uppercase()} NEEDS A SERVER", size = 14.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(12.dp))
        Mono(
            body.ifBlank { "This screen is computed by the ${Brand.NAME} server (program engine and analytics). Direct mode only has the Hevy API: TODAY, LIFTS, HISTORY and the graph work, plus logging in GYM." },
            size = 12.sp, color = T.dim,
        )
        if (onSetup != null) {
            Spacer(Modifier.height(20.dp))
            TButton("Connect a server", onClick = onSetup)
        }
    }
}

@Composable
private fun Toast(msg: String?, onShown: () -> Unit) {
    LaunchedEffect(msg) {
        if (msg != null) { delay(3500); onShown() }
    }
    Box(Modifier.fillMaxSize().padding(12.dp), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(msg != null, enter = fadeIn(), exit = fadeOut()) {
            Box(Modifier.fillMaxWidth().background(T.panel).border(1.dp, T.amber).clickable(onClick = onShown).padding(14.dp)) {
                Mono(msg.orEmpty(), size = 12.sp, color = T.text)
            }
        }
    }
}

private val TAB_GLYPH = mapOf(Tabs.TODAY to "◉", Tabs.GYM to "▲", Tabs.LIFTS to "≡", Tabs.FRIENDS to "@", Tabs.HISTORY to "▦", Tabs.MORE to "⋯")

@Composable
private fun TabBar(nav: Nav, bar: List<String>, gym: GymUi, social: SocialUi, onSelect: (String) -> Unit) {
    val haptic = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().background(T.bg)) {
        bar.forEach { t ->
            val sel = t == nav.tab
            Column(
                Modifier.weight(1f).clickable(role = Role.Tab) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); onSelect(t) }.heightIn(min = 58.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.fillMaxWidth().height(2.dp).background(if (sel) T.amber else T.bg))
                Spacer(Modifier.height(8.dp))
                Box(contentAlignment = Alignment.TopEnd) {
                    Mono(TAB_GLYPH[t].orEmpty(), size = 15.sp, color = if (sel) T.amber else T.dim, align = TextAlign.Center)
                    if (t == Tabs.GYM && gym.state.session != null) Box(Modifier.padding(start = 14.dp).size(6.dp).background(T.amber))
                    if (t == Tabs.FRIENDS && (social.unread > 0 || social.incoming > 0)) Box(Modifier.padding(start = 20.dp).size(6.dp).background(T.down))
                }
                Spacer(Modifier.height(3.dp))
                Mono(t.uppercase(), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), size = 10.sp, color = if (sel) T.amber else T.dim, bold = sel, maxLines = 1, align = TextAlign.Center)
            }
        }
    }
}
