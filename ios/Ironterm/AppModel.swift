import SwiftUI
import WidgetKit

@MainActor
final class AppModel: ObservableObject {
    enum Tab: String, CaseIterable, Identifiable {
        case today, gym, friends, history, more
        var id: String { rawValue }
        var title: String { rawValue.uppercased() }
        var key: String {
            switch self {
            case .today: return "F1"
            case .gym: return "F2"
            case .friends: return "F3"
            case .history: return "F4"
            case .more: return "F5"
            }
        }
        var icon: String {
            switch self {
            case .today: return "square.grid.3x3.fill"
            case .gym: return "dumbbell.fill"
            case .friends: return "person.2.fill"
            case .history: return "list.bullet"
            case .more: return "ellipsis"
            }
        }
    }

    /// Screens under MORE.
    enum More: String, CaseIterable, Identifiable, Hashable {
        case lifts, calendar, program, programs, body, insights, stats, setup, gallery
        var id: String { rawValue }
        var title: String { rawValue.uppercased() }
        /// needs the server's program / analytics (Direct mode shows "needs a server")
        var serverOnly: Bool { ![.lifts, .setup, .gallery].contains(self) }
    }

    @Published var tab: Tab = .today
    /// navigation path of the MORE tab. A NavigationPath, not [More]: screens pushed inside MORE
    /// (a lift's detail, a workout) are other types, and a typed path silently refuses them.
    @Published var morePath = NavigationPath()
    /// the MORE screens last opened by name (deep links, launch args, after starting a program)
    private(set) var moreScreens: [More] = []

    /// Replace the MORE stack with these screens.
    func setMore(_ screens: [More]) {
        moreScreens = screens
        morePath = NavigationPath(screens)
    }
    /// navigation path of the FRIENDS tab
    @Published var socialPath: [SocialRoute] = []
    /// FRIENDS tab section (FEED / FRIENDS / MINE)
    @Published var socialSection: SocialSection = .feed
    /// the sheet shown over the FRIENDS tab
    @Published var socialSheet: SocialSheet?
    /// bumped after a sync or a saved workout so screens refetch
    @Published var dataVersion = 0
    @Published var snapshot: Snapshot?
    @Published var loading = false
    @Published var error: String?
    @Published var authFailed = false
    @Published var source: DataSource
    @Published var lastSync: Date?
    @Published var pendingLink: ConnectLink?
    @Published var linkError: String?
    @Published var theme: ColorTheme { didSet { store.theme = theme; reloadWidgets() } }

    let store: Store
    let demo: Bool
    var session: URLSession = .shared
    let gym: GymStore
    let prefs: GymPrefs
    let social: SocialStore
    /// demo mode's in-memory social backend
    private var demoSocial: DemoSocial?

