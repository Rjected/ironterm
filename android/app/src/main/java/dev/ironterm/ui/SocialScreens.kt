package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.Brand
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.data.app.Load
import dev.ironterm.data.social.Friend
import dev.ironterm.data.social.Share
import dev.ironterm.data.social.Social
import dev.ironterm.data.social.SocialMe
import dev.ironterm.data.social.SocialNotification

private const val NEEDS_SERVER_TEXT =
    "Friends are server-to-server: your ${Brand.NAME} server holds your identity and fetches friends' feeds for you. " +
        "Direct mode talks only to Hevy, so there's no one for friends to reach. Connect a server to add friends."

// ═════════════════════════════ FRIENDS ═════════════════════════════

/** The FRIENDS tab (or the MORE screen in Direct mode, with [onBack]). */
@Composable
fun FriendsScreen(state: UiState, data: DataUi, actions: AppActions, now: Long, onGo: (Route) -> Unit, onSetup: () -> Unit, onBack: (() -> Unit)? = null) {
    LaunchedEffect(state.mode) { actions.socialLoad() }
    val so = data.social
    val me = so.me
    val enabled = me.data?.enabled == true
    Column(Modifier.fillMaxSize()) {
        if (onBack != null) BackBar("Friends", onBack) { if (enabled) Bell(so.unread) { onGo(Route.Notifications) } }
        Box(Modifier.weight(1f)) {
            when {
                state.mode != SourceMode.SERVER || me.needsServer -> NeedsServer("Friends", NEEDS_SERVER_TEXT, onSetup.takeIf { state.mode != SourceMode.SERVER })
                me.data == null && me.error != null -> ErrorState(me.error, me.auth, onRetry = { actions.socialLoad(true) }, onSetup = onSetup.takeIf { me.auth })
                me.data == null -> LoadingState("Friends")
                !me.data.enabled -> Column(Modifier.fillMaxSize()) {
                    if (me.error != null) StaleStrip(me.error, me.savedAt, now)
                    SetupCard(me.data, so, actions)
                }
                else -> Column(Modifier.fillMaxSize()) {
                    SocialHeader(so, actions, onGo, showBell = onBack == null)
                    Line()
                    Box(Modifier.weight(1f)) {
                        when (so.section) {
                            SocialUi.LIST -> FriendListSection(so, actions, now, onGo)
                            SocialUi.MINE -> MineSection(so, actions, now)
                            else -> FeedSection(so, actions, now, onGo)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SocialHeader(so: SocialUi, actions: AppActions, onGo: (Route) -> Unit, showBell: Boolean) {
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        val inc = so.incoming
        Seg(
            listOf(SocialUi.FEED to "FEED", SocialUi.LIST to if (inc > 0) "FRIENDS·$inc" else "FRIENDS", SocialUi.MINE to "MINE"),
            so.section, actions::socialSection,
        )
        Spacer(Modifier.weight(1f))
        if (showBell) Bell(so.unread) { onGo(Route.Notifications) }
        Box(Modifier.clickable(onClickLabel = "Add a friend") { onGo(Route.AddFriend) }.size(44.dp), contentAlignment = Alignment.Center) {
            Mono("+", size = 22.sp, color = T.amber, bold = true)
        }
    }
}

// ───────────── setup ─────────────

@Composable
private fun SetupCard(me: SocialMe, so: SocialUi, actions: AppActions) {
    var handle by rememberSaveable { mutableStateOf(me.handle.orEmpty()) }
    var name by rememberSaveable { mutableStateOf(me.name.orEmpty()) }
    var listed by rememberSaveable { mutableStateOf(true) }
    val busy = "setup" in so.busy
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Label("Set up friends")
        Spacer(Modifier.height(10.dp))
        Mono("Follow friends' training, react to PRs and compare lifts, without a central service holding anyone's workouts.", size = 12.sp)
        Spacer(Modifier.height(14.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, T.line).background(T.panel).padding(12.dp)) {
            Mono("HOW PRIVACY WORKS", size = 10.sp, color = T.amber, bold = true)
            Spacer(Modifier.height(8.dp))
            listOf(
                "Your training stays on your server. A friend's server fetches only what you allow, when they look.",
                "Nothing is shared until you accept a friend. Each friend gets a level: BASIC (default), LIFTS or FULL.",
                "The directory stores only your handle, name, server address and public key. No workouts, no friend lists.",
                "Unfriending or lowering a level stops future fetches. Copies they already fetched can't be recalled.",
            ).forEach { line ->
                Row(Modifier.padding(vertical = 3.dp)) { Mono("›", Modifier.width(14.dp), size = 11.sp, color = T.amber); Mono(line, size = 11.sp, color = T.dim) }
            }
        }
        Spacer(Modifier.height(18.dp))
        Mono("HANDLE", size = 10.sp, color = T.dim, bold = true)
        Spacer(Modifier.height(4.dp))
        SearchField(handle, { handle = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '_' || c == '-' }.take(30) }, "e.g. sam", Modifier.fillMaxWidth())
        Mono("a–z, 0–9, _ and -. Friends find you as @${handle.ifBlank { "handle" }}.", Modifier.padding(top = 4.dp), size = 9.sp, color = T.faint)
        Spacer(Modifier.height(12.dp))
        Mono("DISPLAY NAME", size = 10.sp, color = T.dim, bold = true)
        Spacer(Modifier.height(4.dp))
        SearchField(name, { name = it.take(40) }, "e.g. Sam", Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Toggle("List me in the directory", if (listed) "People can find you by searching your handle or name." else "Unlisted: only your exact handle or server URL works.", listed) { listed = it }
        Spacer(Modifier.height(4.dp))
        Mono(
            when {
                me.directory != null -> "Directory: ${me.directory.substringAfter("://")}"
                me.directoryConfigured -> "Your server will register you with its directory."
                else -> "No directory configured on your server: you won't be searchable, but friends can add you by server URL."
            },
            size = 9.sp, color = T.faint,
        )
        me.server?.let { Mono("Your server: ${it.substringAfter("://")}", size = 9.sp, color = T.faint) }
        so.setupError?.let { Spacer(Modifier.height(10.dp)); Mono(it, size = 11.sp, color = T.down) }
        Spacer(Modifier.height(16.dp))
        TButton(if (busy) "Setting up…" else "Set up friends", Modifier.fillMaxWidth(), primary = true, enabled = !busy && Social.validHandle(handle)) {
            actions.socialSetup(handle, name, listed)
        }
    }
}

// ───────────── feed ─────────────

/** Infinite scroll trigger shared by the feed lists. */
@Composable
private fun rememberNearEnd(list: androidx.compose.foundation.lazy.LazyListState, key: Any?, onMore: () -> Unit) {
    val nearEnd by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= list.layoutInfo.totalItemsCount - 3 } ?: false } }
    LaunchedEffect(list, key) { snapshotFlow { nearEnd }.collect { if (it) onMore() } }
}

private fun LazyListScope.feedFooter(f: FeedUi, onMore: () -> Unit, end: String) {
    if (f.loadingMore) item { Mono("LOADING MORE…", Modifier.padding(16.dp), size = 10.sp, color = T.amber) }
    if (f.error != null && f.loaded && f.items.isNotEmpty() && !f.loading) item {
        Row(Modifier.fillMaxWidth().clickable(onClick = onMore).padding(16.dp)) { Mono("× ${f.error} · TAP TO RETRY", size = 10.sp, color = T.down) }
    }
    if (f.loaded && f.next == null && f.items.isNotEmpty()) item { Mono(end, Modifier.fillMaxWidth().padding(20.dp), size = 9.sp, color = T.faint, align = TextAlign.Center) }
    item { Spacer(Modifier.height(24.dp)) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedSection(so: SocialUi, actions: AppActions, now: Long, onGo: (Route) -> Unit) {
    val f = so.feed
    val me = so.me.data?.server
    val list = rememberLazyListState()
    rememberNearEnd(list, f.next) { if (f.next != null) actions.feedMore() }
    val friends = so.friends.data
    PullToRefreshBox(isRefreshing = f.loading && f.loaded, onRefresh = actions::feedRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = list) {
            if (f.error != null && f.loaded && !f.loadingMore) item { StaleStrip(f.error, f.savedAt, now) }
            if (f.unreachable.isNotEmpty() && f.loaded) item {
                val names = f.unreachable.map { id -> friends?.friends?.firstOrNull { it.id == id }?.author?.display ?: id }
                Mono("◌ Couldn't reach ${names.joinToString(", ")}: nothing cached yet.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), size = 9.sp, color = T.faint, maxLines = 2)
                Line()
            }
            if (so.incoming > 0) item {
                Row(
                    Modifier.fillMaxWidth().background(T.amber.copy(alpha = 0.10f)).clickable { actions.socialSection(SocialUi.LIST) }.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Mono("${so.incoming} FRIEND REQUEST${if (so.incoming == 1) "" else "S"}", Modifier.weight(1f), size = 11.sp, color = T.amber, bold = true)
                    Mono("REVIEW ›", size = 11.sp, color = T.amber, bold = true)
                }
                Line()
            }
            when {
                !f.loaded && f.error != null -> item { Box(Modifier.height(360.dp)) { ErrorState(f.error, onRetry = { actions.feedRefresh() }) } }
                !f.loaded -> item { Box(Modifier.height(300.dp)) { LoadingState("Feed") } }
                f.items.isEmpty() && (friends?.accepted?.isEmpty() ?: true) -> item { NoFriends(onAdd = { onGo(Route.AddFriend) }, pending = friends?.outgoing?.size ?: 0) }
                f.items.isEmpty() -> item {
                    Column(Modifier.padding(16.dp)) { EmptyNote("QUIET SO FAR", "Your friends haven't logged anything you can see yet. Pull to refresh.") }
                }
            }
            items(f.items, key = { (it.author?.id ?: "") + "/" + it.id }) { item ->
                FeedCard(item, me, now, actions, stale = item.author?.id in f.stale, busy = so.busy, onAuthor = { onGo(Route.Friend(it.id)) })
            }
            feedFooter(f, actions::feedMore, "— THAT'S EVERYTHING —")
        }
    }
}

@Composable
private fun NoFriends(onAdd: () -> Unit, pending: Int) {
    Column(Modifier.fillMaxWidth().padding(24.dp)) {
        Spacer(Modifier.height(24.dp))
        Mono("NO FRIENDS YET", size = 14.sp, color = T.amber, bold = true)
        Spacer(Modifier.height(10.dp))
        Mono("Add one: search the directory for their handle, or enter their server address. Their sessions, PRs and achievements show up here.", size = 12.sp, color = T.dim)
        if (pending > 0) { Spacer(Modifier.height(8.dp)); Mono("$pending request${if (pending == 1) "" else "s"} waiting for an answer.", size = 11.sp, color = T.faint) }
        Spacer(Modifier.height(20.dp))
        TButton("+ Add a friend", primary = true, onClick = onAdd)
    }
}

// ───────────── friends list ─────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FriendListSection(so: SocialUi, actions: AppActions, now: Long, onGo: (Route) -> Unit) {
    val load = so.friends
    var confirm by remember { mutableStateOf<Friend?>(null) }
    Box(Modifier.fillMaxSize()) {
        Loaded(load, "Friends", onRetry = { actions.socialLoad(true) }) { l ->
            RefreshColumn(load.loading, { actions.feedRefresh() }) {
                if (l.friends.isEmpty()) NoFriends(onAdd = { onGo(Route.AddFriend) }, pending = 0)
                if (l.incoming.isNotEmpty()) {
                    Group("Requests", "${l.incoming.size}", T.amber)
                    l.incoming.forEach { f -> IncomingRow(f, so.busy, now, actions) }
                }
                if (l.accepted.isNotEmpty()) {
                    Group("Friends", "${l.accepted.size}")
                    l.accepted.sortedBy { it.author.display.lowercase() }.forEach { f -> FriendRow(f, stale = f.id in so.feed.stale, now) { onGo(Route.Friend(f.id)) } }
                }
                if (l.outgoing.isNotEmpty()) {
                    Group("Sent", "${l.outgoing.size} PENDING")
                    l.outgoing.forEach { f -> OutgoingRow(f, now, busy = "unfriend:${f.id}" in so.busy) { confirm = f } }
                }
                if (l.friends.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    TButton("+ Add a friend", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), onClick = { onGo(Route.AddFriend) })
                }
                so.me.data?.let { me ->
                    Spacer(Modifier.height(16.dp))
                    Mono(
                        "You're @${me.handle} · ${if (me.listed) "listed in the directory" else "not listed (exact handle or URL only)"}" +
                            (me.fingerprint?.let { " · key $it" } ?: ""),
                        Modifier.padding(horizontal = 16.dp), size = 9.sp, color = T.faint,
                    )
                }
            }
        }
        Sheet(confirm != null, { confirm = null }) {
            confirm?.let { f ->
                ConfirmBody("Cancel the request to ${f.author.display}?", "They won't be told it was cancelled; the request just goes away.", "Cancel request", onYes = { actions.unfriend(f.id); confirm = null }, onNo = { confirm = null })
            }
        }
    }
}

@Composable
private fun Group(title: String, right: String, color: androidx.compose.ui.graphics.Color = T.dim) {
    Row(Modifier.fillMaxWidth().background(T.panel).padding(horizontal = 16.dp, vertical = 7.dp)) {
        Mono(title.uppercase(), Modifier.weight(1f), size = 10.sp, color = color, bold = true)
        Mono(right, size = 10.sp, color = T.dim)
    }
    Line()
}

@Composable
private fun WhoLine(f: Friend, size: androidx.compose.ui.unit.Dp = 36.dp, content: @Composable ColumnScope.() -> Unit = {}) {
    Row(verticalAlignment = Alignment.Top) {
        Avatar(f.author, size)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Mono(f.author.display.uppercase(), size = 13.sp, bold = true, maxLines = 1)
            Mono(f.author.address, size = 10.sp, color = T.dim, maxLines = 1)
            content()
        }
    }
}

@Composable
private fun IncomingRow(f: Friend, busy: Set<String>, now: Long, actions: AppActions) {
    var share by rememberSaveable(f.id) { mutableStateOf(Share.BASIC) }
    val working = "accept:${f.id}" in busy || "reject:${f.id}" in busy
    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        WhoLine(f) {
            f.note?.takeIf { it.isNotBlank() }?.let { Spacer(Modifier.height(4.dp)); Mono("“$it”", size = 11.sp, color = T.text) }
            Mono("Asked ${Social.ago(f.since, now).lowercase().let { if (it == "now") "just now" else "$it ago" }} · key ${f.fingerprint}", size = 9.sp, color = T.faint, maxLines = 1)
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono("THEY'LL SEE", Modifier.weight(1f), size = 9.sp, color = T.dim, bold = true)
            Seg(Share.all.map { it to Share.label(it) }, share, { share = it })
        }
        Spacer(Modifier.height(4.dp))
        Mono(Share.describe(share), size = 10.sp, color = T.dim)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TButton(if ("accept:${f.id}" in busy) "Accepting…" else "Accept", Modifier.weight(1f), primary = true, enabled = !working) { actions.acceptFriend(f.id, share) }
            TButton("Decline", Modifier.weight(1f), enabled = !working) { actions.rejectFriend(f.id) }
        }
    }
    Line()
}

@Composable
private fun FriendRow(f: Friend, stale: Boolean, now: Long, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            WhoLine(f) {
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Mono("THEY SEE ${Share.label(f.share)}", size = 9.sp, color = T.faint, maxLines = 1)
                    f.theirShare?.let { Mono(" · YOU SEE ${Share.label(it)}", size = 9.sp, color = T.faint, maxLines = 1) }
                }
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            if (stale) StaleMark()
            f.lastSeen?.let { Mono(Social.ago(it, now), size = 9.sp, color = T.faint) }
        }
        Spacer(Modifier.width(10.dp))
        Mono("›", size = 16.sp, color = T.faint)
    }
    Line()
}

