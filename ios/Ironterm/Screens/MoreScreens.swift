import Charts
import SwiftUI

// MARK: - MORE

struct MoreRoot: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        NavigationStack(path: $model.morePath) {
            MoreMenu()
                .navigationDestination(for: AppModel.More.self) { m in
                    VStack(spacing: 0) {
                        BackBar(title: m == .gallery ? "WIDGET GALLERY" : m.title)
                        screen(m)
                    }
                    .screen()
                    .toolbar(.hidden, for: .navigationBar)
                }
                .withRoutes()
        }
    }

    @ViewBuilder func screen(_ m: AppModel.More) -> some View {
        if m.serverOnly && model.source != .server {
            NeedsServer(title: m.title, what: m.what)
        } else {
            switch m {
            case .lifts: LiftsScreen()
            case .calendar: CalendarScreen()
            case .program: ProgramScreen()
            case .programs: ProgramListScreen()
            case .body: BodyScreen()
            case .insights: InsightsScreen()
            case .stats: StatsScreen()
            case .setup: SetupView()
            case .gallery: GalleryView()
            }
        }
    }
}

extension AppModel.More {
    var key: String {
        switch self {
        case .lifts: return "F6"
        case .calendar: return "F7"
        case .program: return "F8"
        case .programs: return ""
        case .body: return "F9"
        case .insights: return "F10"
        case .stats: return "F11"
        case .setup: return "F12"
        case .gallery: return ""
        }
    }
    var what: String {
        switch self {
        case .calendar: return "The training calendar (done, planned, missed, trips)"
        case .program: return "Your program: slots, upcoming sessions and every decision"
        case .programs: return "The program catalog, each program's rules and workouts, and starting one"
        case .body: return "The per-muscle recovery and load model"
        case .insights: return "Projections, strength balance and achievements"
        case .stats: return "Weekly totals and cardio"
        case .lifts, .setup, .gallery: return ""
        }
    }
    var blurb: String {
        switch self {
        case .lifts: return "Every lift · e1RM charts · PRs · projections"
        case .calendar: return "Month grid · done / planned / missed"
        case .program: return "Slots · upcoming · decision log · push to Hevy"
        case .programs: return "Browse every program · rules · workouts · start"
        case .body: return "Muscle map · readiness · weekly load"
        case .insights: return "Projections · balance · achievements"
        case .stats: return "Weekly volume · sessions · cardio"
        case .setup: return "Connection · gym preferences · widgets"
        case .gallery: return "Every widget size"
        }
    }
    var icon: String {
        switch self {
        case .lifts: return "chart.line.uptrend.xyaxis"
        case .calendar: return "calendar"
        case .program: return "list.number"
        case .programs: return "books.vertical"
        case .body: return "figure.arms.open"
        case .insights: return "sparkles"
        case .stats: return "chart.bar.fill"
        case .setup: return "gearshape"
        case .gallery: return "square.grid.2x2"
        }
    }
}

struct MoreMenu: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                ScreenHeader(title: "MORE", detail: model.source == .server ? (model.serverURL?.host ?? "") : model.source.rawValue.uppercased())
                ForEach(AppModel.More.allCases.filter { $0 != .gallery }) { m in
                    Button { model.morePath.append(m) } label: {
                        HStack(spacing: 12) {
                            Text(m.key).font(T.mono(9)).foregroundStyle(T.faint).frame(width: 26, alignment: .leading)
                            Image(systemName: m.icon).font(.system(size: 15)).foregroundStyle(T.amber).frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.title).font(T.mono(14, .heavy)).foregroundStyle(T.text)
                                Text(m.blurb).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
                            }
                            Spacer()
                            if m.serverOnly && model.source != .server { Cap("SERVER", T.faint, size: 8) }
                            Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 13)
                        .background(T.panel)
                        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("more-\(m.rawValue)")
                }
            }
            .padding(14)
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
    }
}

// MARK: - CALENDAR

struct CalendarScreen: View {
    @EnvironmentObject var model: AppModel
    @State private var month: String = ""
    @StateObject private var remote = Remote<AppCalendar>("calendar")
    @State private var picked: AppCalendar.CDay?

