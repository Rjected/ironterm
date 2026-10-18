import SwiftUI

// PROGRAMS: browse the catalog, read a program's generated rules and week-by-week workouts,
// and start it (docs/api/programs.md). Server mode only.

struct ProgramRoute: Hashable {
    var id: String
    /// every open is a fresh page (no tab / week / options left over from the last one)
    var nonce = UUID()
}

// MARK: - list

struct ProgramListScreen: View {
    @StateObject private var remote = Remote<AppProgramCatalog>("programs")
    @State private var filter = ProgramFilter()
    /// pushed with navigationDestination(item:): the MORE stack's path only holds `More` values
    @State private var open: ProgramRoute?

    var body: some View {
        RemoteGate(remote: remote, path: "/api/app/programs") { doc in
            ProgramListContent(doc: doc, filter: $filter) { open = ProgramRoute(id: $0) }
        }
        .navigationDestination(item: $open) { r in ProgramDetailScreen(id: r.id).id(r) }
    }
}

struct ProgramListContent: View {
    var doc: AppProgramCatalog
    @Binding var filter: ProgramFilter
    var open: (String) -> Void

    var body: some View {
        let groups: [ProgramFilter.Group] = filter.apply(doc.programs)
        let shown: Int = groups.reduce(0) { $0 + $1.programs.count }
        VStack(alignment: .leading, spacing: 12) {
            SearchField(text: $filter.query, placeholder: "search \(doc.programs.count) programs…")
            ProgramFilterChips(filter: $filter, days: ProgramFilter.dayChoices(doc.programs))
            if !filter.isEmpty && shown > 0 {
                Cap("\(shown) of \(doc.programs.count) programs", T.dim, size: 9)
            }
            if groups.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("No programs match.").font(T.mono(12)).foregroundStyle(T.dim)
                    TermButton(title: "CLEAR FILTERS") { filter = ProgramFilter() }.frame(width: 160)
                }
                .padding(.top, 8)
            }
            ForEach(groups) { g in
                ProgramGroupView(group: g, active: doc.active, open: open)
            }
        }
    }
}

struct SearchField: View {
    @Binding var text: String
    var placeholder: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(T.faint)
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(T.faint))
                .font(T.mono(13))
                .foregroundStyle(T.text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .accessibilityIdentifier("programs-search")
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 13)).foregroundStyle(T.faint)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 10)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

/// ALL · 3 DAYS · 4 DAYS · … · BEGINNER · INTERMEDIATE · ADVANCED (one of each kind at a time).
struct ProgramFilterChips: View {
    @Binding var filter: ProgramFilter
    var days: [Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Chip(title: "ALL", on: filter.days == nil && filter.level == nil) {
                    filter.days = nil
                    filter.level = nil
                }
                ForEach(days, id: \.self) { d in
                    Chip(title: d == 1 ? "1 DAY" : "\(d) DAYS", on: filter.days == d) { filter.days = filter.days == d ? nil : d }
                }
                ForEach(ProgramFilter.levels, id: \.self) { l in
                    Chip(title: l.uppercased(), on: filter.level == l) { filter.level = filter.level == l ? nil : l }
                }
            }
            .padding(1)
        }
    }
}

