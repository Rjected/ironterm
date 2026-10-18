import Foundation

/// One place that turns the stored settings into a fresh Snapshot. Used by the app (pull to
/// refresh, after connecting) and by every widget's timeline provider.
struct SyncService {
    var store: Store = .shared
    var session: URLSession = .shared

    enum Budget { case app, fullResync, widget }

    @discardableResult
    func sync(_ budget: Budget = .app) async throws -> Snapshot {
        do {
            let snap: Snapshot
            switch store.source {
            case .server:
                guard let base = store.serverURL, let token = store.appToken, !token.isEmpty else { throw ApiError.notConfigured }
                let client = ServerClient(base: base, token: token, session: session)
                if budget != .widget { await client.triggerSync() }
                snap = try await client.fetchSnapshot()
            case .direct:
                guard let key = store.apiKey, !key.isEmpty else { throw ApiError.notConfigured }
                let cached = budget == .fullResync ? [] : store.loadWorkouts()
                let maxPages = budget == .widget ? (cached.isEmpty ? 30 : 5) : 1000
                let workouts = try await HevyClient(apiKey: key, session: session).fetch(merging: cached, maxPages: maxPages)
                store.saveWorkouts(workouts)
                snap = DirectAggregator.snapshot(workouts: workouts, options: .init(unit: store.directUnit, tz: .current, weekTarget: store.weekTarget))
            case .none:
                throw ApiError.notConfigured
            }
            store.saveSnapshot(snap)
            store.lastSync = Date()
            store.lastError = nil
            return snap
        } catch let e as ApiError {
            store.lastError = e.errorDescription
            throw e
        } catch {
            store.lastError = error.localizedDescription
            throw error
        }
    }

    /// Re-run the Direct aggregation on cached workouts (after changing unit / weekly target).
    func recomputeDirect() -> Snapshot? {
        guard store.source == .direct else { return nil }
        let w = store.loadWorkouts()
        guard !w.isEmpty else { return nil }
        let s = DirectAggregator.snapshot(workouts: w, options: .init(unit: store.directUnit, tz: .current, weekTarget: store.weekTarget))
        store.saveSnapshot(s)
        return s
    }

    /// Test credentials without saving anything.
    static func test(source: DataSource, server: URL?, token: String, apiKey: String, session: URLSession = .shared) async -> Result<String, ApiError> {
        do {
            switch source {
            case .server:
                guard let server, !token.isEmpty else { return .failure(.notConfigured) }
                let s = try await ServerClient(base: server, token: token, session: session).fetchSnapshot()
                return .success("OK · \(s.totals.allTime) WORKOUTS · \(s.unit.uppercased())\(s.program.map { " · \($0.name.uppercased())" } ?? "")")
            case .direct:
                guard !apiKey.isEmpty else { return .failure(.notConfigured) }
                let p = try await HevyClient(apiKey: apiKey, session: session).page(1)
                return .success("OK · ~\(p.pageCount * HevyClient.pageSize) WORKOUTS")
            case .none:
                return .failure(.notConfigured)
            }
        } catch let e as ApiError {
            return .failure(e)
        } catch {
            return .failure(.transport(error))
        }
    }
}

/// The bundled demo snapshot (a copy of docs/api/snapshot.sample.json). Used for widget
/// placeholders/previews, the -demoFixture launch argument and tests.
enum Fixture {
    static let sample: Snapshot = {
        let bundles = [Bundle.main] + Bundle.allBundles + Bundle.allFrameworks
        for b in bundles {
            if let url = b.url(forResource: "snapshot.sample", withExtension: "json"),
               let data = try? Data(contentsOf: url), let s = try? Snapshot.decode(data) { return s }
        }
        return Snapshot(v: 1, generatedAt: "", today: Day.local(Date(), tz: .current), unit: "kg", tz: "UTC", demo: true,
                        graph: .init(start: "", days: []), streak: .init(current: 0, best: 0),
                        week: .init(target: 3, done: 0, days: []),
                        totals: .init(sessions52: 0, sessionsPrev52: 0, vol7: 0, volPrev7: 0, avgMin: 0, allTime: 0),
                        last: nil, program: nil, lifts: [], recovery: nil)
    }()

    /// The sample as Direct mode would see it: no program and no recovery.
    static var directSample: Snapshot {
        var s = sample
        s.program = nil
        s.recovery = nil
        return s
    }
}