    var path: String { "/api/app/calendar" + (month.isEmpty ? "" : "?month=\(month)") }

    var body: some View {
        RemoteGate(remote: remote, path: path) { c in
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Button { shift(c.month, -1) } label: { Image(systemName: "chevron.left").padding(8) }
                    Spacer()
                    Text(monthTitle(c.month)).font(T.mono(15, .heavy)).foregroundStyle(T.amber)
                    Spacer()
                    Button { shift(c.month, 1) } label: { Image(systemName: "chevron.right").padding(8) }
                }
                .foregroundStyle(T.amber)
                grid(c)
                legend
                Panel(title: "THIS WEEK", detail: "\(c.week.done)/\(c.week.planned) DONE") {
                    Text(c.week.label.uppercased()).font(T.mono(13, .bold)).foregroundStyle(c.week.left > 0 ? T.amber : T.up)
                    Bar(value: c.week.planned > 0 ? Double(c.week.done) / Double(c.week.planned) : 0, color: T.up, height: 6)
                }
                if !c.trips.isEmpty {
                    Panel(title: "TRIPS") {
                        ForEach(c.trips) { t in
                            HStack {
                                Image(systemName: "airplane").foregroundStyle(T.dim)
                                Text(t.name).font(T.mono(12, .bold)).foregroundStyle(T.text)
                                Spacer()
                                Cap("\(t.start.suffix(5)) → \(t.end.suffix(5)) · \(t.gym)", T.faint, size: 9)
                            }
                        }
                    }
                }
            }
        }
        .sheet(item: $picked) { d in DaySheet(day: d).environmentObject(model).presentationDetents([.medium, .large]).termSheet() }
        .onChange(of: month) { _, _ in remote.rekey("calendar-" + month) }
    }

    func shift(_ m: String, _ n: Int) {
        let p = m.split(separator: "-").compactMap { Int($0) }
        guard p.count == 2 else { return }
        var y = p[0], mo = p[1] + n
        if mo < 1 { mo = 12; y -= 1 }
        if mo > 12 { mo = 1; y += 1 }
        month = String(format: "%04d-%02d", y, mo)
    }

    func monthTitle(_ m: String) -> String {
        let names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
        let mi = Int(m.suffix(2)) ?? 1
        return "\(names[(mi - 1) % 12]) \(m.prefix(4))"
    }

    func grid(_ c: AppCalendar) -> some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        return LazyVGrid(columns: cols, spacing: 4) {
            ForEach(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], id: \.self) { d in Cap(d, T.faint, size: 8).frame(maxWidth: .infinity) }
            ForEach(c.days) { d in
                Button { picked = d } label: { DayCell(d: d) }.buttonStyle(.plain)
            }
        }
    }

    var legend: some View {
        HStack(spacing: 10) {
            ForEach([("done", "DONE"), ("planned", "PLANNED"), ("missed", "MISSED"), ("travel", "TRAVEL")], id: \.0) { s, t in
                HStack(spacing: 4) { WeekCell(status: s, size: 10); Cap(t, T.faint, size: 8) }
            }
        }
    }
}

