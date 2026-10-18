package dev.ironterm.ui

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import android.view.View
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import dev.ironterm.widget.Variant
import dev.ironterm.widget.WidgetCatalog
import dev.ironterm.widget.WidgetData
import dev.ironterm.widget.WidgetKind

/** Every widget at every size, rendered through Glance from the current data. */
@Composable
fun GalleryScreen(state: UiState, onBack: () -> Unit, kinds: List<WidgetKind> = WidgetCatalog.all) {
    BackHandler(onBack = onBack)
    val data = WidgetData(state.snapshot, state.mode, state.theme, null, state.status.lastSuccessAt)
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onBack).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono("‹ BACK", size = 12.sp, color = T.dim, bold = true)
            Spacer(Modifier.size(16.dp))
            Mono("WIDGET GALLERY", size = 14.sp, color = T.amber, bold = true)
        }
        Line()
        LazyColumn(Modifier.fillMaxSize()) {
            items(kinds, key = { it.id }) { k -> GalleryItem(k, data) }
        }
    }
}

@Composable
private fun GalleryItem(k: WidgetKind, data: WidgetData) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp)) {
        Label(k.title)
        Spacer(Modifier.height(4.dp))
        Mono(k.description, size = 10.sp, color = T.dim)
        k.variants.forEach { v ->
            Spacer(Modifier.height(14.dp))
            Mono("${v.name.uppercase()} · ${v.cells}", size = 10.sp, color = T.faint)
            Spacer(Modifier.height(6.dp))
            WidgetPreview(k, v, data)
        }
        Spacer(Modifier.height(12.dp))
        TButton("Add to home screen", modifier = Modifier.fillMaxWidth()) {
            val m = AppWidgetManager.getInstance(ctx)
            if (Build.VERSION.SDK_INT >= 26 && m.isRequestPinAppWidgetSupported) {
                m.requestPinAppWidget(ComponentName(ctx, k.receiver), null, null)
            }
        }
    }
    Line()
}

@Composable
fun WidgetPreview(k: WidgetKind, v: Variant, data: WidgetData, size: DpSize = v.size) {
    val ctx = LocalContext.current
    val view by produceState<View?>(null, k.id, v, data) {
        value = runCatching { WidgetCatalog.render(ctx, k, size, data) }.getOrNull()
    }
    Box(Modifier.size(size).border(1.dp, T.line).background(T.panel)) {
        val vw = view
        if (vw != null) {
            AndroidView(
                factory = { FrameLayout(it) },
                update = { fl -> if (vw.parent !== fl) { (vw.parent as? FrameLayout)?.removeView(vw); fl.removeAllViews(); fl.addView(vw) } },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Mono("RENDERING…", Modifier.align(Alignment.Center), size = 10.sp, color = T.faint)
        }
    }
}
