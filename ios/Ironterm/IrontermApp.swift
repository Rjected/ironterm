import SwiftUI

@main
struct IrontermApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .onOpenURL { model.handle($0) }
                .task { await model.refresh() }
                .onChange(of: phase) { _, p in
                    // refresh when coming back to the app if the data is older than 5 minutes
                    if p == .active, (model.lastSync.map { Date().timeIntervalSince($0) > 300 } ?? true) {
                        Task { await model.refresh() }
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            TopBar()
            Divider1()
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
            Divider1()
            TabBar()
        }
        .background(T.bg.ignoresSafeArea())
        .tint(T.amber)
        .alert("Link", isPresented: Binding(get: { model.linkError != nil }, set: { if !$0 { model.linkError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.linkError ?? "") }
        .sheet(isPresented: Binding(get: { model.pendingLink != nil }, set: { if !$0 { model.pendingLink = nil } })) {
            if let link = model.pendingLink { ConnectConfirm(link: link).presentationDetents([.height(320)]) }
        }
    }

    @ViewBuilder func tabView(_ t: AppModel.Tab) -> some View {
        switch t {
        case .today: TodayView()
        case .graph: GraphTab()
        case .lifts: LiftsTab()
        case .body: BodyTab()
        case .web: WebTab()
        case .setup: SetupView()
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
                if auth { model.tab = .setup } else { Task { await model.refresh() } }
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
    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppModel.Tab.allCases) { t in
                Button { model.tab = t } label: {
                    VStack(spacing: 2) {
                        Text(t.key).font(T.mono(8)).foregroundStyle(model.tab == t ? T.amber : T.faint)
                        Text(t.title).font(T.mono(10, .bold)).foregroundStyle(model.tab == t ? T.bg : T.dim)
                            .padding(.horizontal, 4).padding(.vertical, 2)
                            .background(model.tab == t ? T.amber : Color.clear)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.title)
                .accessibilityAddTraits(model.tab == t ? .isSelected : [])
            }
        }
        .padding(.horizontal, 4)
        .background(T.panel)
    }
}

struct ConnectConfirm: View {
    @EnvironmentObject var model: AppModel
    var link: ConnectLink

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Cap("CONNECT TO SERVER?", T.amber, size: 12, weight: .bold)
            Text(link.server.absoluteString).font(T.mono(15, .bold)).foregroundStyle(T.text)
            Text("This app will read your training data from this server with the token in the link (\(String(link.token.prefix(6)))…). Only continue if you just created the token in your own web app.")
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
            EmptyState(title: "NOT CONNECTED", message: "Pick a data source: your \(Brand.name) server, or Direct with just a Hevy API key.", button: "OPEN SETUP") { model.tab = .setup }
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
