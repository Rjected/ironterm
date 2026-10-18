import SwiftUI
import WidgetKit

/// Everything a widget view needs. Built by the timeline providers in the extension and by the
/// app's widget gallery, so both render exactly the same views.
struct WidgetData {
    var snapshot: Snapshot?
    var source: DataSource
    var error: String?

    static let sample = WidgetData(snapshot: Fixture.sample, source: .server, error: nil)
    static let directSample = WidgetData(snapshot: Fixture.directSample, source: .direct, error: nil)
}

enum WidgetPad {
    static func of(_ f: WidgetFamily) -> CGFloat {
        switch f {
        case .systemSmall: return 13
        case .systemMedium: return 14
        case .systemLarge, .systemExtraLarge: return 16
        default: return 0
        }
    }
}

/// Header line shared by the home screen widgets: amber title left, detail right.
struct WHeader: View {
    var title: String
    var detail: String = ""
    var detailColor: Color = T.dim
    var warn = false

    var body: some View {
        HStack(spacing: 4) {
            Rectangle().fill(T.amber).frame(width: 3, height: 9)
            Cap(title, T.amber, size: 9, weight: .bold)
            if warn { Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 7)).foregroundStyle(T.down) }
            Spacer(minLength: 2)
            Cap(detail, detailColor, size: 9, weight: .bold)
        }
    }
}

/// Shown when there is no snapshot yet (never synced) or when a widget needs the server.
struct WidgetMessage: View {
    var title: String
    var message: String
    var icon = "terminal"

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 10, weight: .bold)).foregroundStyle(T.amber)
                Cap(title, T.amber, size: 10, weight: .bold)
            }
            Text(message)
                .font(T.mono(10))
                .foregroundStyle(T.dim)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Cap(Brand.upper, T.faint, size: 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct NotConnected: View {
    var data: WidgetData
    var body: some View {
        WidgetMessage(title: "NOT CONNECTED", message: data.error ?? "Open \(Brand.name) and pick a data source in SETUP.")
    }
}

// MARK: - Activity graph

struct ActivityWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily
    var theme: ColorTheme

    var body: some View {
        if let s = data.snapshot { content(s) } else { NotConnected(data: data) }
    }

    @ViewBuilder func content(_ s: Snapshot) -> some View {
        let warn = data.error != nil
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 7) {
                WHeader(title: "ACTIVITY", detail: "\(s.week.done)/\(s.week.target)", detailColor: T.text, warn: warn)
                GraphGrid(days: s.graph.days, weeks: 14, theme: theme, gap: 2)
                HStack(alignment: .bottom) {
                    Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: 15)
                    Spacer()
                    Stat(value: "\(s.totals.sessions52)", label: "52 WK", size: 15)
                }
            }
        case .systemMedium:
            VStack(alignment: .leading, spacing: 8) {
                WHeader(title: "ACTIVITY · 26 WK", detail: "BEST \(s.streak.best)W", warn: warn)
                GraphGrid(days: s.graph.days, weeks: 26, theme: theme, gap: 2)
                HStack(alignment: .bottom, spacing: 0) {
                    Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: 14)
                    Spacer()
                    Stat(value: "\(s.week.done)/\(s.week.target)", label: "THIS WEEK", size: 14)
                    Spacer()
                    Stat(value: "\(s.totals.sessions52)", label: "52 WK", size: 14)
                    Spacer()
                    Stat(value: Fmt.compact(s.totals.vol7), label: "VOL 7D \(s.unitLabel)", size: 14)
                }
            }
        case .systemLarge:
            // a year as two half-year bands keeps the cells readable
            let days = s.graph.days
            let split = min(days.count, 27 * 7)
            VStack(alignment: .leading, spacing: 8) {
                WHeader(title: "ACTIVITY · 53 WEEKS", detail: "\(s.totals.allTime) ALL TIME", warn: warn)
                GraphGrid(days: Array(days.prefix(split)), weeks: 27, theme: theme, gap: 2, months: true)
                GraphGrid(days: Array(days.dropFirst(split)), weeks: 27, theme: theme, gap: 2, months: true, padLeading: false)
                Divider1()
                StatsRow(s: s, size: 15)
                Divider1()
                LastLine(s: s)
            }
        default: // systemExtraLarge (iPad)
            VStack(alignment: .leading, spacing: 10) {
                WHeader(title: "ACTIVITY · 53 WEEKS", detail: "\(s.totals.allTime) WORKOUTS ALL TIME", warn: warn)
                GraphGrid(days: s.graph.days, weeks: 53, theme: theme, gap: 2, months: true)
                Divider1()
                HStack(alignment: .center, spacing: 16) {
                    StatsRow(s: s, size: 18)
                    WeekStrip(days: s.week.days, today: s.today, cell: 20).frame(width: 220)
                }
                Divider1()
                if !s.lifts.isEmpty {
                    HStack(spacing: 16) { ForEach(s.bigFour) { LiftTile(l: $0) } }
                    Divider1()
                }
                Spacer(minLength: 0)
                LastLine(s: s)
            }
        }
    }
}

