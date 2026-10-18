import XCTest
@testable import Ironterm

final class ATSMessageTests: XCTestCase {
    func testPlainHttpToAPublicServerExplainsItself() {
        let ats = ApiError.transport(URLError(.appTransportSecurityRequiresSecureConnection))
        XCTAssertEqual(ats, .network("iOS only allows http:// to servers on your local network. Use https:// for this server."))
        let offline = ApiError.transport(URLError(.notConnectedToInternet))
        XCTAssertEqual(offline, .network(URLError(.notConnectedToInternet).localizedDescription))
    }
}

/// In-process HTTP stub: every request made through `StubProtocol.session` is answered by `handler`.
final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?
    static var requests: [URLRequest] = []
    static let lock = NSLock()

    static var session: URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: c)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock(); Self.requests.append(request); let h = Self.handler; Self.lock.unlock()
        let (code, body) = h?(request) ?? (500, Data())
        let resp = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class NetworkTests: XCTestCase {
    let base = URL(string: "https://gym.test")!
    var fixture: Data!

    override func setUp() {
        fixture = try! Data(contentsOf: Bundle.main.url(forResource: "snapshot.sample", withExtension: "json")!)
        StubProtocol.requests = []
        StubProtocol.handler = nil
    }

    /// A Store in a temp dir with its own defaults and no Keychain, so tests never touch real data.
    func tempStore() -> Store {
        let suite = "test.\(UUID().uuidString)"
        let d = UserDefaults(suiteName: suite)!
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(suite)
        return Store(defaults: d, directory: dir, keychain: Keychain(service: suite, accessGroup: nil, fallback: d))
    }

    /// Server stub that requires the right Bearer token, like the real worker.
    func serverHandler(token: String) -> (URLRequest) -> (Int, Data) {
        { [fixture] r in
            guard r.value(forHTTPHeaderField: "Authorization") == "Bearer \(token)" else {
                return (401, Data(#"{"error":"login required","auth":"google"}"#.utf8))
            }
            switch (r.httpMethod ?? "GET", r.url?.path ?? "") {
            case ("GET", "/api/snapshot"): return (200, fixture!)
            case ("POST", "/api/sync"): return (200, Data(#"{"ok":true}"#.utf8))
            default: return (404, Data())
            }
        }
    }

    func testFetchSnapshotSendsBearer() async throws {
        StubProtocol.handler = serverHandler(token: "ht_good")
        let s = try await ServerClient(base: base, token: "ht_good", session: StubProtocol.session).fetchSnapshot()
        XCTAssertEqual(s.program?.name, "GZCLP 4-Day")
        let r = try XCTUnwrap(StubProtocol.requests.last)
        XCTAssertEqual(r.url?.absoluteString, "https://gym.test/api/snapshot")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer ht_good")
    }

    func testRevokedTokenIs401() async {
        StubProtocol.handler = serverHandler(token: "ht_good")
        do {
            _ = try await ServerClient(base: base, token: "ht_revoked", session: StubProtocol.session).fetchSnapshot()
            XCTFail("expected 401")
        } catch let e as ApiError {
            XCTAssertEqual(e, .unauthorized(.server))
            XCTAssertTrue(e.isAuth)
            XCTAssertEqual(e.errorDescription, "Token revoked or invalid. Reconnect.")
        } catch { XCTFail("\(error)") }
    }

    func testServerErrorAndBadJSON() async {
        StubProtocol.handler = { _ in (503, Data("overloaded".utf8)) }
        do { _ = try await ServerClient(base: base, token: "t", session: StubProtocol.session).fetchSnapshot(); XCTFail() } catch let e as ApiError {
            XCTAssertEqual(e, .http(503, "overloaded"))
        } catch { XCTFail("\(error)") }
        StubProtocol.handler = { _ in (200, Data("<html>".utf8)) }
        do { _ = try await ServerClient(base: base, token: "t", session: StubProtocol.session).fetchSnapshot(); XCTFail() } catch let e as ApiError {
            if case .decoding = e {} else { XCTFail("\(e)") }
        } catch { XCTFail("\(error)") }
    }

    func testSyncServiceServerCachesAndRecords401() async throws {
        let store = tempStore()
        store.source = .server
        store.serverURL = base
        store.appToken = "ht_good"
        StubProtocol.handler = serverHandler(token: "ht_good")
        let s = try await SyncService(store: store, session: StubProtocol.session).sync()
        XCTAssertEqual(store.loadSnapshot(), s, "snapshot is cached for the widgets")
        XCTAssertNotNil(store.lastSync)
        XCTAssertTrue(StubProtocol.requests.contains { $0.httpMethod == "POST" && $0.url?.path == "/api/sync" })

        // token revoked on the server: the error is recorded, the cached snapshot survives
        store.appToken = "ht_revoked"
        do { try await SyncService(store: store, session: StubProtocol.session).sync(.widget); XCTFail() } catch {}
        XCTAssertEqual(store.lastError, "Token revoked or invalid. Reconnect.")
        XCTAssertEqual(store.loadSnapshot(), s)
    }

    @MainActor func testAppModelShows401() async {
        let store = tempStore()
        store.source = .server
        store.serverURL = base
        store.appToken = "ht_revoked"
        store.saveSnapshot(Fixture.sample)
        StubProtocol.handler = serverHandler(token: "ht_good")
        let m = AppModel(arguments: ["app"], store: store)
        m.session = StubProtocol.session
        await m.refresh()
        XCTAssertTrue(m.authFailed)
        XCTAssertEqual(m.error, "Token revoked or invalid. Reconnect.")
        XCTAssertEqual(m.snapshot, Fixture.sample, "keeps showing the cached data")
    }

    // MARK: Direct mode (Hevy API)

    func hevyWorkout(_ id: String, _ date: String, updated: String = "u1") -> String {
        """
        {"id":"\(id)","title":"W\(id)","start_time":"\(date)T10:00:00+00:00","end_time":"\(date)T11:00:00+00:00","updated_at":"\(updated)",
         "exercises":[{"title":"Bench Press (Barbell)","exercise_template_id":"79D0BB3A","sets":[{"type":"normal","weight_kg":100,"reps":5}]}]}
        """
    }

    func hevyHandler(key: String, pages: [[String]]) -> (URLRequest) -> (Int, Data) {
        { r in
            guard r.value(forHTTPHeaderField: "api-key") == key else { return (401, Data(#"{"error":"Unauthorized"}"#.utf8)) }
            let q = URLComponents(url: r.url!, resolvingAgainstBaseURL: false)!.queryItems ?? []
            let page = Int(q.first { $0.name == "page" }?.value ?? "1") ?? 1
            XCTAssertEqual(q.first { $0.name == "pageSize" }?.value, "10")
            guard page <= pages.count else { return (404, Data()) }
            return (200, Data(#"{"page":\#(page),"page_count":\#(pages.count),"workouts":[\#(pages[page - 1].joined(separator: ","))]}"#.utf8))
        }
    }

    func testHevyPagingAndIncremental() async throws {
        let pages = [[hevyWorkout("5", "2026-10-14"), hevyWorkout("4", "2026-10-12")],
                     [hevyWorkout("3", "2026-10-09"), hevyWorkout("2", "2026-10-07")],
                     [hevyWorkout("1", "2026-10-05")]]
        StubProtocol.handler = hevyHandler(key: "k", pages: pages)
        let client = HevyClient(apiKey: "k", session: StubProtocol.session)
        let all = try await client.fetch(merging: [])
        XCTAssertEqual(Set(all.map(\.id)), ["1", "2", "3", "4", "5"])
        XCTAssertEqual(StubProtocol.requests.count, 3)
        XCTAssertTrue(StubProtocol.requests.allSatisfy { $0.url?.host == "api.hevyapp.com" && $0.url?.path == "/v1/workouts" })

        // one new workout on page 1, the rest unchanged: stops after page 2 (all known)
        StubProtocol.requests = []
        let pages2 = [[hevyWorkout("6", "2026-10-15"), hevyWorkout("5", "2026-10-14")],
                      [hevyWorkout("4", "2026-10-12"), hevyWorkout("3", "2026-10-09")],
                      [hevyWorkout("2", "2026-10-07"), hevyWorkout("1", "2026-10-05")]]
        StubProtocol.handler = hevyHandler(key: "k", pages: pages2)
        let merged = try await client.fetch(merging: all)
        XCTAssertEqual(Set(merged.map(\.id)), ["1", "2", "3", "4", "5", "6"])
        XCTAssertEqual(StubProtocol.requests.count, 2)
    }

    func testDirectSyncBuildsSnapshot() async throws {
        let store = tempStore()
        store.source = .direct
        store.apiKey = "k"
        store.directUnit = "kg"
        store.weekTarget = 2
        StubProtocol.handler = hevyHandler(key: "k", pages: [[hevyWorkout("1", "2026-10-14")]])
        let s = try await SyncService(store: store, session: StubProtocol.session).sync()
        XCTAssertEqual(s.totals.allTime, 1)
        XCTAssertEqual(s.lifts.first?.key, "bench")
        XCTAssertNil(s.recovery)
        XCTAssertEqual(store.loadWorkouts().count, 1)
        XCTAssertEqual(store.loadSnapshot(), s)
    }

    func testDirectBadKeyIs401() async {
        StubProtocol.handler = hevyHandler(key: "right", pages: [[]])
        let r = await SyncService.test(source: .direct, server: nil, token: "", apiKey: "wrong", session: StubProtocol.session)
        XCTAssertEqual(r, .failure(.unauthorized(.direct)))
        XCTAssertEqual(ApiError.unauthorized(.direct).errorDescription, "Hevy rejected the API key. Check it in SETUP.")
    }

    func testConnectionTestServer() async {
        StubProtocol.handler = serverHandler(token: "ht_good")
        let ok = await SyncService.test(source: .server, server: base, token: "ht_good", apiKey: "", session: StubProtocol.session)
        XCTAssertEqual(ok, .success("OK · 178 WORKOUTS · LB · GZCLP 4-DAY"))
        let bad = await SyncService.test(source: .server, server: base, token: "ht_nope", apiKey: "", session: StubProtocol.session)
        XCTAssertEqual(bad, .failure(.unauthorized(.server)))
    }
}

/// Optional end-to-end check against the real local mock server (Tools/mock_server.py), which
/// verifies the Bearer header itself. Runs when TEST_RUNNER_MOCK_SERVER=http://127.0.0.1:8787 is set.
final class LiveMockServerTests: XCTestCase {
    func testAgainstMockServer() async throws {
        guard let raw = ProcessInfo.processInfo.environment["MOCK_SERVER"], let base = URL(string: raw) else {
            throw XCTSkip("set TEST_RUNNER_MOCK_SERVER to run against Tools/mock_server.py")
        }
        let s = try await ServerClient(base: base, token: "ht_test_good").fetchSnapshot()
        XCTAssertEqual(s.v, 1)
        do {
            _ = try await ServerClient(base: base, token: "ht_test_revoked").fetchSnapshot()
            XCTFail("expected 401")
        } catch let e as ApiError {
            XCTAssertEqual(e.errorDescription, "Token revoked or invalid. Reconnect.")
        }
    }
}
