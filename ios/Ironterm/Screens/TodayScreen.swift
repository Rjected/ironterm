import Charts
import SwiftUI

struct LiftRoute: Hashable { var key: String }
struct WorkoutRoute: Hashable { var id: String }

extension View {
    /// Pushed screens every tab can reach.
    func withRoutes() -> some View {
        navigationDestination(for: LiftRoute.self) { LiftDetailScreen(key: $0.key) }
            .navigationDestination(for: WorkoutRoute.self) { WorkoutScreen(id: $0.id) }
            .toolbar(.hidden, for: .navigationBar)
    }
}

// MARK: - TODAY

struct TodayScreen: View {
    @EnvironmentObject var model: AppModel
    @StateObject private var home = Remote<AppHome>("home")

    var body: some View {
        Group {
            if model.source == .server, let h = home.value {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if home.fromCache, home.error != nil { OfflineStrip(date: home.fetchedAt) }
                        TodayContent(s: model.snapshot ?? h.snapshot, home: h)
                    }
                    .padding(14)
                }
                .refreshable { await reload() }
            } else {
                DataGate { s in TodayContent(s: s, home: nil) }
            }
        }
        .screen()
        .task(id: model.dataVersion) { if model.source == .server { await home.load(model.api, path: "/api/app/home") } }
    }

    func reload() async {
        await model.refresh()
        await home.load(model.api, path: "/api/app/home")
    }
}

