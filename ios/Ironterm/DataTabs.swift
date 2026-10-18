import Charts
import SwiftUI

// MARK: - TODAY

struct TodayView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        DataGate { s in
            VStack(alignment: .leading, spacing: 12) {
                NextPanel(s: s, source: model.source)
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
                if let r = s.recovery {
                    Panel(title: "READINESS", detail: "BIG MUSCLES") {
                        HStack(spacing: 16) {
                            Gauge01(value: r.overall, size: 86)
                            VStack(alignment: .leading, spacing: 6) {
                                Cap("LEAST READY", T.dim, size: 9)
                                ForEach(r.muscles.prefix(3)) { m in MuscleRow(m: m) }
                            }
                        }
                    }
                    .onTapGesture { model.tab = .body }
                } else {
                    Panel(title: "READINESS", detail: "NEEDS SERVER") {
                        Text("Recovery is modelled on the server. Direct mode can't show it.").font(T.mono(11)).foregroundStyle(T.dim)
                    }
                }
                if let l = s.last {
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
        }
    }
}

struct NextPanel: View {
    var s: Snapshot
    var source: DataSource

    var body: some View {
        if let n = s.next {
            Panel(title: "NEXT SESSION", detail: s.program?.name.uppercased() ?? "") {
                HStack(alignment: .firstTextBaseline) {
                    Text(n.when).font(T.mono(24, .heavy)).foregroundStyle(T.amber)
                    if n.reentry { Badge(text: "RE-ENTRY") }
                    Spacer()
                }
                Text(n.dayName + (n.weekName.map { " · \($0)" } ?? "")).font(T.mono(14, .bold)).foregroundStyle(T.text)
                if n.reentry {
                    Text("Back after a break: weights are eased in for this session.").font(T.mono(10)).foregroundStyle(T.dim)
                }
                Divider1()
                ForEach(Array(n.exercises.enumerated()), id: \.offset) { _, e in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(e.tier).font(T.mono(9, .bold)).foregroundStyle(e.tier == "T1" ? T.amber : T.faint).frame(width: 18, alignment: .leading)
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
        } else {
            Panel(title: "NEXT SESSION", detail: "NO PROGRAM") {
                Text(source == .direct
                     ? "Programs live on the server. In Direct mode the app shows your log: graph, streak, lifts."
                     : "No program is set. Pick one in the web app (WEB tab).")
                    .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct MuscleRow: View {
    var m: Snapshot.Recovery.Muscle
    var body: some View {
        HStack(spacing: 8) {
            Text(m.name).font(T.mono(10, .bold)).foregroundStyle(T.text).frame(width: 92, alignment: .leading).lineLimit(1)
            Bar(value: m.readiness, color: T.readiness(m.readiness), height: 7)
            Text("\(Int((m.readiness * 100).rounded()))%").font(T.mono(10)).foregroundStyle(T.readiness(m.readiness)).frame(width: 34, alignment: .trailing)
            Text(m.readyInH > 0 ? "\(Int(m.readyInH))H" : "—").font(T.mono(10)).foregroundStyle(T.faint).frame(width: 30, alignment: .trailing)
        }
    }
}

// MARK: - GRAPH

struct GraphTab: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        DataGate { s in
            VStack(alignment: .leading, spacing: 12) {
                Panel(title: "53 WEEKS", detail: "\(s.graph.days.filter { $0.level > 0 }.count) TRAINING DAYS") {
                    ScrollViewReader { proxy in
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: 4) {
                                VStack(alignment: .trailing, spacing: 0) {
                                    Spacer().frame(height: 11)
                                    ForEach(["M", "", "W", "", "F", "", "S"].indices, id: \.self) { i in
                                        Text(["M", "", "W", "", "F", "", "S"][i]).font(T.mono(8)).foregroundStyle(T.faint).frame(height: 14)
                                    }
                                }
                                GraphGrid(days: s.graph.days, weeks: 53, theme: model.theme, gap: 2, months: true)
                                    .frame(width: 53 * 14 - 2, height: 7 * 14 - 2 + 11)
                                    .id("end")
                            }
                        }
                        .onAppear { proxy.scrollTo("end", anchor: .trailing) }
                    }
                    HStack(spacing: 4) {
                        Cap("LESS", T.faint, size: 9)
                        ForEach(0..<5) { l in Rectangle().fill(model.theme.color(for: l)).frame(width: 10, height: 10) }
                        Cap("MORE", T.faint, size: 9)
                        Spacer()
                        Cap("LEVELS = QUARTILES OF TRAINING DAYS", T.faint, size: 8)
                    }
                }
                Panel(title: "TOTALS") {
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 12) {
                        GridRow {
                            Stat(value: "\(s.totals.sessions52)", label: "SESSIONS 52W", size: 20)
                            Stat(value: s.totals.sessionsPrev52 > 0 ? "\(s.totals.sessionsPrev52)" : "—", label: "PREV 52W", color: T.dim, size: 20)
                            Stat(value: "\(s.totals.allTime)", label: "ALL TIME", size: 20)
                        }
                        GridRow {
                            Stat(value: Fmt.compact(s.totals.vol7), label: "VOL 7D \(s.unitLabel)", size: 20)
                            Stat(value: Fmt.compact(s.totals.volPrev7), label: "PREV 7D", color: T.dim, size: 20)
                            Stat(value: "\(Int(s.totals.avgMin))M", label: "AVG SESSION", size: 20)
                        }
                        GridRow {
                            Stat(value: "\(s.streak.current)W", label: "STREAK", color: T.amber, size: 20)
                            Stat(value: "\(s.streak.best)W", label: "BEST STREAK", size: 20)
                            Stat(value: "\(s.week.target)/WK", label: "TARGET", color: T.dim, size: 20)
                        }
                    }
                }
                Panel(title: "BY WEEK", detail: "SESSIONS, LAST 12") {
                    WeeklyBars(s: s)
                }
            }
        }
    }
}

struct WeeklyBars: View {
    var s: Snapshot
    var body: some View {
        let weeks = stride(from: 0, to: s.graph.days.count, by: 7).map { i in
            (start: s.graph.days[i].date, n: s.graph.days[i..<min(i + 7, s.graph.days.count)].filter { $0.level > 0 }.count)
        }.suffix(12)
        Chart(Array(weeks), id: \.start) { w in
            BarMark(x: .value("Week", String(w.start.suffix(5))), y: .value("Sessions", w.n))
                .foregroundStyle(w.n >= s.week.target ? T.up : T.faint)
            RuleMark(y: .value("Target", s.week.target)).foregroundStyle(T.amber.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
        .chartXAxis { AxisMarks { _ in AxisValueLabel().font(T.mono(7)).foregroundStyle(T.faint) } }
        .chartYAxis { AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(T.line); AxisValueLabel().font(T.mono(8)).foregroundStyle(T.faint) } }
        .frame(height: 120)
    }
}

// MARK: - LIFTS

struct LiftsTab: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        DataGate { s in
            VStack(alignment: .leading, spacing: 12) {
                if s.lifts.isEmpty {
                    Panel(title: "LIFTS") {
                        Text("No tracked lifts yet. Squat, bench, deadlift, press and ~100 other Hevy exercises are recognised by name.")
                            .font(T.mono(11)).foregroundStyle(T.dim)
                    }
                }
                ForEach(s.lifts) { l in LiftCard(l: l, unit: s.unit) }
                Cap("E1RM = EPLEY W×(1+R/30), BEST SET · Δ VS 4 WEEKS AGO", T.faint, size: 8)
            }
        }
    }
}

