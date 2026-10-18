package dev.ironterm.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import dev.ironterm.update.Installer
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Amber "Update available" strip under the top bar; also shows download progress and the permission step. */
@Composable
fun UpdateBanner(u: UpdateUi, actions: AppActions) {
    val info = u.available ?: return
    val ctx = LocalContext.current
    val blocked = remember { Installer.blockedByAdvancedProtection(ctx) }
    Column(Modifier.fillMaxWidth().background(T.amber.copy(alpha = 0.10f)).padding(horizontal = 16.dp, vertical = 10.dp)) {
        when {
            blocked && u.phase == UpdatePhase.IDLE -> {
                Mono("UPDATE AVAILABLE: v${info.versionCode}", size = 12.sp, color = T.amber, bold = true, maxLines = 1)
                Spacer(Modifier.height(4.dp))
                Mono("Advanced Protection is on, so Android only installs apps from a store. Install this update over USB (adb install).", size = 10.sp, color = T.dim)
            }
            else -> UpdateBannerBody(u, info, actions)
        }
    }
    Line()
}

@Composable
private fun UpdateBannerBody(u: UpdateUi, info: dev.ironterm.update.UpdateInfo, actions: AppActions) {
    run {
        when (u.phase) {
            UpdatePhase.IDLE -> Row(Modifier.fillMaxWidth().clickable(onClick = actions::startUpdate), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Mono("UPDATE AVAILABLE: v${info.versionCode}", size = 12.sp, color = T.amber, bold = true, maxLines = 1)
                    if (info.headline.isNotBlank()) Mono(info.headline, size = 10.sp, color = T.dim, maxLines = 1)
                }
                Spacer(Modifier.width(10.dp))
                Badge("UPDATE")
            }
            UpdatePhase.DOWNLOADING -> {
                Mono(
                    "DOWNLOADING v${info.versionCode}" + if (u.progress >= 0) " · ${(u.progress * 100).toInt()}%" else "…",
                    size = 12.sp, color = T.amber, bold = true, maxLines = 1,
                )
                Spacer(Modifier.height(6.dp))
                BarLine(if (u.progress >= 0) u.progress.toDouble() else 0.5, T.amber, Modifier.fillMaxWidth(), 4.dp)
            }
            UpdatePhase.NEEDS_PERMISSION -> {
                Mono("ALLOW UPDATES", size = 12.sp, color = T.amber, bold = true)
                Spacer(Modifier.height(4.dp))
                Mono(
                    "Android asks you to allow Ironterm to install apps once. Turn on \"Allow from this source\", then come back: the update continues.",
                    size = 10.sp, color = T.dim,
                )
                Spacer(Modifier.height(8.dp))
                TButton("Open settings", primary = true, onClick = actions::allowInstalls)
            }
            UpdatePhase.INSTALLING -> Mono("INSTALLING v${info.versionCode}… confirm in the system dialog", size = 12.sp, color = T.amber, bold = true)
        }
    }
}