struct DayCell: View {
    var d: AppCalendar.CDay
    var body: some View {
        VStack(spacing: 2) {
            Text(String(Int(d.date.suffix(2)) ?? 0)).font(T.mono(11, .bold)).foregroundStyle(fg)
            Text(sub).font(T.mono(7, .bold)).foregroundStyle(fg.opacity(0.8)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(bg)
        .overlay(Rectangle().stroke(border, lineWidth: d.status == "today" ? 2 : 1))
        .opacity(d.inMonth ? 1 : 0.35)
        .contentShape(Rectangle())
    }

    var sub: String {
        switch d.status {
        case "done": return d.workouts.first.map { String($0.title.split(separator: "·").last ?? "").trimmingCharacters(in: .whitespaces) } ?? "✓"
        case "planned", "today": return d.planned?.dayId ?? ""
        case "missed": return "MISS"
        case "travel": return "✈"
        default: return ""
        }
    }
    var fg: Color { d.status == "done" ? T.bg : d.status == "missed" ? T.down : d.status == "rest" ? T.dim : T.text }
    var bg: Color { d.status == "done" ? T.up : d.status == "today" ? T.amber.opacity(0.18) : Color(hex: 0x0B0C0E) }
    var border: Color {
        switch d.status {
        case "planned", "today": return T.amber
        case "missed": return T.down.opacity(0.7)
        case "done": return T.up
        default: return T.line
        }
    }
}

struct DaySheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var day: AppCalendar.CDay

    var body: some View {
        NavigationStack { content.withRoutes() }
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(Fmt.dayLabel(day.date)).font(T.mono(16, .heavy)).foregroundStyle(T.amber)
                Spacer()
                Badge(text: day.status, color: StatusColor.of(day.status))
            }
            if let t = day.trip { Label(t, systemImage: "airplane").font(T.mono(12)).foregroundStyle(T.dim) }
            ForEach(day.workouts) { w in
                NavigationLink(value: WorkoutRoute(id: w.id)) {
                    HStack {
                        Image(systemName: "checkmark.square.fill").foregroundStyle(T.up)
                        Text(w.title).font(T.mono(13, .bold)).foregroundStyle(T.text)
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(T.faint)
                    }
                    .padding(10).overlay(Rectangle().stroke(T.line, lineWidth: 1)).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let p = day.planned {
                HStack {
                    Image(systemName: "square.dashed").foregroundStyle(T.amber)
                    VStack(alignment: .leading) {
                        Cap("PLANNED", T.faint, size: 9)
                        Text(p.dayName).font(T.mono(13, .bold)).foregroundStyle(T.text)
                    }
                    Spacer()
                    if day.status == "today" {
                        Button { dismiss(); model.tab = .gym } label: {
                            Text("GYM ▸").font(T.mono(11, .heavy)).foregroundStyle(T.bg).padding(.horizontal, 10).padding(.vertical, 6).background(T.amber)
                        }
                    }
                }
            }
            if day.workouts.isEmpty && day.planned == nil {
                Text(day.status == "missed" ? "A planned session was missed." : "Rest day.").font(T.mono(12)).foregroundStyle(T.dim)
            }
            Spacer()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.panel.ignoresSafeArea())
    }
}

// MARK: - PROGRAM

struct ProgramScreen: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var remote = Remote<AppProgram>("program")
    @State private var confirmPush = false
    @State private var pushing = false
    @State private var pushMsg: (String, Bool)?

    var body: some View {
        RemoteGate(remote: remote, path: "/api/app/program") { doc in
            if let p = doc.program { content(p) } else {
                Panel(title: "PROGRAM", detail: "NONE") {
                    Text("No program is set up. Browse the catalog, read how each one works, and start one.").font(T.mono(11)).foregroundStyle(T.dim)
                        .fixedSize(horizontal: false, vertical: true)
                    TermButton(title: "BROWSE PROGRAMS", style: .primary) { model.morePath.append(AppModel.More.programs) }
                        .accessibilityIdentifier("browse-programs")
                }
            }
        }
        .confirmationDialog("Push the program's next sessions to Hevy as routines?", isPresented: $confirmPush, titleVisibility: .visible) {
            Button("Push to Hevy") { Task { await push() } }
        }
    }

    func push() async {
        guard let api = model.api else { return }
        pushing = true
        defer { pushing = false }
        do {
            let r = try await api.pushRoutines()
            pushMsg = ("Pushed \(r.pushed?.count ?? 0) routines: \((r.pushed ?? []).map(\.dayId).joined(separator: ", "))", true)
            await remote.load(api, path: "/api/app/program")
        } catch {
            pushMsg = ((error as? ApiError)?.errorDescription ?? error.localizedDescription, false)
        }
    }

