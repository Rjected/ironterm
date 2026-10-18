import XCTest
@testable import Ironterm

@MainActor
final class OfflineQueueTests: XCTestCase {
    func tempFile() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("q-\(UUID().uuidString).json") }
    func session(_ id: String, title: String = "T") -> LiveSession {
        var s = Live.emptySession(unit: "kg", now: Date(timeIntervalSince1970: 0))
        s.id = id
        s.title = title
        return s
    }

    func testCoalescesSavesOfTheSameSession() {
        let q = OfflineQueue(file: nil)
        q.enqueue(.putLive(session("a", title: "1")))
        q.enqueue(.putLive(session("a", title: "2")))
        q.enqueue(.putLive(session("b")))
        XCTAssertEqual(q.ops, [.putLive(session("a", title: "2")), .putLive(session("b"))], "only the newest copy of a")
        // finishing drops the pending save of that session
        q.enqueue(.finish(session("a"), queuedAt: "x"))
        XCTAssertEqual(q.ops, [.putLive(session("b")), .finish(session("a"), queuedAt: "x")])
        XCTAssertEqual(q.pendingFinishes, 1)
    }

    func testFlushInOrderAndStopsWhenOffline() async {
        let q = OfflineQueue(file: nil)
        var sent: [OfflineQueue.Op] = []
        var online = false
        q.sender = { op in
            guard online else { throw ApiError.network("offline") }
            sent.append(op)
            return FinishResult(workout: .init(id: "w1"))
        }
        var finished: [String] = []
        q.onFinished = { s, r in finished.append("\(s.id):\(r?.workout.id ?? "")") }
        q.enqueue(.putLive(session("a")))
        q.enqueue(.finish(session("b"), queuedAt: "t"))
        q.enqueue(.discard(sessionId: "c"))
        let ok1 = await q.flush()
        XCTAssertFalse(ok1)
        XCTAssertEqual(q.ops.count, 3, "nothing lost while offline")
        online = true
        let ok2 = await q.flush()
        XCTAssertTrue(ok2)
        XCTAssertEqual(sent, [.putLive(session("a")), .finish(session("b"), queuedAt: "t"), .discard(sessionId: "c")])
        XCTAssertEqual(finished, ["b:w1"])
        XCTAssertTrue(q.ops.isEmpty)
    }

    func testServerErrorsRetryClientErrorsDrop() async {
        let q = OfflineQueue(file: nil)
        var code = 503
        q.sender = { _ in throw ApiError.http(code, "nope") }
        q.enqueue(.finish(session("a"), queuedAt: "t"))
        _ = await q.flush()
        XCTAssertEqual(q.ops.count, 1, "5xx is transient")
        code = 409
        _ = await q.flush()
        XCTAssertEqual(q.ops.count, 1, "409: the server is still saving an earlier attempt, retry later")
        code = 400
        _ = await q.flush()
        XCTAssertTrue(q.ops.isEmpty, "4xx won't get better")
        XCTAssertEqual(q.failures.count, 1)
        XCTAssertEqual(q.failures.first?.message, "Server error 400: nope")
    }

    func testConcurrentFlushesSendOnce() async {
        let q = OfflineQueue(file: nil)
        var sent = 0
        q.sender = { _ in
            sent += 1
            try await Task.sleep(for: .milliseconds(50))
            return FinishResult(workout: .init(id: "w"))
        }
        q.enqueue(.finish(session("a"), queuedAt: "t"))
        async let a = q.flush()
        async let b = q.flush()
        let r = await (a, b)
        XCTAssertTrue(r.0 && r.1)
        XCTAssertEqual(sent, 1, "a workout is never posted twice")
    }

    func testPersistsAcrossLaunches() {
        let f = tempFile()
        let q = OfflineQueue(file: f)
        q.enqueue(.finish(session("a"), queuedAt: "t"))
        let q2 = OfflineQueue(file: f)
        XCTAssertEqual(q2.ops, [.finish(session("a"), queuedAt: "t")])
    }
}

/// GymStore against an in-process stub server: debounced saves, offline FINISH, resume.
@MainActor
final class GymStoreTests: XCTestCase {
    let base = URL(string: "https://gym.test")!
    var online = true
    var puts: [LiveSession] = []
    var finishes: [LiveSession] = []
    var deletes = 0
    var finishBody = #"{"workout":{"id":"w-1"},"demo":true,"prs":[{"lift":"bench","short":"BENCH","kind":"rep","reps":1,"weight":325,"prev":320}]}"#

