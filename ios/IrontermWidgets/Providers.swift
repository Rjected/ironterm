import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration intents

enum ThemeOption: String, AppEnum {
    case app, blue, green, purple, orange

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Theme"
    static let caseDisplayRepresentations: [ThemeOption: DisplayRepresentation] = [
        .app: "Same as app", .blue: "Blue (Terminal)", .green: "Green", .purple: "Purple", .orange: "Orange",
    ]

    var colorTheme: ColorTheme { ColorTheme(rawValue: rawValue) ?? Store.shared.theme }
}

struct ActivityIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Activity graph"
    static let description = IntentDescription("Colour ramp for the contribution graph.")

    @Parameter(title: "Theme", default: .app)
    var theme: ThemeOption
}

struct LiftEntity: AppEntity {
    var id: String
    var name: String

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Lift"
    static let defaultQuery = LiftQuery()
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

/// Lifts come from the cached snapshot (whatever the user actually trains), else the big four.
struct LiftQuery: EntityQuery {
    func all() -> [LiftEntity] {
        let lifts = (Store.shared.loadSnapshot() ?? Fixture.sample).lifts
        if !lifts.isEmpty { return lifts.map { LiftEntity(id: $0.key, name: $0.name) } }
        return LiftLibrary.all.filter { LiftLibrary.bigFour.contains($0.key) }.map { LiftEntity(id: $0.key, name: $0.name) }
    }

    func entities(for identifiers: [String]) async throws -> [LiftEntity] {
        let a = all()
        return identifiers.map { id in a.first { $0.id == id } ?? LiftEntity(id: id, name: LiftLibrary.all.first { $0.key == id }?.name ?? id) }
    }

    func suggestedEntities() async throws -> [LiftEntity] { all() }

    func defaultResult() async -> LiftEntity? { all().first }
}

struct LiftIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Lift"
    static let description = IntentDescription("Which lift the small widget shows.")

    @Parameter(title: "Lift")
    var lift: LiftEntity?
}

enum LockCircularOption: String, AppEnum {
    case week, streak
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Circle shows"
    static let caseDisplayRepresentations: [LockCircularOption: DisplayRepresentation] = [
        .week: "This week ring", .streak: "Week streak",
    ]
}

struct LockIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Lock screen"
    static let description = IntentDescription("What the round lock screen widget shows.")

    @Parameter(title: "Circle shows", default: .week)
    var circular: LockCircularOption
}

// MARK: - Loading

enum WidgetLoader {
    /// Cached snapshot, refreshed from the network first unless the app synced in the last 10 min.
    static func load(refresh: Bool) async -> WidgetData {
        let store = Store.shared
        guard store.isConfigured else {
            return WidgetData(snapshot: nil, source: store.source, error: nil)
        }
        var failure: String?
        let recent = store.lastSync.map { Date().timeIntervalSince($0) < 600 } ?? false
        if refresh && !recent {
            do {
                try await SyncGate.shared.run()
            } catch let e as ApiError {
                failure = e.errorDescription
            } catch {
                failure = "Couldn't refresh."
            }
        }
        return WidgetData(snapshot: store.loadSnapshot(), source: store.source, error: failure)
    }

    static func preview() -> WidgetData {
        let store = Store.shared
        if store.isConfigured, let s = store.loadSnapshot() { return WidgetData(snapshot: s, source: store.source, error: nil) }
        return .sample
    }

    static var nextRefresh: Date { Date().addingTimeInterval(30 * 60) }
}

/// Every widget kind asks for a timeline at about the same time; they share one network sync.
actor SyncGate {
    static let shared = SyncGate()
    private var inFlight: Task<Void, Error>?

    func run() async throws {
        if let t = inFlight { return try await t.value }
        let t = Task<Void, Error> {
            _ = try await withTimeout(seconds: 25) { try await SyncService(store: .shared).sync(.widget) }
        }
        inFlight = t
        defer { inFlight = nil }
        try await t.value
    }
}

struct TimeoutError: Error {}

func withTimeout<T>(seconds: Double, _ op: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { g in
        g.addTask { try await op() }
        g.addTask { try await Task.sleep(nanoseconds: UInt64(seconds * 1e9)); throw TimeoutError() }
        let r = try await g.next()!
        g.cancelAll()
        return r
    }
}

// MARK: - Providers

struct SnapEntry<Config>: TimelineEntry {
    let date: Date
    let data: WidgetData
    let config: Config
}

struct IntentProvider<I: WidgetConfigurationIntent>: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SnapEntry<I> {
        SnapEntry(date: Date(), data: .sample, config: I())
    }

    func snapshot(for configuration: I, in context: Context) async -> SnapEntry<I> {
        SnapEntry(date: Date(), data: context.isPreview ? WidgetLoader.preview() : await WidgetLoader.load(refresh: false), config: configuration)
    }

    func timeline(for configuration: I, in context: Context) async -> Timeline<SnapEntry<I>> {
        let data = await WidgetLoader.load(refresh: true)
        return Timeline(entries: [SnapEntry(date: Date(), data: data, config: configuration)], policy: .after(WidgetLoader.nextRefresh))
    }
}

struct NoConfig {}

struct StaticProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapEntry<NoConfig> {
        SnapEntry(date: Date(), data: .sample, config: NoConfig())
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapEntry<NoConfig>) -> Void) {
        if context.isPreview { completion(SnapEntry(date: Date(), data: WidgetLoader.preview(), config: NoConfig())); return }
        Task { completion(SnapEntry(date: Date(), data: await WidgetLoader.load(refresh: false), config: NoConfig())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry<NoConfig>>) -> Void) {
        Task {
            let data = await WidgetLoader.load(refresh: true)
            completion(Timeline(entries: [SnapEntry(date: Date(), data: data, config: NoConfig())], policy: .after(WidgetLoader.nextRefresh)))
        }
    }
}
