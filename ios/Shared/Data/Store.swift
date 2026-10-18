import Foundation
import Security

/// Where the data comes from. No lock-in: the user can switch any time in SETUP.
enum DataSource: String, Codable, CaseIterable {
    case none, server, direct
}

/// Shared state between the app and the widget extension: settings in the App Group's
/// UserDefaults, secrets in the Keychain (shared through the App Group access group), and the
/// last snapshot + raw Direct-mode workouts as files in the App Group container.
final class Store {
    static let appGroup = "group.dev.ironterm"
    static let shared = Store()

    let defaults: UserDefaults
    let directory: URL
    let keychain: Keychain

    init(defaults: UserDefaults? = nil, directory: URL? = nil, keychain: Keychain? = nil) {
        let d = defaults ?? UserDefaults(suiteName: Store.appGroup) ?? .standard
        self.defaults = d
        let dir = directory
            ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Store.appGroup)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.directory = dir
        self.keychain = keychain ?? Keychain(service: "dev.ironterm", accessGroup: Store.appGroup, fallback: d)
    }

    // MARK: settings

    var source: DataSource {
        get { DataSource(rawValue: defaults.string(forKey: "source") ?? "") ?? .none }
        set { defaults.set(newValue.rawValue, forKey: "source") }
    }

    /// Server origin, e.g. https://gym.example.com
    var serverURL: URL? {
        get { defaults.string(forKey: "serverURL").flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: "serverURL") }
    }

    var appToken: String? {
        get { keychain.get("appToken") }
        set { keychain.set(newValue, for: "appToken") }
    }

    var apiKey: String? {
        get { keychain.get("apiKey") }
        set { keychain.set(newValue, for: "apiKey") }
    }

    var theme: ColorTheme {
        get { ColorTheme(rawValue: defaults.string(forKey: "colorTheme") ?? "") ?? .blue }
        set { defaults.set(newValue.rawValue, forKey: "colorTheme") }
    }

    /// Direct mode only: the server knows these from the program; here the user sets them.
    var directUnit: String {
        get { defaults.string(forKey: "directUnit") ?? (Locale.current.measurementSystem == .us ? "lb" : "kg") }
        set { defaults.set(newValue, forKey: "directUnit") }
    }

    var weekTarget: Int {
        get { let v = defaults.integer(forKey: "weekTarget"); return v > 0 ? v : 3 }
        set { defaults.set(newValue, forKey: "weekTarget") }
    }

    var lastSync: Date? {
        get { defaults.object(forKey: "lastSync") as? Date }
        set { defaults.set(newValue, forKey: "lastSync") }
    }

    var lastError: String? {
        get { defaults.string(forKey: "lastError") }
        set { defaults.set(newValue, forKey: "lastError") }
    }

    var isConfigured: Bool {
        switch source {
        case .server: return serverURL != nil && !(appToken ?? "").isEmpty
        case .direct: return !(apiKey ?? "").isEmpty
        case .none: return false
        }
    }

    // MARK: caches

    private var snapshotFile: URL { directory.appendingPathComponent("snapshot.json") }
    private var workoutsFile: URL { directory.appendingPathComponent("workouts.json") }

    func loadSnapshot() -> Snapshot? {
        guard let data = try? Data(contentsOf: snapshotFile) else { return nil }
        return try? Snapshot.decode(data)
    }

    func saveSnapshot(_ s: Snapshot?) {
        if let s, let data = try? s.encoded() { try? data.write(to: snapshotFile, options: .atomic) }
        else { try? FileManager.default.removeItem(at: snapshotFile) }
    }

    func loadWorkouts() -> [Workout] {
        guard let data = try? Data(contentsOf: workoutsFile) else { return [] }
        return (try? JSONDecoder().decode([Workout].self, from: data)) ?? []
    }

    func saveWorkouts(_ w: [Workout]?) {
        if let w, let data = try? JSONEncoder().encode(w) { try? data.write(to: workoutsFile, options: .atomic) }
        else { try? FileManager.default.removeItem(at: workoutsFile) }
    }

    /// Forget the connection (credentials + caches). Theme and Direct settings stay.
    func disconnect() {
        appToken = nil
        apiKey = nil
        serverURL = nil
        source = .none
        lastSync = nil
        lastError = nil
        saveSnapshot(nil)
        saveWorkouts(nil)
    }
}

/// Minimal generic-password Keychain wrapper. Items live in the App Group access group so the
/// widget extension can read them. If the build carries no entitlements (an unsigned simulator
/// build, errSecMissingEntitlement), it falls back to the App Group defaults so the app still
/// works; a properly signed device build always uses the Keychain.
final class Keychain {
    let service: String
    let accessGroup: String?
    let fallback: UserDefaults?

    init(service: String, accessGroup: String?, fallback: UserDefaults?) {
        self.service = service
        self.accessGroup = accessGroup
        self.fallback = fallback
    }

    private func query(_ account: String) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup { q[kSecAttrAccessGroup as String] = accessGroup }
        return q
    }

    func get(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecSuccess, let data = out as? Data { return String(data: data, encoding: .utf8) }
        if status == errSecMissingEntitlement { return fallback?.string(forKey: "kc." + account) }
        return nil
    }

    func set(_ value: String?, for account: String) {
        SecItemDelete(query(account) as CFDictionary)
        fallback?.removeObject(forKey: "kc." + account)
        guard let value, !value.isEmpty else { return }
        var q = query(account)
        q[kSecValueData as String] = Data(value.utf8)
        // readable by the widget after the first unlock, never synced off the device
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecMissingEntitlement { fallback?.set(value, forKey: "kc." + account) }
    }
}