    func content(_ p: AppProgram.Program) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(p.name.uppercased()).font(T.mono(18, .heavy)).foregroundStyle(T.amber)
                if let a = p.author { Text("by \(a)").font(T.mono(10)).foregroundStyle(T.dim) }
                HStack(spacing: 8) {
                    Badge(text: "WEEK \(p.week)\(p.weekName.map { " · \($0)" } ?? "")", color: T.up)
                    Badge(text: p.unit, color: T.faint)
                    if p.complete { Badge(text: "COMPLETE", color: T.amber) }
                    if let r = p.reentry { Badge(text: "RE-ENTRY \(r.done + 1)/\(r.total)") }
                }
                if let summary: String = p.reentry?.summary {
                    Text(summary).font(T.mono(10)).foregroundStyle(T.amber).fixedSize(horizontal: false, vertical: true)
                }
            }
            TermButton(title: "BROWSE PROGRAMS") { model.morePath.append(AppModel.More.programs) }
                .accessibilityIdentifier("browse-programs")
            if model.snapshot?.isLocal == true {
                Panel(title: "LOGGING") {
                    Text("No Hevy connected, so there are no routines to push: log each session in GYM and it's saved on your server.")
                        .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
            } else {
            Panel(title: "HEVY ROUTINES", detail: p.pushed ? "PUSHED" : "NOT PUSHED") {
                Text("Push the upcoming sessions to Hevy as routines, with exact weights, to log them in the Hevy app instead.")
                    .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                TermButton(title: pushing ? "PUSHING…" : "PUSH TO HEVY", style: .primary, disabled: pushing) { confirmPush = true }
                if let (m, ok) = pushMsg { Text(m).font(T.mono(10, .bold)).foregroundStyle(ok ? T.up : T.down).fixedSize(horizontal: false, vertical: true) }
            }
            }
            Panel(title: "UPCOMING", detail: "\(p.upcoming.count) SESSIONS") {
                ForEach(Array(p.upcoming.enumerated()), id: \.offset) { i, u in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(u.dayName).font(T.mono(12, .bold)).foregroundStyle(i == 0 ? T.amber : T.text)
                            Spacer()
                            Cap(Fmt.dayLabel(u.date), T.dim, size: 9)
                        }
                        ForEach(Array(u.exercises.enumerated()), id: \.offset) { _, e in
                            HStack(spacing: 6) {
                                TierTag(tier: e.tier)
                                Text(e.short).font(T.mono(10, .bold)).foregroundStyle(T.text).frame(width: 74, alignment: .leading).lineLimit(1)
                                Text(e.summary).font(T.mono(10)).foregroundStyle(T.dim)
                            }
                        }
                    }
                    if i < p.upcoming.count - 1 { Divider1() }
                }
            }
            Panel(title: "SLOTS", detail: "\(p.slots.count) · ▲ HIT ▼ MISS") {
                ForEach(p.slots) { s in
                    VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        TierTag(tier: s.tier)
                        Text(s.name).font(T.mono(11, .bold)).foregroundStyle(T.text).lineLimit(1)
                        Spacer(minLength: 4)
                        if s.stages.count > 1 {
                            HStack(spacing: 2) {
                                ForEach(0..<s.stages.count, id: \.self) { k in Rectangle().fill(k == s.stage ? T.amber : T.line).frame(width: 6, height: 6) }
                            }
                        }
                        Text(s.scheme).font(T.mono(10)).foregroundStyle(T.dim).frame(width: 54, alignment: .trailing)
                        Text(Fmt.weight(s.weight)).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 46, alignment: .trailing)
                    }
                    // what happens next session
                    Group {
                        if let n = s.note, !n.isEmpty { Text(n).foregroundStyle(T.amber) }
                        if let x = s.ifSuccess { Text("▲ " + x).foregroundStyle(T.up) }
                        if let x = s.ifFail { Text("▼ " + x).foregroundStyle(T.down) }
                    }
                    .font(T.mono(9)).padding(.leading, 28).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 2)
                }
            }
            Panel(title: "DECISION LOG", detail: "NEWEST FIRST") {
                if p.log.isEmpty { Text("Nothing logged yet.").font(T.mono(11)).foregroundStyle(T.dim) }
                ForEach(Array(p.log.prefix(12).enumerated()), id: \.offset) { i, e in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("DAY \(e.dayId)").font(T.mono(11, .bold)).foregroundStyle(T.amber)
                            Spacer()
                            Cap(Fmt.dayLabel(String(e.date.prefix(10))), T.dim, size: 9)
                        }
                        ForEach(Array(e.results.enumerated()), id: \.offset) { _, r in ResultRow(r: r) }
                    }
                    if i < min(12, p.log.count) - 1 { Divider1() }
                }
            }
        }
    }
}

