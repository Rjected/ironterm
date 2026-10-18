package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ironterm.BuildConfig
import dev.ironterm.Fmt
import dev.ironterm.data.SourceMode
import dev.ironterm.widget.ColorTheme

@Composable
fun SetupScreen(state: UiState, actions: AppActions, now: Long, prefs: GymPrefs = GymPrefs(), onGallery: () -> Unit) {
    var mode by remember(state.mode) { mutableStateOf(if (state.mode == SourceMode.NONE) SourceMode.SERVER else state.mode) }
    var url by remember(state.serverUrl) { mutableStateOf(state.serverUrl) }
    var token by remember(state.token) { mutableStateOf(state.token) }
    var apiKey by remember(state.apiKey) { mutableStateOf(state.apiKey) }
    var unit by remember(state.unit) { mutableStateOf(state.unit) }
    var target by remember(state.weeklyTarget) { mutableIntStateOf(state.weeklyTarget) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        state.notice?.let {
            val c = if (state.noticeError) T.down else T.amber
            Mono(it, Modifier.fillMaxWidth().background(c.copy(alpha = 0.08f)).padding(16.dp), size = 12.sp, color = c)
            Line()
        }
        if (!state.configured) {
            Section("Quick connect") {
                TButton("▣ Scan QR code", primary = true, modifier = Modifier.fillMaxWidth(), onClick = actions::scanQr)
                Spacer(Modifier.height(8.dp))
                Mono("Web app → F10 SETUP → APPS & WIDGETS → New app token shows a QR. Scan it to connect in one step. Or fill in the fields below.", size = 10.sp, color = T.faint)
            }
        }
        Section("Data source", right = if (state.configured) "CONNECTED" else "NOT CONNECTED", rightColor = if (state.configured) T.up else T.faint) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SourceOption("Server", "Full app: program, gym sync, recovery", mode == SourceMode.SERVER, Modifier.weight(1f)) {
                    mode = SourceMode.SERVER; actions.clearTest()
                }
                SourceOption("Direct", "Hevy API key only, no server", mode == SourceMode.DIRECT, Modifier.weight(1f)) {
                    mode = SourceMode.DIRECT; actions.clearTest()
                }
            }
            Spacer(Modifier.height(16.dp))
            if (mode == SourceMode.SERVER) {
                TButton("▣ Scan QR", modifier = Modifier.fillMaxWidth(), onClick = actions::scanQr)
                Spacer(Modifier.height(12.dp))
                Field("Server URL", url, { url = it }, placeholder = "https://gym.example.com", keyboard = KeyboardType.Uri)
                Spacer(Modifier.height(12.dp))
                Field("App token", token, { token = it }, placeholder = "ht_…", secret = true)
                Spacer(Modifier.height(8.dp))
                Mono("Web app → F10 SETUP → APPS & WIDGETS → New app token. Scan its QR, or tap \"Open in app\" there on the phone.", size = 10.sp, color = T.faint)
            } else {
                Field("Hevy API key", apiKey, { apiKey = it }, placeholder = "xxxxxxxx-xxxx-…", secret = true)
                Spacer(Modifier.height(8.dp))
                Mono("hevy.com → Settings → Developer (needs Hevy Pro). Read-only: the app only lists your workouts.", size = 10.sp, color = T.faint)
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Mono("UNIT", Modifier.width(110.dp), size = 11.sp, color = T.dim)
                    UnitToggle("KG", unit == "kg") { unit = "kg" }
                    Spacer(Modifier.width(8.dp))
                    UnitToggle("LB", unit == "lb") { unit = "lb" }
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Mono("WEEKLY GOAL", Modifier.width(110.dp), size = 11.sp, color = T.dim)
                    UnitToggle("−", false) { target = (target - 1).coerceAtLeast(1) }
                    Mono("  $target / WK  ", size = 13.sp, bold = true)
                    UnitToggle("+", false) { target = (target + 1).coerceAtMost(7) }
                }
            }
            Spacer(Modifier.height(16.dp))
            val ready = if (mode == SourceMode.SERVER) url.isNotBlank() && token.isNotBlank() else apiKey.isNotBlank()
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TButton(if (state.testing) "Testing…" else "Test", enabled = ready && !state.testing) { actions.test(mode, url, token, apiKey) }
                TButton("Save & connect", primary = true, enabled = ready) {
                    if (mode == SourceMode.SERVER) actions.connectServer(url, token) else actions.connectDirect(apiKey, unit, target)
                }
            }
            state.testResult?.let { r ->
                Spacer(Modifier.height(10.dp))
                if (r.isEmpty()) Mono("✓ CONNECTION OK", size = 12.sp, color = T.up, bold = true)
                else Mono("× $r", size = 12.sp, color = T.down)
            }
        }
        Section("Sync") {
            KV("Source", when (state.mode) {
                SourceMode.SERVER -> state.serverUrl.removePrefix("https://")
                SourceMode.DIRECT -> "api.hevyapp.com (direct)"
                SourceMode.NONE -> "—"
            })
            KV("Last sync", Fmt.ago(state.status.lastSuccessAt, now), if (state.status.lastSuccessAt > 0) T.text else T.faint)
            state.status.lastError?.takeIf { state.status.lastAttemptAt >= state.status.lastSuccessAt }?.let {
                KV("Last error", it, T.down)
            }
            KV("Background", "EVERY 30 MIN + ON OPEN")
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TButton(if (state.loading) "Syncing…" else "Sync now", enabled = state.configured && !state.loading, onClick = actions::refresh)
                if (state.configured) TButton("Disconnect", onClick = actions::disconnect)
            }
        }
        Section("Gym") {
            Toggle("Keep screen on", "While a session is open in GYM", prefs.keepScreenOn) { actions.setGymPrefs(prefs.copy(keepScreenOn = it)) }
            Toggle("Rest sound", "Beep when rest ends (never in silent or vibrate mode)", prefs.restSound) { actions.setGymPrefs(prefs.copy(restSound = it)) }
            Toggle("Rest vibration", "Buzz when rest ends (not in silent mode)", prefs.restVibrate) { actions.setGymPrefs(prefs.copy(restVibrate = it)) }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Mono("DEFAULT REST", size = 11.sp, color = T.text, bold = true)
                    Mono("For exercises you add (program ones use the program's rest)", size = 10.sp, color = T.faint)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(60, 90, 120, 180, 240).forEach { sec ->
                    Chip(if (sec % 60 == 0) "${sec / 60}:00" else "${sec / 60}:${(sec % 60).toString().padStart(2, '0')}", prefs.defaultRest == sec, Modifier.weight(1f)) { actions.setGymPrefs(prefs.copy(defaultRest = sec)) }
                }
            }
        }
        if (state.mode == SourceMode.SERVER && state.configured) {
            Section("Program & lifts") {
                Mono("Choosing a program, its options and mapping lifts to your Hevy exercises happen in the web app.", size = 11.sp, color = T.dim)
                Spacer(Modifier.height(10.dp))
                TButton("Advanced setup (web) ↗", modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { actions.openWeb("/#set") }
            }
        }
        Section("Widgets", right = "THEME") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ColorTheme.entries.forEach { th ->
                    ThemeSwatch(th, th == state.theme, Modifier.weight(1f)) { actions.setTheme(th) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Mono("Applies to graph widgets without their own theme. Long-press a widget → reconfigure to change one.", size = 10.sp, color = T.faint)
            Spacer(Modifier.height(14.dp))
            TButton("Widget gallery ›", modifier = Modifier.fillMaxWidth(), onClick = onGallery)
            Spacer(Modifier.height(8.dp))
            Mono("Add widgets: long-press the home screen → Widgets → ${dev.ironterm.Brand.NAME}.", size = 10.sp, color = T.faint)
        }
        Section("Updates", right = if (state.update.available != null) "v${state.update.available.versionCode} AVAILABLE" else null, rightColor = T.amber) {
            KV("Installed", "v${BuildConfig.VERSION_CODE} (${BuildConfig.VERSION_NAME})")
            KV("Source", "github.com/${BuildConfig.UPDATE_REPO}")
            KV("Last check", Fmt.ago(state.update.lastCheckAt, now), if (state.update.lastCheckAt > 0) T.text else T.faint)
            state.update.message?.let { KV("Status", it, if (it.startsWith("Up to date")) T.up else T.down) }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TButton(if (state.update.checking) "Checking…" else "Check for updates", enabled = !state.update.checking, onClick = actions::checkUpdates)
                if (state.update.available != null) TButton("Update", primary = true, onClick = actions::startUpdate)
            }
        }
        Section("About") {
            KV("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            KV("Mode", if (state.mode == SourceMode.DIRECT) "Data stays on this phone" else "Snapshot from your server")
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SourceOption(title: String, sub: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.border(1.dp, if (selected) T.amber else T.line)
            .background(if (selected) T.amber.copy(alpha = 0.06f) else T.bg)
            .clickable(onClick = onClick).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(if (selected) "◉ " else "○ ", size = 12.sp, color = if (selected) T.amber else T.faint)
            Mono(title.uppercase(), size = 12.sp, color = if (selected) T.amber else T.text, bold = true)
        }
        Spacer(Modifier.height(4.dp))
        Mono(sub, size = 10.sp, color = T.dim)
    }
}

@Composable
private fun UnitToggle(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.border(1.dp, if (selected) T.amber else T.line).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
    ) { Mono(text, size = 12.sp, color = if (selected) T.amber else T.text, bold = selected) }
}

