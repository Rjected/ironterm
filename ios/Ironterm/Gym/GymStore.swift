import Foundation
import SwiftUI
import UIKit

/// GYM preferences (SETUP → GYM). Stored on the phone only.
final class GymPrefs: ObservableObject {
    private let d: UserDefaults
    init(defaults: UserDefaults = .standard) {
        d = defaults
        restAlerts = d.object(forKey: "gym.restAlerts") as? Bool ?? true
        haptics = d.object(forKey: "gym.haptics") as? Bool ?? true
        keepAwake = d.object(forKey: "gym.keepAwake") as? Bool ?? true
        liveActivity = d.object(forKey: "gym.liveActivity") as? Bool ?? true
        autoAdvance = d.object(forKey: "gym.autoAdvance") as? Bool ?? true
        barLb = d.object(forKey: "gym.barLb") as? Double ?? 45
        barKg = d.object(forKey: "gym.barKg") as? Double ?? 20
    }
    /// local notification when rest ends (also when the phone is locked)
    @Published var restAlerts: Bool { didSet { d.set(restAlerts, forKey: "gym.restAlerts") } }
    @Published var haptics: Bool { didSet { d.set(haptics, forKey: "gym.haptics") } }
    @Published var keepAwake: Bool { didSet { d.set(keepAwake, forKey: "gym.keepAwake") } }
    @Published var liveActivity: Bool { didSet { d.set(liveActivity, forKey: "gym.liveActivity") } }
    /// scroll to and open the next exercise when one is finished
    @Published var autoAdvance: Bool { didSet { d.set(autoAdvance, forKey: "gym.autoAdvance") } }
    @Published var barLb: Double { didSet { d.set(barLb, forKey: "gym.barLb") } }
    @Published var barKg: Double { didSet { d.set(barKg, forKey: "gym.barKg") } }

    func bar(_ unit: String) -> Double { unit == "lb" ? barLb : barKg }
}

/// The GYM session, offline first: every change is saved to a local file at once and sent to the
/// server (PUT /api/live) debounced. FINISH is queued while offline and sent when back online.
@MainActor
final class GymStore: ObservableObject {
    @Published private(set) var session: LiveSession?
    @Published var gym: AppGym?
    @Published var loading = false
    @Published var error: String?
    /// set after FINISH: what to show on the summary screen
    @Published var finished: FinishedInfo?
    @Published var busy = false

    struct FinishedInfo: Equatable {
        var session: LiveSession
        var summary: Live.Summary
        /// nil while queued offline
        var workoutId: String?
        var queued: Bool
        var demo: Bool
        var prs: [FinishPR] = []
        /// stored on a server with no Hevy connected
        var local: Bool = false
    }

    let queue: OfflineQueue
    let prefs: GymPrefs
    let rest: RestController
    private let dir: URL
    private var saveTask: Task<Void, Never>?
    var apiProvider: () -> AppAPI? = { nil }
    var onWorkoutSaved: (() -> Void)?
    var debounce: Duration = .milliseconds(800)

    init(directory: URL? = nil, prefs: GymPrefs = GymPrefs(), rest: RestController? = nil) {
        let d = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("gym", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        dir = d
        self.prefs = prefs
        self.rest = rest ?? RestController(prefs: prefs)
        queue = OfflineQueue(file: d.appendingPathComponent("outbox.json"))
        session = Self.load(d.appendingPathComponent("live.json"))
        if let data = try? Data(contentsOf: d.appendingPathComponent("gym.json")) { gym = try? JSONDecoder().decode(AppGym.self, from: data) }
        queue.sender = { [weak self] op in try await self?.send(op) }
        queue.onFinished = { [weak self] s, id in self?.finishedUploaded(s, id) }
        self.rest.sync(session)
    }

    private var liveFile: URL { dir.appendingPathComponent("live.json") }

    nonisolated static func load(_ url: URL) -> LiveSession? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(LiveSession.self, from: data)
    }

    private func persist() {
        if let s = session, let data = try? JSONEncoder().encode(s) { try? data.write(to: liveFile, options: .atomic) }
        else { try? FileManager.default.removeItem(at: liveFile) }
    }

    // MARK: loading

