import SwiftUI

/// Paged workout list: the server's /api/app/history in Server mode, the cached Hevy workouts in
/// Direct mode. Loads the next page when the last row appears.
@MainActor
final class HistoryModel: ObservableObject {
    @Published var items: [AppWorkoutSummary] = []
    @Published var next: String?
    @Published var total = 0
    @Published var loading = false
    @Published var error: String?
    @Published var query = ""
    @Published var fromCache = false
    private var generation = 0

    typealias Fetch = (_ cursor: String?, _ q: String?) async throws -> AppHistory

    func reload(_ fetch: Fetch?) async {
        guard let fetch else { return }
        generation += 1
        let g = generation
        if items.isEmpty, query.isEmpty, let (cached, _) = AppCache.load("history", as: AppHistory.self) {
            apply(cached, append: false); fromCache = true
        }
        loading = true
        defer { if g == generation { loading = false } }
        do {
            let h = try await fetch(nil, query)
            guard g == generation else { return }
            apply(h, append: false)
            fromCache = false
            error = nil
            if query.isEmpty, let data = try? JSONEncoder().encode(h) { AppCache.save("history", data) }
        } catch {
            guard g == generation else { return }
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    func more(_ fetch: Fetch?) async {
        guard let fetch, let cursor = next, !loading else { return }
        let g = generation
        loading = true
        defer { if g == generation { loading = false } }
        do {
            let h = try await fetch(cursor, query)
            guard g == generation else { return }
            apply(h, append: true)
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func apply(_ h: AppHistory, append: Bool) {
        if append {
            let seen = Set(items.map(\.id))
            items += h.workouts.filter { !seen.contains($0.id) }
        } else {
            items = h.workouts
        }
        next = h.next
        total = h.total
    }
}

struct HistoryScreen: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var h = HistoryModel()
    @State private var searchTask: Task<Void, Never>?

    var fetch: HistoryModel.Fetch? {
        if let d = model.direct { return { c, q in d.history(cursor: c, q: q) } }
        guard let api = model.api else { return nil }
        return { c, q in try await api.history(cursor: c, q: q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            if h.items.isEmpty {
                if model.direct == nil && model.api == nil {
                    EmptyState(title: "NOT CONNECTED", message: "Connect a server, or Direct with a Hevy API key, in SETUP.", button: "OPEN SETUP") { model.showSetup() }
                } else if h.loading {
                    ProgressView().tint(T.amber).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    EmptyState(title: h.query.isEmpty ? "NO WORKOUTS" : "NO MATCHES", message: h.error ?? (h.query.isEmpty ? "Workouts you log show up here." : "Nothing matches \"\(h.query)\"."), button: "RELOAD") {
                        Task { await h.reload(fetch) }
                    }
                }
            } else {
                list
            }
        }
        .screen()
        .task(id: model.dataVersion) { await h.reload(fetch) }
    }

    var searchBar: some View {
        HStack(spacing: 8) {
            Text(">").font(T.mono(14, .heavy)).foregroundStyle(T.amber)
            TextField("search workouts or exercises", text: $h.query)
                .font(T.mono(12)).foregroundStyle(T.text)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.search)
                .onChange(of: h.query) { _, _ in
                    searchTask?.cancel()
                    searchTask = Task {
                        try? await Task.sleep(for: .milliseconds(300))
                        if !Task.isCancelled { await h.reload(fetch) }
                    }
                }
            if !h.query.isEmpty {
                Button { h.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(T.faint) }
                    .accessibilityLabel("Clear search")
            }
            Cap("\(h.total)", T.faint, size: 9)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(T.panel)
        .overlay(alignment: .bottom) { Divider1() }
    }

    var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                if h.fromCache, h.error != nil { OfflineStrip(date: nil) }
                ForEach(Array(h.items.enumerated()), id: \.element.id) { i, w in
                    if i == 0 || String(h.items[i - 1].date.prefix(7)) != String(w.date.prefix(7)) {
                        Cap(monthLabel(w.date), T.amber, size: 10, weight: .bold).padding(.top, i == 0 ? 0 : 8)
                    }
                    NavigationLink(value: WorkoutRoute(id: w.id)) { HistoryRow(w: w, unit: model.snapshot?.unitLabel ?? "") }
                        .buttonStyle(.plain)
                        .onAppear { if i >= h.items.count - 5 { Task { await h.more(fetch) } } }
                }
                if h.next != nil {
                    HStack { Spacer(); ProgressView().tint(T.amber); Spacer() }.padding()
                } else {
                    Cap("— END · \(h.total) WORKOUTS —", T.faint, size: 9).frame(maxWidth: .infinity).padding()
                }
            }
            .padding(14)
        }
        .refreshable { await h.reload(fetch) }
    }

    func monthLabel(_ d: String) -> String {
        let m = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
        let mi = Int(d.dropFirst(5).prefix(2)) ?? 1
        return "\(m[(mi - 1) % 12]) \(d.prefix(4))"
    }
}

struct HistoryRow: View {
    var w: AppWorkoutSummary
    var unit: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 0) {
                Text(String(Fmt.dayLabel(w.date).prefix(3))).font(T.mono(9, .bold)).foregroundStyle(T.faint)
                Text(String(w.date.suffix(2))).font(T.mono(18, .heavy)).foregroundStyle(T.text)
            }
            .frame(width: 34)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(w.title).font(T.mono(13, .bold)).foregroundStyle(T.text).lineLimit(1)
                    if let d = w.programDay { Badge(text: d, color: T.up) }
                    if w.hasNotes { Image(systemName: "note.text").font(.system(size: 10)).foregroundStyle(T.amber) }
                }
                Text(exerciseLine).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(2)
                HStack(spacing: 12) {
                    Cap("\(Int(w.durationMin))M", T.faint, size: 9)
                    Cap("\(w.sets) SETS", T.faint, size: 9)
                    Cap("\(Fmt.compact(w.volume)) \(unit)", T.faint, size: 9)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint).padding(.top, 14)
        }
        .padding(10)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
        .contentShape(Rectangle())
    }

    var exerciseLine: String {
        // "Squat (Barbell)" → "Squat"; repeated exercises once
        var seen: [String] = []
        for e in w.exercises {
            let t = e.replacingOccurrences(of: #"\s*\(.*\)"#, with: "", options: .regularExpression)
            if !seen.contains(t) { seen.append(t) }
        }
        return seen.joined(separator: " · ")
    }
}

