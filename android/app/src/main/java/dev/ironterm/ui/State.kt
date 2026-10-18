package dev.ironterm.ui

import dev.ironterm.data.app.AppBody
import dev.ironterm.data.app.AppCalendar
import dev.ironterm.data.app.AppGym
import dev.ironterm.data.app.AppHome
import dev.ironterm.data.app.AppInsights
import dev.ironterm.data.app.AppLiftDetail
import dev.ironterm.data.app.AppLiftList
import dev.ironterm.data.app.AppProgram
import dev.ironterm.data.app.AppStats
import dev.ironterm.data.app.AppWorkout
import dev.ironterm.data.app.Load
import dev.ironterm.data.app.NotesEdit
import dev.ironterm.data.app.WorkoutSummary
import dev.ironterm.gym.GymState
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.PickItem

/** A screen pushed on top of a tab (details and the MORE screens). */
sealed interface Route {
    data class Lift(val key: String) : Route
    data class Workout(val id: String) : Route
    data object Calendar : Route
    data object Program : Route
    /** program catalog (BROWSE PROGRAMS) and one program's page */
    data object Programs : Route
    data class ProgramPage(val id: String) : Route
    data object Body : Route
    data object Insights : Route
    data object Stats : Route
    data object Setup : Route
    data object Gallery : Route
    /** LIFTS / FRIENDS when they aren't in the bottom bar (see [Tabs.bar]) */
    data object Lifts : Route
    data object Friends : Route
    data class Friend(val id: String) : Route
    data object AddFriend : Route
    data object Notifications : Route
}

/** HISTORY list: paged, searchable, filterable by a day picked on the year graph. */
data class HistoryUi(
    val items: List<WorkoutSummary> = emptyList(),
    val next: String? = null,
    val total: Int = 0,
    val query: String = "",
    val day: String? = null,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val loaded: Boolean = false,
    val needsServer: Boolean = false,
)

/** Every screen document the app shows, as [Load] states. */
data class DataUi(
    val home: Load<AppHome> = Load(),
    val gym: Load<AppGym> = Load(),
    val lifts: Load<AppLiftList> = Load(),
    val lift: Map<String, Load<AppLiftDetail>> = emptyMap(),
    val history: HistoryUi = HistoryUi(),
    val workout: Map<String, Load<AppWorkout>> = emptyMap(),
    val calendar: Map<String, Load<AppCalendar>> = emptyMap(),
    val program: Load<AppProgram> = Load(),
    val programs: Load<dev.ironterm.data.app.ProgramCatalog> = Load(),
    /** keyed by ProgramBrowse.detailKey(id, options) */
    val programDetail: Map<String, Load<dev.ironterm.data.app.ProgramDetail>> = emptyMap(),
    /** keyed by ProgramBrowse.bodyKey(id, options, mode) */
    val programBody: Map<String, Load<dev.ironterm.data.app.ProgramBody>> = emptyMap(),
    val startingProgram: Boolean = false,
    /** POST start failed: shown in the start sheet */
    val startError: String? = null,
    val body: Map<String, Load<AppBody>> = emptyMap(),
    val insights: Load<AppInsights> = Load(),
    val stats: Load<AppStats> = Load(),
    /** exercise picker rows for ADD EXERCISE */
    val picker: List<PickItem> = emptyList(),
    /** best e1RM per lift key (from LIFTS), to flag PRs in the finish summary */
    val bests: Map<String, Double> = emptyMap(),
    val savingNotes: Boolean = false,
    val pushing: Boolean = false,
    val starting: Boolean = false,
    /** one-shot message (snackbar) */
    val toast: String? = null,
    val social: SocialUi = SocialUi(),
)

/** A paged feed (merged friends feed, one friend's feed, or my own items). */
data class FeedUi(
    val items: List<dev.ironterm.data.social.FeedItem> = emptyList(),
    val next: String? = null,
    /** friend ids the server served from its cache */
    val stale: List<String> = emptyList(),
    /** friend ids that couldn't be reached at all */
    val unreachable: List<String> = emptyList(),
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val loaded: Boolean = false,
    val savedAt: Long = 0,
)

data class SearchUi(val query: String = "", val users: List<dev.ironterm.data.social.DirectoryUser> = emptyList(), val loading: Boolean = false, val error: String? = null)

