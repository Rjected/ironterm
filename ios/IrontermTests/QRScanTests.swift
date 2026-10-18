import XCTest
@testable import Ironterm

@MainActor
final class QRScanTests: XCTestCase {
    func model() -> AppModel { AppModel(arguments: ["app", "-demoFixture"]) }

    func testAcceptsConnectLink() {
        let m = model()
        XCTAssertTrue(m.handleScanned("ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc"))
        XCTAssertEqual(m.pendingLink, ConnectLink(server: URL(string: "https://gym.example.com")!, token: "ht_abc"))
        XCTAssertNil(m.linkError)
    }

    func testTrimsWhitespaceAroundPayload() {
        let m = model()
        XCTAssertTrue(m.handleScanned("  ironterm://connect?server=http%3A%2F%2F192.168.1.20%3A8787&token=ht_x\n"))
        XCTAssertEqual(m.pendingLink?.server.absoluteString, "http://192.168.1.20:8787")
    }

    func testRejectsOtherText() {
        for text in ["https://gym.example.com", "hello", "", "ironterm://tab/lifts",
                     "ironterm://connect?token=ht_x", "hevyterminal://connect?server=https%3A%2F%2Fa.b&token=ht_1",
                     "WIFI:S:home;T:WPA;P:secret;;"] {
            let m = model()
            XCTAssertFalse(m.handleScanned(text), text)
            XCTAssertNil(m.pendingLink, text)
            XCTAssertEqual(m.linkError, "That QR isn't an Ironterm connect code.", text)
        }
    }

    func testScannerUnsupportedOnSimulator() {
        #if targetEnvironment(simulator)
        XCTAssertFalse(QRScanner.isSupported)
        #endif
    }
}