// MARK: - workout detail

struct WorkoutScreen: View {
    @EnvironmentObject var model: AppModel
    var id: String
    @StateObject private var remote: Remote<AppWorkout>
    @State private var editing = false

    init(id: String) {
        self.id = id
        _remote = StateObject(wrappedValue: Remote<AppWorkout>("workout-" + id))
    }

    var path: String { "/api/app/workouts/" + AppAPI.seg(id) }

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: "WORKOUT", trailing: model.api != nil && remote.value != nil ? AnyView(
                Button { editing = true } label: { Text("EDIT NOTES").font(T.mono(11, .bold)).foregroundStyle(T.amber) }
                    .accessibilityIdentifier("edit-notes")
            ) : nil)
            if let d = model.direct {
                if let w = d.workout(id) { ScrollView { WorkoutContent(w: w).padding(14) } } else {
                    EmptyState(title: "NOT FOUND", message: "This workout isn't in the cache any more.", button: "BACK") {}
                }
            } else {
                RemoteGate(remote: remote, path: path) { w in WorkoutContent(w: w) }
            }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $editing) {
            if let w = remote.value {
                NotesEditor(w: w) { edit in
                    guard let api = model.api else { return "Not connected." }
                    do {
                        try await api.saveNotes(workoutId: id, edit)
                        await remote.load(api, path: path)
                        model.dataVersion += 1
                        return nil
                    } catch {
                        return (error as? ApiError)?.errorDescription ?? error.localizedDescription
                    }
                }
                .termSheet()
            }
        }
    }
}

