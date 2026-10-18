package dev.ironterm.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.ironterm.BuildConfig
import dev.ironterm.data.ConnectCode
import dev.ironterm.update.ApkDownloader
import dev.ironterm.update.CheckResult
import dev.ironterm.update.InstallStatusReceiver
import dev.ironterm.update.Installer
import dev.ironterm.update.ReleaseParser
import dev.ironterm.update.UpdateChecker
import dev.ironterm.update.UpdateInfo
import dev.ironterm.update.UpdateStore
import java.io.File
import dev.ironterm.data.ConnectLink
import dev.ironterm.data.RefreshResult
import dev.ironterm.data.Refresher
import dev.ironterm.data.Settings
import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SourceMode
import dev.ironterm.data.SyncStatus
import dev.ironterm.data.normalizeServerUrl
import dev.ironterm.data.direct.WorkoutsRepository
import dev.ironterm.widget.ColorTheme
import dev.ironterm.widget.Widgets
import dev.ironterm.work.SyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import dev.ironterm.Fmt
import dev.ironterm.data.app.*
import dev.ironterm.gym.*

data class UiState(
    val snapshot: Snapshot? = null,
    val mode: SourceMode = SourceMode.NONE,
    val serverUrl: String = "",
    val token: String = "",
    val apiKey: String = "",
    val theme: ColorTheme = ColorTheme.BLUE,
    val unit: String = "kg",
    val weeklyTarget: Int = 3,
    val loading: Boolean = false,
    val status: SyncStatus = SyncStatus(),
    val testing: Boolean = false,
    /** result of TEST CONNECTION: null = not run, "" = ok, else the error */
    val testResult: String? = null,
    /** one-shot message shown in SETUP (e.g. after a deep link) */
    val notice: String? = null,
    /** show [notice] as an error (red) */
    val noticeError: Boolean = false,
    val goToday: Boolean = false,
    val update: UpdateUi = UpdateUi(),
) {
    val configured: Boolean get() = when (mode) {
        SourceMode.SERVER -> serverUrl.isNotBlank() && token.isNotBlank()
        SourceMode.DIRECT -> apiKey.isNotBlank()
        SourceMode.NONE -> false
    }
    val authError: Boolean get() = status.authError
}

enum class UpdatePhase { IDLE, DOWNLOADING, NEEDS_PERMISSION, INSTALLING }

/** In-app updater state (GitHub Releases). */
data class UpdateUi(
    val available: UpdateInfo? = null,
    val phase: UpdatePhase = UpdatePhase.IDLE,
    /** 0..1, or -1 when the size is unknown */
    val progress: Float = 0f,
    val checking: Boolean = false,
    val message: String? = null,
    val lastCheckAt: Long = 0,
)

class AppViewModel(app: Application) : AndroidViewModel(app), AppActions {
    private val settings = Settings.get(app)
    private val store = SnapshotStore.get(app)
    private val refresher get() = Refresher(settings, store, getApplication<Application>().filesDir)

    private val updates = UpdateStore(app)
    private var downloaded: File? = null

    private val _state = MutableStateFlow(load().copy(update = UpdateUi(
        available = updates.available?.takeIf { ReleaseParser.isNewer(it, BuildConfig.VERSION_CODE) },
        lastCheckAt = updates.lastCheckAt,
    )))

    init {
        InstallStatusReceiver.listener = { msg -> setUpdate { copy(phase = UpdatePhase.IDLE, message = msg) } }
    }

    private fun setUpdate(f: UpdateUi.() -> UpdateUi) = _state.update { it.copy(update = it.update.f()) }

    /** On app open: at most every 6 hours. */
    fun checkUpdatesIfDue() {
        if (System.currentTimeMillis() - updates.lastCheckAt > UpdateStore.CHECK_EVERY_MS) check(manual = false)
    }

    override fun checkUpdates() = check(manual = true)

    private fun check(manual: Boolean) {
        if (_state.value.update.checking) return
        setUpdate { copy(checking = true, message = null) }
        viewModelScope.launch {
            val r = UpdateChecker(BuildConfig.UPDATE_REPO, BuildConfig.VERSION_CODE).check()
            val now = System.currentTimeMillis()
            if (r !is CheckResult.Failed) updates.lastCheckAt = now
            when (r) {
                is CheckResult.Available -> { updates.available = r.info; setUpdate { copy(checking = false, available = r.info, lastCheckAt = now) } }
                CheckResult.UpToDate -> { updates.available = null; setUpdate { copy(checking = false, available = null, lastCheckAt = now, message = if (manual) "Up to date (v${BuildConfig.VERSION_CODE})." else null) } }
                is CheckResult.Failed -> setUpdate { copy(checking = false, message = if (manual) r.message else message) }
            }
        }
    }