struct StatsRow: View {
    var s: Snapshot
    var size: CGFloat = 15
    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: size)
            Spacer()
            Stat(value: "\(s.streak.best)W", label: "BEST", size: size)
            Spacer()
            Stat(value: "\(s.week.done)/\(s.week.target)", label: "WEEK", size: size)
            Spacer()
            Stat(value: "\(s.totals.sessions52)", label: "52 WK", size: size)
            Spacer()
            Stat(value: "\(Int(s.totals.avgMin))M", label: "AVG", size: size)
        }
    }
}

struct LastLine: View {
    var s: Snapshot
    var body: some View {
        if let l = s.last {
            HStack(spacing: 6) {
                Cap("LAST", T.faint, size: 9)
                Text(l.title).font(T.mono(10, .bold)).foregroundStyle(T.text).lineLimit(1)
                Spacer(minLength: 4)
                Cap("\(Fmt.dayLabel(l.date)) · \(Int(l.durationMin))M · \(Fmt.compact(l.volume)) \(s.unitLabel)", T.dim, size: 9)
            }
        } else {
            Cap("NO WORKOUTS YET", T.faint, size: 9)
        }
    }
}

// MARK: - Next workout

struct NextWorkoutWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily

    var body: some View {
        if let s = data.snapshot {
            if let n = s.next { content(s, n) } else { noProgram(s) }
        } else { NotConnected(data: data) }
    }

    func noProgram(_ s: Snapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WHeader(title: "NEXT", detail: "NO PROGRAM")
            Text(data.source == .direct ? "Programs need the server. Direct mode shows your last session." : "No program set. Pick one in the web app.")
                .font(T.mono(9)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            if family == .systemLarge && !s.lifts.isEmpty {
                Divider1()
                Cap("E1RM · \(s.unitLabel)", T.dim, size: 9)
                Grid(horizontalSpacing: 14, verticalSpacing: 10) {
                    GridRow { ForEach(s.bigFour.prefix(2)) { LiftTile(l: $0) } }
                    if s.bigFour.count > 2 { GridRow { ForEach(s.bigFour.dropFirst(2).prefix(2)) { LiftTile(l: $0) } } }
                }
            }
            Spacer(minLength: 0)
            if let l = s.last {
                Cap("LAST · \(Fmt.dayLabel(l.date))", T.faint, size: 9)
                Text(l.title).font(T.mono(12, .bold)).foregroundStyle(T.text).lineLimit(1)
                Cap("\(l.exercises) EX · \(l.sets) SETS · \(Fmt.compact(l.volume)) \(s.unitLabel)", T.dim, size: 9)
            }
            if family == .systemLarge {
                Divider1()
                WeekStrip(days: s.week.days, today: s.today, cell: 22)
            }
        }
    }

    @ViewBuilder func content(_ s: Snapshot, _ n: Snapshot.NextSession) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 5) {
                WHeader(title: "NEXT", detail: n.when, detailColor: T.amber, warn: data.error != nil)
                Text(n.dayName).font(T.mono(12, .bold)).foregroundStyle(T.text).lineLimit(2).minimumScaleFactor(0.8)
                if n.reentry { Badge(text: "RE-ENTRY") }
                Spacer(minLength: 0)
                ForEach(Array(n.exercises.prefix(n.reentry ? 2 : 3).enumerated()), id: \.offset) { _, e in
                    HStack {
                        Cap(e.short, T.dim, size: 10)
                        Spacer(minLength: 2)
                        Text(e.top > 0 ? Fmt.weight(e.top) : "BW").font(T.mono(13, .bold)).foregroundStyle(T.text)
                    }
                }
            }
        case .systemMedium:
            VStack(alignment: .leading, spacing: 5) {
                WHeader(title: "NEXT · \(n.dayName)", detail: n.when, detailColor: T.amber, warn: data.error != nil)
                if n.reentry { Badge(text: "RE-ENTRY · LIGHTER") }
                ExerciseList(n: n, max: n.reentry ? 3 : 4, unit: s.unitLabel)
                Spacer(minLength: 0)
                Divider1()
                HStack {
                    Cap(s.program?.name ?? "", T.faint, size: 9)
                    Spacer()
                    Cap("WEEK \(s.week.done)/\(s.week.target)", T.text, size: 9, weight: .bold)
                    Cap("STREAK \(s.streak.current)W", T.amber, size: 9, weight: .bold)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 7) {
                WHeader(title: "NEXT SESSION", detail: n.when, detailColor: T.amber, warn: data.error != nil)
                VStack(alignment: .leading, spacing: 2) {
                    Text(n.dayName).font(T.mono(15, .bold)).foregroundStyle(T.text).lineLimit(1)
                    HStack(spacing: 6) {
                        Cap(([s.program?.name, n.weekName].compactMap { $0 }).joined(separator: " · "), T.dim, size: 9)
                        if n.reentry { Badge(text: "RE-ENTRY") }
                    }
                }
                Divider1()
                ExerciseList(n: n, max: 6, unit: s.unitLabel, roomy: true)
                Spacer(minLength: 0)
                if n.exercises.count <= 4, let l = s.last {
                    Cap("LAST · \(l.title) · \(Fmt.dayLabel(l.date))", T.faint, size: 9)
                }
                Divider1()
                HStack {
                    Cap("THIS WEEK \(s.week.done)/\(s.week.target)", T.text, size: 9, weight: .bold)
                    Spacer()
                    Cap("STREAK \(s.streak.current)W", T.amber, size: 9, weight: .bold)
                }
                WeekStrip(days: s.week.days, today: s.today, cell: 22)
            }
        }
    }
}