@Composable
private fun OutgoingRow(f: Friend, now: Long, busy: Boolean, onCancel: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            WhoLine(f) { Mono("WAITING · SENT ${Social.ago(f.since, now)}", size = 9.sp, color = T.faint, maxLines = 1) }
        }
        Mono(if (busy) "…" else "CANCEL", Modifier.clickable(enabled = !busy, onClick = onCancel).padding(horizontal = 8.dp, vertical = 12.dp), size = 10.sp, color = T.dim, bold = true)
    }
    Line()
}

@Composable
fun ConfirmBody(title: String, body: String, yes: String, danger: Boolean = true, onYes: () -> Unit, onNo: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 20.dp)) {
        Mono(title.uppercase(), size = 14.sp, color = if (danger) T.down else T.amber, bold = true)
        Spacer(Modifier.height(8.dp))
        Mono(body, size = 12.sp, color = T.dim)
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TButton("Keep", Modifier.weight(1f), onClick = onNo)
            Box(
                Modifier.weight(1f).border(1.dp, if (danger) T.down else T.amber).background((if (danger) T.down else T.amber).copy(alpha = 0.10f))
                    .clickable(onClick = onYes).padding(horizontal = 14.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) { Mono(yes.uppercase(), size = 12.sp, color = if (danger) T.down else T.amber, bold = true, maxLines = 1) }
        }
    }
}