@Composable
fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String = "",
    secret: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    var show by remember { mutableStateOf(false) }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono(label.uppercase(), Modifier.weight(1f), size = 10.sp, color = T.dim)
            if (secret && value.isNotEmpty()) Mono(if (show) "HIDE" else "SHOW", Modifier.clickable { show = !show }, size = 10.sp, color = T.faint)
        }
        Spacer(Modifier.height(5.dp))
        BasicTextField(
            value = value,
            onValueChange = { onChange(it.trim()) },
            singleLine = true,
            textStyle = T.style(13.sp),
            cursorBrush = SolidColor(T.amber),
            visualTransformation = if (secret && !show) PasswordVisualTransformation('•') else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else keyboard, autoCorrectEnabled = false),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().border(1.dp, T.line).background(T.panel).padding(horizontal = 12.dp, vertical = 11.dp)) {
                    if (value.isEmpty()) Mono(placeholder, size = 13.sp, color = T.faint, maxLines = 1)
                    inner()
                }
            },
        )
    }
}


@Composable
private fun ThemeSwatch(th: ColorTheme, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.border(1.dp, if (selected) T.amber else T.line).clickable(onClick = onClick).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            (1..4).forEach { Box(Modifier.size(10.dp).background(Color(th.level(it)))) }
        }
        Spacer(Modifier.height(6.dp))
        Mono(th.displayName.uppercase(), size = 10.sp, color = if (selected) T.amber else T.dim, bold = selected)
    }
}