// MARK: - BODY

struct BodyScreen: View {
    @EnvironmentObject var model: AppModel
    @State private var mode = "ready"
    @StateObject private var remote = Remote<AppBody>("body-ready")

    var body: some View {
        RemoteGate(remote: remote, path: "/api/app/body?mode=\(mode)") { b in
            VStack(alignment: .leading, spacing: 12) {
                Seg(options: [("ready", "READINESS"), ("load", "WEEKLY LOAD")], value: $mode)
                figures(b)
                muscles(b)
            }
        }
        .onChange(of: mode) { _, m in remote.rekey("body-" + m) }
    }

    func figures(_ b: AppBody) -> some View {
        Panel(title: b.mode == "load" ? "PROGRAM LOAD" : "RECOVERY", detail: b.mode == "load" ? "HARD SETS / WEEK" : "FATIGUE NOW") {
            HStack(alignment: .bottom, spacing: 8) {
                VStack(spacing: 4) { SVGView(svg: b.svgFront); Cap("FRONT", T.faint, size: 8) }
                VStack(spacing: 4) { SVGView(svg: b.svgBack); Cap("BACK", T.faint, size: 8) }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Muscle map, \(b.mode == "load" ? "weekly load" : "fatigue")")
            HStack(spacing: 6) {
                Cap(b.legend.first ?? "", T.faint, size: 8)
                LinearGradient(colors: b.mode == "load" ? [Color(hex: 0x0F3278), Color(hex: 0x285AB4), Color(hex: 0x5082DC), Color(hex: 0x8CB4FF)]
                                                       : [Color(hex: 0x16181D), Color(hex: 0xFF6B5E)], startPoint: .leading, endPoint: .trailing)
                    .frame(height: 6)
                Cap(b.legend.last ?? "", T.faint, size: 8)
            }
        }
    }

    func muscles(_ b: AppBody) -> some View {
        Panel(title: "MUSCLES", detail: b.mode == "load" ? "MOST LOADED FIRST" : "LEAST READY FIRST") {
            HStack {
                Spacer()
                Cap(b.mode == "load" ? "LOAD" : "READY", T.faint, size: 8).frame(width: 40, alignment: .trailing)
                Cap("7D", T.faint, size: 8).frame(width: 30, alignment: .trailing)
                Cap("28D", T.faint, size: 8).frame(width: 34, alignment: .trailing)
            }
            ForEach(b.muscles) { m in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.short).font(T.mono(10, .bold)).foregroundStyle(T.text).lineLimit(1)
                        if let s = m.status, s != "ok", s != "n/a" { Cap(s, StatusColor.of(s), size: 7) }
                    }
                    .frame(width: 84, alignment: .leading)
                    let v = b.mode == "load" ? m.value : m.readiness
                    Bar(value: v, color: b.mode == "load" ? T.up : T.readiness(m.readiness), height: 7)
                    Text(b.mode == "load" ? "\(Int((m.value * 100).rounded()))%" : "\(Int((m.readiness * 100).rounded()))%")
                        .font(T.mono(10)).foregroundStyle(b.mode == "load" ? T.up : T.readiness(m.readiness)).frame(width: 40, alignment: .trailing)
                    Text(Fmt.weight(m.sets7)).font(T.mono(10)).foregroundStyle(T.dim).frame(width: 30, alignment: .trailing)
                    Text(Fmt.weight(m.sets28)).font(T.mono(10)).foregroundStyle(T.faint).frame(width: 34, alignment: .trailing)
                }
            }
            Cap("SETS = HARD SETS ATTRIBUTED TO THE MUSCLE", T.faint, size: 7)
        }
    }
}