// ───────────── my activity ─────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MineSection(so: SocialUi, actions: AppActions, now: Long) {
    LaunchedEffect(Unit) { actions.loadMine() }
    val f = so.mine
    val list = rememberLazyListState()
    rememberNearEnd(list, f.next) { if (f.next != null) actions.mineMore() }
    PullToRefreshBox(isRefreshing = f.loading && f.loaded, onRefresh = { actions.loadMine(true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = list) {
            item {
                Mono("Your own sessions, PRs and achievements as friends see them, with their reactions and comments.", Modifier.padding(16.dp), size = 10.sp, color = T.faint)
                Line()
            }
            when {
                !f.loaded && f.error != null -> item { Box(Modifier.height(320.dp)) { ErrorState(f.error, onRetry = { actions.loadMine(true) }) } }
                !f.loaded -> item { Box(Modifier.height(260.dp)) { LoadingState("My activity") } }
                f.items.isEmpty() -> item { Column(Modifier.padding(16.dp)) { EmptyNote("NOTHING YET", "Log a workout: it shows up here and in your friends' feeds.") } }
            }
            items(f.items, key = { it.id }) { FeedCard(it, so.me.data?.server, now, actions, readOnly = true, showAuthor = false) }
            feedFooter(f, actions::mineMore, "— START OF YOUR ACTIVITY —")
        }
    }
}