/** FRIENDS: everything social, from /api/social. */
data class SocialUi(
    val me: Load<dev.ironterm.data.social.SocialMe> = Load(),
    val friends: Load<dev.ironterm.data.social.FriendList> = Load(),
    val feed: FeedUi = FeedUi(),
    val mine: FeedUi = FeedUi(),
    val profile: Map<String, Load<dev.ironterm.data.social.ProfileDoc>> = emptyMap(),
    val compare: Map<String, Load<dev.ironterm.data.social.Compare>> = emptyMap(),
    val friendFeed: Map<String, FeedUi> = emptyMap(),
    val notifications: Load<dev.ironterm.data.social.NotificationList> = Load(),
    val search: SearchUi = SearchUi(),
    /** actions in flight: "setup", "add", "accept:<id>", "share:<id>", "comment:<item>", … */
    val busy: Set<String> = emptySet(),
    val setupError: String? = null,
    val addError: String? = null,
    /** bumped when ADD FRIEND succeeded (the screen pops back) */
    val added: Int = 0,
    /** FRIENDS screen section: feed | friends | mine */
    val section: String = SocialUi.FEED,
) {
    companion object {
        const val FEED = "feed"
        const val LIST = "friends"
        const val MINE = "mine"
    }

    val unread: Int get() = notifications.data?.unread ?: me.data?.unread ?: 0
    val incoming: Int get() = friends.data?.incoming?.size ?: 0
}

data class GymPrefs(val keepScreenOn: Boolean = true, val restSound: Boolean = true, val restVibrate: Boolean = true, val defaultRest: Int = 90)

data class GymUi(val state: GymState = GymState(), val prefs: GymPrefs = GymPrefs())

/** Everything the UI can ask for. Default no-ops so previews and screenshot tests pass [AppActions.None]. */
interface AppActions {
    // connection / setup
    fun refresh() {}
    fun test(mode: dev.ironterm.data.SourceMode, serverUrl: String, token: String, apiKey: String) {}
    fun connectServer(serverUrl: String, token: String) {}
    fun connectDirect(apiKey: String, unit: String, weeklyTarget: Int) {}
    fun setTheme(theme: dev.ironterm.widget.ColorTheme) {}
    fun disconnect() {}
    fun clearTest() {}
    fun scanQr() {}
    fun checkUpdates() {}
    fun startUpdate() {}
    fun allowInstalls() {}
    /** "Advanced setup (web)": program choice and lift mapping, in a Custom Tab. */
    fun openWeb(path: String) {}

    // screen data
    fun load(screen: String, force: Boolean = false) {}
    fun loadLift(key: String, force: Boolean = false) {}
    fun loadWorkout(id: String, force: Boolean = false) {}
    fun loadCalendar(month: String?, force: Boolean = false) {}
    fun loadBody(mode: String, force: Boolean = false) {}
    fun historyMore() {}
    fun historySearch(q: String) {}
    fun historyDay(date: String?) {}
    fun saveNotes(id: String, edit: NotesEdit) {}
    fun pushRoutines() {}
    fun loadPrograms(force: Boolean = false) {}
    fun loadProgramDetail(id: String, options: Map<String, String> = emptyMap(), force: Boolean = false) {}
    /** [mode]: "load" | "gaps" */
    fun loadProgramBody(id: String, options: Map<String, String> = emptyMap(), mode: String = "load", force: Boolean = false) {}
    /** POST start; [onDone] runs after the server switched (the UI then shows PROGRAM). */
    fun startProgram(id: String, body: dev.ironterm.data.app.ProgramStartBody, onDone: () -> Unit = {}) {}
    fun clearStartError() {}
    fun toastShown() {}

    // gym
    fun gymStart(dayIndex: Int?, empty: Boolean) {}
    fun gym(f: (LiveSession) -> LiveSession) {}
    fun gymFinish() {}
    fun gymDiscard() {}
    fun gymRetry() {}
    fun gymDismissSummary() {}
    fun gymRestoreFailed() {}
    fun gymDropFailed() {}
    fun setGymPrefs(p: GymPrefs) {}

    // social (FRIENDS)
    /** /me, then friends, feed and notifications when social is set up */
    fun socialLoad(force: Boolean = false) {}
    fun socialSection(section: String) {}
    fun socialSetup(handle: String, name: String, listed: Boolean) {}
    /** pull to refresh: ?fresh=1 */
    fun feedRefresh() {}
    fun feedMore() {}
    fun react(item: dev.ironterm.data.social.FeedItem, emoji: String) {}
    fun comment(item: dev.ironterm.data.social.FeedItem, text: String) {}
    fun directorySearch(q: String) {}
    /** [target]: a handle or a server URL */
    fun addFriend(target: String, note: String, share: String) {}
    fun acceptFriend(id: String, share: String) {}
    fun rejectFriend(id: String) {}
    fun setShare(id: String, share: String) {}
    fun unfriend(id: String) {}
    fun loadFriend(id: String, force: Boolean = false) {}
    fun friendFeedMore(id: String) {}
    fun loadMine(force: Boolean = false) {}
    fun mineMore() {}
    fun loadNotifications(force: Boolean = false) {}
    fun markNotificationsRead() {}

    companion object { val None = object : AppActions {} }
}

object Screens {
    const val HOME = "home"
    const val GYM = "gym"
    const val LIFTS = "lifts"
    const val HISTORY = "history"
    const val PROGRAM = "program"
    const val INSIGHTS = "insights"
    const val STATS = "stats"
}