// MARK: - INSIGHTS

struct InsightsScreen: View {
    @StateObject private var remote = Remote<AppInsights>("insights")

    var body: some View {
        RemoteGate(remote: remote, path: "/api/app/insights") { i in
            VStack(alignment: .leading, spacing: 12) {
                if !i.projections.isEmpty {
                    Panel(title: "PROJECTIONS", detail: "12 WEEKS") {
                        ForEach(i.projections) { p in
                            NavigationLink(value: LiftRoute(key: p.lift)) {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(p.short).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 80, alignment: .leading)
                                        Text(p.current.map(Fmt.weight) ?? "—").font(T.mono(13, .bold)).foregroundStyle(T.text)
                                        Image(systemName: "arrow.right").font(.system(size: 9)).foregroundStyle(T.faint)
                                        Text(p.projected.map(Fmt.weight) ?? "—").font(T.mono(13, .bold)).foregroundStyle(T.amber)
                                        Spacer()
                                        if let c = p.current, let x = p.projected { Text(Fmt.signed(DirectScreens.r1(x - c))).font(T.mono(11)).foregroundStyle(T.deltaColor(x - c)) }
                                    }
                                    Text(p.note).font(T.mono(9)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let b = i.balance {
                    Panel(title: "STRENGTH BALANCE", detail: b.lagging.isEmpty ? "BALANCED" : "LAGGING: \(b.lagging.map { LiftLibrary.byKey[$0]?.short ?? $0 }.joined(separator: ", "))") {
                        Text(b.summary).font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                        ForEach(b.ratios, id: \.name) { r in RatioRow(r: r) }
                    }
                }
                Panel(title: "ACHIEVEMENTS", detail: "\(i.achievements.unlocked)/\(i.achievements.total) UNLOCKED") {
                    Bar(value: Double(i.achievements.unlocked) / Double(max(1, i.achievements.total)), color: T.amber, height: 6)
                    if !i.achievements.recent.isEmpty {
                        Cap("RECENT", T.faint, size: 9)
                        ForEach(i.achievements.recent) { a in AchievementRow(a: a) }
                    }
                    if !i.achievements.next.isEmpty {
                        Cap("CLOSEST", T.faint, size: 9)
                        ForEach(i.achievements.next) { a in AchievementRow(a: a) }
                    }
                }
            }
        }
    }
}

struct RatioRow: View {
    var r: AppInsights.Balance.Ratio
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(r.name.uppercased()).font(T.mono(10, .bold)).foregroundStyle(T.text)
                Spacer()
                Text(String(format: "%.2f", r.value)).font(T.mono(11, .bold)).foregroundStyle(StatusColor.of(r.status))
                Cap(r.status, StatusColor.of(r.status), size: 8)
            }
            GeometryReader { g in
                let lo: Double = min(r.lo, r.value) * 0.8, hi: Double = max(r.hi, r.value) * 1.15
                let x = { (v: Double) -> CGFloat in CGFloat((v - lo) / max(0.0001, hi - lo)) * g.size.width }
                ZStack(alignment: .leading) {
                    Rectangle().fill(T.line).frame(height: 4)
                    Rectangle().fill(T.up.opacity(0.35)).frame(width: max(2, x(r.hi) - x(r.lo)), height: 8).offset(x: x(r.lo))
                    Rectangle().fill(StatusColor.of(r.status)).frame(width: 3, height: 12).offset(x: x(r.value) - 1.5)
                }
                .frame(height: 12)
            }
            .frame(height: 12)
            Cap("TARGET \(String(format: "%.2f", r.lo))–\(String(format: "%.2f", r.hi))", T.faint, size: 7)
        }
    }
}