struct ExerciseList: View {
    var n: Snapshot.NextSession
    var max: Int
    var unit: String
    var roomy = false

    var body: some View {
        VStack(alignment: .leading, spacing: roomy ? 9 : 8) {
            ForEach(Array(n.exercises.prefix(max).enumerated()), id: \.offset) { _, e in
                if roomy {
                    // two lines: lift + top weight, then the set summary
                    HStack(alignment: .top, spacing: 8) {
                        Text(e.tier).font(T.mono(9, .bold)).foregroundStyle(e.tier == "T1" ? T.amber : T.faint).frame(width: 16, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.name.uppercased()).font(T.mono(12, .bold)).foregroundStyle(T.text).lineLimit(1)
                            Text(e.summary).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1).minimumScaleFactor(0.75)
                        }
                        Spacer(minLength: 4)
                        Text(e.top > 0 ? Fmt.weight(e.top) : "BW").font(T.mono(17, .bold)).foregroundStyle(T.text)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(e.tier).font(T.mono(8, .bold)).foregroundStyle(e.tier == "T1" ? T.amber : T.faint).frame(width: 14, alignment: .leading)
                        Text(e.short).font(T.mono(11, .bold)).foregroundStyle(T.text).frame(width: 62, alignment: .leading).lineLimit(1)
                        Text(e.summary).font(T.mono(11)).foregroundStyle(T.dim).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                    }
                }
            }
            if n.exercises.count > max {
                Cap("+\(n.exercises.count - max) MORE", T.faint, size: 8)
            }
        }
    }
}

// MARK: - This week

struct WeekWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily

    var body: some View {
        if let s = data.snapshot { content(s) } else { NotConnected(data: data) }
    }

    @ViewBuilder func content(_ s: Snapshot) -> some View {
        let p = s.week.target > 0 ? Double(s.week.done) / Double(s.week.target) : 0
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 6) {
                WHeader(title: "THIS WEEK", warn: data.error != nil)
                ZStack {
                    Ring(progress: p, color: p >= 1 ? T.up : T.amber, lineWidth: 9)
                    VStack(spacing: 0) {
                        Text("\(s.week.done)/\(s.week.target)").font(T.mono(22, .bold)).foregroundStyle(T.text)
                        Cap("SESSIONS", T.faint, size: 8)
                    }
                }
                .frame(maxWidth: .infinity)
                HStack {
                    Cap("STREAK", T.faint, size: 9)
                    Text("\(s.streak.current)W").font(T.mono(11, .bold)).foregroundStyle(T.amber)
                    Spacer()
                    Cap("BEST \(s.streak.best)", T.dim, size: 9)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                WHeader(title: "THIS WEEK", detail: "\(s.week.done)/\(s.week.target) SESSIONS", detailColor: p >= 1 ? T.up : T.text, warn: data.error != nil)
                Spacer(minLength: 0)
                WeekStrip(days: s.week.days, today: s.today, cell: 30)
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: 0) {
                    Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: 14)
                    Spacer()
                    Stat(value: "\(s.streak.best)W", label: "BEST", size: 14)
                    Spacer()
                    Stat(value: Fmt.compact(s.totals.vol7), label: "VOL 7D \(s.unitLabel)", size: 14)
                    Spacer()
                    let d = s.totals.vol7 - s.totals.volPrev7
                    Stat(value: (d >= 0 ? "+" : "−") + Fmt.compact(abs(d)), label: "VS PREV", color: T.deltaColor(d), size: 14)
                }
            }
        }
    }
}