    init(arguments: [String] = ProcessInfo.processInfo.arguments, store injected: Store? = nil) {
        let args = LaunchArgs(arguments)
        demo = args.demo
        if args.demo {
            // never touch the real App Group or Keychain in demo mode
            let suite = "ironterm.demo"
            let d = UserDefaults(suiteName: suite)!
            d.removePersistentDomain(forName: suite)
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("demo", isDirectory: true)
            store = Store(defaults: d, directory: dir, keychain: Keychain(service: "demo", accessGroup: nil, fallback: nil))
            source = args.demoDirect ? .direct : .server
            snapshot = args.demoDirect ? Fixture.directSample : Fixture.sample
            lastSync = Date().addingTimeInterval(-4 * 60)
            if let e = args.demoError {
                error = e == "401" ? ApiError.unauthorized(.server).errorDescription : e
                authFailed = e == "401"
            }
            if args.demoEmpty { snapshot = nil; source = .none; lastSync = nil }
            prefs = GymPrefs(defaults: d)
            gym = GymStore(directory: dir.appendingPathComponent("gym", isDirectory: true), prefs: prefs)
            social = SocialStore(useCache: false, defaults: d)
            let mode = DemoSocial.Mode(rawValue: args.demoSocial ?? "") ?? .normal
            demoSocial = args.demoDirect || args.demoEmpty ? nil : DemoSocial(mode: mode)

        } else {
            store = injected ?? .shared
            source = store.source
            snapshot = store.isConfigured ? store.loadSnapshot() : nil
            lastSync = store.lastSync
            error = store.isConfigured ? store.lastError : nil
            prefs = GymPrefs()
            gym = GymStore(prefs: prefs)
            social = SocialStore()
        }
        theme = store.theme
        if let t = args.tab { open(t) }
        if let sc = args.socialScreen { openSocial(sc) }
        if demo, args.demoSocial == DemoSocial.Mode.offline.rawValue {
            // what the cache would hold: the last good copy from 3 hours ago
            let then = Date().addingTimeInterval(-3 * 3600)
            let sample = DemoSocial.sample(now: then)
            social.seed(me: SocialMe(enabled: true, handle: "alex", name: "Alex", server: DemoSocial.myServer, directory: nil, listed: true, fingerprint: nil),
                        friends: sample.friends, feed: FeedPage(items: sample.feed, next: nil), notifications: sample.notes,
                        mine: FeedPage(items: sample.mine, next: nil))
            social.fromCache = true
            social.fetchedAt = then
        }
        if let link = args.demoLink { pendingLink = link }
        demoServer = args.demoServer.flatMap(URL.init(string:))
        gym.apiProvider = { [weak self] in self?.api }
        social.serviceProvider = { [weak self] in self?.socialService }
        gym.onWorkoutSaved = { [weak self] in
            guard let self else { return }
            self.dataVersion += 1
            Task { await self.refresh() }
        }
    }

    /// The app screens API (Server mode only).
    var api: AppAPI? {
        guard !demo, source == .server, let base = store.serverURL, let token = store.appToken, !token.isEmpty else { return nil }
        return AppAPI(base: base, token: token, session: session)
    }

    /// The owner's social API (Server mode, or the in-memory demo).
    var socialService: SocialService? {
        if demo { return demoSocial }
        return api.map { SocialAPI(api: $0) }
    }

    /// Open a tab or a MORE screen by name (launch argument, widget link).
    func open(_ name: String) {
        let n = name.lowercased()
        if let t = Tab(rawValue: n) { tab = t; if t == .more { setMore([]) }; return }
        if n == "notifications" || n == "feed" { tab = .friends; openSocial(n); return }
        if n == "graph" { tab = .today; return }
        if n == "web" { tab = .more; setMore([.setup]); return }
        if let m = More(rawValue: n) {
            tab = .more
            setMore(m == .gallery ? [.setup, .gallery] : [m])
        }
    }

    func showSetup() { open("setup") }

    private var directCache: (version: Int, screens: DirectScreens)?

    /// Direct mode: LIFTS / HISTORY documents computed from the cached Hevy workouts.
    var direct: DirectScreens? {
        guard source == .direct else { return nil }
        if let c = directCache, c.version == dataVersion { return c.screens }
        let d = DirectScreens(workouts: store.loadWorkouts(), unit: store.directUnit)
        directCache = (dataVersion, d)
        return d
    }

    private(set) var demoServer: URL?
    var serverURL: URL? { demo ? demoServer : store.serverURL }
    var appToken: String? { demo ? nil : store.appToken }