struct Chip: View {
    var title: String
    var on: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(T.mono(11, .bold))
                .foregroundStyle(on ? T.amber : T.text)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .overlay(Rectangle().stroke(on ? T.amber : T.line, lineWidth: on ? 1.5 : 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct ProgramGroupView: View {
    var group: ProgramFilter.Group
    var active: String?
    var open: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Cap(ProgramText.category(group.category), T.amber, size: 10, weight: .bold)
                .padding(.bottom, 6)
            ForEach(group.programs) { p in
                Button { open(p.id) } label: {
                    ProgramRow(p: p, active: p.id == active)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("program-\(p.id)")
                Divider1()
            }
        }
    }
}

struct ProgramRow: View {
    var p: ProgramSummary
    var active: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(p.name).font(T.mono(14, .bold)).foregroundStyle(T.text).lineLimit(1)
                Spacer(minLength: 4)
                if active {
                    ActiveMark()
                } else {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint)
                }
            }
            Text(ProgramText.tags(p)).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
            Text(p.summary).font(T.mono(11)).foregroundStyle(T.text.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

struct ActiveMark: View {
    var body: some View {
        Text("● ACTIVE").font(T.mono(11, .bold)).foregroundStyle(T.amber)
    }
}

// MARK: - program page

enum ProgramTab: String, CaseIterable, Identifiable {
    case about, rules, workouts, body
    var id: String { rawValue }
}

struct ProgramDetailScreen: View {
    @EnvironmentObject var model: AppModel
    var id: String
    @StateObject private var remote: Remote<ProgramDetail>
    /// options the user picked (the server fills in the rest)
    @State private var opts: [String: String] = [:]
    @State private var tab: ProgramTab = .about
    @State private var week = 1
    @State private var starting = false
    @State private var catalog: AppProgramCatalog?

    init(id: String) {
        self.id = id
        _remote = StateObject(wrappedValue: Remote<ProgramDetail>("programs-" + id))
    }

    var path: String { AppAPI.programPath(id, options: opts) }

    var isActive: Bool {
        if let a = catalog?.active { return a == id }
        return remote.value?.basis == "active"
    }

    /// name of the running program, for "This replaces …"
    /// (the catalog says which template runs; the cached PROGRAM document has its full name, "GZCLP 4-Day")
    var currentName: String? {
        let running: AppProgram.Program? = AppCache.load("program", as: AppProgram.self)?.0.program
        guard let c = catalog else { return running?.name }
        guard let a = c.active else { return nil }
        if let r = running, r.templateId == a { return r.name }
        return c.programs.first { $0.id == a }?.name
    }

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: catalog?.programs.first { $0.id == id }?.name.uppercased() ?? "PROGRAM")
            RemoteGate(remote: remote, path: path) { d in
                ProgramDetailContent(d: d, active: isActive, loading: remote.loading, tab: $tab, week: $week, opts: $opts)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if remote.value != nil { startBar }
            }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { catalog = AppCache.load("programs", as: AppProgramCatalog.self)?.0 }
        .sheet(isPresented: $starting) {
            if let d = remote.value {
                StartProgramSheet(d: d, currentName: isActive ? nil : currentName, restarting: isActive) { result in
                    finished(result)
                }
                .termSheet()
            }
        }
    }

    var startBar: some View {
        VStack(spacing: 0) {
            Divider1()
            TermButton(title: isActive ? "RESTART THIS PROGRAM" : "START THIS PROGRAM", style: .primary, disabled: model.api == nil) {
                starting = true
            }
            .accessibilityIdentifier("program-start")
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .background(T.bg)
    }

    func finished(_ r: ProgramStartResult) {
        starting = false
        if let p = r.program, let data = try? JSONEncoder().encode(p) { AppCache.save("program", data) }
        model.setMore([.program])
        Task { await model.refresh() }
    }
}

struct ProgramDetailContent: View {
    var d: ProgramDetail
    var active: Bool
    var loading: Bool
    @Binding var tab: ProgramTab
    @Binding var week: Int
    @Binding var opts: [String: String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProgramHeader(d: d, active: active)
            ProgramTabBar(tab: $tab)
            switch tab {
            case .about: ProgramAboutTab(d: d, loading: loading, opts: $opts)
            case .rules: ProgramRulesTab(d: d)
            case .workouts: ProgramWorkoutsTab(d: d, week: $week)
            case .body: ProgramBodyTab(id: d.id, opts: opts)
            }
        }
    }
}

struct ProgramHeader: View {
    var d: ProgramDetail
    var active: Bool