// MARK: - Lifts

struct LiftsWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily
    var liftKey: String?

    var body: some View {
        if let s = data.snapshot {
            if s.lifts.isEmpty {
                WidgetMessage(title: "LIFTS", message: "No tracked lifts yet. Log a squat, bench, deadlift or press in Hevy.", icon: "chart.line.uptrend.xyaxis")
            } else { content(s) }
        } else { NotConnected(data: data) }
    }

    @ViewBuilder func content(_ s: Snapshot) -> some View {
        switch family {
        case .systemSmall:
            let l = s.lift(liftKey)!
            VStack(alignment: .leading, spacing: 3) {
                WHeader(title: l.short, detail: "E1RM", warn: data.error != nil)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(Fmt.weight(l.e1rm)).font(T.mono(30, .bold)).foregroundStyle(T.text).minimumScaleFactor(0.6).lineLimit(1)
                    Cap(s.unit, T.dim, size: 10)
                }
                DeltaLine(d: l.delta28)
                Sparkline(values: l.spark, color: T.up).padding(.top, 4)
            }
        case .systemMedium:
            VStack(alignment: .leading, spacing: 7) {
                WHeader(title: "E1RM · \(s.unitLabel)", detail: "28D Δ", warn: data.error != nil)
                let big = s.bigFour
                Grid(horizontalSpacing: 14, verticalSpacing: 12) {
                    GridRow {
                        ForEach(big.prefix(2)) { LiftTile(l: $0) }
                    }
                    if big.count > 2 {
                        GridRow {
                            ForEach(big.dropFirst(2).prefix(2)) { LiftTile(l: $0) }
                        }
                    }
                }
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                WHeader(title: "E1RM · \(s.unitLabel)", detail: "12 WK · 28D Δ", warn: data.error != nil)
                Divider1()
                ForEach(s.lifts.prefix(8)) { l in
                    HStack(spacing: 8) {
                        Text(l.short).font(T.mono(10, .bold)).foregroundStyle(T.text).frame(width: 66, alignment: .leading).lineLimit(1)
                        Sparkline(values: l.spark, color: T.up, fill: false, lineWidth: 1.2).frame(height: 18)
                        Text(Fmt.weight(l.e1rm)).font(T.mono(12, .bold)).foregroundStyle(T.text).frame(width: 52, alignment: .trailing)
                        Text(l.delta28.map(Fmt.signed) ?? "—").font(T.mono(10)).foregroundStyle(T.deltaColor(l.delta28)).frame(width: 46, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxHeight: .infinity)
                }
            }
        }
    }
}

struct DeltaLine: View {
    var d: Double?
    var body: some View {
        HStack(spacing: 3) {
            if let d {
                Image(systemName: d > 0 ? "arrow.up.right" : d < 0 ? "arrow.down.right" : "arrow.right")
                    .font(.system(size: 8, weight: .bold))
                Text("\(Fmt.signed(d)) / 28D").font(T.mono(10, .bold))
            } else {
                Text("NEW").font(T.mono(10, .bold))
            }
        }
        .foregroundStyle(T.deltaColor(d))
    }
}

