package dev.ironterm.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import java.net.URLEncoder

/** True when [url] is on the same scheme+host+port as [origin]. */
fun sameOrigin(url: Uri, origin: Uri): Boolean =
    url.scheme.equals(origin.scheme, true) && url.host.equals(origin.host, true) && effectivePort(url) == effectivePort(origin)

private fun effectivePort(u: Uri): Int = if (u.port != -1) u.port else if (u.scheme.equals("http", true)) 80 else 443

/** Body for POST /auth/app: signs the WebView in with the app token, then redirects to [next]. */
fun authBody(token: String, next: String = "/"): ByteArray =
    "token=${URLEncoder.encode(token, "UTF-8")}&next=${URLEncoder.encode(next, "UTF-8")}".toByteArray()

/**
 * The full web app, signed in. Navigation stays inside the server origin; any other link opens in
 * the browser. Back navigates the WebView history first.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebView(serverUrl: String, token: String) {
    val ctx = LocalContext.current
    val origin = remember(serverUrl) { Uri.parse(serverUrl) }
    var view by remember { mutableStateOf<WebView?>(null) }
    var loading by remember { mutableStateOf(true) }
    var canBack by remember { mutableStateOf(false) }
    BackHandler(enabled = canBack) { view?.goBack() }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Mono(origin.host.orEmpty().uppercase(), Modifier.weight(1f), size = 10.sp, color = T.faint, maxLines = 1)
            if (loading) Mono("LOADING…", size = 10.sp, color = T.amber)
            Spacer(Modifier.width(12.dp))
            Mono("↻ RELOAD", Modifier.clickable { view?.reload() }, size = 10.sp, color = T.dim)
            Spacer(Modifier.width(12.dp))
            Mono("BROWSER ›", Modifier.clickable { openExternal(ctx, Uri.parse(view?.url ?: serverUrl)) }, size = 10.sp, color = T.dim)
        }
        Line()
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { c ->
                    WebView(c).apply {
                        setBackgroundColor(T.bg.toArgb())
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.setSupportMultipleWindows(false)
                        CookieManager.getInstance().setAcceptCookie(true)
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                                val u = req.url
                                if (sameOrigin(u, origin)) return false
                                openExternal(c, u)
                                return true
                            }

                            override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) { loading = true }
                            override fun onPageFinished(v: WebView, url: String?) {
                                loading = false
                                canBack = v.canGoBack()
                            }
                        }
                        postUrl("${serverUrl.trimEnd('/')}/auth/app", authBody(token))
                        view = this
                    }
                },
                onRelease = { it.destroy() },
            )
        }
    }
}

private fun openExternal(ctx: android.content.Context, u: Uri) {
    if (u.scheme !in setOf("http", "https", "mailto")) return
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
    }
}
