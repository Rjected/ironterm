import SwiftUI

/// Last good response of every screen document, so screens open instantly and work offline.
enum AppCache {
    static var dir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("app", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func file(_ key: String) -> URL {
        let safe = key.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
        return dir.appendingPathComponent(String(safe) + ".json")
    }

    static func load<T: Decodable>(_ key: String, as: T.Type) -> (T, Date)? {
        let url = file(key)
        guard let data = try? Data(contentsOf: url), let v = try? JSONDecoder().decode(T.self, from: data) else { return nil }
        let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        return (v, date)
    }

    static func save(_ key: String, _ data: Data) { try? data.write(to: file(key), options: .atomic) }

    static func clear() { try? FileManager.default.removeItem(at: dir) }
}

/// One screen document: cached value first, then the network.
@MainActor
final class Remote<Doc: Codable & Equatable & Sendable>: ObservableObject {
    @Published var value: Doc?
    @Published var error: String?
    @Published var loading = false
    /// when the shown value was fetched (cached values can be old)
    @Published var fetchedAt: Date?
    @Published var fromCache = false
    private(set) var key: String

    init(_ key: String) {
        self.key = key
        if let (v, d) = AppCache.load(key, as: Doc.self) { value = v; fetchedAt = d; fromCache = true }
    }

    /// Switch to another document (e.g. another month) without losing the cache behaviour.
    func rekey(_ k: String) {
        guard k != key else { return }
        key = k
        error = nil
        if let (v, d) = AppCache.load(k, as: Doc.self) { value = v; fetchedAt = d; fromCache = true } else { value = nil; fetchedAt = nil }
    }

    func load(_ api: AppAPI?, path: String) async {
        guard let api else { return }
        let k = key
        loading = true
        defer { loading = false }
        do {
            let (v, raw): (Doc, Data) = try await api.getRaw(path)
            guard k == key else { return }
            if v != value { value = v }
            error = nil
            fetchedAt = Date()
            fromCache = false
            AppCache.save(k, raw)
        } catch let e as ApiError {
            guard k == key else { return }
            error = e.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Loading / error / offline chrome around a screen document.
struct RemoteGate<Doc: Codable & Equatable & Sendable, Content: View>: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var remote: Remote<Doc>
    var path: String
    @ViewBuilder var content: (Doc) -> Content

    var body: some View {
        Group {
            if let v = remote.value {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if remote.fromCache, remote.error != nil { OfflineStrip(date: remote.fetchedAt) }
                        content(v)
                    }
                    .padding(14)
                }
                .refreshable { await remote.load(model.api, path: path) }
            } else if model.api == nil {
                EmptyState(title: "NOT CONNECTED", message: "Connect your \(Brand.name) server in SETUP.", button: "OPEN SETUP") { model.showSetup() }
            } else if let e = remote.error, !remote.loading { // a retry shows the spinner
                EmptyState(title: "COULDN'T LOAD", message: e, button: "RETRY") { Task { await remote.load(model.api, path: path) } }
            } else {
                VStack(spacing: 10) {
                    ProgressView().tint(T.amber)
                    Cap("FETCHING…", T.dim, size: 11)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: TaskKey(path: path, version: model.dataVersion)) { await remote.load(model.api, path: path) }
    }

    struct TaskKey: Hashable { var path: String; var version: Int }
}

struct OfflineStrip: View {
    var date: Date?
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash").font(.system(size: 10, weight: .bold))
            Cap("OFFLINE · SHOWING DATA FROM \(Fmt.ago(date))", T.amber, size: 9, weight: .bold)
            Spacer()
        }
        .foregroundStyle(T.amber)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .overlay(Rectangle().stroke(T.amber.opacity(0.5), lineWidth: 1))
    }
}

/// Shown for server-only screens in Direct mode (and when not connected).
struct NeedsServer: View {
    @EnvironmentObject var model: AppModel
    var title: String
    var what: String

    var body: some View {
        ScrollView {
            Panel(title: title, detail: "NEEDS A SERVER") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(model.source == .direct ? "\(title.capitalized) isn't available in Direct mode." : "Not connected.")
                        .font(T.mono(13, .bold)).foregroundStyle(T.text)
                    Text("\(what) comes from your \(Brand.name) server, which runs the program engine and the analytics. Direct mode only has the Hevy API key on this phone, so it shows TODAY, LIFTS, HISTORY and the graph.\n\nRun your own server and connect it in SETUP. Nothing is locked in: you can switch back any time.")
                        .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                    TermButton(title: "OPEN SETUP", style: .secondary) { model.showSetup() }.frame(width: 160)
                }
            }
            .padding(14)
        }
    }
}

/// Terminal-style screen title used at the top of pushed screens.
struct ScreenHeader: View {
    var title: String
    var detail: String = ""
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("> " + title).font(T.mono(15, .heavy)).foregroundStyle(T.amber)
            Spacer()
            Cap(detail, T.dim, size: 10)
        }
    }
}

/// Segmented control in the terminal style.
struct Seg<V: Hashable>: View {
    var options: [(V, String)]
    @Binding var value: V
    var size: CGFloat = 11

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, o in
                Button { value = o.0 } label: {
                    Text(o.1).font(T.mono(size, .bold))
                        .foregroundStyle(value == o.0 ? T.bg : T.dim)
                        .frame(maxWidth: .infinity).padding(.vertical, 7)
                        .background(value == o.0 ? T.amber : Color.clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

/// A tappable row with a chevron.
struct NavRow<Label: View>: View {
    var action: () -> Void
    @ViewBuilder var label: Label
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                label
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Status word → colour (stalls, outcomes, achievements).
enum StatusColor {
    static func of(_ s: String?) -> Color {
        switch (s ?? "").lowercased() {
        case "progressing", "success", "ok", "balanced", "done", "gold": return T.up
        case "watch", "hold", "planned", "today", "low", "silver": return T.amber
        case "stalled", "fail", "missed", "regressing", "high", "deload", "reset": return T.down
        default: return T.dim
        }
    }
}

extension View {
    /// The standard screen background.
    func screen() -> some View { background(T.bg) }
}
