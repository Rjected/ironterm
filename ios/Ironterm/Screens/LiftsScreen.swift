import Charts
import SwiftUI

// MARK: - LIFTS list

struct LiftsScreen: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var remote = Remote<AppLiftList>("lifts")
    @State private var filter = ""

    var body: some View {
        Group {
            if let d = model.direct {
                ScrollView { list(d.liftList(), unit: model.store.directUnit).padding(14) }
                    .refreshable { await model.refresh() }
            } else {
                RemoteGate(remote: remote, path: "/api/app/lifts") { l in list(l, unit: model.snapshot?.unit ?? "") }
            }
        }
        .screen()
    }

    func list(_ l: AppLiftList, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ScreenHeader(title: "LIFTS", detail: "\(l.lifts.count) TRACKED · E1RM \(unit.uppercased())")
            if l.lifts.count > 8 {
                TextField("filter", text: $filter)
                    .font(T.mono(12)).foregroundStyle(T.text).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(Color(hex: 0x0B0C0E)).overlay(Rectangle().stroke(T.line, lineWidth: 1))
            }
            if l.lifts.isEmpty {
                Panel(title: "LIFTS") {
                    Text("No tracked lifts yet. Squat, bench, deadlift, press and ~100 other Hevy exercises are recognised by name.")
                        .font(T.mono(11)).foregroundStyle(T.dim)
                }
            }
            let f = filter.trimmingCharacters(in: .whitespaces).lowercased()
            ForEach(l.lifts.filter { f.isEmpty || $0.name.lowercased().contains(f) || $0.short.lowercased().contains(f) }) { x in
                NavigationLink(value: LiftRoute(key: x.key)) { LiftRow(l: x) }.buttonStyle(.plain)
            }
            Cap("E1RM = EPLEY W×(1+R/30), BEST SET OF THE SESSION", T.faint, size: 8)
        }
    }
}

struct LiftRow: View {
    var l: AppLiftList.Lift
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(l.short).font(T.mono(12, .heavy)).foregroundStyle(T.amber).lineLimit(1)
                    if let s = l.status, s != "progressing" { Badge(text: s, color: StatusColor.of(s)) }
                }
                Text(l.name).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
                Cap("\(l.sessions) SESSIONS · \(Fmt.dayLabel(l.last))", T.faint, size: 8)
            }
            .frame(width: 128, alignment: .leading)
            Sparkline(values: l.spark.indices.map { i in l.spark[max(0, i - 3)...i].max() ?? 0 }, color: l.status == "inactive" ? T.faint : T.up)
                .frame(height: 34)
            VStack(alignment: .trailing, spacing: 1) {
                Text(l.e1rm > 0 ? Fmt.weight(l.e1rm) : "BW").font(T.mono(20, .bold)).foregroundStyle(T.text).lineLimit(1).minimumScaleFactor(0.7)
                Cap(l.best > 0 ? "BEST \(Fmt.weight(l.best))" : "BODYWEIGHT", T.faint, size: 8)
            }
            .frame(width: 70, alignment: .trailing)
            Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint)
        }
        .padding(12)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
        .contentShape(Rectangle())
    }
}

// MARK: - lift detail

struct LiftDetailScreen: View {
    @EnvironmentObject var model: AppModel
    var key: String
    @StateObject private var remote: Remote<AppLiftDetail>

    init(key: String) {
        self.key = key
        _remote = StateObject(wrappedValue: Remote<AppLiftDetail>("lift-" + key))
    }

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: LiftLibrary.byKey[key]?.short ?? key.uppercased())
            if let d = model.direct {
                ScrollView { LiftDetailContent(d: d.liftDetail(key)).padding(14) }
            } else {
                RemoteGate(remote: remote, path: "/api/app/lifts/" + AppAPI.seg(key)) { d in LiftDetailContent(d: d) }
            }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Back button row for pushed screens (the nav bar is hidden for the terminal look).