struct AchievementRow: View {
    var a: Achievement
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: a.unlockedAt != nil ? "rosette" : "lock")
                .font(.system(size: 14)).foregroundStyle(a.unlockedAt != nil ? tierColor : T.faint).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(a.title).font(T.mono(11, .bold)).foregroundStyle(T.text)
                Text(a.description).font(T.mono(9)).foregroundStyle(T.dim).lineLimit(2)
                if a.unlockedAt == nil { Bar(value: a.progress > 1 ? a.progress / 100 : a.progress, color: T.amber, height: 4) }
            }
            Spacer(minLength: 0)
            if let u = a.unlockedAt { Cap(Fmt.dayLabel(u), T.faint, size: 8) }
            else { Cap("\(Int(((a.progress > 1 ? a.progress / 100 : a.progress) * 100).rounded()))%", T.amber, size: 9) }
        }
    }
    var tierColor: Color { a.tier == "gold" ? T.amber : a.tier == "silver" ? T.text : Color(hex: 0xC8875A) }
}

// MARK: - STATS

struct StatsScreen: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var remote = Remote<AppStats>("stats")
    @State private var metric = "volume"

    var body: some View {
        RemoteGate(remote: remote, path: "/api/app/stats") { s in
            VStack(alignment: .leading, spacing: 12) {
                Panel(title: "TOTALS") {
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 12) {
                        GridRow {
                            Stat(value: "\(s.totals.workouts)", label: "WORKOUTS", size: 20)
                            Stat(value: "\(s.totals.sessions52)", label: "SESSIONS 52W", size: 20)
                            Stat(value: "\(Int(s.totals.avgMin))M", label: "AVG SESSION", size: 20)
                        }
                        GridRow {
                            Stat(value: "\(s.totals.streak.current)W", label: "STREAK", color: T.amber, size: 20)
                            Stat(value: "\(s.totals.streak.best)W", label: "BEST STREAK", size: 20)
                            Stat(value: Fmt.compact(s.weekly.suffix(4).reduce(0) { $0 + $1.volume } / 4), label: "VOL/WK 4W \(s.unit.uppercased())", size: 20)
                        }
                    }
                }
                if let snap = model.snapshot {
                    Panel(title: "53 WEEKS", detail: "\(snap.graph.days.filter { $0.level > 0 }.count) TRAINING DAYS") {
                        GraphGrid(days: snap.graph.days, weeks: 53, theme: model.theme, gap: 1, months: true).frame(height: 62)
                    }
                }
                Panel(title: "BY WEEK", detail: "\(s.weekly.count) WEEKS") {
                    Seg(options: [("volume", "VOLUME"), ("sessions", "SESSIONS"), ("sets", "SETS")], value: $metric, size: 10)
                    Chart(s.weekly, id: \.week) { w in
                        BarMark(x: .value("Week", Day.date(w.week) ?? Date(), unit: .weekOfYear), y: .value(metric, value(w)))
                            .foregroundStyle(T.up.opacity(0.85))
                    }
                    .chartXAxis { AxisMarks(values: .stride(by: .month, count: 3)) { _ in AxisGridLine().foregroundStyle(T.line); AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits)).font(T.mono(7)).foregroundStyle(T.faint) } }
                    .chartYAxis { AxisMarks(position: .leading) { v in AxisGridLine().foregroundStyle(T.line); AxisValueLabel { Text(Fmt.compact(v.as(Double.self) ?? 0)).font(T.mono(7)).foregroundStyle(T.faint) } } }
                    .frame(height: 170)
                }
                if let c = s.cardio {
                    Panel(title: "CARDIO", detail: "ALL TIME") {
                        HStack {
                            Stat(value: "\(c.sessions)", label: "SESSIONS", size: 20)
                            Spacer()
                            Stat(value: Fmt.weight(c.distance), label: c.unit.uppercased(), size: 20)
                            Spacer()
                            Stat(value: "\(Int(c.durationMin / 60))H", label: "TIME", size: 20)
                        }
                    }
                }
            }
        }
    }

    func value(_ w: AppHome.Week) -> Double {
        metric == "sessions" ? Double(w.sessions) : metric == "sets" ? Double(w.sets) : w.volume
    }
}
