import SwiftUI

// MARK: - add exercise

struct ExercisePick {
    var lift: String
    var cardio = false
    var title: String?
    var templateId: String?
}

/// Searchable exercise catalog: the lift library (from the server, or the bundled copy offline),
/// cardio, and a custom name.
struct ExercisePicker: View {
    @Environment(\.dismiss) private var dismiss
    var catalog: [AppGym.CatalogItem]?
    var onPick: (ExercisePick) -> Void
    @State private var q = ""
    @State private var kind = "all"
    @FocusState private var focused: Bool

    static let cardio = ["Recumbent Bike", "Treadmill", "Running", "Cycling", "Rowing Machine", "Elliptical Trainer", "Stair Machine (Steps)", "Walking", "Air Bike", "Ski Erg", "Jump Rope", "Swimming", "Spinning"]

    var items: [AppGym.CatalogItem] {
        catalog ?? LiftLibrary.all.map { .init(key: $0.key, name: $0.name, kind: $0.kind, hevy: $0.titles.first) }
    }

    var body: some View {
        let t = q.trimmingCharacters(in: .whitespaces).lowercased()
        let lifts = items.filter { (kind == "all" || $0.kind == kind) && (t.isEmpty || $0.name.lowercased().contains(t) || ($0.hevy ?? "").lowercased().contains(t) || $0.key.lowercased().contains(t)) }
        let cardio = kind == "all" || kind == "cardio" ? Self.cardio.filter { t.isEmpty || $0.lowercased().contains(t) } : []
        return VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(">").font(T.mono(15, .heavy)).foregroundStyle(T.amber)
                TextField("search exercises", text: $q)
                    .font(T.mono(14)).foregroundStyle(T.text)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focused)
                    .accessibilityIdentifier("exercise-search")
                Button("CLOSE") { dismiss() }.font(T.mono(11, .bold)).foregroundStyle(T.dim)
            }
            .padding(14)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["all", "barbell", "dumbbell", "machine", "bodyweight", "cardio"], id: \.self) { k in
                        Button { kind = k } label: {
                            Text(k.uppercased()).font(T.mono(10, .bold)).foregroundStyle(kind == k ? T.bg : T.dim)
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(kind == k ? T.amber : Color.clear)
                                .overlay(Rectangle().stroke(kind == k ? T.amber : T.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
            }
            .padding(.bottom, 8)
            Divider1()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !t.isEmpty && lifts.isEmpty && cardio.isEmpty {
                        row(title: "ADD \"\(q.trimmingCharacters(in: .whitespaces))\"", sub: "custom exercise", badge: "CUSTOM") {
                            pick(.init(lift: "custom", title: q.trimmingCharacters(in: .whitespaces)))
                        }
                    }
                    if !cardio.isEmpty {
                        section("CARDIO")
                        ForEach(cardio, id: \.self) { c in
                            row(title: c, sub: "time · distance", badge: "CARDIO") { pick(.init(lift: "cardio", cardio: true, title: c, templateId: "demo-cardio-\(c)")) }
                        }
                    }
                    if !lifts.isEmpty {
                        section("LIFTS · \(lifts.count)")
                        ForEach(lifts) { l in
                            row(title: l.name, sub: l.hevy ?? "custom", badge: l.kind.uppercased()) { pick(.init(lift: l.key)) }
                        }
                    }
                }
                .padding(.bottom, 30)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .background(T.panel.ignoresSafeArea())
        .onAppear { focused = true }
    }

    func pick(_ p: ExercisePick) { onPick(p); dismiss() }

    func section(_ t: String) -> some View {
        Cap(t, T.amber, size: 10, weight: .bold).padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 6)
    }

    func row(title: String, sub: String, badge: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(T.mono(13, .bold)).foregroundStyle(T.text)
                    Text(sub).font(T.mono(9)).foregroundStyle(T.faint).lineLimit(1)
                }
                Spacer()
                Cap(badge, T.faint, size: 8)
                Image(systemName: "plus").font(.system(size: 12, weight: .bold)).foregroundStyle(T.amber)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .overlay(alignment: .bottom) { Rectangle().fill(T.line).frame(height: 1).padding(.leading, 14) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - finish

struct FinishSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var gym: GymStore
    var s: LiveSession
    @State private var confirmDiscard = false

    var body: some View {
        let p = Live.progress(s)
        let sum = Live.summary(s) { gym.name($0) }
        let undone = s.exercises.flatMap(\.sets).filter { !$0.done && !$0.isWarmup }.count
        return VStack(alignment: .leading, spacing: 14) {
            Cap("FINISH WORKOUT?", T.amber, size: 12, weight: .heavy)
            Text(s.title).font(T.mono(20, .heavy)).foregroundStyle(T.text)
            HStack {
                Stat(value: Live.clock(sum.durationSec), label: "TIME", size: 20)
                Spacer()
                Stat(value: "\(p.done)/\(p.total)", label: "WORK SETS", size: 20)
                Spacer()
                Stat(value: Fmt.compact(sum.volume), label: "VOL \(s.unit.uppercased())", size: 20)
            }
            if undone > 0 {
                Text("\(undone) set\(undone == 1 ? "" : "s") not done. Only completed sets are saved.")
                    .font(T.mono(11, .bold)).foregroundStyle(T.amber).fixedSize(horizontal: false, vertical: true)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(sum.exercises.enumerated()), id: \.offset) { _, l in SummaryLine(l: l) }
                    if sum.exercises.isEmpty { Text("No sets done yet.").font(T.mono(11)).foregroundStyle(T.dim) }
                }
            }
            // The GYM screen's alert can't show over this sheet, so a refused save is reported here.
            if let e = gym.error {
                Text(e).font(T.mono(11, .bold)).foregroundStyle(T.down).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("finish-error")
            }
            VStack(spacing: 10) {
                TermButton(title: gym.busy ? "SAVING…" : "SAVE TO HEVY", style: .primary, disabled: gym.busy || p.done == 0 && sum.exercises.isEmpty) {
                    Task { await gym.finish(); if gym.session == nil { dismiss() } }
                }
                .accessibilityIdentifier("save-workout")
                HStack(spacing: 10) {
                    TermButton(title: "KEEP GOING") { dismiss() }
                    TermButton(title: "DISCARD", style: .danger) { confirmDiscard = true }
                }
            }
        }
        .padding(18)
        .background(T.panel.ignoresSafeArea())
        .onDisappear { gym.error = nil } // already shown here; don't repeat it as an alert underneath
        .confirmationDialog("Discard this workout? Nothing is saved to Hevy.", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard workout", role: .destructive) { Task { await gym.discard(); dismiss() } }
            Button("Keep it", role: .cancel) {}
        }
    }
}

