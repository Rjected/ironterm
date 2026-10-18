package dev.ironterm.ui

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.GlanceAppWidgetManager
import dev.ironterm.data.Settings
import dev.ironterm.data.SnapshotStore
import dev.ironterm.data.SourceMode
import dev.ironterm.widget.ColorTheme
import dev.ironterm.widget.GraphWidgetReceiver
import dev.ironterm.widget.LiftsWidgetReceiver
import dev.ironterm.widget.WidgetCatalog
import dev.ironterm.widget.WidgetData
import dev.ironterm.widget.WidgetOptions
import dev.ironterm.widget.WidgetKind
import dev.ironterm.widget.Widgets
import dev.ironterm.work.SyncWorker
import kotlinx.coroutines.launch

/**
 * Widget options. Graph: colour theme. Lifts: which lift the 2×2 size shows. Other widgets have
 * nothing to configure (configuration_optional), but long-press → reconfigure still lands here.
 */
class WidgetConfigActivity : ComponentActivity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider?.className
        val kind = WidgetCatalog.byReceiver(provider) ?: WidgetCatalog.all.first()
        val settings = Settings.get(this)
        val opts = WidgetOptions(this)
        val snapshot = SnapshotStore.get(this).read()

        setContent {
            TerminalTheme {
                val scope = rememberCoroutineScope()
                var theme by remember { mutableStateOf(ColorTheme.fromName(opts.theme(appWidgetId) ?: settings.themeName)) }
                var lift by remember { mutableStateOf(opts.lift(appWidgetId)) }
                ConfigScreen(
                    kind = kind,
                    data = WidgetData(snapshot, settings.mode, theme, lift),
                    configured = settings.isConfigured,
                    theme = theme, onTheme = { theme = it },
                    lift = lift, onLift = { lift = it },
                    onSetup = {
                        startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, Tabs.SETUP))
                    },
                    onSave = {
                        if (kind.receiver == GraphWidgetReceiver::class.java) opts.setTheme(appWidgetId, theme.name)
                        if (kind.receiver == LiftsWidgetReceiver::class.java) opts.setLift(appWidgetId, lift)
                        scope.launch {
                            runCatching {
                                val id = GlanceAppWidgetManager(this@WidgetConfigActivity).getGlanceIdBy(appWidgetId)
                                Widgets.updateAll(this@WidgetConfigActivity)
                                id
                            }
                            if (settings.isConfigured) {
                                SyncWorker.schedulePeriodic(this@WidgetConfigActivity)
                                if (snapshot == null) SyncWorker.enqueueOneTime(this@WidgetConfigActivity)
                            }
                            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
                            finish()
                        }
                    },
                )
            }
        }
    }
}

@Composable
fun ConfigScreen(
    kind: WidgetKind,
    data: WidgetData,
    configured: Boolean,
    theme: ColorTheme,
    onTheme: (ColorTheme) -> Unit,
    lift: String?,
    onLift: (String?) -> Unit,
    onSetup: () -> Unit,
    onSave: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(T.bg).windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono("WIDGET · ", size = 14.sp, color = T.text, bold = true)
            Mono(kind.title.uppercase(), size = 14.sp, color = T.amber, bold = true)
        }
        Line()
        if (!configured) {
            Section("Not connected") {
                Mono("Widgets show data from the app. Connect a server or a Hevy API key first.", size = 12.sp, color = T.dim)
                Spacer(Modifier.height(10.dp))
                TButton("Open setup", primary = true, onClick = onSetup)
            }
        }
        Section("Preview") {
            val v = kind.variants.first { it.name != "wide" }
            WidgetPreview(kind, v, data)
        }
        if (kind.receiver == GraphWidgetReceiver::class.java) {
            Section("Colour") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ColorTheme.entries.forEach { th ->
                        Column(
                            Modifier.weight(1f).border(1.dp, if (th == theme) T.amber else T.line).clickable { onTheme(th) }.padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                (1..4).forEach { Spacer(Modifier.size(10.dp).background(Color(th.level(it)))) }
                            }
                            Spacer(Modifier.height(6.dp))
                            Mono(th.displayName.uppercase(), size = 10.sp, color = if (th == theme) T.amber else T.dim)
                        }
                    }
                }
            }
        }
        if (kind.receiver == LiftsWidgetReceiver::class.java) {
            Section("Lift (2×2 size)") {
                val lifts = data.snapshot?.lifts.orEmpty()
                if (lifts.isEmpty()) Mono("No lifts synced yet. The first lift is used.", size = 12.sp, color = T.dim)
                lifts.forEach { l ->
                    val sel = (lift ?: lifts.first().key) == l.key
                    Row(Modifier.fillMaxWidth().clickable { onLift(l.key) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Mono(if (sel) "◉ " else "○ ", size = 12.sp, color = if (sel) T.amber else T.faint)
                        Mono(l.name.uppercase(), Modifier.weight(1f), size = 12.sp, color = if (sel) T.amber else T.text)
                        Mono(dev.ironterm.Fmt.w(l.e1rm), size = 12.sp, color = T.dim)
                    }
                }
            }
        }
        Column(Modifier.padding(16.dp)) {
            TButton(if (data.mode == SourceMode.NONE) "Add widget" else "Save", primary = true, modifier = Modifier.fillMaxWidth(), onClick = onSave)
        }
    }
}
