import XCTest
@testable import Ironterm

final class DeepLinkTests: XCTestCase {
    func parse(_ s: String) -> Result<ConnectLink, ConnectLink.ParseError> { ConnectLink.parse(URL(string: s)!) }

    func testParsesDocumentedLink() throws {
        let r = parse("ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc123")
        XCTAssertEqual(try r.get(), ConnectLink(server: URL(string: "https://gym.example.com")!, token: "ht_abc123"))
    }

    func testNormalisesServerToOrigin() throws {
        let l = try parse("ironterm://connect?server=https%3A%2F%2Fgym.example.com%3A8443%2Fsome%2Fpath%3Fq%3D1&token=ht_x").get()
        XCTAssertEqual(l.server.absoluteString, "https://gym.example.com:8443")
        let local = try parse("ironterm://connect?server=http%3A%2F%2F192.168.1.20%3A8787%2F&token=ht_x").get()
        XCTAssertEqual(local.server.absoluteString, "http://192.168.1.20:8787")
    }

    func testCaseInsensitiveSchemeAndHost() throws {
        XCTAssertNoThrow(try parse("Ironterm://CONNECT?server=https%3A%2F%2Fa.b&token=ht_1").get())
    }

    func testRejectsBadLinks() {
        XCTAssertEqual(parse("ironterm://other?server=https%3A%2F%2Fa.b&token=ht_1"), .failure(.notConnectLink))
        XCTAssertEqual(parse("https://connect?server=https%3A%2F%2Fa.b&token=ht_1"), .failure(.notConnectLink))
        XCTAssertEqual(parse("ironterm://connect?token=ht_1"), .failure(.missingServer))
        XCTAssertEqual(parse("ironterm://connect?server=javascript%3Aalert(1)&token=ht_1"), .failure(.invalidServer))
        XCTAssertEqual(parse("ironterm://connect?server=ftp%3A%2F%2Fa.b&token=ht_1"), .failure(.invalidServer))
        XCTAssertEqual(parse("ironterm://connect?server=https%3A%2F%2Fuser%3Apw%40a.b&token=ht_1"), .failure(.invalidServer))
        XCTAssertEqual(parse("ironterm://connect?server=https%3A%2F%2Fa.b"), .failure(.missingToken))
        XCTAssertEqual(parse("ironterm://connect?server=https%3A%2F%2Fa.b&token=%20"), .failure(.missingToken))
    }

    func testOriginFromUserInput() {
        XCTAssertEqual(ConnectLink.origin("gym.example.com")?.absoluteString, "https://gym.example.com")
        XCTAssertEqual(ConnectLink.origin(" https://gym.example.com/ ")?.absoluteString, "https://gym.example.com")
        XCTAssertNil(ConnectLink.origin(""))
        XCTAssertNil(ConnectLink.origin("file:///etc/passwd"))
    }

    func testSameOrigin() {
        let base = URL(string: "https://gym.example.com")!
        XCTAssertTrue(ConnectLink.sameOrigin(URL(string: "https://gym.example.com/lifts?x=1")!, base))
        XCTAssertTrue(ConnectLink.sameOrigin(URL(string: "https://GYM.example.com:443/")!, base))
        XCTAssertFalse(ConnectLink.sameOrigin(URL(string: "http://gym.example.com/")!, base))
        XCTAssertFalse(ConnectLink.sameOrigin(URL(string: "https://gym.example.com.evil.com/")!, base))
        XCTAssertFalse(ConnectLink.sameOrigin(URL(string: "https://gym.example.com:8443/")!, base))
    }

    @MainActor func testAppModelHandlesTabAndConnectLinks() {
        let m = AppModel(arguments: ["app", "-demoFixture"])
        m.handle(URL(string: "ironterm://tab/lifts")!)
        XCTAssertEqual(m.tab, .more, "LIFTS lives under MORE now")
        XCTAssertEqual(m.moreScreens, [.lifts])
        XCTAssertEqual(m.morePath.count, 1)
        m.handle(URL(string: "ironterm://tab/friends")!)
        XCTAssertEqual(m.tab, .friends)
        m.handle(URL(string: "ironterm://tab/notifications")!)
        XCTAssertEqual(m.tab, .friends)
        XCTAssertEqual(m.socialPath, [.notifications])
        m.handle(URL(string: "ironterm://tab/body")!)
        XCTAssertEqual(m.tab, .more)
        XCTAssertEqual(m.moreScreens, [.body])
        m.handle(URL(string: "ironterm://tab/graph")!)
        XCTAssertEqual(m.tab, .today, "the old GRAPH tab lives on TODAY now")
        m.handle(URL(string: "ironterm://connect?server=https%3A%2F%2Fa.b&token=ht_1")!)
        XCTAssertEqual(m.pendingLink?.server.absoluteString, "https://a.b", "a link is only staged until the user confirms")
        m.handle(URL(string: "ironterm://connect?server=https%3A%2F%2Fa.b")!)
        XCTAssertNotNil(m.linkError)
    }

    func testSavedTokenNeverGoesToAnotherHost() {
        let saved: URL = URL(string: "https://gym.example.com")!
        let other: URL = URL(string: "https://evil.example.net")!
        XCTAssertTrue(ConnectLink.mayUseToken("ht_saved", for: saved, savedToken: "ht_saved", savedServer: saved))
        XCTAssertTrue(ConnectLink.mayUseToken("ht_saved", for: URL(string: "https://GYM.example.com:443")!, savedToken: "ht_saved", savedServer: saved))
        XCTAssertFalse(ConnectLink.mayUseToken("ht_saved", for: other, savedToken: "ht_saved", savedServer: saved))
        XCTAssertFalse(ConnectLink.mayUseToken("ht_saved", for: URL(string: "http://gym.example.com")!, savedToken: "ht_saved", savedServer: saved), "no https to http downgrade")
        XCTAssertFalse(ConnectLink.mayUseToken("ht_saved", for: URL(string: "https://gym.example.com:8443")!, savedToken: "ht_saved", savedServer: saved))
        XCTAssertTrue(ConnectLink.mayUseToken("ht_new", for: other, savedToken: "ht_saved", savedServer: saved), "a token entered for the new server is fine")
        XCTAssertTrue(ConnectLink.mayUseToken("ht_new", for: other, savedToken: nil, savedServer: nil))
        XCTAssertFalse(ConnectLink.mayUseToken("ht_saved", for: other, savedToken: "ht_saved", savedServer: nil))
    }

    func testConfirmationShowsHostAndFlagsCleartext() {
        let tls = ConnectLink(server: URL(string: "https://gym.example.com")!, token: "ht_1")
        XCTAssertEqual(tls.displayHost, "gym.example.com")
        XCTAssertFalse(tls.isCleartext)
        let lan = ConnectLink(server: URL(string: "http://192.168.1.20:8787")!, token: "ht_1")
        XCTAssertEqual(lan.displayHost, "192.168.1.20:8787")
        XCTAssertTrue(lan.isCleartext)
        guard case .success(let parsed) = ConnectLink.parse(URL(string: "ironterm://connect?server=HTTP%3A%2F%2Fbox.local&token=ht_2")!) else {
            return XCTFail("parses")
        }
        XCTAssertTrue(parsed.isCleartext)
        XCTAssertEqual(parsed.displayHost, "box.local")
    }
}