// ═════════════════════════════ ADD FRIEND ═════════════════════════════

@Composable
fun AddFriendScreen(data: DataUi, actions: AppActions, onBack: () -> Unit) {
    val so = data.social
    val startAdded = remember { so.added }
    LaunchedEffect(so.added) { if (so.added != startAdded) onBack() }
    var target by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var share by rememberSaveable { mutableStateOf(Share.BASIC) }
    var q by rememberSaveable { mutableStateOf(so.search.query) }
    val busy = "add" in so.busy
    val known = so.friends.data?.friends.orEmpty()
    Column(Modifier.fillMaxSize()) {
        BackBar("Add friend", onBack)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Section("Search the directory", right = so.me.data?.directory?.substringAfter("://")) {
                SearchField(q, { q = it; actions.directorySearch(it) }, "handle or name (2+ letters)", Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                val s = so.search
                when {
                    s.error != null -> Mono(s.error, size = 10.sp, color = T.down)
                    s.loading -> Mono("SEARCHING…", size = 10.sp, color = T.amber)
                    s.query.trim().length >= 2 && s.users.isEmpty() -> Mono("No listed users match. Unlisted people can still be added by exact handle below.", size = 10.sp, color = T.faint)
                    s.query.isBlank() -> Mono("Only people who chose to be listed show up.", size = 10.sp, color = T.faint)
                }
                s.users.forEach { u ->
                    val existing = known.firstOrNull { Social.same(it.server, u.server) }
                    val picked = target == u.handle
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = existing == null) { target = u.handle }.heightIn(min = 52.dp).padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(dev.ironterm.data.social.Author(u.server, u.server, u.handle, u.name), 30.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Mono((u.name ?: u.handle).uppercase(), size = 12.sp, bold = true, maxLines = 1)
                            Mono("@${u.handle} · ${u.server.substringAfter("://")}", size = 10.sp, color = T.dim, maxLines = 1)
                        }
                        Mono(
                            when (existing?.status) { Friend.FRIENDS -> "FRIENDS"; Friend.OUTGOING -> "SENT"; Friend.INCOMING -> "ASKED YOU"; else -> if (picked) "✓ PICKED" else "PICK" },
                            size = 10.sp, color = if (existing == null) T.amber else T.faint, bold = true,
                        )
                    }
                }
            }
            Section("Send a request") {
                Mono("HANDLE OR SERVER", size = 10.sp, color = T.dim, bold = true)
                Spacer(Modifier.height(4.dp))
                SearchField(target, { target = it.trim() }, "sam  or  gym.example.com", Modifier.fillMaxWidth(), keyboard = androidx.compose.ui.text.input.KeyboardType.Uri)
                Mono("A handle is looked up in the directory. A server URL works without one.", Modifier.padding(top = 4.dp), size = 9.sp, color = T.faint)
                Spacer(Modifier.height(12.dp))
                Row { Mono("NOTE (OPTIONAL)", Modifier.weight(1f), size = 10.sp, color = T.dim, bold = true); Mono("${note.length}/140", size = 9.sp, color = T.faint) }
                Spacer(Modifier.height(4.dp))
                SearchField(note, { note = it.take(140) }, "Hey, it's Sam from the gym", Modifier.fillMaxWidth(), singleLine = false, minHeight = 64.dp)
                Spacer(Modifier.height(14.dp))
                Mono("WHAT THEY'LL SEE ONCE THEY ACCEPT", size = 10.sp, color = T.dim, bold = true)
                Spacer(Modifier.height(6.dp))
                SharePicker(share, { share = it })
                so.addError?.let { Spacer(Modifier.height(10.dp)); Mono(it, size = 11.sp, color = T.down) }
                Spacer(Modifier.height(14.dp))
                TButton(if (busy) "Sending…" else "Send request", Modifier.fillMaxWidth(), primary = true, enabled = !busy && Social.target(target) != null) {
                    actions.addFriend(target, note, share)
                }
            }
        }
    }
}