struct LiftTile: View {
    var l: Snapshot.Lift
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack {
                Cap(l.short, T.dim, size: 9)
                Spacer(minLength: 2)
                Text(l.delta28.map(Fmt.signed) ?? "NEW").font(T.mono(9, .bold)).foregroundStyle(T.deltaColor(l.delta28)).lineLimit(1)
            }
            HStack(alignment: .bottom, spacing: 6) {
                Text(Fmt.weight(l.e1rm)).font(T.mono(18, .bold)).foregroundStyle(T.text).lineLimit(1).minimumScaleFactor(0.7)
                Sparkline(values: l.spark, color: T.up, fill: true, lineWidth: 1.3).frame(height: 30)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Recovery

struct RecoveryWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily

    var body: some View {
        if let s = data.snapshot {
            if let r = s.recovery { content(r) } else {
                WidgetMessage(title: "RECOVERY", message: data.source == .direct
                              ? "Needs server. Direct mode has no recovery model; connect a server in SETUP."
                              : "No recovery data yet.", icon: "server.rack")
            }
        } else { NotConnected(data: data) }
    }

    @ViewBuilder func content(_ r: Snapshot.Recovery) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 6) {
                WHeader(title: "RECOVERY", warn: data.error != nil)
                Spacer(minLength: 0)
                Gauge01(value: r.overall, size: 78).frame(maxWidth: .infinity)
                Spacer(minLength: 0)
                if let m = r.muscles.first {
                    HStack {
                        Cap("LOW", T.faint, size: 9)
                        Cap(m.name, T.text, size: 9, weight: .bold)
                        Spacer(minLength: 0)
                        Cap("\(Int((m.readiness * 100).rounded()))%", T.readiness(m.readiness), size: 9, weight: .bold)
                    }
                }
            }
        default:
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    WHeader(title: "RECOVERY", warn: data.error != nil)
                    Spacer(minLength: 0)
                    Gauge01(value: r.overall, size: 84)
                    Spacer(minLength: 0)
                }
                .frame(width: 96)
                VStack(alignment: .leading, spacing: 7) {
                    Cap("LEAST READY", T.dim, size: 9)
                    ForEach(r.muscles.prefix(6)) { m in
                        HStack(spacing: 6) {
                            Text(m.name).font(T.mono(9, .bold)).foregroundStyle(T.text).frame(width: 74, alignment: .leading).lineLimit(1)
                            Bar(value: m.readiness, color: T.readiness(m.readiness), height: 6)
                            Text(m.readyInH > 0 ? "\(Int(m.readyInH))H" : "OK").font(T.mono(9)).foregroundStyle(T.dim).frame(width: 26, alignment: .trailing)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct Gauge01: View {
    var value: Double
    var size: CGFloat
    var body: some View {
        ZStack {
            Ring(progress: value, color: T.readiness(value), lineWidth: size * 0.11)
            VStack(spacing: 0) {
                Text("\(Int((value * 100).rounded()))").font(T.mono(size * 0.3, .bold)).foregroundStyle(T.text)
                Cap("READY", T.faint, size: max(7, size * 0.1))
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Lock screen

enum LockCircular: String, CaseIterable { case week, streak }

struct LockWidgetView: View {
    var data: WidgetData
    var family: WidgetFamily
    var circular: LockCircular = .week

    var body: some View {
        switch family {
        case .accessoryCircular: circle
        case .accessoryRectangular: rect
        default: inline
        }
    }

    @ViewBuilder var circle: some View {
        if let s = data.snapshot {
            switch circular {
            case .week:
                Gauge(value: Double(min(s.week.done, max(1, s.week.target))), in: 0...Double(max(1, s.week.target))) {
                    Text("WK")
                } currentValueLabel: {
                    Text("\(s.week.done)/\(s.week.target)").font(T.mono(12, .bold))
                }
                .gaugeStyle(.accessoryCircularCapacity)
            case .streak:
                ZStack {
                    Circle().fill(Color.white.opacity(0.14))
                    VStack(spacing: -1) {
                        Image(systemName: "flame.fill").font(.system(size: 11))
                        Text("\(s.streak.current)").font(T.mono(18, .bold)).minimumScaleFactor(0.6)
                        Text("WK").font(T.mono(8))
                    }
                }
            }
        } else {
            ZStack { Circle().fill(Color.white.opacity(0.14)); Image(systemName: "dumbbell") }
        }
    }

    @ViewBuilder var rect: some View {
        if let s = data.snapshot {
            if let n = s.next {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 3) {
                        Image(systemName: "dumbbell.fill").font(.system(size: 10))
                        Text("NEXT · \(n.when)").font(T.mono(12, .bold)).lineLimit(1)
                    }
                    Text(n.dayName).font(T.mono(11)).lineLimit(1)
                    Text(n.exercises.prefix(2).map { "\($0.short) \($0.top > 0 ? Fmt.weight($0.top) : "BW")" }.joined(separator: " · "))
                        .font(T.mono(11)).lineLimit(1).minimumScaleFactor(0.7).opacity(0.8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text("WEEK \(s.week.done)/\(s.week.target)").font(T.mono(12, .bold))
                    Text("STREAK \(s.streak.current)W · BEST \(s.streak.best)").font(T.mono(11)).lineLimit(1)
                    if let l = s.last { Text("LAST \(l.title)").font(T.mono(11)).lineLimit(1).opacity(0.8) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            Text("\(Brand.upper)\nnot connected").font(T.mono(11))
        }
    }

    var inline: some View {
        Text(data.snapshot?.inlineNext ?? "\(Brand.name): not connected")
    }
}