struct BackBar: View {
    @Environment(\.dismiss) private var dismiss
    var title: String
    var trailing: AnyView? = nil

    var body: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 12, weight: .bold))
                    Text("BACK").font(T.mono(11, .bold))
                }
                .foregroundStyle(T.amber)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text(title).font(T.mono(12, .heavy)).foregroundStyle(T.text).lineLimit(1)
            Spacer()
            trailing
        }
        .padding(.horizontal, 14)
        .background(T.bg)
        .overlay(alignment: .bottom) { Divider1() }
    }
}

struct LiftDetailContent: View {
    var d: AppLiftDetail
    @State private var range = 365
    @State private var selected: AppLiftDetail.Point?
    @State private var selDate: Date?

    var shown: [AppLiftDetail.Point] {
        guard range > 0, let last = d.points.last else { return d.points }
        let from = Day.add(last.date, -range)
        let r = d.points.filter { $0.date >= from }
        return r.count >= 2 ? r : Array(d.points.suffix(2))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            chartPanel
            if let st = d.stall { stallPanel(st) }
            if let p = d.projection { projectionPanel(p) }
            if !d.repPRs.isEmpty { repPanel }
            if !d.prWall.isEmpty { wallPanel }
            if !d.rpe.isEmpty { rpePanel }
            recentPanel
        }
    }

    var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(d.name.uppercased()).font(T.mono(16, .heavy)).foregroundStyle(T.amber)
            HStack(alignment: .bottom) {
                Stat(value: d.e1rm.map(Fmt.weight) ?? "—", label: "E1RM \(d.unit.uppercased())", size: 30)
                Spacer()
                Stat(value: d.best.map { Fmt.weight($0.e1rm) } ?? "—", label: d.best.map { "BEST · \(Fmt.dayLabel($0.date))" } ?? "BEST", color: T.dim, size: 18)
                Spacer()
                if let y = d.yearAgo, let n = d.e1rm {
                    Stat(value: Fmt.signed(DirectScreens.r1(n - y)), label: "VS 1Y AGO", color: T.deltaColor(n - y), size: 18)
                } else {
                    Stat(value: "\(d.points.count)", label: "SESSIONS", color: T.dim, size: 18)
                }
            }
        }
    }

    // e1RM over time with the projection band; drag to scrub
    var chartPanel: some View {
        let pts = shown
        let band = d.projection?.band ?? []
        let values = pts.map(\.e1rm) + band.flatMap { [$0.lo, $0.hi] }
        let lo = ((values.min() ?? 0) * 0.95).rounded(.down)
        let hi = max(lo + 1, ((values.max() ?? 1) * 1.03).rounded(.up))
        return Panel(title: "E1RM", detail: selected.map { "\(Fmt.dayLabel($0.date)) · \(Fmt.weight($0.e1rm))" } ?? "DRAG TO SCRUB") {
            Seg(options: [(90, "3M"), (182, "6M"), (365, "1Y"), (0, "ALL")], value: $range, size: 10)
            Chart {
                ForEach(band, id: \.date) { b in
                    AreaMark(x: .value("Date", Day.date(b.date) ?? Date()), yStart: .value("lo", b.lo), yEnd: .value("hi", b.hi))
                        .foregroundStyle(T.amber.opacity(0.14))
                    LineMark(x: .value("Date", Day.date(b.date) ?? Date()), y: .value("mid", b.mid), series: .value("s", "proj"))
                        .foregroundStyle(T.amber.opacity(0.8))
                        .lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                }
                // every session as a faint dot, the 28-day best as the line (like the web chart)
                ForEach(pts) { p in
                    PointMark(x: .value("Date", Day.date(p.date) ?? Date()), y: .value("e1RM", p.e1rm))
                        .foregroundStyle(T.up.opacity(0.35))
                        .symbolSize(pts.count > 60 ? 5 : 10)
                }
                ForEach(Self.rollingBest(pts), id: \.date) { b in
                    AreaMark(x: .value("Date", Day.date(b.date) ?? Date()), yStart: .value("lo", lo), yEnd: .value("best", b.v), series: .value("s", "area"))
                        .foregroundStyle(LinearGradient(colors: [T.up.opacity(0.25), T.up.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.stepEnd)
                    LineMark(x: .value("Date", Day.date(b.date) ?? Date()), y: .value("best", b.v), series: .value("s", "best"))
                        .foregroundStyle(T.up)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        .interpolationMethod(.stepEnd)
                }
                if let s = selected {
                    RuleMark(x: .value("Date", Day.date(s.date) ?? Date())).foregroundStyle(T.amber.opacity(0.7))
                    PointMark(x: .value("Date", Day.date(s.date) ?? Date()), y: .value("e1RM", s.e1rm)).foregroundStyle(T.amber).symbolSize(70)
                }
            }
            .chartYScale(domain: lo...hi)
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisGridLine().foregroundStyle(T.line); AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits)).font(T.mono(8)).foregroundStyle(T.faint) } }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in AxisGridLine().foregroundStyle(T.line); AxisValueLabel().font(T.mono(8)).foregroundStyle(T.faint) } }
            .chartXSelection(value: $selDate)
            .onChange(of: selDate) { _, date in
                guard let date else { return }
                selected = pts.min { abs((Day.date($0.date) ?? Date()).timeIntervalSince(date)) < abs((Day.date($1.date) ?? Date()).timeIntervalSince(date)) }
            }
            .frame(height: 200)
            if let s = selected {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Cap("TOP SET", T.faint, size: 8)
                        Text("\(Fmt.weight(s.topWeight)) × \(s.topReps)").font(T.mono(13, .bold)).foregroundStyle(T.text)
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        Cap("SETS", T.faint, size: 8)
                        Text(s.sets.map { "\(Fmt.weight($0.weight))×\($0.reps)" }.joined(separator: " ")).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(2)
                    }
                    Spacer()
                    NavigationLink(value: WorkoutRoute(id: s.workoutId)) {
                        Text("WORKOUT ▸").font(T.mono(10, .bold)).foregroundStyle(T.amber)
                    }
                }
            }
            HStack(spacing: 12) {
                legend(T.up, "28-DAY BEST")
                legend(T.up.opacity(0.4), "SESSION")
                if !band.isEmpty { legend(T.amber, "12-WEEK PROJECTION") }
            }
        }
    }

    struct Best { var date: String; var v: Double }

    /// Best e1RM over the trailing 28 days at each session (web/src/derive.ts rollingBest).
    static func rollingBest(_ pts: [AppLiftDetail.Point]) -> [Best] {
        pts.map { p in
            let from = Day.add(p.date, -27)
            return Best(date: p.date, v: pts.filter { $0.date >= from && $0.date <= p.date }.map(\.e1rm).max() ?? p.e1rm)
        }
    }

    func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Rectangle().fill(c).frame(width: 10, height: 2); Cap(t, T.faint, size: 8) }
    }

    func stallPanel(_ st: AppLiftDetail.Stall) -> some View {
        Panel(title: "TREND", detail: st.status.uppercased()) {
            HStack(alignment: .top, spacing: 10) {
                Badge(text: st.status, color: StatusColor.of(st.status))
                Text(st.reason).font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Stat(value: st.change6w.map { pct($0) } ?? "—", label: "6 WEEKS", color: T.deltaColor(st.change6w))
                Spacer()
                Stat(value: st.change12w.map { pct($0) } ?? "—", label: "12 WEEKS", color: T.deltaColor(st.change12w))
                Spacer()
            }
        }
    }

    func pct(_ x: Double) -> String { (x >= 0 ? "+" : "−") + String(format: "%.1f%%", abs(x * 100)) }

    func projectionPanel(_ p: AppLiftDetail.Projection) -> some View {
        Panel(title: "PROJECTION", detail: "12 WEEKS") {
            HStack {
                Stat(value: p.current.map(Fmt.weight) ?? "—", label: "NOW")
                Image(systemName: "arrow.right").foregroundStyle(T.faint)
                Stat(value: p.projected.map(Fmt.weight) ?? "—", label: "PROJECTED", color: T.amber)
                Spacer()
                if let c = p.current, let x = p.projected { Stat(value: Fmt.signed(DirectScreens.r1(x - c)), label: "GAIN", color: T.deltaColor(x - c)) }
            }
            Text(p.note).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
        }
    }

    var repPanel: some View {
        Panel(title: "REP PRS", detail: "BEST WEIGHT × REPS") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                ForEach(d.repPRs, id: \.reps) { r in
                    VStack(spacing: 2) {
                        Cap("\(r.reps)RM", T.faint, size: 8)
                        Text(Fmt.weight(r.weight)).font(T.mono(14, .bold)).foregroundStyle(T.text)
                        Cap(String(r.date.prefix(7)), T.faint, size: 7)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                    .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                }
            }
        }
    }

    var wallPanel: some View {
        Panel(title: "PR WALL", detail: "HOW LONG EACH HAS STOOD") {
            let maxDays = Double(max(1, d.prWall.map(\.stoodDays).max() ?? 1))
            ForEach(d.prWall, id: \.reps) { r in
                HStack(spacing: 8) {
                    Text("\(r.reps)RM").font(T.mono(10, .bold)).foregroundStyle(T.dim).frame(width: 34, alignment: .leading)
                    Text(Fmt.weight(r.weight)).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 52, alignment: .trailing)
                    Bar(value: Double(r.stoodDays) / maxDays, color: r.stoodDays < 30 ? T.up : r.stoodDays < 120 ? T.amber : T.down, height: 6)
                    Text(r.stoodDays == 0 ? "NEW" : "\(r.stoodDays)D").font(T.mono(10)).foregroundStyle(T.faint).frame(width: 40, alignment: .trailing)
                }
            }
        }
    }

    var rpePanel: some View {
        let reps = Array(Set(d.rpe.map(\.reps))).sorted()
        let rpes = Array(Set(d.rpe.map(\.rpe))).sorted(by: >)
        return Panel(title: "YOUR RPE CHART", detail: "% OF E1RM") {
            Grid(alignment: .trailing, horizontalSpacing: 6, verticalSpacing: 4) {
                GridRow {
                    Cap("RPE", T.faint, size: 8)
                    ForEach(reps, id: \.self) { r in Cap("\(r)", T.faint, size: 8).frame(maxWidth: .infinity, alignment: .trailing) }
                }
                ForEach(rpes, id: \.self) { e in
                    GridRow {
                        Cap(Fmt.weight(e), T.dim, size: 9, weight: .bold)
                        ForEach(reps, id: \.self) { r in
                            let v = d.rpe.first { $0.reps == r && $0.rpe == e }?.pct
                            Text(v.map { "\(Int(($0 * 100).rounded()))" } ?? "").font(T.mono(10)).foregroundStyle(T.text)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }
                }
            }
        }
    }

    var recentPanel: some View {
        Panel(title: "RECENT SESSIONS", detail: "\(d.points.count) TOTAL") {
            ForEach(d.points.suffix(10).reversed()) { p in
                NavigationLink(value: WorkoutRoute(id: p.workoutId)) {
                    HStack(spacing: 8) {
                        Text(Fmt.dayLabel(p.date)).font(T.mono(10)).foregroundStyle(T.dim).frame(width: 82, alignment: .leading)
                        Text("\(Fmt.weight(p.topWeight))×\(p.topReps)").font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 74, alignment: .leading)
                        Cap("\(p.sets.count) SETS", T.faint, size: 8)
                        Spacer()
                        Text(Fmt.weight(p.e1rm)).font(T.mono(12, .bold)).foregroundStyle(T.up)
                        Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(T.faint)
                    }
                    .padding(.vertical, 3)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
