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

interface AppActions {
    fun refresh() {}
    fun test(mode: SourceMode, serverUrl: String, token: String, apiKey: String) {}
    fun connectServer(serverUrl: String, token: String) {}
    fun connectDirect(apiKey: String, unit: String, weeklyTarget: Int) {}
    fun setTheme(theme: ColorTheme) {}
    fun disconnect() {}
    fun clearTest() {}
    fun scanQr() {}
    fun checkUpdates() {}
    fun startUpdate() {}
    fun allowInstalls() {}

    companion object { val None = object : AppActions {} }
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
        reload { copy(snapshot = null, testResult = null) }
        viewModelScope.launch { Widgets.updateAll(getApplication()) }
    }
}
