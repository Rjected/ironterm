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
    data object Body : Route
    data object Insights : Route
    data object Stats : Route
    data object Setup : Route
    data object Gallery : Route
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
)

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