    func reloadWidgets() {
        guard !demo else { return }
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: sync

    func refresh(full: Bool = false) async {
        guard !demo else { return }
        guard store.isConfigured else { error = nil; snapshot = nil; return }
        loading = true
        defer { loading = false }
        do {
            snapshot = try await SyncService(store: store, session: session).sync(full ? .fullResync : .app)
            error = nil
            authFailed = false
        } catch let e as ApiError {
            error = e.errorDescription
            authFailed = e.isAuth
            if snapshot == nil { snapshot = store.loadSnapshot() }
        } catch {
            self.error = error.localizedDescription
        }
        lastSync = store.lastSync
        dataVersion += 1
        reloadWidgets()
    }

    func connectServer(_ url: URL, token: String) async {
        store.serverURL = url
        store.appToken = token
        store.apiKey = nil
        store.saveWorkouts(nil)
        store.source = .server
        source = .server
        snapshot = nil
        AppCache.clear()
        social.reset()
        socialPath = []
        await refresh()
        await gym.load()
    }

    func useDirect(apiKey: String, unit: String, weekTarget: Int) async {
        store.apiKey = apiKey
        store.directUnit = unit
        store.weekTarget = weekTarget
        store.appToken = nil
        store.serverURL = nil
        store.source = .direct
        source = .direct
        snapshot = nil
        social.reset()
        socialPath = []
        await refresh()
    }

    /// Unit / weekly target changed: recompute from cached workouts, no network.
    func directSettingsChanged(unit: String, weekTarget: Int) {
        store.directUnit = unit
        store.weekTarget = weekTarget
        if let s = SyncService(store: store).recomputeDirect() { snapshot = s; reloadWidgets() }
    }

    func disconnect() {
        store.disconnect()
        source = .none
        snapshot = nil
        error = nil
        authFailed = false
        lastSync = nil
        AppCache.clear()
        social.reset()
        socialPath = []
        dataVersion += 1
        reloadWidgets()
    }

    // MARK: URLs

    func handle(_ url: URL) {
        if url.host?.lowercased() == "tab" {
            open(url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            return
        }
        switch ConnectLink.parse(url) {
        case .success(let link): pendingLink = link // confirmed by the user before anything is saved
        case .failure(let e):
            linkError = switch e {
            case .notConnectLink: "Unknown link: \(url.absoluteString.prefix(80))"
            case .missingServer: "The link has no server."
            case .invalidServer: "The link's server isn't an http(s) URL."
            case .missingToken: "The link has no token."
            }
        }
    }

    static let notAConnectCode = "That QR isn't an \(Brand.name) connect code."

    /// Text from the QR scanner: the same parser and confirmation sheet as the URL scheme.
    @discardableResult
    func handleScanned(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: t), case .success(let link) = ConnectLink.parse(url) {
            pendingLink = link
            return true
        }
        linkError = Self.notAConnectCode
        return false
    }

    func acceptPendingLink() async {
        guard let link = pendingLink else { return }
        pendingLink = nil
        if demo { return }
        tab = .today
        await connectServer(link.server, token: link.token)
    }
}

/// Launch arguments used for screenshots and UI checks:
///   -demoFixture            load the bundled sample snapshot, no network, no stored data touched
///   -demoDirect             the sample as Direct mode sees it (no program / recovery)
///   -demoError 401|<text>   show the error banner
///   -demoEmpty              not-connected empty state
///   -demoLink               show the connect-link confirmation
///   -demoServer <origin>    server shown in demo mode
///   -startTab <tab|screen>  today gym friends history more, or a MORE screen (lifts calendar … setup, gallery)
///   -demoSocial <mode>      FRIENDS demo: normal (default) setup empty error offline
///   -socialScreen <name>    FRIENDS screen: feed friends mine add notifications profile compare share accept comments
struct LaunchArgs {
    var demo = false, demoDirect = false, demoEmpty = false
    var demoError: String?
    var demoServer: String?
    var tab: String?
    var demoLink: ConnectLink?
    var demoSocial: String?
    var socialScreen: String?

    init(_ a: [String]) {
        func value(_ k: String) -> String? {
            guard let i = a.firstIndex(of: k), i + 1 < a.count, !a[i + 1].hasPrefix("-") else { return nil }
            return a[i + 1]
        }
        demoDirect = a.contains("-demoDirect")
        demoEmpty = a.contains("-demoEmpty")
        demo = a.contains("-demoFixture") || demoDirect || demoEmpty
        demoError = value("-demoError")
        tab = value("-startTab")
        demoServer = value("-demoServer")
        demoSocial = value("-demoSocial")
        socialScreen = value("-socialScreen")
        if a.contains("-demoLink"), demo {
            demoLink = ConnectLink(server: URL(string: "https://gym.example.com")!, token: "ht_demo")
        }
    }
}