struct TodayContent: View {
    @EnvironmentObject var model: AppModel
    var s: Snapshot
    var home: AppHome?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LiveBanner(gym: model.gym)
            NextSessionPanel(s: s, source: model.source)
            weekPanel
            graphPanel
            readinessPanel
            e1rmPanel
            if let h = home {
                if !h.watch.isEmpty { watchPanel(h) }
                if !h.recentPRs.isEmpty { prPanel(h) }
                if h.weekly.count > 1 { volumePanel(h) }
            }
            if let l = s.last { lastPanel(l) }
        }
    }

    var weekPanel: some View {
        Panel(title: "THIS WEEK", detail: "\(s.week.done)/\(s.week.target) SESSIONS") {
            WeekStrip(days: s.week.days, today: s.today, cell: 34)
            HStack(alignment: .bottom) {
                Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: 20)
                Spacer()
                Stat(value: "\(s.streak.best)W", label: "BEST", size: 20)
                Spacer()
                Stat(value: Fmt.compact(s.totals.vol7), label: "VOL 7D \(s.unitLabel)", size: 20)
                Spacer()
                let d = s.totals.vol7 - s.totals.volPrev7
                Stat(value: (d >= 0 ? "+" : "−") + Fmt.compact(abs(d)), label: "VS PREV 7D", color: T.deltaColor(d), size: 20)
            }
        }
    }

    var graphPanel: some View {
        Panel(title: "26 WEEKS", detail: "\(s.graph.days.suffix(182).filter { $0.level > 0 }.count) TRAINING DAYS") {
            GraphGrid(days: s.graph.days, weeks: 26, theme: model.theme, gap: 2, months: true)
                .frame(height: 104)
            HStack(spacing: 4) {
                Cap("LESS", T.faint, size: 8)
                ForEach(0..<5) { l in Rectangle().fill(model.theme.color(for: l)).frame(width: 9, height: 9) }
                Cap("MORE", T.faint, size: 8)
                Spacer()
                Cap("\(s.totals.sessions52) SESSIONS / 52W · \(s.totals.allTime) ALL TIME", T.faint, size: 8)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { if model.source == .server { model.open("stats") } }
    }

    @ViewBuilder var readinessPanel: some View {
        if let r = s.recovery {
            Panel(title: "READINESS", detail: "BIG MUSCLES →") {
                HStack(spacing: 16) {
                    Gauge01(value: r.overall, size: 86)
                    VStack(alignment: .leading, spacing: 6) {
                        Cap("LEAST READY", T.dim, size: 9)
                        ForEach(r.muscles.prefix(3)) { m in MuscleRow(name: m.name, readiness: m.readiness, readyInH: m.readyInH) }
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { model.open("body") }
        } else if model.source == .direct {
            Panel(title: "READINESS", detail: "NEEDS SERVER") {
                Text("Recovery is modelled on the server. Direct mode can't show it.").font(T.mono(11)).foregroundStyle(T.dim)
            }
        }
    }

    @ViewBuilder var e1rmPanel: some View {
        let rows: [(key: String, short: String, now: Double, d4: Double?, d12: Double?, best: Double?)] = home.map { h in
            h.e1rm.prefix(6).map { ($0.lift, $0.short, $0.now, $0.d4w, $0.d12w, Optional($0.best)) }
        } ?? s.lifts.prefix(6).map { ($0.key, $0.short, $0.e1rm, $0.delta28, nil, nil) }
        if !rows.isEmpty {
            Panel(title: "E1RM", detail: s.unitLabel) {
                HStack {
                    Cap("LIFT", T.faint, size: 8).frame(maxWidth: .infinity, alignment: .leading)
                    Cap("NOW", T.faint, size: 8).frame(width: 52, alignment: .trailing)
                    Cap("4W", T.faint, size: 8).frame(width: 48, alignment: .trailing)
                    if home != nil {
                        Cap("12W", T.faint, size: 8).frame(width: 48, alignment: .trailing)
                        Cap("BEST", T.faint, size: 8).frame(width: 48, alignment: .trailing)
                    }
                }
                ForEach(rows, id: \.key) { r in
                    NavigationLink(value: LiftRoute(key: r.key)) {
                        HStack {
                            Text(r.short).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(maxWidth: .infinity, alignment: .leading).lineLimit(1)
                            Text(Fmt.weight(r.now)).font(T.mono(13, .bold)).foregroundStyle(T.text).frame(width: 52, alignment: .trailing)
                            Text(r.d4.map(Fmt.signed) ?? "—").font(T.mono(11)).foregroundStyle(T.deltaColor(r.d4)).frame(width: 48, alignment: .trailing)
                            if home != nil {
                                Text(r.d12.map(Fmt.signed) ?? "—").font(T.mono(11)).foregroundStyle(T.deltaColor(r.d12)).frame(width: 48, alignment: .trailing)
                                Text(r.best.map(Fmt.weight) ?? "—").font(T.mono(11)).foregroundStyle(T.dim).frame(width: 48, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    func watchPanel(_ h: AppHome) -> some View {
        Panel(title: "WATCH LIST", detail: "STALLS & PROGRESS") {
            ForEach(Array(h.watch.prefix(6).enumerated()), id: \.offset) { _, w in
                NavigationLink(value: LiftRoute(key: w.lift)) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Badge(text: w.status, color: StatusColor.of(w.status)).frame(width: 84, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(w.short).font(T.mono(11, .bold)).foregroundStyle(T.text)
                            Text(w.text).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        if let r = w.rate { Text((r >= 0 ? "+" : "") + Fmt.weight(r) + "%").font(T.mono(11, .bold)).foregroundStyle(T.deltaColor(r)) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    func prPanel(_ h: AppHome) -> some View {
        Panel(title: "RECENT PRS", detail: "LAST 30 DAYS") {
            ForEach(Array(h.recentPRs.prefix(6).enumerated()), id: \.offset) { _, p in
                HStack(spacing: 8) {
                    Image(systemName: "trophy.fill").font(.system(size: 10)).foregroundStyle(T.amber)
                    Text(p.short).font(T.mono(11, .bold)).foregroundStyle(T.text).frame(width: 78, alignment: .leading).lineLimit(1)
                    Text(p.kind == "e1rm" ? "E1RM \(Fmt.weight(p.weight))" : "\(Fmt.weight(p.weight)) × \(p.reps)").font(T.mono(12, .bold)).foregroundStyle(T.text)
                    if p.kind != "e1rm" { Cap(p.kind == "rep" ? "REP PR" : p.kind, T.dim, size: 8) }
                    Spacer()
                    Cap(Fmt.dayLabel(p.date), T.faint, size: 9)
                }
            }
        }
    }

    func volumePanel(_ h: AppHome) -> some View {
        Panel(title: "VOLUME", detail: "26 WEEKS · \(s.unitLabel)") {
            Chart(h.weekly, id: \.week) { w in
                BarMark(x: .value("Week", Day.date(w.week) ?? Date(), unit: .weekOfYear), y: .value("Volume", w.volume))
                    .foregroundStyle(T.up.opacity(0.8))
            }
            .chartXAxis { AxisMarks(values: .stride(by: .month)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated)).font(T.mono(7)).foregroundStyle(T.faint) } }
            .chartYAxis { AxisMarks(position: .leading) { v in AxisGridLine().foregroundStyle(T.line); AxisValueLabel { Text(Fmt.compact(v.as(Double.self) ?? 0)).font(T.mono(7)).foregroundStyle(T.faint) } } }
            .frame(height: 110)
        }
    }

    func lastPanel(_ l: Snapshot.LastWorkout) -> some View {
        Panel(title: "LAST WORKOUT", detail: Fmt.dayLabel(l.date)) {
            Text(l.title).font(T.mono(15, .bold)).foregroundStyle(T.text)
            HStack {
                Stat(value: "\(Int(l.durationMin))M", label: "TIME")
                Spacer()
                Stat(value: "\(l.exercises)", label: "EXERCISES")
                Spacer()
                Stat(value: "\(l.sets)", label: "SETS")
                Spacer()
                Stat(value: Fmt.compact(l.volume), label: "VOL \(s.unitLabel)")
            }
        }
    }
}

/// "SESSION IN PROGRESS" on TODAY while a GYM session runs.
struct LiveBanner: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore

    var body: some View {
        if let s = gym.session {
            let p = Live.progress(s)
            Button { model.tab = .gym } label: {
                HStack(spacing: 10) {
                    Circle().fill(T.up).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 2) {
                        Cap("SESSION IN PROGRESS", T.bg, size: 10, weight: .heavy)
                        Text("\(s.title) · \(p.done)/\(p.total) sets").font(T.mono(11)).foregroundStyle(T.bg.opacity(0.75))
                    }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        Text(Live.clock(ctx.date.timeIntervalSince(s.startDate))).font(T.mono(16, .bold)).foregroundStyle(T.bg).monospacedDigit()
                    }
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(T.bg)
                }
                .padding(12)
                .background(T.amber)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

struct NextSessionPanel: View {
    @EnvironmentObject var model: AppModel
    var s: Snapshot
    var source: DataSource

    var body: some View {
        if let n = s.next {
            Button { model.tab = .gym } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Cap("NEXT SESSION", T.amber, size: 10, weight: .bold)
                        Spacer()
                        Cap(s.program?.name.uppercased() ?? "", T.dim, size: 10)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(n.when).font(T.mono(24, .heavy)).foregroundStyle(T.amber)
                        if n.reentry { Badge(text: "RE-ENTRY") }
                        Spacer()
                        if model.gym.session == nil {
                            Text("START ▸").font(T.mono(11, .heavy)).foregroundStyle(T.bg).padding(.horizontal, 8).padding(.vertical, 4).background(T.amber)
                        }
                    }
                    Text(n.dayName + (n.weekName.map { " · \($0)" } ?? "")).font(T.mono(14, .bold)).foregroundStyle(T.text)
                    if n.reentry {
                        Text("Back after a break: weights are eased in for this session.").font(T.mono(10)).foregroundStyle(T.dim)
                    }
                    Divider1()
                    ForEach(Array(n.exercises.enumerated()), id: \.offset) { _, e in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            TierTag(tier: e.tier)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.name.uppercased()).font(T.mono(12, .bold)).foregroundStyle(T.text)
                                Text(e.summary).font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 4)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(e.top > 0 ? Fmt.weight(e.top) : "BW").font(T.mono(16, .bold)).foregroundStyle(T.text)
                                Cap(e.top > 0 ? s.unit : "", T.faint, size: 8)
                            }
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(T.panel)
                .overlay(Rectangle().stroke(T.amber.opacity(0.6), lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens GYM")
        } else {
            Panel(title: "NEXT SESSION", detail: "NO PROGRAM") {
                Text(source == .direct
                     ? "Programs live on the server. In Direct mode the app shows your log: graph, streak, lifts, history."
                     : "No program is set. Pick one in SETUP → Advanced setup (web), or just start an empty workout in GYM.")
                    .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct TierTag: View {
    var tier: String?
    var body: some View {
        Text(tier ?? "").font(T.mono(9, .bold))
            .foregroundStyle(tier == "T1" || tier == "MAIN" ? T.amber : tier == "T2" || tier == "SUPP" ? T.up : T.faint)
            .frame(width: 22, alignment: .leading)
    }
}

struct MuscleRow: View {
    var name: String
    var readiness: Double
    var readyInH: Double

    var body: some View {
        HStack(spacing: 8) {
            Text(name).font(T.mono(10, .bold)).foregroundStyle(T.text).frame(width: 92, alignment: .leading).lineLimit(1)
            Bar(value: readiness, color: T.readiness(readiness), height: 7)
            Text("\(Int((readiness * 100).rounded()))%").font(T.mono(10)).foregroundStyle(T.readiness(readiness)).frame(width: 34, alignment: .trailing)
            Text(readyInH > 0 ? "\(Int(readyInH))H" : "—").font(T.mono(10)).foregroundStyle(T.faint).frame(width: 30, alignment: .trailing)
        }
    }
}
