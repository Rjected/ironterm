package dev.ironterm

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureRoboImage
import dev.ironterm.SocialSamples.alex
import dev.ironterm.SocialSamples.jo
import dev.ironterm.data.SourceMode
import dev.ironterm.data.SyncStatus
import dev.ironterm.data.app.Load
import dev.ironterm.data.social.DirectoryUser
import dev.ironterm.data.social.FriendList
import dev.ironterm.ui.AppActions
import dev.ironterm.ui.AppScreen
import dev.ironterm.ui.DataUi
import dev.ironterm.ui.FeedUi
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.SearchUi
import dev.ironterm.ui.SocialController
import dev.ironterm.ui.SocialUi
import dev.ironterm.ui.Tabs
import dev.ironterm.ui.TerminalTheme
import dev.ironterm.ui.UiState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** FRIENDS: every screen and state → docs/screens/android/social_*.png (411dp; "_360" = 360dp). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class SocialScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private val out = File(System.getProperty("screens.dir") ?: "build/screens").apply { mkdirs() }
    private val now = SocialSamples.now
    private val synced = SyncStatus(lastSuccessAt = now - 4 * 60_000, lastAttemptAt = now - 4 * 60_000)
    private val server get() = UiState(snapshot = Fixtures.home.snapshot, mode = SourceMode.SERVER, serverUrl = SocialSamples.ME, token = "ht_demo", status = synced, unit = "kg")
    private val direct get() = UiState(snapshot = Fixtures.home.snapshot, mode = SourceMode.DIRECT, apiKey = "test-key", status = synced, unit = "kg")
    private val so = SocialSamples.ui
    private fun d(s: SocialUi = so) = DataUi(social = s, home = Load.of(Fixtures.home, now), lifts = Load.of(Fixtures.lifts, now))

    private fun shot(name: String, nav: Nav, data: DataUi = d(), state: UiState = server, tall: Boolean = false, width: Int? = null, before: () -> Unit = {}) {
        if (tall) RuntimeEnvironment.setQualifiers("+h2200dp")
        if (width != null) RuntimeEnvironment.setQualifiers("+w${width}dp")
        compose.setContent { TerminalTheme { AppScreen(state, AppActions.None, nav, {}, data, now = now, ticking = false) } }
        compose.waitForIdle()
        before()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(File(out, "social_$name.png").path)
    }

    private fun click(text: String) = { compose.onAllNodes(hasText(text)).onFirst().performClick(); Unit }

    private val friends = Nav(Tabs.FRIENDS)
    private fun section(s: String) = d(so.copy(section = s))

    // ── feed ──
    @Test fun feed() = shot("feed", friends)
    @Test fun feed_360() = shot("feed_360", friends, width = 360)
    @Test fun feed_full() = shot("feed_full", friends, tall = true)
    @Test fun feed_comments() = shot("feed_comments", friends, before = click("💬"))
    @Test fun feed_comments_360() = shot("feed_comments_360", friends, width = 360, before = click("💬"))
    @Test fun feed_loading() = shot("feed_loading", friends, d(so.copy(feed = FeedUi(loading = true))))
    @Test fun feed_error() = shot("feed_error", friends, d(so.copy(feed = FeedUi(error = "Offline or server unreachable."))))
    @Test fun feed_offline() = shot("feed_offline", friends, d(so.copy(feed = so.feed.copy(error = "Offline or server unreachable.", savedAt = now - 2 * 3_600_000))))
    @Test fun feed_no_friends() = shot("feed_no_friends", friends, d(so.copy(friends = Load.of(FriendList()), feed = FeedUi(loaded = true), notifications = Load.of(dev.ironterm.data.social.NotificationList()))))
    @Test fun feed_quiet() = shot("feed_quiet", friends, d(so.copy(friends = Load.of(FriendList(listOf(alex))), feed = FeedUi(loaded = true, unreachable = listOf(alex.id)))))
    @Test fun me_loading() = shot("loading", friends, d(SocialUi(me = Load.loading())))
    @Test fun me_error() = shot("error", friends, d(SocialUi(me = Load.failed("The server took too long to answer."))))
    @Test fun needs_update() = shot("needs_update", friends, d(SocialUi(me = Load.failed(SocialController.NO_SOCIAL))))

    // ── setup / direct ──
    @Test fun setup() = shot("setup", friends, d(SocialUi(me = Load.of(SocialSamples.meOff))), tall = true)
    @Test fun setup_360() = shot("setup_360", friends, d(SocialUi(me = Load.of(SocialSamples.meOff))), width = 360)
    @Test fun setup_error() = shot("setup_error", friends, d(SocialUi(me = Load.of(SocialSamples.meOff), setupError = "Directory: handle already taken")), before = {
        compose.onAllNodes(hasText("e.g. sam")).onFirst().performTextInput("lifter")
    })
    @Test fun direct() = shot("direct", friends, DataUi(), state = direct)
    @Test fun direct_more() = shot("direct_more", Nav(Tabs.MORE), DataUi(), state = direct)

    // ── friends list ──
    @Test fun friends() = shot("friends", friends, section(SocialUi.LIST), tall = true)
    @Test fun friends_360() = shot("friends_360", friends, section(SocialUi.LIST), width = 360)
    @Test fun friends_accept_full() = shot("friends_accept_full", friends, section(SocialUi.LIST), before = click("FULL"))
    @Test fun friends_cancel_confirm() = shot("friends_cancel_confirm", friends, section(SocialUi.LIST), tall = true, before = click("CANCEL"))

    // ── add ──
    @Test fun add() = shot("add", Nav(Tabs.FRIENDS, listOf(Route.AddFriend)), tall = true)
    @Test fun add_search() = shot("add_search", Nav(Tabs.FRIENDS, listOf(Route.AddFriend)), d(so.copy(
        search = SearchUi("sa", listOf(DirectoryUser("sam", "Sam", SocialSamples.sam.server), DirectoryUser("sasha", "Sasha", "https://sasha.example.com"), DirectoryUser("sage", null, "https://sage.example.com"))),
        addError = "No one called @sagee in the directory.",
    )), width = 360)

    // ── profile / compare ──
    private val alexNav = Nav(Tabs.FRIENDS, listOf(Route.Friend(alex.id)))
    @Test fun profile() = shot("profile", alexNav)
    @Test fun profile_full() = shot("profile_full", alexNav, tall = true)
    @Test fun profile_360() = shot("profile_360", alexNav, width = 360, tall = true)
    @Test fun profile_compare_bw() = shot("profile_compare_bw", alexNav, tall = true, before = click("×BW"))
    @Test fun profile_basic_stale() = shot("profile_basic_stale", Nav(Tabs.FRIENDS, listOf(Route.Friend(jo.id))), tall = true)
    @Test fun profile_loading() = shot("profile_loading", Nav(Tabs.FRIENDS, listOf(Route.Friend(SocialSamples.sam.id))))
    @Test fun share_sheet() = shot("share_sheet", alexNav, before = click("CHANGE ›"))
    @Test fun unfriend_confirm() = shot("unfriend_confirm", alexNav, tall = true, before = click("UNFRIEND"))

    // ── notifications / mine ──
    @Test fun notifications() = shot("notifications", Nav(Tabs.FRIENDS, listOf(Route.Notifications)))
    @Test fun notifications_empty() = shot("notifications_empty", Nav(Tabs.FRIENDS, listOf(Route.Notifications)), d(so.copy(notifications = Load.of(dev.ironterm.data.social.NotificationList()))))
    @Test fun mine() = shot("mine", friends, section(SocialUi.MINE), tall = true)
    @Test fun mine_360() = shot("mine_360", friends, section(SocialUi.MINE), width = 360)

    // ── navigation: LIFTS under MORE with a server ──
    @Test fun more() = shot("more", Nav(Tabs.MORE))
    @Test fun lifts_under_more() = shot("lifts_under_more", Nav(Tabs.LIFTS))
}
