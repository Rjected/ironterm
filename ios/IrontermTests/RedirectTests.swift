import XCTest
@testable import Ironterm

/// Answers every request to `/start` with a 302 to `RedirectProtocol.target`, and records hosts.
final class RedirectProtocol: URLProtocol {
    static var target: URL = URL(string: "https://evil.test/api/snapshot")!
    static var hosts: [String] = []
    static var authHeaders: [String] = []
    static let lock = NSLock()

    static var session: URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [RedirectProtocol.self]
        return URLSession(configuration: c)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url: URL = request.url!
        Self.lock.lock()
        Self.hosts.append(url.host ?? "")
        Self.authHeaders.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
        Self.lock.unlock()
        if url.path == "/start" {
            let headers: [String: String] = ["Location": Self.target.absoluteString]
            let resp = HTTPURLResponse(url: url, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: headers)!
            var next = URLRequest(url: Self.target)
            next.allHTTPHeaderFields = request.allHTTPHeaderFields
            client?.urlProtocol(self, wasRedirectedTo: next, redirectResponse: resp)
            client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"ok":true}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class RedirectTests: XCTestCase {
    let base: URL = URL(string: "https://gym.test")!

    override func setUp() {
        RedirectProtocol.hosts = []
        RedirectProtocol.authHeaders = []
    }

    func testAllowsOnlySameOrigin() {
        let r = { (s: String) -> URLRequest in URLRequest(url: URL(string: s)!) }
        XCTAssertTrue(SameOriginRedirects.allows(r("https://gym.test/api/x"), from: base))
        XCTAssertTrue(SameOriginRedirects.allows(r("https://GYM.test:443/y"), from: base))
        XCTAssertFalse(SameOriginRedirects.allows(r("https://evil.test/api/x"), from: base))
        XCTAssertFalse(SameOriginRedirects.allows(r("http://gym.test/api/x"), from: base), "no downgrade to http")
        XCTAssertFalse(SameOriginRedirects.allows(r("https://gym.test:8443/"), from: base))
        XCTAssertFalse(SameOriginRedirects.allows(r("https://gym.test/"), from: nil))
    }

    func testTokenIsNotFollowedToAnotherHost() async throws {
        RedirectProtocol.target = URL(string: "https://evil.test/api/snapshot")!
        let api = AppAPI(base: base, token: "ht_secret", session: RedirectProtocol.session)
        do {
            _ = try await api.perform(api.client.request("/start"))
            XCTFail("the cross-origin redirect must not succeed")
        } catch let e as ApiError {
            XCTAssertEqual(e, .http(302, ""))
        }
        XCTAssertEqual(RedirectProtocol.hosts, ["gym.test"], "evil.test never contacted")
    }

    func testSameOriginRedirectIsFollowed() async throws {
        RedirectProtocol.target = URL(string: "https://gym.test/api/ok")!
        let api = AppAPI(base: base, token: "ht_secret", session: RedirectProtocol.session)
        _ = try await api.perform(api.client.request("/start"))
        XCTAssertEqual(RedirectProtocol.hosts, ["gym.test", "gym.test"])
    }
}