struct SummaryLine: View {
    var l: Live.Summary.Line
    var body: some View {
        HStack(spacing: 8) {
            Text(l.name.uppercased()).font(T.mono(11, .bold)).foregroundStyle(T.text).lineLimit(1)
            Spacer(minLength: 4)
            Cap("\(l.sets) SET\(l.sets == 1 ? "" : "S")", T.faint, size: 8)
            Text(l.best).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 74, alignment: .trailing)
            Text(l.e1rm.map { "e1 \(Fmt.weight($0))" } ?? "").font(T.mono(10)).foregroundStyle(T.up).frame(width: 64, alignment: .trailing)
        }
        .padding(.vertical, 3)
    }
}

/// After FINISH: what was logged, and whether it reached the server yet.
struct FinishSummaryView: View {
    @EnvironmentObject var model: AppModel
    var info: GymStore.FinishedInfo
    @ObservedObject var gym: GymStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(info.queued ? "> SAVED ON THE PHONE" : "> WORKOUT SAVED").font(T.mono(20, .heavy)).foregroundStyle(info.queued ? T.amber : T.up)
                    Text(info.queued ? "You're offline. It uploads to the server (and Hevy) as soon as there's a connection." :
                         info.demo ? "Saved (demo server): the program advanced." : "Saved to Hevy · the program advanced.")
                        .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
                Panel(title: info.session.title.uppercased(), detail: Fmt.dayLabel(Day.local(info.session.startDate, tz: .current))) {
                    HStack {
                        Stat(value: Live.clock(info.summary.durationSec), label: "TIME", size: 22)
                        Spacer()
                        Stat(value: "\(info.summary.sets)", label: "WORK SETS", size: 22)
                        Spacer()
                        Stat(value: Fmt.compact(info.summary.volume), label: "VOL \(info.session.unit.uppercased())", size: 22)
                    }
                }
                if !info.prs.isEmpty {
                    Panel(title: "NEW RECORDS", detail: "\(info.prs.count) PR\(info.prs.count == 1 ? "" : "S")") {
                        ForEach(Array(info.prs.enumerated()), id: \.offset) { _, p in
                            HStack(spacing: 8) {
                                Image(systemName: "trophy.fill").font(.system(size: 11)).foregroundStyle(T.amber)
                                Text(p.short).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 80, alignment: .leading).lineLimit(1)
                                Text(p.kind == "e1rm" ? "E1RM \(Fmt.weight(p.weight))" : "\(Fmt.weight(p.weight)) × \(p.reps)")
                                    .font(T.mono(13, .heavy)).foregroundStyle(T.amber)
                                Spacer()
                                Cap(p.prev.map { "WAS \(Fmt.weight($0))" } ?? "FIRST", T.dim, size: 9)
                            }
                        }
                    }
                }
                Panel(title: "EXERCISES", detail: "BEST SET · E1RM") {
                    ForEach(Array(info.summary.exercises.enumerated()), id: \.offset) { _, l in SummaryLine(l: l) }
                }
                if let n = info.session.notes, !n.isEmpty {
                    Panel(title: "NOTES") { Text(n).font(T.mono(11)).foregroundStyle(T.text) }
                }
                TermButton(title: "DONE", style: .primary) { gym.finished = nil }
                    .accessibilityIdentifier("finish-done")
                HStack(spacing: 10) {
                    TermButton(title: "TODAY") { gym.finished = nil; model.tab = .today }
                    TermButton(title: "HISTORY") { gym.finished = nil; model.tab = .history }
                }
            }
            .padding(14)
        }
    }
}