struct WorkoutContent: View {
    var w: AppWorkout

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Cap(Fmt.dayLabel(w.summary.date) + " · " + time, T.dim, size: 10)
                Text(w.summary.title).font(T.mono(18, .heavy)).foregroundStyle(T.amber)
            }
            HStack {
                Stat(value: "\(Int(w.summary.durationMin))M", label: "TIME", size: 18)
                Spacer()
                Stat(value: "\(w.summary.sets)", label: "SETS", size: 18)
                Spacer()
                Stat(value: Fmt.compact(w.summary.volume), label: "VOL \(w.unit.uppercased())", size: 18)
                Spacer()
                Stat(value: "\(w.exercises.count)", label: "EXERCISES", size: 18)
            }
            if !w.note.isEmpty {
                Panel(title: "NOTE") { Text(w.note).font(T.mono(12)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true) }
            }
            ForEach(Array(w.exercises.enumerated()), id: \.offset) { _, e in exercise(e) }
            if let p = w.program { programPanel(p) }
        }
    }

    var time: String {
        guard let d = Fmt.parseISO(w.summary.start) else { return "" }
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }

    func exercise(_ e: AppWorkout.Ex) -> some View {
        Panel(title: e.title, detail: e.lift.flatMap { LiftLibrary.byKey[$0]?.short } ?? "") {
            if let n = e.note, !n.isEmpty {
                Text(n).font(T.mono(11)).foregroundStyle(T.amber).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(e.sets.enumerated()), id: \.offset) { _, s in
                HStack(spacing: 8) {
                    Text(s.type == "warmup" ? "W" : s.type == "dropset" ? "D" : s.type == "failure" ? "F" : "•")
                        .font(T.mono(10, .bold)).foregroundStyle(s.type == "warmup" ? T.faint : s.type == "failure" ? T.down : T.dim)
                        .frame(width: 14)
                    Text(setText(s)).font(T.mono(12, s.type == "warmup" ? .regular : .bold)).foregroundStyle(s.type == "warmup" ? T.dim : T.text)
                    if let r = s.rpe { Cap("@\(Fmt.weight(r))", T.amber, size: 9) }
                    Spacer()
                    if let e1 = s.e1rm { Cap("E1RM \(Fmt.weight(e1))", T.faint, size: 8) }
                }
            }
        }
    }

    func setText(_ s: AppWorkout.WSet) -> String {
        if s.durationSec != nil || s.distanceM != nil {
            var p: [String] = []
            if let d = s.durationSec { p.append("\(Int((d / 60).rounded())) min") }
            if let m = s.distanceM, m > 0 { p.append(w.unit == "lb" ? String(format: "%.2f mi", m / 1609.344) : String(format: "%.2f km", m / 1000)) }
            return p.joined(separator: " · ")
        }
        let wt = s.weight.map { $0 > 0 ? Fmt.weight($0) : "BW" } ?? "BW"
        return "\(wt) × \(s.reps ?? 0)"
    }

    func programPanel(_ p: AppWorkout.Program) -> some View {
        Panel(title: "PROGRAM", detail: "DAY \(p.dayId)") {
            ForEach(Array(p.results.enumerated()), id: \.offset) { _, r in ResultRow(r: r) }
        }
    }
}

struct ResultRow: View {
    var r: ProgramResult
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            TierTag(tier: r.tier)
            Text(LiftLibrary.byKey[r.lift]?.short ?? r.lift.uppercased()).font(T.mono(11, .bold)).foregroundStyle(T.text).frame(width: 74, alignment: .leading).lineLimit(1)
            Text("\(r.scheme) @ \(Fmt.weight(r.weight))").font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                Badge(text: r.outcome, color: StatusColor.of(r.outcome))
                Text(r.note).font(T.mono(9)).foregroundStyle(T.dim).lineLimit(1)
            }
        }
    }
}

/// EDIT NOTES: the workout note and one note per exercise (PUT /api/workouts/{id}/notes).
struct NotesEditor: View {
    @Environment(\.dismiss) private var dismiss
    var w: AppWorkout
    var save: (NotesEdit) async -> String?
    @State private var note = ""
    @State private var notes: [String] = []
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("CANCEL") { dismiss() }.font(T.mono(12, .bold)).foregroundStyle(T.dim)
                Spacer()
                Cap("EDIT NOTES", T.amber, size: 12, weight: .bold)
                Spacer()
                Button(saving ? "SAVING…" : "SAVE") {
                    Task {
                        saving = true
                        error = await save(NotesEdit(description: note, exercises: notes.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }))
                        saving = false
                        if error == nil { dismiss() }
                    }
                }
                .font(T.mono(12, .bold)).foregroundStyle(T.amber).disabled(saving)
            }
            .padding(14)
            Divider1()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let error { Text(error).font(T.mono(11, .bold)).foregroundStyle(T.down) }
                    Cap("WORKOUT NOTE", T.faint, size: 9)
                    NoteField(text: $note, placeholder: "how it went", minHeight: 90)
                    ForEach(Array(w.exercises.enumerated()), id: \.offset) { i, e in
                        if i < notes.count {
                            Cap(e.title, T.faint, size: 9)
                            NoteField(text: $notes[i], placeholder: "note for this exercise", minHeight: 44)
                        }
                    }
                    Text("Saved to Hevy. The hidden program-day tag is kept automatically.").font(T.mono(9)).foregroundStyle(T.faint)
                }
                .padding(14)
            }
        }
        .background(T.panel.ignoresSafeArea())
        .onAppear {
            note = w.note
            notes = w.exercises.map { $0.note ?? "" }
        }
    }
}

struct NoteField: View {
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 60

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .font(T.mono(12)).foregroundStyle(T.text)
            .lineLimit(2...8)
            .frame(minHeight: minHeight, alignment: .topLeading)
            .padding(10)
            .background(Color(hex: 0x0B0C0E))
            .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}
