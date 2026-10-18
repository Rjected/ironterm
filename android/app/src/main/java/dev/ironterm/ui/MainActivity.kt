package dev.ironterm.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ironterm.data.DeepLink
import dev.ironterm.data.Settings
import dev.ironterm.gym.RestTimerService

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_TAB = "tab"
        const val EXTRA_REFRESH = "refresh"
        /** Don't refetch on every resume; widgets and the worker keep the cache fresh. */
        private const val RESUME_REFRESH_AFTER_MS = 60_000L
    }

    private val vm: AppViewModel by viewModels()
    private val nav = mutableStateOf(Nav())

    /** The ViewModel's actions plus the ones that need an Activity (QR scanner, Custom Tab). */
    private val actions: AppActions by lazy {
        object : AppActions by vm {
            override fun scanQr() = QrScanner.scan(
                this@MainActivity,
                onText = vm::onScanned,
                onError = { vm.showNotice(it, error = true) },
            )

            override fun openWeb(path: String) {
                val base = Settings.get(this@MainActivity).serverUrl ?: return
                val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(0xFF000000.toInt()).setNavigationBarColor(0xFF000000.toInt()).build()
                runCatching {
                    CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).setShowTitle(true).build()
                        .launchUrl(this@MainActivity, Uri.parse(base.trimEnd('/') + path))
                }.onFailure { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(base.trimEnd('/') + path))) }
            }

            override fun gymStart(dayIndex: Int?, empty: Boolean) {
                askNotifications()
                vm.gymStart(dayIndex, empty)
            }

            // FRIENDS: requests, reactions and comments can arrive as notifications once you're social.
            override fun socialSetup(handle: String, name: String, listed: Boolean) {
                askNotifications()
                vm.socialSetup(handle, name, listed)
            }

            override fun addFriend(target: String, note: String, share: String) {
                askNotifications()
                vm.addFriend(target, note, share)
            }
        }
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            // Plain requestPermissions: a transitive old androidx.fragment trips ActivityResult lint.
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        RestTimerService.ensureChannel(this)
        val savedTab = savedInstanceState?.getString(EXTRA_TAB)
        nav.value = when {
            savedTab != null -> Nav.resolve(savedTab) ?: Nav()
            !Settings.get(this).isConfigured -> Nav.resolve(Tabs.SETUP)!!
            vm.gymStore.session != null -> Nav(Tabs.GYM)
            else -> Nav()
        }
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            val state by vm.state.collectAsStateWithLifecycle()
            val data by vm.data.collectAsStateWithLifecycle()
            val gym by vm.gym.collectAsStateWithLifecycle()
            LaunchedEffect(state.goToday) {
                if (state.goToday) { nav.value = Nav(Tabs.TODAY); vm.consumeGoToday() }
            }
            TerminalTheme {
                AppScreen(state = state, actions = actions, nav = nav.value, onNav = { nav.value = it }, data = data, gym = gym)
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
        vm.ensureGymService();
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(EXTRA_TAB, nav.value.tab)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val data = intent.dataString
        if (intent.action == Intent.ACTION_VIEW && data != null && data.startsWith(DeepLink.SCHEME, ignoreCase = true)) {
            val link = DeepLink.parse(data)
            nav.value = Nav.resolve(Tabs.SETUP)!!
            if (link != null) vm.connectFromLink(link) else vm.showNotice("That connect link is invalid or incomplete. Create a new app token in the web app.", error = true)
            return
        }
        Nav.resolve(intent.getStringExtra(EXTRA_TAB))?.let { nav.value = it }
        // Opened from a widget: always refresh (the widget tap is the "refresh" gesture).
        if (intent.getBooleanExtra(EXTRA_REFRESH, false)) vm.refresh()
    }
}