// ═════════════════════════════ NOTIFICATIONS ═════════════════════════════

@Composable
fun NotificationsScreen(data: DataUi, actions: AppActions, now: Long, onBack: () -> Unit, onGo: (Route) -> Unit) {
    LaunchedEffect(Unit) { actions.loadNotifications(true) }
    val load = data.social.notifications
    val unread = data.social.unread
    Column(Modifier.fillMaxSize()) {
        BackBar("Notifications", onBack) {
            if (unread > 0) Mono("MARK READ", Modifier.clickable { actions.markNotificationsRead() }.padding(horizontal = 8.dp, vertical = 14.dp), size = 11.sp, color = T.amber, bold = true)
        }
        Box(Modifier.weight(1f)) {
            Loaded(load, "Notifications", onRetry = { actions.loadNotifications(true) }) { n ->
                RefreshColumn(load.loading, { actions.loadNotifications(true) }) {
                    if (n.items.isEmpty()) Column(Modifier.padding(16.dp)) { EmptyNote("ALL QUIET", "Friend requests, accepts, reactions and comments on your activity show up here.") }
                    n.items.sortedByDescending { it.at }.forEach { x ->
                        NotificationRow(x, now) {
                            when (x.kind) {
                                "request" -> { actions.socialSection(SocialUi.LIST); onBack() }
                                "reaction", "comment" -> { actions.socialSection(SocialUi.MINE); onBack() }
                                else -> onGo(Route.Friend(x.from.id))
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun notificationText(n: SocialNotification): String = when (n.kind) {
    "request" -> "sent you a friend request" + (n.text?.takeIf { it.isNotBlank() }?.let { ": “$it”" } ?: "")
    "accepted" -> "accepted your friend request"
    "reaction" -> "reacted ${n.emoji.orEmpty()} to your ${itemKind(n.item)}"
    "comment" -> "commented on your ${itemKind(n.item)}" + (n.text?.let { ": “$it”" } ?: "")
    else -> n.kind
}

private fun itemKind(id: String?) = when {
    id == null -> "activity"
    id.startsWith("pr:") -> "PR"
    id.startsWith("a:") -> "achievement"
    else -> "workout"
}

@Composable
private fun NotificationRow(n: SocialNotification, now: Long, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(if (n.read) T.bg else T.amber.copy(alpha = 0.05f)).clickable(onClick = onClick).heightIn(min = 60.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.padding(top = 12.dp).size(6.dp).background(if (n.read) T.bg else T.amber))
        Spacer(Modifier.width(8.dp))
        Avatar(n.from, 30.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Mono(n.from.display.uppercase(), size = 12.sp, bold = !n.read, maxLines = 1)
            Mono(notificationText(n), size = 11.sp, color = if (n.read) T.dim else T.text, maxLines = 3)
        }
        Spacer(Modifier.width(8.dp))
        Mono(Social.ago(n.at, now), size = 9.sp, color = T.faint)
    }
    Line()
}

// ═════════════════════════════ FRIEND PROFILE ═════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendProfileScreen(id: String, state: UiState, data: DataUi, actions: AppActions, now: Long, onBack: () -> Unit) {
    LaunchedEffect(id) { actions.loadFriend(id) }
    val so = data.social
    val friend = so.friends.data?.friends?.firstOrNull { it.id == id }
    val load = so.profile[id] ?: Load()
    val p = load.data?.profile
    val title = friend?.author?.display ?: p?.name ?: p?.handle?.let { "@$it" } ?: "Friend"
    val feed = so.friendFeed[id] ?: FeedUi()
    val cmp = so.compare[id] ?: Load()
    var sheet by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()
    rememberNearEnd(list, feed.next) { if (feed.next != null) actions.friendFeedMore(id) }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            BackBar(title, onBack) {
                // Up here, not under an endless feed.
                if (friend != null) Mono("UNFRIEND", Modifier.clickable { sheet = "unfriend" }.padding(horizontal = 8.dp, vertical = 14.dp), size = 11.sp, color = T.dim, bold = true)
            }
            Box(Modifier.weight(1f)) {
                if (p == null && load.error != null && friend == null) ErrorState(load.error, onRetry = { actions.loadFriend(id, true) })
                else PullToRefreshBox(isRefreshing = load.loading && p != null, onRefresh = { actions.loadFriend(id, true) }, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), state = list) {
                        if (load.error != null && p != null) item { StaleStrip(load.error, load.savedAt, now) }
                        item { ProfileHeader(friend, p, load.data?.stale == true, now) { sheet = it } }
                        when {
                            p == null && load.error != null -> item { Column(Modifier.padding(16.dp)) { Mono("Couldn't load their profile: ${load.error}", size = 11.sp, color = T.down) } }
                            p == null -> item { Box(Modifier.height(220.dp)) { LoadingState("Profile") } }
                            else -> item { ProfileBody(p, state) }
                        }
                        item {
                            when {
                                cmp.data != null -> CompareBlock(cmp.data, title)
                                cmp.loading -> Column(Modifier.padding(16.dp)) { Label("Compare"); Spacer(Modifier.height(8.dp)); Mono("LOADING…", size = 10.sp, color = T.amber) }
                                cmp.error != null -> Column(Modifier.padding(16.dp)) { Label("Compare"); Spacer(Modifier.height(8.dp)); Mono(cmp.error, size = 10.sp, color = T.dim) }
                            }
                        }
                        item {
                            Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp)) { Label("Activity", right = if (feed.stale.isNotEmpty()) "◌ CACHED" else null, rightColor = T.faint) }
                            Line()
                        }
                        when {
                            !feed.loaded && feed.error != null -> item { Column(Modifier.padding(16.dp)) { Mono(feed.error, size = 11.sp, color = T.down) } }
                            !feed.loaded -> item { Mono("LOADING…", Modifier.padding(16.dp), size = 10.sp, color = T.amber) }
                            feed.items.isEmpty() -> item { Column(Modifier.padding(16.dp)) { EmptyNote("NOTHING TO SHOW", "No activity they share with you yet.") } }
                        }
                        items(feed.items, key = { it.id }) { FeedCard(it, so.me.data?.server, now, actions, busy = so.busy, showAuthor = false) }
                        feedFooter(feed, { actions.friendFeedMore(id) }, "— START OF THEIR ACTIVITY —")

                    }
                }
            }
        }
        Sheet(sheet != null, { sheet = null }) {
            when (sheet) {
                "share" -> friend?.let { f ->
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 20.dp).verticalScroll(rememberScrollState())) {
                        Mono("WHAT ${f.author.display.uppercase()} SEES", size = 14.sp, color = T.amber, bold = true)
                        Spacer(Modifier.height(12.dp))
                        SharePicker(f.share, { lv -> if (lv != f.share) actions.setShare(f.id, lv); sheet = null }, name = f.author.display)
                    }
                }
                "unfriend" -> friend?.let { f ->
                    ConfirmBody(
                        "Unfriend ${f.author.display}?",
                        "Their server is told, you stop seeing each other's activity, and their reactions and comments on your items are removed. You can send a new request later.",
                        "Unfriend", onYes = { actions.unfriend(f.id); sheet = null; onBack() }, onNo = { sheet = null },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileHeader(f: Friend?, p: dev.ironterm.data.social.SocialProfile?, stale: Boolean, now: Long, onSheet: (String) -> Unit) {
    val author = f?.author ?: p?.let { dev.ironterm.data.social.Author("", it.server, it.handle, it.name) }
    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(author, 48.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Mono((author?.display ?: "").uppercase(), size = 16.sp, bold = true, maxLines = 1)
                Mono(author?.address.orEmpty(), size = 10.sp, color = T.dim, maxLines = 1)
                val since = f?.since?.takeIf { it.isNotBlank() }?.let { "FRIENDS SINCE ${Fmt.day(it.take(10)).substringAfter(' ')}" }
                val upd = p?.updatedAt?.takeIf { it.isNotBlank() }?.let { "UPDATED ${Social.ago(it, now)}" }
                Mono(listOfNotNull(since, upd).joinToString(" · "), size = 9.sp, color = T.faint, maxLines = 1)
                f?.fingerprint?.takeIf { it.isNotBlank() }?.let { Mono("KEY $it", size = 9.sp, color = T.faint, maxLines = 1) }
            }
        }
        if (stale) {
            Spacer(Modifier.height(8.dp))
            Mono("◌ Their server didn't answer: showing the last copy your server fetched.", size = 9.sp, color = T.faint)
        }
        if (f != null) {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f).border(1.dp, T.line).clickable { onSheet("share") }.padding(10.dp)) {
                    Mono("THEY SEE", size = 9.sp, color = T.faint)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Mono(Share.label(f.share), Modifier.weight(1f), size = 13.sp, color = T.amber, bold = true)
                        Mono("CHANGE ›", size = 9.sp, color = T.amber, bold = true)
                    }
                    Mono(Share.short(f.share), size = 9.sp, color = T.dim, maxLines = 2)
                }
                Column(Modifier.weight(1f).border(1.dp, T.line).padding(10.dp)) {
                    val theirs = p?.share ?: f.theirShare
                    Mono("YOU SEE", size = 9.sp, color = T.faint)
                    Mono(Share.label(theirs), size = 13.sp, color = T.up, bold = true)
                    Mono(Share.short(theirs), size = 9.sp, color = T.dim, maxLines = 2)
                }
            }
        }
    }
    Line()
}

