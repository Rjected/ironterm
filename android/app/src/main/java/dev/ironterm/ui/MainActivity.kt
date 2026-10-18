package dev.ironterm.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ironterm.data.DeepLink
import dev.ironterm.data.Settings

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_TAB = "tab"
        const val EXTRA_REFRESH = "refresh"
        /** Don't refetch on every resume; widgets and the worker keep the cache fresh. */
        private const val RESUME_REFRESH_AFTER_MS = 60_000L
    }

    private val vm: AppViewModel by viewModels()
    private val tab = mutableStateOf(Tabs.TODAY)

    /** The ViewModel's actions plus the one that needs an Activity (the QR scanner UI). */
    private val actions: AppActions by lazy {
        object : AppActions by vm {
            override fun scanQr() = QrScanner.scan(
                this@MainActivity,
                onText = vm::onScanned,
                onError = { vm.showNotice(it, error = true) },
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        tab.value = savedInstanceState?.getString(EXTRA_TAB)
            ?: if (Settings.get(this).isConfigured) Tabs.TODAY else Tabs.SETUP
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            val state by vm.state.collectAsStateWithLifecycle()
            LaunchedEffect(state.goToday) {
                if (state.goToday) { tab.value = Tabs.TODAY; vm.consumeGoToday() }
            }
            TerminalTheme {
                AppScreen(state = state, actions = actions, tab = tab.value, onTab = { tab.value = it })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val st = vm.state.value
        if (System.currentTimeMillis() - st.status.lastAttemptAt > RESUME_REFRESH_AFTER_MS) vm.refresh()
        vm.resumeUpdateIfAllowed()
        vm.checkUpdatesIfDue()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(EXTRA_TAB, tab.value)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val data = intent.dataString
        if (intent.action == Intent.ACTION_VIEW && data != null && data.startsWith(DeepLink.SCHEME, ignoreCase = true)) {
            val link = DeepLink.parse(data)
            tab.value = Tabs.SETUP
            if (link != null) vm.connectFromLink(link) else vm.showNotice("That connect link is invalid or incomplete. Create a new app token in the web app.", error = true)
            return
        }
        intent.getStringExtra(EXTRA_TAB)?.takeIf { it in Tabs.all }?.let { tab.value = it }
        // Opened from a widget: always refresh (the widget tap is the "refresh" gesture).
        if (intent.getBooleanExtra(EXTRA_REFRESH, false)) vm.refresh()
    }
}