    var tags: String {
        [ProgramText.category(d.category), ProgramText.days(d.daysPerWeek), ProgramText.length(d.weekCount)]
            .filter { !$0.isEmpty }.joined(separator: " · ").uppercased()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(tags).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
                Spacer(minLength: 4)
                if active { ActiveMark() }
            }
            Text(d.name).font(T.mono(22, .heavy)).foregroundStyle(T.text)
                .fixedSize(horizontal: false, vertical: true)
            if !d.author.isEmpty {
                Text(d.author).font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ProgramTabBar: View {
    @Binding var tab: ProgramTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ProgramTab.allCases) { t in
                Button { tab = t } label: {
                    VStack(spacing: 8) {
                        Text(t.rawValue.uppercased()).font(T.mono(12, .bold))
                            .foregroundStyle(tab == t ? T.amber : T.dim)
                        Rectangle().fill(tab == t ? T.amber : Color.clear).frame(height: 2)
                    }
                    .padding(.top, 8)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("program-tab-\(t.rawValue)")
            }
        }
        .overlay(alignment: .bottom) { Divider1() }
    }
}

// MARK: ABOUT

struct ProgramAboutTab: View {
    var d: ProgramDetail
    var loading: Bool
    @Binding var opts: [String: String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(d.summary).font(T.mono(13)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 14) {
                Stat(value: d.level.uppercased(), label: "level", size: 13)
                Stat(value: ProgramText.days(d.daysPerWeek).uppercased(), label: "per week", size: 13)
                Stat(value: ProgramText.length(d.weekCount).uppercased(), label: "length", size: 13)
                Stat(value: d.unit.uppercased(), label: "unit", size: 13)
            }
            if !d.options.isEmpty {
                Panel(title: "OPTIONS", detail: loading ? "UPDATING…" : "\(d.options.count)") {
                    ForEach(d.options) { o in
                        OptionPicker(o: o) { v in opts[o.key] = v }
                    }
                }
            }
            if !d.notes.isEmpty {
                Panel(title: "NOTES", detail: "\(d.notes.count)") {
                    ForEach(Array(d.notes.enumerated()), id: \.offset) { _, n in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("›").font(T.mono(11, .bold)).foregroundStyle(T.amber)
                            Text(n).font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if !d.source.isEmpty {
                Panel(title: "SOURCE") {
                    SourceText(source: d.source)
                }
            }
        }
    }
}

/// One option: its choices as radio rows (labels like "5×3+ › 6×2+ › 10×1+" are too long for a segmented control).
struct OptionPicker: View {
    var o: ProgramDetail.Option
    var pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Cap(o.label, T.dim, size: 9, weight: .bold)
            ForEach(o.choices, id: \.value) { c in
                Button { if c.value != o.selected { pick(c.value) } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(c.value == o.selected ? "◉" : "○").font(T.mono(12))
                            .foregroundStyle(c.value == o.selected ? T.amber : T.faint)
                        Text(c.label).font(T.mono(11, c.value == o.selected ? .bold : .regular))
                            .foregroundStyle(c.value == o.selected ? T.text : T.dim)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if c.value == o.default { Cap("DEFAULT", T.faint, size: 8) }
                    }
                    .padding(.vertical, 3)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("opt-\(o.key)-\(c.value)")
            }
        }
        .padding(.bottom, 4)
    }
}

struct SourceText: View {
    var source: String