    /// Fetch the gym document (next session, days, catalog) and adopt a session started elsewhere.
    func load() async {
        guard let api = apiProvider() else { return }
        loading = true
        defer { loading = false }
        await queue.flush()
        do {
            let (g, raw): (AppGym, Data) = try await api.getRaw("/api/app/gym")
            gym = g
            error = nil
            try? raw.write(to: dir.appendingPathComponent("gym.json"), options: .atomic)
            adopt(server: g.live)
        } catch let e as ApiError {
            error = e.isTransient ? nil : e.errorDescription // offline is fine here: we have the cache
        } catch {}
    }

    /// Server and phone disagree about the running session: keep the one touched last.
    func adopt(server: LiveSession?) {
        guard let server else { return }
        if queue.ops.contains(where: { if case .discard(let id) = $0 { return id == server.id }; if case .finish(let s, _) = $0 { return s.id == server.id }; return false }) { return }
        if let local = session {
            if local.id == server.id || Self.lastTouched(local) >= Self.lastTouched(server) { return }
        }
        session = server
        persist()
        rest.sync(session)
    }

    nonisolated static func lastTouched(_ s: LiveSession) -> Date {
        let done = s.exercises.flatMap(\.sets).compactMap { $0.doneAt.flatMap(Live.parse) }
        return ([s.startDate] + done).max() ?? s.startDate
    }

    // MARK: skip a workout

    /// Skip the program's next session (`dayId`) or, with nil, bring back the last skip. Needs the
    /// server: the program moves on there. Returns the server's message, nil on failure (`error` says why).
    @discardableResult
    func skipWorkout(dayId: String?) async -> String? {
        guard let api = apiProvider() else {
            error = "Skipping a workout needs the server."
            return nil
        }
        busy = true
        defer { busy = false }
        do {
            let r = try await api.skipWorkout(dayId: dayId)
            gym = r.gym
            if let data = try? JSONEncoder().encode(r.gym) { try? data.write(to: dir.appendingPathComponent("gym.json"), options: .atomic) }
            onWorkoutSaved?()
            return r.message
        } catch {
            let what: String = dayId == nil ? "undo the skip" : "skip"
            self.error = "Couldn't \(what): \(Self.skipError(error))"
        }
        return nil
    }

    /// The server's own words for a refused skip ("the next session is A2, not A1"), else the error.
    nonisolated static func skipError(_ error: Error) -> String {
        guard let e = error as? ApiError else { return error.localizedDescription }
        switch e {
        case .http(let code, let msg) where code < 500 && !msg.isEmpty: return msg
        case .network: return "you're offline. Skipping a workout needs the server."
        default: return e.errorDescription ?? "error"
        }
    }

    // MARK: start / edit

    func start(dayIndex: Int?, empty: Bool) async {
        busy = true
        defer { busy = false }
        if let api = apiProvider() {
            do {
                let s = try await api.startGym(dayIndex: dayIndex, empty: empty)
                begin(s, saved: true)
                return
            } catch let e as ApiError where !e.isTransient {
                error = e.errorDescription
                return
            } catch {}
        }
        // offline (or Direct mode): build it here
        let unit = gym?.unit ?? "kg"
        var s: LiveSession
        let nextIndex = gym?.plan?.dayIndex ?? gym?.days.first(where: { $0.dayName == gym?.next?.dayName })?.dayIndex
        if !empty, dayIndex == nil || dayIndex == nextIndex,
           let plan = gym?.plan ?? gym?.next.flatMap({ Self.plan(from: $0, days: gym?.days ?? []) }) {
            s = Live.sessionFromPlan(plan, unit: unit, programName: gym?.programName ?? "Program")
        } else {
            s = Live.emptySession(unit: unit)
        }
        begin(s, saved: false)
    }

    /// The cached next session as a plan (used offline; the server adds slot ids and rest times).
    nonisolated static func plan(from n: Snapshot.NextSession, days: [AppGym.ProgramDay]) -> PlannedSession? {
        let day = days.first { $0.dayName == n.dayName }
        let dayId = day?.dayId ?? n.dayName.split(separator: "·").first.map { $0.replacingOccurrences(of: "Day", with: "").trimmingCharacters(in: .whitespaces) } ?? "?"
        return PlannedSession(dayIndex: day?.dayIndex, dayId: dayId, dayName: n.dayName, exercises: n.exercises.map { e in
            let rest: Double = e.tier == "T1" || e.tier == "MAIN" ? 180 : e.tier == "T2" || e.tier == "SUPP" ? 120 : 75
            return .init(slotId: nil, lift: e.lift, tier: e.tier, scheme: e.scheme,
                         sets: e.sets.map { .init(weight: $0.weight, reps: $0.reps, repsMax: $0.repsMax, amrap: $0.amrap, rpe: $0.rpe) },
                         restSeconds: rest)
        })
    }