    override func setUp() {
        StubProtocol.requests = []
        online = true
        puts = []; finishes = []; deletes = 0
        let gymJSON = try! LiveTests.fixture("gym")
        let startJSON = try! LiveTests.fixture("gym-start")
        StubProtocol.handler = { [unowned self] r in
            // URLProtocol runs off the main thread; the test only reads these after awaiting
            guard self.online else { return (599, Data()) }
            let body = r.httpBodyStream.map { s -> Data in
                s.open(); defer { s.close() }
                var d = Data(); var buf = [UInt8](repeating: 0, count: 4096)
                while s.hasBytesAvailable { let n = s.read(&buf, maxLength: buf.count); if n <= 0 { break }; d.append(buf, count: n) }
                return d
            } ?? r.httpBody ?? Data()
            switch (r.httpMethod ?? "GET", r.url?.path ?? "") {
            case ("GET", "/api/app/gym"): return (200, gymJSON)
            case ("POST", "/api/app/gym/start"): return (200, startJSON)
            case ("PUT", "/api/live"): self.puts.append(try! JSONDecoder().decode(LiveSession.self, from: body)); return (200, Data(#"{"ok":true}"#.utf8))
            case ("DELETE", "/api/live"): self.deletes += 1; return (200, Data(#"{"ok":true}"#.utf8))
            case ("POST", "/api/live/finish"):
                self.finishes.append(try! JSONDecoder().decode(LiveSession.self, from: body))
                return (200, Data(self.finishBody.utf8))
            default: return (404, Data())
            }
        }
    }

    func store() -> GymStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gym-\(UUID().uuidString)")
        let d = UserDefaults(suiteName: "gym-\(UUID().uuidString)")!
        let prefs = GymPrefs(defaults: d)
        prefs.liveActivity = false
        prefs.restAlerts = false
        let g = GymStore(directory: dir, prefs: prefs)
        g.apiProvider = { [base] in AppAPI(base: base, token: "ht_x", session: StubProtocol.session) }
        g.debounce = .milliseconds(50)
        return g
    }

    func testStartOnlineThenDebouncedSave() async throws {
        let g = store()
        await g.load()
        XCTAssertEqual(g.gym?.days.count, 4)
        await g.start(dayIndex: nil, empty: false)
        let s = try XCTUnwrap(g.session)
        XCTAssertEqual(s.id, try AppAPI.decode(LiveSession.self, LiveTests.fixture("gym-start")).id, "the server's session")
        g.complete(exId: s.exercises[0].id, set: 0)
        g.complete(exId: s.exercises[0].id, set: 1)
        XCTAssertTrue(puts.isEmpty, "debounced")
        try await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(puts.count, 1, "two changes, one PUT")
        XCTAssertEqual(puts.last?.exercises[0].sets.filter(\.done).count, 2)
        // the session survives a relaunch
        XCTAssertEqual(GymStore.load(g.queue.file!.deletingLastPathComponent().appendingPathComponent("live.json"))?.id, s.id)
    }

    func testFinishOfflineIsQueuedThenSent() async throws {
        let g = store()
        await g.load()
        online = false
        await g.start(dayIndex: nil, empty: false)
        let s = try XCTUnwrap(g.session, "starts offline from the cached plan")
        XCTAssertEqual(s.dayId, "A2")
        XCTAssertEqual(s.exercises.count, 3)
        XCTAssertEqual(s.exercises[0].slotId, "a2-t1", "offline start uses the server's plan (slot ids, rest, notes)")
        XCTAssertEqual(s.exercises[0].ifSuccess, "10 reps → 330")
        g.complete(exId: s.exercises[0].id, set: 0)
        await g.finish()
        XCTAssertNil(g.session)
        XCTAssertEqual(g.finished?.queued, true)
        XCTAssertEqual(g.queue.pendingFinishes, 1)
        XCTAssertTrue(finishes.isEmpty)
        online = true
        await g.queue.flush()
        XCTAssertEqual(finishes.count, 1)
        XCTAssertEqual(finishes[0].id, s.id)
        XCTAssertEqual(g.finished?.queued, false)
        XCTAssertEqual(g.finished?.workoutId, "w-1")
        XCTAssertEqual(g.finished?.prs.first?.short, "BENCH", "records arrive with the queued upload too")
        XCTAssertTrue(g.queue.ops.isEmpty)
    }

    func testFinishOnlineShowsSummary() async throws {
        let g = store()
        await g.start(dayIndex: nil, empty: false)
        let s = try XCTUnwrap(g.session)
        for i in 0..<5 { g.complete(exId: s.exercises[0].id, set: i) }
        await g.finish()
        XCTAssertEqual(finishes.count, 1)
        let f = try XCTUnwrap(g.finished)
        XCTAssertFalse(f.queued)
        XCTAssertTrue(f.demo)
        XCTAssertEqual(f.summary.sets, 1)
        XCTAssertEqual(f.summary.exercises.first?.name, "Bench Press")
        XCTAssertEqual(f.prs, [FinishPR(lift: "bench", short: "BENCH", kind: "rep", reps: 1, weight: 325, prev: 320)])
    }

    func testFinishOnALocalModeServerSaysSo() async throws {
        finishBody = #"{"workout":{"id":"local-1"},"local":true,"prs":[]}"#
        let g = store()
        await g.start(dayIndex: nil, empty: false)
        let s = try XCTUnwrap(g.session)
        g.complete(exId: s.exercises[0].id, set: 0)
        await g.finish()
        let f = try XCTUnwrap(g.finished)
        XCTAssertTrue(f.local, "no Hevy on the server: the summary must not say it went to Hevy")
        XCTAssertFalse(f.demo)
    }

    func testDiscardDeletesOnServer() async throws {
        let g = store()
        await g.start(dayIndex: nil, empty: true)
        XCTAssertNotNil(g.session)
        await g.discard()
        XCTAssertNil(g.session)
        XCTAssertEqual(deletes, 1)
    }

    func testAdoptsNewerSessionFromServer() throws {
        let g = store()
        var server = try JSONDecoder().decode(LiveSession.self, from: LiveTests.fixture("gym-start"))
        g.adopt(server: server)
        XCTAssertEqual(g.session?.id, server.id, "nothing local: take the server's")
        // a local session touched later wins over an older one from the server
        g.update { Live.completeSet($0, exId: $0.exercises[0].id, 0, now: Date()) }
        let mine = server.id
        server.id = "other"
        g.adopt(server: server)
        XCTAssertEqual(g.session?.id, mine)
    }
}