    override fun startUpdate() {
        val info = _state.value.update.available ?: return
        val ctx = getApplication<Application>()
        if (!Installer.canInstall(ctx)) { setUpdate { copy(phase = UpdatePhase.NEEDS_PERMISSION, message = null) }; return }
        if (_state.value.update.phase == UpdatePhase.DOWNLOADING) return
        viewModelScope.launch {
            try {
                val apk = downloaded?.takeIf { it.exists() && it.name.contains("-${info.versionCode}.") }
                    ?: run {
                        setUpdate { copy(phase = UpdatePhase.DOWNLOADING, progress = 0f, message = null) }
                        ApkDownloader.download(ctx, info) { p -> setUpdate { copy(progress = p) } }.also { downloaded = it }
                    }
                setUpdate { copy(phase = UpdatePhase.INSTALLING) }
                Installer.install(ctx, apk)
            } catch (e: Exception) {
                setUpdate { copy(phase = UpdatePhase.IDLE, message = "Update failed: ${e.message ?: e.javaClass.simpleName}") }
            }
        }
    }

    override fun allowInstalls() {
        val ctx = getApplication<Application>()
        ctx.startActivity(Installer.permissionIntent(ctx))
    }

    /** Back from the "install unknown apps" settings page: carry on if it was granted. */
    fun resumeUpdateIfAllowed() {
        val u = _state.value.update
        if (u.phase == UpdatePhase.NEEDS_PERMISSION && Installer.canInstall(getApplication())) startUpdate()
        if (u.phase == UpdatePhase.INSTALLING) setUpdate { copy(phase = UpdatePhase.IDLE) } // dialog dismissed or done
    }

    val state: StateFlow<UiState> = _state

    private fun load() = UiState(
        snapshot = store.read(),
        mode = settings.mode,
        serverUrl = settings.serverUrl.orEmpty(),
        token = settings.appToken.orEmpty(),
        apiKey = settings.apiKey.orEmpty(),
        theme = ColorTheme.fromName(settings.themeName),
        unit = settings.directUnit,
        weeklyTarget = settings.weeklyTarget,
        status = store.status(),
    )

    private fun reload(transform: UiState.() -> UiState = { this }) {
        val fresh = load()
        _state.update { cur -> fresh.copy(loading = cur.loading, testing = cur.testing, testResult = cur.testResult, notice = cur.notice, noticeError = cur.noticeError, goToday = cur.goToday, update = cur.update).transform() }
    }

    override fun refresh() = refresh(afterConnect = false)

