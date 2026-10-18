import SafariServices
import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: AppModel

    @State private var choice: DataSource = .server
    @State private var serverText = ""
    @State private var token = ""
    @State private var apiKey = ""
    @State private var unit = "kg"
    @State private var weekTarget = 3
    @State private var testing = false
    @State private var testResult: Result<String, ApiError>?
    @State private var confirmDisconnect = false
    @State private var scanning = false
    @State private var scanned: String?

    @State private var safari: SafariLink?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if model.source == .none { quickConnectPanel }
                statusPanel
                sourcePanel
                GymPrefsPanel(prefs: model.prefs)
                if model.source == .server, let base = model.serverURL { advancedPanel(base) }
                widgetsPanel
                Cap("\(Brand.upper) · iOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")", T.faint, size: 8)
                Text("Uses the Hevy public API; not affiliated with Hevy.").font(T.mono(9)).foregroundStyle(T.faint)
            }
            .padding(14)
        }
        .background(T.bg)
        .fullScreenCover(isPresented: $scanning, onDismiss: {
            // hand the code over after the cover is gone, so the confirmation sheet can present
            if let s = scanned { scanned = nil; model.handleScanned(s) }
        }) {
            QRScannerView(onCode: { scanned = $0; scanning = false }, onCancel: { scanning = false })
        }
        .sheet(item: $safari) { l in SafariView(url: l.url).ignoresSafeArea() }
        .onAppear(perform: loadFields)
    }

    /// Program choice and lift mapping stay in the web app: the one web surface, opened in Safari.
    func advancedPanel(_ base: URL) -> some View {
        Panel(title: "ADVANCED SETUP", detail: "WEB") {
            Text("Program choice, start weights, training days, trips and lift mapping are set in the web app on your server.")
                .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            Button { safari = SafariLink(url: ServerClient.endpoint(base, "/#set")) } label: {
                HStack {
                    Image(systemName: "safari")
                    Text("ADVANCED SETUP (WEB)").font(T.mono(11, .bold))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
                .foregroundStyle(T.amber)
                .padding(.vertical, 10).padding(.horizontal, 10)
                .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("advanced-setup")
        }
    }

    func loadFields() {
        choice = model.source == .none ? .server : model.source
        serverText = model.serverURL?.absoluteString ?? ""
        token = model.appToken ?? ""
        apiKey = model.demo ? "" : (model.store.apiKey ?? "")
        unit = model.store.directUnit
        weekTarget = model.store.weekTarget
    }

    // MARK: QR

    var quickConnectPanel: some View {
        Panel(title: "CONNECT", detail: "FASTEST") {
            Text("On your server: F10 SETUP → APPS & WIDGETS → New app token shows a QR code. Scan it here to connect in one step.")
                .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            scanButton(prominent: true)
        }
    }

    @ViewBuilder func scanButton(prominent: Bool) -> some View {
        let ok = QRScanner.isSupported && !model.demo
        VStack(alignment: .leading, spacing: 6) {
            Button { scanning = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "qrcode.viewfinder").font(.system(size: prominent ? 16 : 13, weight: .bold))
                    Text("SCAN QR").font(T.mono(prominent ? 13 : 11, .bold))
                }
                .foregroundStyle(prominent ? T.bg : (ok ? T.amber : T.faint))
                .frame(maxWidth: .infinity)
                .padding(.vertical, prominent ? 12 : 9)
                .background(prominent ? (ok ? T.amber : T.faint) : Color.clear)
                .overlay(Rectangle().stroke(prominent ? Color.clear : (ok ? T.amber : T.line), lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!ok)
            .accessibilityHint(ok ? "Opens the camera" : "Scanning isn't available on this device")
            if !QRScanner.isSupported && (prominent || model.source != .none) {
                Text("No camera scanner here. Open the code with the Camera app (it opens \(ConnectLink.scheme):// links), or enter the URL and token below.")
                    .font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: status

    var statusPanel: some View {
        Panel(title: "STATUS", detail: model.source == .none ? "NOT CONNECTED" : model.source.rawValue.uppercased()) {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                row("SOURCE", model.source == .server ? (model.serverURL?.host ?? "SERVER") : model.source == .direct ? "DIRECT · HEVY API" : "—")
                row("LAST SYNC", model.lastSync.map { "\(Fmt.ago($0)) · \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "NEVER")
                row("DATA", model.snapshot.map { "\($0.totals.allTime) WORKOUTS · \($0.unit.uppercased())\($0.demo ? " · DEMO" : "")" } ?? "—")
                if let e = model.error { row("ERROR", e, T.down) }
            }
            if model.source != .none {
                HStack(spacing: 10) {
                    TermButton(title: model.loading ? "SYNCING…" : "SYNC NOW", style: .primary, disabled: model.loading) { Task { await model.refresh() } }
                    if model.source == .direct {
                        TermButton(title: "FULL RESYNC", disabled: model.loading) { Task { await model.refresh(full: true) } }
                    }
                    TermButton(title: "DISCONNECT", style: .danger) { confirmDisconnect = true }
                }
                .confirmationDialog("Disconnect and forget the credentials on this phone?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
                    Button("Disconnect", role: .destructive) { model.disconnect(); loadFields() }
                }
            }
        }
    }

    func row(_ k: String, _ v: String, _ c: Color = T.text) -> some View {
        GridRow {
            Cap(k, T.faint, size: 9)
            Text(v).font(T.mono(11)).foregroundStyle(c).fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: source

    var sourcePanel: some View {
        Panel(title: "DATA SOURCE", detail: "SWITCH ANY TIME") {
            HStack(spacing: 0) {
                seg(.server, "SERVER")
                seg(.direct, "DIRECT")
            }
            .overlay(Rectangle().stroke(T.line, lineWidth: 1))

            if choice == .server {
                Text("Your \(Brand.name) server: everything, including the program, the GYM logger, recovery and insights. In the web app: F10 SETUP → APPS & WIDGETS → New app token, then scan its QR code, tap \"Open in app\", or paste the URL and token here.")
                    .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                scanButton(prominent: false)
                Field(label: "SERVER URL", text: $serverText, placeholder: "https://gym.example.com", secure: false, keyboard: .URL)
                Field(label: "APP TOKEN", text: $token, placeholder: "ht_…", secure: true)
            } else {
                Text("Only a Hevy API key (hevy.com → Settings → Developer). The phone reads your workouts from Hevy and computes the graph, streak, totals and lift e1RMs itself. No program, GYM logging, recovery or insights in this mode.")
                    .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                Field(label: "HEVY API KEY", text: $apiKey, placeholder: "xxxxxxxx-xxxx-…", secure: true)
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Cap("UNIT", T.faint, size: 9)
                        HStack(spacing: 0) {
                            ForEach(["kg", "lb"], id: \.self) { u in
                                Button { unit = u; if model.source == .direct { model.directSettingsChanged(unit: unit, weekTarget: weekTarget) } } label: {
                                    Text(u.uppercased()).font(T.mono(11, .bold)).foregroundStyle(unit == u ? T.bg : T.dim)
                                        .frame(width: 44).padding(.vertical, 6).background(unit == u ? T.amber : Color.clear)
                                }.buttonStyle(.plain)
                            }
                        }
                        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Cap("SESSIONS / WEEK (STREAK)", T.faint, size: 9)
                        Stepper(value: $weekTarget, in: 1...7) {
                            Text("\(weekTarget)").font(T.mono(14, .bold)).foregroundStyle(T.text)
                        }
                        .onChange(of: weekTarget) { _, v in if model.source == .direct { model.directSettingsChanged(unit: unit, weekTarget: v) } }
                    }
                }
            }

            HStack(spacing: 10) {
                TermButton(title: testing ? "TESTING…" : "TEST", disabled: testing || !canSubmit) { Task { await test() } }
                TermButton(title: "SAVE & SYNC", style: .primary, disabled: !canSubmit || model.loading) { Task { await save() } }
            }
            if let r = testResult {
                switch r {
                case .success(let m): Cap(m, T.up, size: 10, weight: .bold)
                case .failure(let e): Text(e.errorDescription ?? "Failed").font(T.mono(10, .bold)).foregroundStyle(T.down)
                }
            }
        }
    }

    func seg(_ s: DataSource, _ title: String) -> some View {
        Button { choice = s; testResult = nil } label: {
            HStack(spacing: 6) {
                Text(title).font(T.mono(12, .bold))
                if model.source == s { Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)) }
            }
            .foregroundStyle(choice == s ? T.bg : T.dim)
            .frame(maxWidth: .infinity).padding(.vertical, 9)
            .background(choice == s ? T.amber : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    var serverOrigin: URL? { ConnectLink.origin(serverText) }

    var canSubmit: Bool {
        if model.demo { return false }
        return choice == .server ? (serverOrigin != nil && !token.trimmingCharacters(in: .whitespaces).isEmpty) : !apiKey.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func test() async {
        testing = true
        testResult = await SyncService.test(source: choice, server: serverOrigin, token: token.trimmingCharacters(in: .whitespaces), apiKey: apiKey.trimmingCharacters(in: .whitespaces), session: model.session)
        testing = false
    }

    func save() async {
        testResult = nil
        if choice == .server, let url = serverOrigin {
            serverText = url.absoluteString
            await model.connectServer(url, token: token.trimmingCharacters(in: .whitespaces))
        } else if choice == .direct {
            await model.useDirect(apiKey: apiKey.trimmingCharacters(in: .whitespaces), unit: unit, weekTarget: weekTarget)
        }
        if model.error == nil { model.tab = .today; model.setMore([]) }
    }

    // MARK: widgets

    var widgetsPanel: some View {
        Panel(title: "WIDGETS", detail: "REFRESH ~30 MIN") {
            Cap("GRAPH THEME", T.faint, size: 9)
            HStack(spacing: 8) {
                ForEach(ColorTheme.allCases) { t in
                    Button { model.theme = t } label: {
                        VStack(spacing: 4) {
                            HStack(spacing: 2) { ForEach(1..<5) { l in Rectangle().fill(t.color(for: l)).frame(width: 9, height: 9) } }
                            Text(t.displayName).font(T.mono(9, .bold)).foregroundStyle(model.theme == t ? T.amber : T.dim)
                        }
                        .padding(.vertical, 7).frame(maxWidth: .infinity)
                        .overlay(Rectangle().stroke(model.theme == t ? T.amber : T.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            Text("Widgets read the same data source and fetch on their own every ~30 minutes; the app refreshes them after every sync. Long-press a widget → Edit to pick a theme or lift.")
                .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            Button { model.morePath.append(AppModel.More.gallery) } label: {
                HStack {
                    Image(systemName: "square.grid.2x2")
                    Text("WIDGET GALLERY").font(T.mono(11, .bold))
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .foregroundStyle(T.amber)
                .padding(.vertical, 10).padding(.horizontal, 10)
                .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

struct Field: View {
    var label: String
    @Binding var text: String
    var placeholder: String
    var secure: Bool
    var keyboard: UIKeyboardType = .default
    @State private var reveal = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Cap(label, T.faint, size: 9)
            HStack {
                Group {
                    if secure && !reveal { SecureField(placeholder, text: $text) } else { TextField(placeholder, text: $text).keyboardType(keyboard) }
                }
                .font(T.mono(13))
                .foregroundStyle(T.text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                if secure {
                    Button { reveal.toggle() } label: { Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(T.faint) }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(Color(hex: 0x0B0C0E))
            .overlay(Rectangle().stroke(T.line, lineWidth: 1))
        }
    }
}

struct SafariLink: Identifiable {
    var url: URL
    var id: String { url.absoluteString }
}

struct SafariView: UIViewControllerRepresentable {
    var url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let c = SFSafariViewController(url: url)
        c.preferredControlTintColor = UIColor(red: 1, green: 0.69, blue: 0, alpha: 1)
        c.preferredBarTintColor = .black
        c.dismissButtonStyle = .close
        return c
    }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}
}

struct GymPrefsPanel: View {
    @ObservedObject var prefs: GymPrefs

    var body: some View {
        Panel(title: "GYM", detail: "ON THIS PHONE") {
            toggle("REST ALERT", "Notification when rest ends, also when locked", $prefs.restAlerts)
            toggle("LIVE ACTIVITY", "Rest countdown on the lock screen and Dynamic Island", $prefs.liveActivity)
            toggle("HAPTICS", "Buzz on each set and when rest ends", $prefs.haptics)
            toggle("KEEP SCREEN ON", "While a session is running", $prefs.keepAwake)
            toggle("AUTO-ADVANCE", "Scroll to the next exercise when one is done", $prefs.autoAdvance)
            HStack(spacing: 16) {
                bar("BAR LB", $prefs.barLb, [45, 35, 33, 25, 15])
                bar("BAR KG", $prefs.barKg, [20, 15, 10, 7])
            }
        }
    }

    func toggle(_ t: String, _ sub: String, _ b: Binding<Bool>) -> some View {
        Toggle(isOn: b) {
            VStack(alignment: .leading, spacing: 1) {
                Text(t).font(T.mono(11, .bold)).foregroundStyle(T.text)
                Text(sub).font(T.mono(9)).foregroundStyle(T.faint)
            }
        }
        .tint(T.amber)
    }

    func bar(_ t: String, _ b: Binding<Double>, _ opts: [Double]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Cap(t, T.faint, size: 9)
            Menu {
                ForEach(opts, id: \.self) { o in Button(Fmt.weight(o)) { b.wrappedValue = o } }
            } label: {
                HStack {
                    Text(Fmt.weight(b.wrappedValue)).font(T.mono(13, .bold)).foregroundStyle(T.text)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 9)).foregroundStyle(T.faint)
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .overlay(Rectangle().stroke(T.line, lineWidth: 1))
            }
        }
    }
}
