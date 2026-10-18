import SwiftUI

@main
struct IrontermApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    /// Unit tests run inside the app: don't let it sync, flush the gym queue or poll friends against
    /// whatever server an earlier run left in the simulator's settings.
    private static let unitTestHost: Bool = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    var body: some Scene {
        WindowGroup {
            if Self.unitTestHost { Color.clear } else { app }
        }
    }

    private var app: some View {
        RootView()
            .environmentObject(model)
            .preferredColorScheme(.dark)
            .onOpenURL { model.handle($0) }
            .task { await model.refresh() }
            .task { await model.gym.load() }
            .onChange(of: phase) { _, p in
                if p == .background { Task { await model.gym.flushNow() } }
                guard p == .active else { return }
                // anything queued while offline goes out now
                Task { await model.gym.queue.flush() }
                // the bell and incoming requests
                Task { await model.social.refreshNotifications() }
                // refresh when coming back to the app if the data is older than 5 minutes
                if model.lastSync.map({ Date().timeIntervalSince($0) > 300 }) ?? true {
                    Task { await model.refresh(); await model.gym.load() }
                }
            }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    @State private var keyboard = false

    var body: some View {
        VStack(spacing: 0) {
            TopChrome(gym: model.gym)
            if let e = model.error { ErrorBanner(text: e, auth: model.authFailed) }
            ZStack {
                ForEach(AppModel.Tab.allCases) { t in
                    tabView(t)
                        .opacity(model.tab == t ? 1 : 0)
                        .allowsHitTesting(model.tab == t)
                        .accessibilityHidden(model.tab != t)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !keyboard {
                Divider1()
                TabBar(gym: model.gym, social: model.social)
            }
        }
        .background(T.bg.ignoresSafeArea())
        .tint(T.amber)
        // the bottom bar makes way for the keyboard
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboard = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboard = false }
        .alert("Link", isPresented: Binding(get: { model.linkError != nil }, set: { if !$0 { model.linkError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.linkError ?? "") }
        .sheet(isPresented: Binding(get: { model.pendingLink != nil }, set: { if !$0 { model.pendingLink = nil } })) {
            if let link = model.pendingLink { ConnectConfirm(link: link).presentationDetents([.height(link.isCleartext ? 400 : 350)]).termSheet() }
        }
    }

    @ViewBuilder func tabView(_ t: AppModel.Tab) -> some View {
        switch t {
        case .today: NavigationStack { TodayScreen().withRoutes() }
        case .gym: GymScreen()
        case .friends: FriendsRoot()
        case .history: NavigationStack { HistoryScreen().withRoutes() }
        case .more: MoreRoot()
        }
    }
}

/// The brand bar, hidden while a GYM session is on screen (the session header takes its place).
struct TopChrome: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore
    var body: some View {
        if !(model.tab == .gym && (gym.session != nil || gym.finished != nil)) {
            TopBar()
            Divider1()
        }
    }
}

struct TopBar: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        HStack(spacing: 8) {
            BrandBlock()
            if model.demo { Badge(text: "DEMO", color: T.faint) }
            Spacer()
            if model.loading {
                ProgressView().controlSize(.mini).tint(T.amber)
                Cap("SYNCING", T.amber, size: 9)
            } else {
                Cap(sourceLabel, T.dim, size: 9)
                Cap("· " + Fmt.ago(model.lastSync), T.faint, size: 9)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
    }

    var sourceLabel: String {
        switch model.source {
        case .server: return "SERVER"
        case .direct: return "DIRECT"
        case .none: return "OFFLINE"
        }
    }
}

/// The web app's brand block: amber block, black bold text.
struct BrandBlock: View {
    var size: CGFloat = 13
    var body: some View {
        Text(Brand.upper)
            .font(T.mono(size, .heavy))
            .tracking(size * 0.06)
            .foregroundStyle(Color.black)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(T.amber)
    }
}

struct ErrorBanner: View {
    @EnvironmentObject var model: AppModel
    var text: String
    var auth: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 11)).foregroundStyle(T.down)
            Text(text).font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            Button(auth ? "RECONNECT" : "RETRY") {
                if auth { model.showSetup() } else { Task { await model.refresh() } }
            }
            .font(T.mono(10, .bold))
            .foregroundStyle(T.amber)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(T.down.opacity(0.12))
        .overlay(alignment: .bottom) { Rectangle().fill(T.down.opacity(0.5)).frame(height: 1) }
    }
}