    private fun refresh(afterConnect: Boolean) {
        if (!settings.isConfigured || _state.value.loading) return
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val r = refresher.refresh()
            Widgets.updateAll(getApplication())
            if (r is RefreshResult.Ok) afterSnapshot()
            reload {
                when {
                    !afterConnect -> copy(loading = false)
                    r is RefreshResult.Ok -> copy(loading = false, notice = null, noticeError = false, goToday = true)
                    r is RefreshResult.Failed -> copy(loading = false, notice = "Couldn't connect: ${r.message}", noticeError = true)
                    else -> copy(loading = false)
                }
            }
        }
    }

    /** MainActivity switches to TODAY once, after a successful connect. */
    fun consumeGoToday() = _state.update { it.copy(goToday = false) }

    override fun test(mode: SourceMode, serverUrl: String, token: String, apiKey: String) {
        _state.update { it.copy(testing = true, testResult = null) }
        viewModelScope.launch {
            val err = refresher.test(mode, serverUrl.trim(), token.trim(), apiKey.trim())
            _state.update { it.copy(testing = false, testResult = err ?: "") }
        }
    }

    override fun clearTest() = _state.update { it.copy(testResult = null, notice = null, noticeError = false) }

    override fun connectServer(serverUrl: String, token: String) {
        val url = normalizeServerUrl(serverUrl) ?: run {
            _state.update { it.copy(testResult = "Invalid server URL") }; return
        }
        settings.connectServer(url, token.trim())
        afterConnect()
    }

    override fun connectDirect(apiKey: String, unit: String, weeklyTarget: Int) {
        settings.directUnit = unit
        settings.weeklyTarget = weeklyTarget
        settings.connectDirect(apiKey.trim())
        afterConnect()
    }

    fun showNotice(msg: String, error: Boolean = false) = _state.update { it.copy(notice = msg, noticeError = error) }

    /** Text from the QR scanner: same flow as the deep link. */
    fun onScanned(text: String?) {
        when (val r = ConnectCode.handle(text)) {
            is ConnectCode.Result.Connect -> connectFromLink(r.link)
            is ConnectCode.Result.Invalid -> showNotice(r.message, error = true)
        }
    }

    fun connectFromLink(link: ConnectLink) {
        _state.update { it.copy(notice = "Connecting to ${link.server}…", noticeError = false) }
        settings.connectServer(link.server, link.token)
        afterConnect()
    }

    private fun afterConnect() {
        store.clear() // never show the previous source's data under the new one
        appCache.clear()
        _data.value = DataUi()
        reload { copy(snapshot = null, testResult = null) }
        SyncWorker.schedulePeriodic(getApplication())
        refresh(afterConnect = true)
    }

    override fun setTheme(theme: ColorTheme) {
        settings.themeName = theme.name
        reload()
        viewModelScope.launch { Widgets.updateAll(getApplication()) }
    }

    override fun disconnect() {
        settings.disconnect()
        store.clear()
        WorkoutsRepository(getApplication<Application>().filesDir).clear()
        SyncWorker.cancelPeriodic(getApplication())
        appCache.clear()
        _data.value = DataUi()
        reload { copy(snapshot = null, testResult = null) }
        viewModelScope.launch { Widgets.updateAll(getApplication()) }
    }

    // ═════════════════════════════ screen data ═════════════════════════════

    private val appCache = AppCache.get(app)
    private val repo = AppRepo.get(app)
    private val _data = MutableStateFlow(initialData())
    val data: StateFlow<DataUi> = _data

    private fun setData(f: DataUi.() -> DataUi) = _data.update { it.f() }

    /** Open instantly from the disk cache; screens refresh in the background. */
    private fun initialData(): DataUi {
        if (settings.mode != SourceMode.SERVER) return DataUi()
        return DataUi(
            home = repo.cached("home", AppHome.serializer()) ?: Load(),
            lifts = repo.cached("lifts", AppLiftList.serializer()) ?: Load(),
            gym = repo.cached("gym", AppGym.serializer()) ?: Load(),
            program = repo.cached("program", AppProgram.serializer()) ?: Load(),
        )
    }

    private fun maxAge(screen: String) = when (screen) {
        Screens.GYM -> 0L
        Screens.HOME, Screens.HISTORY -> 2 * 60_000L
        else -> 10 * 60_000L
    }

    private fun <T> run(
        get: DataUi.() -> Load<T>,
        put: DataUi.(Load<T>) -> DataUi,
        force: Boolean,
        block: suspend (Boolean) -> Load<T>,
    ) {
        val cur = _data.value.get()
        if (cur.loading) return
        setData { put(cur.copy(loading = true)) }
        viewModelScope.launch {
            val r = try { block(force) } catch (e: Exception) { Load(data = cur.data, savedAt = cur.savedAt, error = friendly(e)) }
            setData { put(r) }
            if (r.auth) reload { copy(status = status.copy(authError = true, lastError = r.error, lastAttemptAt = System.currentTimeMillis())) }
        }
    }

    private fun direct() = repo.direct()

    override fun load(screen: String, force: Boolean) {
        when (screen) {
            Screens.HOME -> run({ home }, { copy(home = it) }, force) { f ->
                repo.load("home", AppHome.serializer(), f, maxAge(screen), { d -> _state.value.snapshot?.let(d::home) }) { it.home() }
            }
            Screens.LIFTS -> run({ lifts }, { l -> copy(lifts = l, bests = l.data?.lifts?.associate { it.key to it.best } ?: bests) }, force) { f ->
                repo.load("lifts", AppLiftList.serializer(), f, maxAge(screen), { it.lifts() }) { it.lifts() }
            }
            Screens.PROGRAM -> run({ program }, { copy(program = it) }, force) { f -> repo.load("program", AppProgram.serializer(), f, maxAge(screen), null) { it.program() } }
            Screens.INSIGHTS -> run({ insights }, { copy(insights = it) }, force) { f -> repo.load("insights", AppInsights.serializer(), f, maxAge(screen), null) { it.insights() } }
            Screens.STATS -> run({ stats }, { copy(stats = it) }, force) { f -> repo.load("stats", AppStats.serializer(), f, maxAge(screen), null) { it.stats() } }
            Screens.HISTORY -> if (force || !_data.value.history.loaded) loadHistory(reset = true)
            Screens.GYM -> loadGym(force)
        }
    }

    override fun loadLift(key: String, force: Boolean) = run({ lift[key] ?: Load() }, { copy(lift = lift + (key to it)) }, force) { f ->
        repo.load("lift_$key", AppLiftDetail.serializer(), f, maxAge(Screens.LIFTS), { it.lift(key) }) { it.lift(key) }
    }

    override fun loadWorkout(id: String, force: Boolean) = run({ workout[id] ?: Load() }, { copy(workout = workout + (id to it)) }, force) { f ->
        repo.load("workout_$id", AppWorkout.serializer(), f, 60 * 60_000L, { it.workout(id) }) { it.workout(id) }
    }

    override fun loadCalendar(month: String?, force: Boolean) {
        val m = month ?: java.time.LocalDate.now().toString().take(7)
        run({ calendar[m] ?: Load() }, { copy(calendar = calendar + (m to it)) }, force) { f ->
            repo.load("calendar_$m", AppCalendar.serializer(), f, maxAge("calendar"), null) { it.calendar(m) }
        }
    }

    override fun loadBody(mode: String, force: Boolean) = run({ body[mode] ?: Load() }, { copy(body = body + (mode to it)) }, force) { f ->
        repo.load("body_$mode", AppBody.serializer(), f, 30 * 60_000L, null) { it.body(mode) }
    }

    // ── history ──

    private var historyJob: kotlinx.coroutines.Job? = null

    private suspend fun historyPage(cursor: String?, q: String): AppHistory = when (settings.mode) {
        SourceMode.SERVER -> repo.api()?.history(cursor, 30, q.ifBlank { null }) ?: throw java.io.IOException("Not connected")
        SourceMode.DIRECT -> direct().history(cursor, 30, q)
        SourceMode.NONE -> throw java.io.IOException("Not connected. Open SETUP.")
    }

    private fun loadHistory(reset: Boolean) {
        val h = _data.value.history
        if (!reset && (h.next == null || h.loadingMore || h.loading)) return
        historyJob?.cancel()
        setData { copy(history = if (reset) history.copy(loading = true, error = null) else history.copy(loadingMore = true, error = null)) }
        historyJob = viewModelScope.launch {
            try {
                val q = _data.value.history.query
                val page = historyPage(if (reset) null else h.next, q)
                setData {
                    copy(history = history.copy(
                        items = if (reset) page.workouts else (history.items + page.workouts).distinctBy { it.id },
                        next = page.next, total = page.total, loading = false, loadingMore = false, loaded = true, error = null,
                    ))
                }
                // A day picked on the graph that's older than what's loaded: keep paging (bounded).
                val day = _data.value.history.day
                val hist = _data.value.history
                if (day != null && hist.next != null && hist.items.none { it.date == day } && (hist.items.lastOrNull()?.date ?: "") > day && hist.items.size < 600) loadHistory(reset = false)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                setData { copy(history = history.copy(loading = false, loadingMore = false, error = friendly(e), loaded = history.loaded)) }
            }
        }
    }

    override fun historyMore() = loadHistory(reset = false)

    override fun historySearch(q: String) {
        if (q == _data.value.history.query) return
        setData { copy(history = history.copy(query = q)) }
        viewModelScope.launch {
            kotlinx.coroutines.delay(300)
            if (_data.value.history.query == q) loadHistory(reset = true)
        }
    }

    override fun historyDay(date: String?) {
        setData { copy(history = history.copy(day = date)) }
        val h = _data.value.history
        if (date != null && h.items.none { it.date == date } && h.next != null) loadHistory(reset = false)
    }

    override fun saveNotes(id: String, edit: NotesEdit) {
        val api = repo.api() ?: run { setData { copy(toast = "Editing notes needs the server.") }; return }
        setData { copy(savingNotes = true) }
        viewModelScope.launch {
            try {
                api.saveNotes(id, edit)
                setData { copy(savingNotes = false, toast = "Notes saved") }
                loadWorkout(id, force = true)
                loadHistory(reset = true)
            } catch (e: Exception) {
                setData { copy(savingNotes = false, toast = "Couldn't save notes: ${friendly(e)}") }
            }
        }
    }

    override fun pushRoutines() {
        val api = repo.api() ?: return
        setData { copy(pushing = true) }
        viewModelScope.launch {
            val msg = try { api.pushRoutines(); "Routines pushed to Hevy" } catch (e: Exception) { "Push failed: ${friendly(e)}" }
            setData { copy(pushing = false, toast = msg) }
            load(Screens.PROGRAM, force = true)
        }
    }

    override fun toastShown() = setData { copy(toast = null) }

    /** A new snapshot arrived (sync / finish): documents derived from history are stale. */
    private fun afterSnapshot() {
        if (settings.mode == SourceMode.DIRECT) {
            load(Screens.HOME, force = true)
            load(Screens.LIFTS, force = true)
            loadHistory(reset = true)
        }
    }

    // ═════════════════════════════ gym ═════════════════════════════

    val gymStore = Gym.store(app)
    private val _gymPrefs = MutableStateFlow(prefs())
    val gym: StateFlow<GymUi> = combine(gymStore.state, _gymPrefs) { st, p -> GymUi(st, p) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, GymUi(gymStore.state.value, _gymPrefs.value))

    private fun prefs() = GymPrefs(settings.keepScreenOn, settings.restSound, settings.restVibrate, settings.defaultRest)

    init {
        // A FINISH reached the server: refresh what it changed.
        viewModelScope.launch {
            gymStore.state.map { it.summary?.state }.distinctUntilChanged().collect { st ->
                if (st == FinishState.SAVED) {
                    load(Screens.HOME, force = true)
                    load(Screens.LIFTS, force = true)
                    load(Screens.GYM, force = true)
                    loadHistory(reset = true)
                    refresh()
                }
            }
        }
    }

    private var templates: List<HevyTemplate>? = null

    private fun loadGym(force: Boolean) {
        when (settings.mode) {
            SourceMode.DIRECT -> {
                setData { copy(gym = Load.of(AppGym(unit = settings.directUnit)), picker = direct().catalog()) }
                return
            }
            SourceMode.NONE -> { setData { copy(gym = Load.failed("Not connected. Open SETUP.")) }; return }
            SourceMode.SERVER -> Unit
        }
        run({ gym }, { g -> copy(gym = g, picker = picker(g.data)) }, force) { f ->
            val r = repo.server("gym", AppGym.serializer(), f, 0L) { it.gym() }
            if (r.error == null) r.data?.live?.let { gymStore.adopt(it) }
            if (templates == null) templates = runCatching { repo.api()?.templates() }.getOrNull()
            r
        }
        if (_data.value.bests.isEmpty()) load(Screens.LIFTS)
    }

    /** Server picker: cardio (real Hevy templates when the server has them), the lift library, other Hevy exercises. */
    private fun picker(g: AppGym?): List<PickItem> {
        val tpls = templates.orEmpty()
        val cardio = PickItem.cardio().map { c -> tpls.firstOrNull { it.title == c.name }?.let { c.copy(templateId = it.id) } ?: c }
        val lib = g?.catalog?.takeIf { it.isNotEmpty() }?.map(PickItem::fromCatalog) ?: PickItem.library()
        val known = LiftLibrary.all.flatMap { it.hevy }.map { it.lowercase() }.toSet() + PickItem.CARDIO.map { it.lowercase() }
        val other = tpls.filter { it.title.lowercase() !in known }.map { PickItem("custom", it.title, it.equipment ?: "Hevy", "machine", title = it.title, templateId = it.id) }
        return cardio + lib + other
    }

    override fun gymStart(dayIndex: Int?, empty: Boolean) {
        if (_data.value.starting) return
        val unit = _data.value.gym.data?.unit ?: if (settings.mode == SourceMode.DIRECT) settings.directUnit else "kg"
        if (settings.mode != SourceMode.SERVER) {
            gymStore.start(Live.emptySession(unit), onServer = false)
            return
        }
        val api = repo.api() ?: return
        setData { copy(starting = true) }
        viewModelScope.launch {
            try {
                val s = api.startGym(dayIndex, empty)
                gymStore.start(s, onServer = true)
                setData { copy(starting = false) }
            } catch (e: Exception) {
                if (!e.isRetryable()) { setData { copy(starting = false, toast = "Couldn't start: ${friendly(e)}") }; return@launch }
                // Offline: start locally from the cached plan; it's uploaded when the network is back.
                val g = _data.value.gym.data
                val plan = g?.plan
                val next = g?.next
                val day = g?.days?.firstOrNull { it.dayName == next?.dayName }
                val s = when {
                    empty || g == null -> null
                    // the server's own plan: the same session sessionFromPlan builds on the server
                    plan != null && (dayIndex == null || dayIndex == plan.dayIndex) -> Live.sessionFromPlan(plan, g.unit, g.programName ?: "Program")
                    // older servers: the snapshot-shaped next session
                    plan == null && next != null && (dayIndex == null || dayIndex == day?.dayIndex) -> offlinePlan(next, day, g.unit, g.programName ?: "Program")
                    else -> null
                }
                if (!empty && s == null) { setData { copy(starting = false, toast = "Offline: only today's session or an empty workout can start without the server.") }; return@launch }
                gymStore.start(s ?: Live.emptySession(unit), onServer = false)
                setData { copy(starting = false, toast = "Offline · started locally, will upload when back online") }
            }
        }
    }

    /** The cached next session (snapshot shape) as a plan. No per-exercise rest in that shape: tier defaults. */
    private fun offlinePlan(n: dev.ironterm.data.NextSession, day: dev.ironterm.data.app.GymDay?, unit: String, program: String): LiveSession {
        val plan = PlannedSession(
            dayIndex = day?.dayIndex ?: 0, dayId = day?.dayId ?: n.dayName.substringBefore(" ·").removePrefix("Day ").trim(), dayName = n.dayName, weekName = n.weekName,
            exercises = n.exercises.map { e ->
                PlannedExercise(
                    lift = e.lift, tier = e.tier, scheme = e.scheme,
                    restSeconds = when (e.tier) { "T1", "MAIN" -> 180; "T2", "SUPP" -> 120; else -> 90 },
                    sets = e.sets.map { PlannedSet(weight = it.weight, reps = it.reps, repsMax = it.repsMax, amrap = it.amrap, rpe = it.rpe) },
                )
            },
        )
        return Live.sessionFromPlan(plan, unit, program)
    }

    override fun gym(f: (LiveSession) -> LiveSession) = gymStore.update(f)

    override fun gymFinish() {
        val s = gymStore.session ?: return
        gymStore.finish(prLines(s, _data.value.bests))
    }

    override fun gymDiscard() = gymStore.discard()
    override fun gymRetry() = gymStore.retry()
    override fun gymDismissSummary() = gymStore.dismissSummary()
    override fun gymRestoreFailed() = gymStore.restoreFailed()
    override fun gymDropFailed() = gymStore.dropFailed()

    override fun setGymPrefs(p: GymPrefs) {
        settings.keepScreenOn = p.keepScreenOn
        settings.restSound = p.restSound
        settings.restVibrate = p.restVibrate
        settings.defaultRest = p.defaultRest
        _gymPrefs.value = prefs()
    }

    /** App opened with a session on disk (e.g. after process death): bring the timer service back. */
    fun ensureGymService() {
        if (gymStore.session != null) RestTimerService.start(getApplication())
        if (gymStore.state.value.outbox.isNotEmpty()) gymStore.retry()
    }

    companion object {
        /** Done sets whose e1RM beats the best known before this session. */
        fun prLines(s: LiveSession, bests: Map<String, Double>): List<String> = s.exercises.mapNotNull { ex ->
            val best = bests[ex.lift] ?: return@mapNotNull null
            val top = ex.sets.filter { it.done && it.type != SetType.WARMUP && (it.weight ?: 0.0) > 0 && (it.reps ?: 0) in 1..12 }
                .maxByOrNull { Live.e1rm(it.weight!!, it.reps!!) } ?: return@mapNotNull null
            val e1 = Live.e1rm(top.weight!!, top.reps!!)
            if (e1 > best + 0.05) "${ex.def?.short ?: ex.displayName.uppercase()} ${Fmt.w(top.weight)}×${top.reps} · e1RM ${Fmt.w(e1)} (was ${Fmt.w(best)})" else null
        }
    }
}