    var body: some View {
        if let url = URL(string: source), url.scheme == "https" || url.scheme == "http" {
            Link(destination: url) {
                Text(source).font(T.mono(11)).foregroundStyle(T.up).underline().multilineTextAlignment(.leading)
            }
        } else {
            Text(source).font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: RULES

struct ProgramRulesTab: View {
    var d: ProgramDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !d.rules.overview.isEmpty {
                Panel(title: "OVERVIEW") {
                    ForEach(Array(d.rules.overview.enumerated()), id: \.offset) { _, line in
                        Text(line).font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if !d.rules.rotation.isEmpty {
                Panel(title: "ROTATION", detail: "REPEATS") {
                    ForEach(Array(d.rules.rotation.enumerated()), id: \.offset) { _, r in
                        Text(RuleText.rotation(r)).font(T.mono(11)).foregroundStyle(T.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if !d.rules.tiers.isEmpty {
                Panel(title: "HOW EACH LIFT PROGRESSES") {
                    ForEach(Array(d.rules.tiers.enumerated()), id: \.offset) { _, t in
                        Text(RuleText.tier(t)).font(T.mono(12)).foregroundStyle(T.text)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.bottom, 4)
                    }
                }
            }
            Text("Generated from the program definition the engine runs, so it always matches what the app does.")
                .font(T.mono(10)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Bold title + plain sentences (AttributedString, so no deprecated Text concatenation).
enum RuleText {
    static func bold(_ s: String) -> AttributedString {
        var a = AttributedString(s)
        a.font = T.mono(12, .heavy)
        return a
    }

    static func rotation(_ r: ProgramDetail.Rules.Rotation) -> AttributedString {
        var a = AttributedString(r.day + ": ")
        a.font = T.mono(11, .heavy)
        a.append(AttributedString(r.lifts.joined(separator: " · ")))
        return a
    }

    /// **T1 · 5×3+ → 6×2+ → 10×1+**
    /// Back Squat, Overhead Press, …   (dim)
    /// the rule in plain sentences
    static func tier(_ t: ProgramDetail.Rules.TierRule) -> AttributedString {
        var a = bold(t.title)
        if !t.lifts.isEmpty {
            var l = AttributedString("\n" + t.lifts.joined(separator: ", "))
            l.font = T.mono(11)
            l.foregroundColor = T.dim
            a.append(l)
        }
        a.append(AttributedString("\n" + t.text))
        return a
    }
}

// MARK: WORKOUTS

struct ProgramWorkoutsTab: View {
    var d: ProgramDetail
    @Binding var week: Int

    var current: ProgramDetail.Week? { d.plan.first { $0.week == week } ?? d.plan.first }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(d.plan) { w in
                        Chip(title: "WEEK \(w.week)", on: w.week == (current?.week ?? 0)) { week = w.week }
                            .accessibilityIdentifier("week-\(w.week)")
                    }
                }
                .padding(1)
            }
            VStack(alignment: .leading, spacing: 3) {
                if let w = current, let n = w.name, !n.isEmpty {
                    Text(ProgramText.weekTitle(w)).font(T.mono(11, .bold)).foregroundStyle(T.amber)
                }
                Text(d.basisLine).font(T.mono(10)).foregroundStyle(T.dim)
                if d.weekCount == nil && !d.plan.contains(where: { ($0.name ?? "").isEmpty == false }) {
                    Text("open-ended: weeks 1–\(d.plan.count) as if every session succeeds").font(T.mono(10)).foregroundStyle(T.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let w = current {
                ForEach(Array(w.days.enumerated()), id: \.offset) { _, day in
                    ProgramDayCard(day: day)
                }
            } else {
                Text("No workouts to show.").font(T.mono(11)).foregroundStyle(T.dim)
            }
        }
    }
}

struct ProgramDayCard: View {
    var day: ProgramDetail.Day

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Cap(day.name, T.dim, size: 10, weight: .bold).padding(.bottom, 4)
            ForEach(Array(day.exercises.enumerated()), id: \.offset) { i, e in
                ProgramExerciseRow(e: e)
                if i < day.exercises.count - 1 { Divider1() }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

struct TierBox: View {
    static let width: CGFloat = 40
    /// where the lines under an exercise start (box + spacing)
    static let indent: CGFloat = 48
    var tier: String

    var color: Color {
        switch tier.uppercased() {
        case "T1", "MAIN": return T.amber
        case "T2", "SUPP": return T.up
        default: return T.dim
        }
    }

    var body: some View {
        Text(tier).font(T.mono(10, .bold)).foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.vertical, 1)
            .frame(width: TierBox.width)
            .overlay(Rectangle().stroke(color, lineWidth: 1))
    }
}

struct ProgramExerciseRow: View {
    var e: ProgramDetail.Exercise

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                TierBox(tier: e.tier)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.name).font(T.mono(13, .bold)).foregroundStyle(T.text)
                    Text(e.scheme).font(T.mono(11)).foregroundStyle(T.dim)
                }
                Spacer(minLength: 4)
                Text(e.top > 0 ? Fmt.weight(e.top) : "BW").font(T.mono(15, .bold))
                    .foregroundStyle(e.top > 0 ? T.amber : T.faint)
            }
            if let s = ProgramSets.line(e) {
                Text(s).font(T.mono(10)).foregroundStyle(T.dim).padding(.leading, TierBox.indent)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ProgramOutcomeLine(e: e)
        }
        .padding(.vertical, 8)
    }
}

struct ProgramOutcomeLine: View {
    var e: ProgramDetail.Exercise

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let n = e.note, !n.isEmpty {
                Text(n).font(T.mono(10)).foregroundStyle(T.amber)
            }
            if let x = e.ifSuccess, !x.isEmpty {
                Text("▲ " + x).font(T.mono(10)).foregroundStyle(T.up)
            }
            if let x = e.ifFail, !x.isEmpty {
                Text("▼ " + x).font(T.mono(10)).foregroundStyle(T.down)
            }
        }
        .padding(.leading, TierBox.indent)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// "135×5 · 155×5 · 175×5+" when the sets differ (percent waves, ramps); nil when the scheme says it all.
enum ProgramSets {
    static func line(_ e: ProgramDetail.Exercise) -> String? {
        guard e.sets.count > 1 else { return nil }
        let weights: Set<Double> = Set(e.sets.map(\.weight))
        let rpes: Bool = e.sets.contains { $0.rpe != nil }
        guard weights.count > 1 || rpes else { return nil }
        return e.sets.map(one).joined(separator: " · ")
    }

    static func one(_ s: ProgramDetail.PSet) -> String {
        var reps: String = String(s.reps)
        if let m = s.repsMax, m > s.reps { reps += "–\(m)" }
        if s.amrap { reps += "+" }
        var out: String = s.weight > 0 ? Fmt.weight(s.weight) + "×" + reps : reps
        if let r = s.rpe { out += " @" + Fmt.weight(r) }
        return out
    }
}

// MARK: - START

/// Two steps, like Android: pick days and review the weights, then a confirm page that says what
/// gets replaced. Confirming POSTs and hands the result back.
struct StartProgramSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var d: ProgramDetail
    /// the program this replaces (nil when none, or restarting the running one)
    var currentName: String?
    var restarting = false
    var onDone: (ProgramStartResult) -> Void

    @State private var days: Set<Int> = []
    @State private var weights: [String: String] = [:]
    @State private var maxes: [String: String] = [:]
    @State private var confirming = false
    @State private var sending = false
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(confirming ? "> CONFIRM" : "> START " + d.name.uppercased())
                    .font(T.mono(14, .heavy)).foregroundStyle(T.amber).lineLimit(1)
                Spacer()
            }
            .padding(14)
            Divider1()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if confirming { confirmPage } else { editPage }
                    if let e = error {
                        Text(e).font(T.mono(11, .bold)).foregroundStyle(T.down).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(14)
            }
            .scrollDismissesKeyboard(.interactively)
            Divider1()
            buttons.padding(14)
        }
        .background(T.panel)
        .onAppear(perform: prefill)
        .interactiveDismissDisabled(sending)
    }

    var buttons: some View {
        HStack(spacing: 10) {
            TermButton(title: confirming ? "‹ BACK" : "CANCEL", disabled: sending) {
                if confirming { confirming = false } else { dismiss() }
            }
            .frame(width: 110)
            .accessibilityIdentifier("program-start-back")
            if confirming {
                TermButton(title: sending ? "STARTING…" : (restarting ? "CONFIRM RESTART" : "CONFIRM START"), style: .primary, disabled: sending) {
                    Task { await send() }
                }
                .accessibilityIdentifier("program-start-confirm")
            } else {
                TermButton(title: "NEXT ›", style: .primary, disabled: days.isEmpty) {
                    if let e = validate() { error = e } else { error = nil; confirming = true }
                }
                .accessibilityIdentifier("program-start-next")
            }
        }
    }

    @ViewBuilder var editPage: some View {
        StartDaysPanel(days: $days, target: d.start.trainingDays.count)
        if !d.start.startWeights.isEmpty {
            StartWeightsPanel(title: "STARTING WEIGHTS", unit: d.unit, keys: d.startOrder(d.start.startWeights.keys), label: d.startLabel, values: $weights)
        }
        if !d.start.trainingMaxes.isEmpty {
            StartWeightsPanel(title: d.start.maxLabel.isEmpty ? "TRAINING MAXES" : d.start.maxLabel, unit: d.unit, keys: d.startOrder(d.start.trainingMaxes.keys), label: d.startLabel, values: $maxes)
        }
        Text("Prefilled from \(d.basisSource). Starts today; the program takes it from here.")
            .font(T.mono(10)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder var confirmPage: some View {
        Text(StartSummary.replaces(name: d.name, current: currentName, restarting: restarting))
            .font(T.mono(13)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("program-start-replaces")
        VStack(alignment: .leading, spacing: 8) {
            SummaryRow(label: "PROGRAM", value: d.name)
            if !d.options.isEmpty { SummaryRow(label: "OPTIONS", value: StartSummary.options(d)) }
            SummaryRow(label: "DAYS", value: StartSummary.days(days))
            SummaryRow(label: "STARTS", value: "today")
            if let m = parsed(maxes), !m.isEmpty { SummaryRow(label: StartSummary.maxTitle(d), value: StartSummary.weights(m, label: d.startLabel, order: d.startOrder(m.keys))) }
            if let w = parsed(weights), !w.isEmpty { SummaryRow(label: "WEIGHTS", value: StartSummary.changed(w, d.start.startWeights)) }
        }
        .padding(.top, 4)
    }

    func prefill() {
        guard !loaded else { return }
        loaded = true
        days = Set(d.start.trainingDays)
        weights = d.start.startWeights.mapValues(Fmt.weight)
        maxes = d.start.trainingMaxes.mapValues(Fmt.weight)
    }

    func parsed(_ m: [String: String]) -> [String: Double]? {
        var out: [String: Double] = [:]
        for (k, v) in m {
            guard let n = ProgramText.number(v) else { return nil }
            out[k] = n
        }
        return out
    }

    func validate() -> String? {
        if days.isEmpty { return "Pick at least one training day." }
        guard let w = parsed(weights), let m = parsed(maxes) else { return "Every weight needs a number (0 or more)." }
        if w.values.contains(where: { $0 > ProgramText.maxWeight }) || m.values.contains(where: { $0 > ProgramText.maxWeight }) {
            return "Weights go up to \(Int(ProgramText.maxWeight))."
        }
        return nil
    }

    func send() async {
        guard let api = model.api else { error = "Not connected to a server."; return }
        guard let w = parsed(weights), let m = parsed(maxes) else { return }
        sending = true
        defer { sending = false }
        let body = ProgramStartBody.make(detail: d, days: days, weights: w, maxes: m)
        do {
            let r = try await api.startProgram(d.id, body)
            onDone(r)
        } catch let e as ApiError {
            error = e.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Text of the confirm page (unit tested).
enum StartSummary {
    static func replaces(name: String, current: String?, restarting: Bool) -> String {
        if restarting { return "This restarts \(name) from today. Your past workouts are kept." }
        if let c = current, !c.isEmpty { return "This replaces \(c). Your past workouts are kept." }
        return "Your past workouts are kept."
    }

    static func days(_ days: Set<Int>) -> String {
        let names: [String] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return days.filter { $0 >= 0 && $0 < 7 }.sorted().map { names[$0] }.joined(separator: ", ")
    }

    static func options(_ d: ProgramDetail) -> String {
        d.options.map { o in o.choices.first { $0.value == o.selected }?.label ?? o.selected }.joined(separator: " · ")
    }

    static func weights(_ m: [String: Double], label: (String) -> String, order: [String]) -> String {
        order.compactMap { k in m[k].map { label(k) + " " + Fmt.weight($0) } }.joined(separator: " · ")
    }

    /// the summary row label: the program's own word when it fits ("1RM"), else MAXES
    static func maxTitle(_ d: ProgramDetail) -> String {
        let l: String = d.start.maxLabel
        return l.isEmpty || l.count > 8 ? "MAXES" : l.uppercased()
    }

    /// "as prefilled" or "3 changed" (there can be a dozen slots; the list is on the previous page)
    static func changed(_ edited: [String: Double], _ prefill: [String: Double]) -> String {
        let n: Int = edited.filter { k, v in prefill[k].map { abs($0 - v) > 0.001 } ?? true }.count
        return n == 0 ? "\(edited.count) as prefilled" : "\(edited.count) · \(n) changed"
    }
}

struct SummaryRow: View {
    var label: String
    var value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Cap(label, T.dim, size: 10).frame(width: 74, alignment: .leading)
            Text(value).font(T.mono(12)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }
}

struct StartDaysPanel: View {
    @Binding var days: Set<Int>
    var target: Int

    var detail: String {
        target > 0 ? "\(days.count) PICKED · PLAN \(target)/WK" : "\(days.count) PICKED"
    }

    var body: some View {
        Panel(title: "TRAINING DAYS", detail: detail) {
            HStack(spacing: 4) {
                ForEach(0..<7, id: \.self) { i in
                    DayToggle(label: ProgramText.weekdays[i], on: days.contains(i)) {
                        if days.contains(i) { days.remove(i) } else { days.insert(i) }
                    }
                }
            }
            if target > 0 && days.count != target {
                Text("The program plans \(target) sessions a week; with other days picked, sessions follow your days in order.")
                    .font(T.mono(10)).foregroundStyle(T.amber).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct DayToggle: View {
    var label: String
    var on: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label).font(T.mono(10, .bold))
                .foregroundStyle(on ? T.bg : T.dim)
                .frame(maxWidth: .infinity).padding(.vertical, 9)
                .background(on ? T.amber : Color.clear)
                .overlay(Rectangle().stroke(on ? T.amber : T.line, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("day-\(label)")
    }
}

struct StartWeightsPanel: View {
    var title: String
    var unit: String
    var keys: [String]
    var label: (String) -> String
    @Binding var values: [String: String]

    var body: some View {
        Panel(title: title, detail: unit.uppercased()) {
            ForEach(keys, id: \.self) { k in
                WeightField(name: label(k), unit: unit, text: binding(k))
            }
        }
    }

    func binding(_ k: String) -> Binding<String> {
        Binding(get: { values[k] ?? "" }, set: { values[k] = $0 })
    }
}

struct WeightField: View {
    var name: String
    var unit: String
    @Binding var text: String

    var invalid: Bool { ProgramText.number(text) == nil }
    var step: Double { unit == "kg" ? 2.5 : 5 }

    var body: some View {
        HStack(spacing: 6) {
            Text(name).font(T.mono(12)).foregroundStyle(T.text).lineLimit(1)
            Spacer(minLength: 6)
            stepButton("minus", -step)
            TextField("0", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(T.mono(14, .bold))
                .foregroundStyle(invalid ? T.down : T.amber)
                .frame(width: 70)
                .padding(.vertical, 7)
                .overlay(Rectangle().stroke(invalid ? T.down : T.line, lineWidth: 1))
            stepButton("plus", step)
        }
    }

    func stepButton(_ icon: String, _ delta: Double) -> some View {
        Button {
            let v: Double = ProgramText.number(text) ?? 0
            text = Fmt.weight(max(0, v + delta))
        } label: {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(T.text)
                .frame(width: 30, height: 30).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