struct LiftCard: View {
    var l: Snapshot.Lift
    var unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Cap(l.short, T.amber, size: 11, weight: .bold)
                Cap(l.name, T.faint, size: 9)
                Spacer()
                DeltaLine(d: l.delta28)
            }
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(Fmt.weight(l.e1rm)).font(T.mono(30, .bold)).foregroundStyle(T.text)
                    Cap("E1RM \(unit)", T.faint, size: 9)
                }
                .frame(width: 112, alignment: .leading)
                Chart(Array(l.spark.enumerated()), id: \.offset) { i, v in
                    AreaMark(x: .value("Week", i), yStart: .value("lo", lo), yEnd: .value("e1rm", v))
                        .foregroundStyle(LinearGradient(colors: [T.up.opacity(0.3), T.up.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Week", i), y: .value("e1rm", v))
                        .foregroundStyle(T.up)
                        .lineStyle(StrokeStyle(lineWidth: 1.6))
                }
                .chartYScale(domain: lo...hi)
                .chartXAxis(.hidden)
                .chartYAxis { AxisMarks(position: .trailing, values: [lo, hi]) { _ in AxisValueLabel().font(T.mono(8)).foregroundStyle(T.faint) } }
                .frame(height: 56)
            }
        }
        .padding(12)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }

    var lo: Double { ((l.spark.filter { $0 > 0 }.min() ?? 0) * 0.97).rounded(.down) }
    var hi: Double { max(lo + 1, ((l.spark.max() ?? 1) * 1.01).rounded(.up)) }
}

// MARK: - BODY

struct BodyTab: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        DataGate { s in
            if let r = s.recovery {
                VStack(alignment: .leading, spacing: 12) {
                    Panel(title: "OVERALL", detail: "BIG MUSCLES AVG") {
                        HStack(spacing: 18) {
                            Gauge01(value: r.overall, size: 110)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(r.overall >= 0.8 ? "READY TO TRAIN HARD" : r.overall >= 0.6 ? "MOSTLY RECOVERED" : "STILL RECOVERING")
                                    .font(T.mono(12, .bold)).foregroundStyle(T.readiness(r.overall))
                                Text("\(r.muscles.filter { $0.readiness < 0.6 }.count) of \(r.muscles.count) muscles under 60%")
                                    .font(T.mono(10)).foregroundStyle(T.dim)
                            }
                        }
                    }
                    Panel(title: "MUSCLES", detail: "LEAST READY FIRST") {
                        HStack {
                            Spacer()
                            Cap("READY", T.faint, size: 8).frame(width: 34, alignment: .trailing)
                            Cap("IN", T.faint, size: 8).frame(width: 30, alignment: .trailing)
                        }
                        ForEach(r.muscles) { m in MuscleRow(m: m) }
                    }
                }
            } else {
                Panel(title: "RECOVERY", detail: "NEEDS SERVER") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Recovery isn't available in Direct mode.").font(T.mono(13, .bold)).foregroundStyle(T.text)
                        Text("Per-muscle readiness comes from the server's model of every set you've logged (stimulus per muscle, decay over time). Direct mode only has the Hevy API key on this phone, so it shows the graph, streak and lifts.\n\nTo get it, run your own \(Brand.name) server and connect it in SETUP. Nothing is locked in: you can switch back to Direct any time.")
                            .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                        TermButton(title: "OPEN SETUP", style: .secondary) { model.tab = .setup }.frame(width: 160)
                    }
                }
            }
        }
    }
}