struct TabBar: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore
    @ObservedObject var social: SocialStore

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppModel.Tab.allCases) { t in
                let on = model.tab == t
                Button {
                    if on, t == .more { model.setMore([]) } // tap again: back to the MORE menu
                    if on, t == .friends { model.socialPath = [] }
                    model.tab = t
                } label: {
                    VStack(spacing: 3) {
                        HStack(spacing: 3) {
                            Text(t.key).font(T.mono(8)).foregroundStyle(on ? T.amber : T.faint)
                            if t == .gym, gym.session != nil {
                                Circle().fill(gym.session?.restEnd.map { $0 > Date() } == true ? T.amber : T.up).frame(width: 5, height: 5)
                            }
                            if t == .friends, social.attention {
                                Circle().fill(T.down).frame(width: 5, height: 5)
                            }
                        }
                        Text(t.title).font(T.mono(11, .bold)).foregroundStyle(on ? T.bg : T.dim)
                            .padding(.horizontal, 5).padding(.vertical, 3)
                            .background(on ? T.amber : Color.clear)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 7).padding(.bottom, 5)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label(t))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.horizontal, 4)
        .background(T.panel.ignoresSafeArea(edges: .bottom))
    }

    func label(_ t: AppModel.Tab) -> String {
        if t == .gym && gym.session != nil { return t.title + ", session running" }
        if t == .friends && social.attention { return t.title + ", new activity" }
        return t.title
    }
}

struct ConnectConfirm: View {
    @EnvironmentObject var model: AppModel
    var link: ConnectLink

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Cap("CONNECT TO SERVER?", T.amber, size: 12, weight: .bold)
            Text(link.displayHost).font(T.mono(17, .bold)).foregroundStyle(T.text)
                .lineLimit(2).minimumScaleFactor(0.6)
                .accessibilityIdentifier("connect-host")
            Text(link.server.absoluteString).font(T.mono(10)).foregroundStyle(T.faint)
            if link.isCleartext {
                Text("NOT ENCRYPTED (http): anyone on this network can read the token. Use it only on your own home network.")
                    .font(T.mono(10, .bold)).foregroundStyle(T.down).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("connect-cleartext")
            }
            Text("This app will send the token in the link (\(String(link.token.prefix(6)))…) to this server and read your training data from it. Only continue if this is your server and you just created the token in your own web app.")
                .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            if model.source != .none {
                Text("Replaces the current \(model.source == .server ? "server" : "Direct") connection.").font(T.mono(10)).foregroundStyle(T.faint)
            }
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                TermButton(title: "CANCEL", style: .secondary) { model.pendingLink = nil }
                TermButton(title: "CONNECT", style: .primary) { Task { await model.acceptPendingLink() } }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.panel.ignoresSafeArea())
    }
}

struct TermButton: View {
    enum Style { case primary, secondary, danger }
    var title: String
    var style: Style = .secondary
    var disabled = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(T.mono(11, .bold))
                .foregroundStyle(fg)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(style == .primary ? (disabled ? T.faint : T.amber) : Color.clear)
                .overlay(Rectangle().stroke(style == .primary ? Color.clear : (style == .danger ? T.down : T.line), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    var fg: Color {
        switch style {
        case .primary: return T.bg
        case .secondary: return disabled ? T.faint : T.text
        case .danger: return T.down
        }
    }
}

/// Section panel with an uppercase title on the line.
struct Panel<Content: View>: View {
    var title: String
    var detail: String = ""
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Cap(title, T.amber, size: 10, weight: .bold)
                Spacer()
                Cap(detail, T.dim, size: 10)
            }
            content
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

/// Loading / empty states shared by the data tabs.
struct DataGate<Content: View>: View {
    @EnvironmentObject var model: AppModel
    @ViewBuilder var content: (Snapshot) -> Content

    var body: some View {
        if let s = model.snapshot {
            ScrollView {
                content(s).padding(14)
            }
            .refreshable { await model.refresh() }
        } else if model.loading {
            VStack(spacing: 10) {
                ProgressView().tint(T.amber)
                Cap("FETCHING DATA…", T.dim, size: 11)
                if model.source == .direct { Cap("FIRST DIRECT SYNC READS EVERY WORKOUT", T.faint, size: 9) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.source == .none || !model.store.isConfigured && !model.demo {
            EmptyState(title: "NOT CONNECTED", message: "Pick a data source: your \(Brand.name) server, or Direct with just a Hevy API key.", button: "OPEN SETUP") { model.showSetup() }
        } else {
            EmptyState(title: "NO DATA YET", message: model.error ?? "Pull to refresh, or sync from SETUP.", button: "SYNC NOW") { Task { await model.refresh() } }
        }
    }
}

struct EmptyState: View {
    var title: String
    var message: String
    var button: String
    var action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("> _").font(T.mono(28, .bold)).foregroundStyle(T.amber)
            Cap(title, T.text, size: 14, weight: .bold)
            Text(message).font(T.mono(12)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            TermButton(title: button, style: .primary, action: action).frame(width: 180)
        }
        .padding(.horizontal, 24)
        .padding(.top, 72)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

extension View {
    /// Sheets in the terminal style (no light system background around the content).
    func termSheet() -> some View { presentationBackground(T.panel) }
}