@Composable
private fun ProfileBody(p: dev.ironterm.data.social.SocialProfile, state: UiState) {
    val days = remember(p.graph) { Social.graphDays(p.graph) }
    if (days.isNotEmpty()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Label("Year", right = "${Fmt.n(p.sessions52)} SESSIONS / 52W")
            Spacer(Modifier.height(10.dp))
            ContributionGraph(days, java.time.LocalDate.now().toString(), state.theme)
            Spacer(Modifier.height(6.dp))
            Row { Spacer(Modifier.weight(1f)); GraphLegend(state.theme) }
        }
        Line()
    }
    Row(Modifier.fillMaxWidth().padding(16.dp)) {
        Stat("Streak", "${p.streak.current} WK", Modifier.weight(1f), sub = "BEST ${p.streak.best}", valueColor = T.amber)
        Stat("This week", "${p.week.done}/${p.week.target}", Modifier.weight(1f), sub = if (p.week.target > 0 && p.week.done >= p.week.target) "DONE" else "SESSIONS", subColor = if (p.week.target > 0 && p.week.done >= p.week.target) T.up else T.dim)
        Stat("52 weeks", Fmt.n(p.sessions52), Modifier.weight(1f), sub = "SESSIONS")
    }
    Line()
    if (p.lifts.isNotEmpty()) {
        Section("Lifts", right = p.unit?.uppercase() ?: "LEVELS ONLY") {
            val shared = p.lifts.any { it.e1rm != null || it.best != null }
            TRow(listOf("LIFT", "E1RM", "BEST"), listOf(1.6f, 1f, 1f), header = true)
            p.lifts.forEach { l ->
                TRow(listOf(l.name.uppercase(), l.e1rm?.let(Fmt::w) ?: "—", l.best?.let(Fmt::w) ?: "—"), listOf(1.6f, 1f, 1f), listOf(T.text, T.amber, T.dim))
            }
            if (!shared) Mono("They share at BASIC: lift names only. Numbers appear at LIFTS and FULL.", Modifier.padding(top = 6.dp), size = 9.sp, color = T.faint)
            p.bodyweight?.let { Mono("BODYWEIGHT ${Fmt.w(it)} ${p.unit?.uppercase().orEmpty()}", Modifier.padding(top = 6.dp), size = 10.sp, color = T.dim) }
        }
    }
    p.program?.takeIf { it.isNotBlank() }?.let { Section("Program") { Mono(it.uppercase(), size = 13.sp, bold = true) } }
}
