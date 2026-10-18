import SwiftUI
import WebKit

/// The full web app in a WKWebView, signed in by POSTing the app token to /auth/app.
struct WebTab: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var web = WebState()

    var body: some View {
        if model.source == .server, let base = model.serverURL, let token = model.appToken ?? (model.demo ? "ht_demo" : nil) {
            VStack(spacing: 0) {
                HStack(spacing: 14) {
                    Button { web.view?.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!web.canGoBack)
                    Button { web.view?.reload() } label: { Image(systemName: "arrow.clockwise") }
                    Text(web.title.isEmpty ? base.host ?? "" : web.title).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
                    Spacer()
                    if web.loading { ProgressView().controlSize(.mini).tint(T.amber) }
                    Button { if let u = web.view?.url ?? Optional(base) { UIApplication.shared.open(u) } } label: { Image(systemName: "safari") }
                }
                .font(.system(size: 14))
                .foregroundStyle(T.amber)
                .padding(.horizontal, 14).padding(.vertical, 7)
                Divider1()
                ZStack {
                    WebView(base: base, token: token, state: web)
                        .id(model.webReloadToken)
                    if let e = web.error {
                        EmptyState(title: "COULDN'T LOAD", message: e, button: "RETRY") {
                            web.error = nil
                            model.webReloadToken = UUID()
                        }
                        .background(T.bg)
                    }
                }
            }
        } else {
            EmptyState(title: "WEB NEEDS A SERVER",
                       message: model.source == .direct
                           ? "The full web app (programs, planner, history, settings) runs on your \(Brand.name) server. Direct mode has no server to open."
                           : "Connect a \(Brand.name) server in SETUP to open the full web app here, already signed in.",
                       button: "OPEN SETUP") { model.tab = .setup }
        }
    }
}

final class WebState: ObservableObject {
    @Published var loading = false
    @Published var canGoBack = false
    @Published var title = ""
    @Published var error: String?
    weak var view: WKWebView?
}

struct WebView: UIViewRepresentable {
    var base: URL
    var token: String
    var state: WebState

    func makeCoordinator() -> Coordinator { Coordinator(base: base, state: state) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let v = WKWebView(frame: .zero, configuration: config)
        v.navigationDelegate = context.coordinator
        v.uiDelegate = context.coordinator
        v.allowsBackForwardNavigationGestures = true
        v.isOpaque = false
        v.backgroundColor = .black
        v.scrollView.backgroundColor = .black
        v.customUserAgent = nil
        state.view = v
        v.load(ServerClient(base: base, token: token).webLoginRequest(next: "/"))
        return v
    }

    func updateUIView(_ v: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let base: URL
        let state: WebState
        init(base: URL, state: WebState) { self.base = base; self.state = state }

        /// Main-frame navigation stays on the server's origin; anything else opens in Safari.
        static func allowed(_ url: URL, base: URL) -> Bool {
            if ["about", "data", "blob"].contains(url.scheme?.lowercased() ?? "") { return true }
            return ConnectLink.sameOrigin(url, base)
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            let mainFrame = action.targetFrame?.isMainFrame ?? true
            if !mainFrame || Self.allowed(url, base: base) { return decisionHandler(.allow) }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        // target=_blank / window.open
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if Self.allowed(url, base: base) { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { update(webView, loading: true) }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { update(webView, loading: false) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(webView, error) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(webView, error) }

        private func update(_ v: WKWebView, loading: Bool) {
            state.loading = loading
            state.canGoBack = v.canGoBack
            state.title = v.title ?? ""
            if !loading { state.error = nil }
        }

        private func fail(_ v: WKWebView, _ error: Error) {
            update(v, loading: false)
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
            if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return } // frame load interrupted (we cancelled)
            state.error = error.localizedDescription
        }
    }
}
