import Security
import XCTest
@testable import Ironterm

/// In-memory stand-in for the SecItem API, keyed by service + account.
final class FakeKeychain: KeychainBackend {
    var items: [String: Data] = [:]
    var accessible: [String: String] = [:]
    var missingEntitlement = false

    private func key(_ q: [String: Any]) -> String {
        let service: String = q[kSecAttrService as String] as? String ?? ""
        let account: String = q[kSecAttrAccount as String] as? String ?? ""
        return service + "/" + account
    }

    func copy(_ query: [String: Any]) -> (OSStatus, Data?) {
        if missingEntitlement { return (errSecMissingEntitlement, nil) }
        guard let d = items[key(query)] else { return (errSecItemNotFound, nil) }
        return (errSecSuccess, d)
    }

    func add(_ query: [String: Any]) -> OSStatus {
        if missingEntitlement { return errSecMissingEntitlement }
        let k: String = key(query)
        if items[k] != nil { return errSecDuplicateItem }
        items[k] = query[kSecValueData as String] as? Data
        accessible[k] = query[kSecAttrAccessible as String] as? String
        return errSecSuccess
    }

    func delete(_ query: [String: Any]) -> OSStatus {
        if missingEntitlement { return errSecMissingEntitlement }
        return items.removeValue(forKey: key(query)) == nil ? errSecItemNotFound : errSecSuccess
    }
}

final class KeychainTests: XCTestCase {
    var defaults: UserDefaults!
    var fake: FakeKeychain!

    override func setUp() {
        defaults = UserDefaults(suiteName: "kc.\(UUID().uuidString)")!
        fake = FakeKeychain()
    }

    func keychain(fallbackAllowed: Bool) -> Keychain {
        Keychain(service: "svc", accessGroup: "group.test", fallback: defaults, backend: fake, allowsPlaintextFallback: fallbackAllowed)
    }

    func testStoresInKeychainThisDeviceOnlyAndNotInDefaults() {
        let kc: Keychain = keychain(fallbackAllowed: false)
        kc.set("ht_secret", for: "appToken")
        XCTAssertEqual(kc.get("appToken"), "ht_secret")
        XCTAssertNil(defaults.string(forKey: "kc.appToken"))
        XCTAssertEqual(fake.accessible["svc/appToken"], kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }

    func testOverwriteAndClear() {
        let kc: Keychain = keychain(fallbackAllowed: false)
        kc.set("ht_one", for: "appToken")
        kc.set("ht_two", for: "appToken")
        XCTAssertEqual(kc.get("appToken"), "ht_two")
        kc.set(nil, for: "appToken")
        XCTAssertNil(kc.get("appToken"))
        XCTAssertTrue(fake.items.isEmpty)
    }

    func testMigratesPlaintextValueIntoKeychain() {
        defaults.set("ht_old", forKey: "kc.appToken")
        let kc: Keychain = keychain(fallbackAllowed: false)
        XCTAssertEqual(kc.get("appToken"), "ht_old")
        XCTAssertNil(defaults.string(forKey: "kc.appToken"), "plaintext copy removed")
        XCTAssertEqual(fake.items["svc/appToken"], Data("ht_old".utf8))
        XCTAssertEqual(kc.get("appToken"), "ht_old")
    }

    func testStalePlaintextRemovedWhenKeychainHasValue() {
        let kc: Keychain = keychain(fallbackAllowed: false)
        kc.set("ht_new", for: "appToken")
        defaults.set("ht_stale", forKey: "kc.appToken")
        XCTAssertEqual(kc.get("appToken"), "ht_new")
        XCTAssertNil(defaults.string(forKey: "kc.appToken"))
    }

    func testNoPlaintextFallbackOnDevice() {
        fake.missingEntitlement = true
        let kc: Keychain = keychain(fallbackAllowed: false)
        kc.set("ht_secret", for: "appToken")
        XCTAssertNil(defaults.string(forKey: "kc.appToken"), "never written in plaintext")
        XCTAssertNil(kc.get("appToken"))
    }

    func testPlaintextFallbackOnlyWhenAllowed() {
        fake.missingEntitlement = true
        let kc: Keychain = keychain(fallbackAllowed: true)
        kc.set("ht_secret", for: "appToken")
        XCTAssertEqual(kc.get("appToken"), "ht_secret")
        kc.set(nil, for: "appToken")
        XCTAssertNil(defaults.string(forKey: "kc.appToken"))
    }
}