    private func begin(_ s: LiveSession, saved: Bool) {
        session = s
        finished = nil
        persist()
        if !saved, apiProvider() != nil { queue.enqueue(.putLive(s)); Task { await queue.flush() } }
        rest.requestPermissionIfNeeded()
        rest.sync(session)
    }

    /// Apply a change: saved locally now, sent to the server debounced.
    func update(_ f: (LiveSession) -> LiveSession) {
        guard let cur = session else { return }
        let next = f(cur)
        guard next != cur else { return }
        session = next
        persist()
        rest.sync(session)
        scheduleSave()
    }

    func complete(exId: String, set i: Int) {
        update { Live.completeSet($0, exId: exId, i) }
        if prefs.haptics { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let delay = debounce
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self, let s = self.session else { return }
            self.queue.enqueue(.putLive(s))
            await self.queue.flush()
        }
    }

    /// Push any pending change now (app going to the background).
    func flushNow() async {
        saveTask?.cancel()
        if let s = session, saveTask != nil { queue.enqueue(.putLive(s)); saveTask = nil }
        await queue.flush()
    }

    // MARK: finish / discard

    func finish() async {
        guard let s = session else { return }
        busy = true
        defer { busy = false }
        saveTask?.cancel()
        let summary = Live.summary(s) { Self.name($0, catalog: gym?.catalog) }
        let api = apiProvider()
        if let api {
            // A save still queued (or in flight) would PUT the session back after the finish, and the
            // next load would adopt the finished workout as a running one.
            await queue.cancelSaves(of: s.id)
            do {
                let r = try await api.finishLive(s)
                end()
                finished = FinishedInfo(session: s, summary: summary, workoutId: r.workout.id, queued: false, demo: r.demo == true, prs: r.prs ?? [], local: r.local == true)
                onWorkoutSaved?()
                return
            } catch let e as ApiError where !e.isTransient {
                // the server refused it: keep the session so nothing is lost
                error = "Couldn't save: \(e.errorDescription ?? "error"). Your session is kept, try again."
                return
            } catch {}
        }
        // offline: queue it, the session is done on the phone
        queue.enqueue(.finish(s, queuedAt: Live.iso(Date())))
        end()
        finished = FinishedInfo(session: s, summary: summary, workoutId: nil, queued: true, demo: false)
    }

    func discard() async {
        guard let s = session else { return }
        saveTask?.cancel()
        end()
        queue.enqueue(.discard(sessionId: s.id))
        await queue.flush()
    }

    private func end() {
        session = nil
        persist()
        rest.sync(nil)
    }

    private func finishedUploaded(_ s: LiveSession, _ r: FinishResult?) {
        if finished?.session.id == s.id {
            finished?.workoutId = r?.workout.id
            finished?.queued = false
            finished?.demo = r?.demo == true
            finished?.local = r?.local == true
            finished?.prs = r?.prs ?? []
        }
        onWorkoutSaved?()
    }

    private func send(_ op: OfflineQueue.Op) async throws -> FinishResult? {
        guard let api = apiProvider() else { throw ApiError.network("not connected") }
        switch op {
        case .putLive(let s): try await api.putLive(s); return nil
        case .discard: try await api.discardLive(); return nil
        case .finish(let s, _): return try await api.finishLive(s)
        }
    }

    // MARK: names

    nonisolated static func name(_ ex: LiveExercise, catalog: [AppGym.CatalogItem]?) -> String {
        if let t = ex.title, !t.isEmpty { return t }
        if let c = catalog?.first(where: { $0.key == ex.lift }) { return c.name }
        return LiftLibrary.byKey[ex.lift]?.name ?? ex.lift
    }

    func name(_ ex: LiveExercise) -> String { Self.name(ex, catalog: gym?.catalog) }

    func kind(_ lift: String) -> String {
        gym?.catalog.first { $0.key == lift }?.kind ?? LiftLibrary.kind(lift)
    }
}
