import SwiftUI

// The program page's BODY tab: what a program does to each muscle before you start it
// (GET /api/app/programs/{id}/body, docs/api/programs.md). The figures are the server's SVGs,
// drawn by SVGView like the BODY screen's.

struct ProgramBodyTab: View {
    @EnvironmentObject var model: AppModel
    var id: String
    var opts: [String: String]
    @State private var mode = "load"
    @State private var week = 1
    @StateObject private var remote: Remote<ProgramBody>

    init(id: String, opts: [String: String]) {
        self.id = id
        self.opts = opts
        _remote = StateObject(wrappedValue: Remote<ProgramBody>(Self.key(id, opts, "load")))
    }

    static func key(_ id: String, _ opts: [String: String], _ mode: String) -> String {
        "programs-body-" + id + "-" + mode + "-" + ProgramText.optionQuery(opts)
    }

    var path: String { AppAPI.programBodyPath(id, options: opts, mode: mode) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Seg(options: [("load", "WEEKLY LOAD"), ("gaps", "GAPS")], value: $mode)
                .accessibilityIdentifier("program-body-mode")
            content
        }
        .onChange(of: mode) { _, m in remote.rekey(Self.key(id, opts, m)) }
        .onChange(of: opts) { _, o in remote.rekey(Self.key(id, o, mode)) }
        .task(id: TaskKey(path: path, version: model.dataVersion)) { await remote.load(model.api, path: path) }
    }

    struct TaskKey: Hashable { var path: String; var version: Int }

    @ViewBuilder var content: some View {
        if let b = remote.value {
            if remote.fromCache, remote.error != nil { OfflineStrip(date: remote.fetchedAt) }
            summary(b)
            figures(b)
            ProgramBodyMuscles(b: b)
            ProgramBodyOverlaps(b: b, week: $week)
        } else if let e = remote.error, !remote.loading {
            VStack(alignment: .leading, spacing: 8) {
                Cap("COULDN'T LOAD THE BODY VIEW", T.down, size: 10, weight: .bold)
                Text(e).font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                TermButton(title: "RETRY", style: .secondary, disabled: false) { Task { await remote.load(model.api, path: path) } }
            }
        } else {
            HStack(spacing: 8) {
                ProgressView().tint(T.amber)
                Cap("MODELLING A WEEK OF TRAINING…", T.dim, size: 10)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
        }
    }

    func summary(_ b: ProgramBody) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(b.summary.lines.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("·").font(T.mono(12, .bold)).foregroundStyle(T.amber)
                    Text(line).font(T.mono(12)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                }
            }
            Text(footnote(b)).font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("program-body-summary")
    }

    func footnote(_ b: ProgramBody) -> String {
        let avg: String = b.weeks > 1 ? "averaged over \(b.weeks) weeks · " : ""
        return ProgramBodyText.days(b.trainingDays) + " · " + avg + "as if every session goes to plan"
    }

    @ViewBuilder func figures(_ b: ProgramBody) -> some View {
        let load: Bool = b.mode == "load"
        Panel(title: load ? "WEEKLY LOAD" : "RECOVERY GAPS", detail: load ? "HARD SETS / WEEK" : "LOWEST READINESS") {
            if let f = b.svgFront, let k = b.svgBack {
                HStack(alignment: .bottom, spacing: 8) {
                    VStack(spacing: 4) { SVGView(svg: f); Cap("FRONT", T.faint, size: 8) }
                    VStack(spacing: 4) { SVGView(svg: k); Cap("BACK", T.faint, size: 8) }
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(load ? "Muscle map, weekly load" : "Muscle map, recovery gaps")
            }
            HStack(spacing: 6) {
                Cap(b.legend.first ?? "", T.faint, size: 8)
                LinearGradient(colors: load ? Self.loadRamp : Self.warnRamp, startPoint: .leading, endPoint: .trailing)
                    .frame(height: 6)
                Cap(b.legend.last ?? "", T.faint, size: 8)
            }
        }
    }

    static let loadRamp: [Color] = [Color(hex: 0x0F3278), Color(hex: 0x285AB4), Color(hex: 0x5082DC), Color(hex: 0x8CB4FF)]
    static let warnRamp: [Color] = [Color(hex: 0x16181D), Color(hex: 0xFF6B5E)]
}

struct ProgramBodyMuscles: View {
    var b: ProgramBody
    @State private var open: String?

    var body: some View {
        Panel(title: "WEEKLY HARD SETS VS RANGE", detail: "SETS · STATUS") {
            ForEach(ProgramBodyText.grouped(b), id: \.0) { group in
                Cap(group.0, T.faint, size: 8, weight: .bold).padding(.top, 4)
                ForEach(group.1) { m in row(m) }
            }
            Cap("BAR = HARD SETS A WEEK · BAND = TARGET RANGE", T.faint, size: 7)
        }
    }

    func color(_ m: ProgramBody.Muscle) -> Color {
        if m.status == "high" || m.overlaps > 0 { return T.down }
        if m.status == "low" || m.status == "none" { return T.amber }
        return T.up
    }

    func row(_ m: ProgramBody.Muscle) -> some View {
        Button { open = open == m.id ? nil : m.id } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(m.short).font(T.mono(10, .bold)).foregroundStyle(T.text).lineLimit(1)
                        .frame(width: 84, alignment: .leading)
                    RangeBarView(bar: ProgramBodyText.bar(m), color: color(m))
                    Text(Fmt.weight(m.hardSets)).font(T.mono(10)).foregroundStyle(T.text).frame(width: 34, alignment: .trailing)
                    Cap(ProgramBodyText.status(m.status), StatusColor.of(m.status), size: 7).frame(width: 52, alignment: .trailing)
                }
                if open == m.id {
                    Text(ProgramBodyText.detail(m)).font(T.mono(9)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("program-body-muscle-\(m.id)")
    }
}

/// A bar with the target range as a faint band behind it.
struct RangeBarView: View {
    var bar: ProgramBodyText.RangeBar
    var color: Color

    var body: some View {
        GeometryReader { geo in
            let w: CGFloat = geo.size.width
            ZStack(alignment: .leading) {
                Rectangle().fill(T.line).frame(height: 6)
                if let lo = bar.lo, let hi = bar.hi {
                    Rectangle().fill(T.faint.opacity(0.35)).frame(width: w * CGFloat(hi - lo), height: 12).offset(x: w * CGFloat(lo))
                }
                Rectangle().fill(color).frame(width: w * CGFloat(bar.fill), height: 6)
            }
            .frame(height: 12)
        }
        .frame(height: 12)
    }
}

struct ProgramBodyOverlaps: View {
    var b: ProgramBody
    @Binding var week: Int

    var current: Int { min(max(1, week), max(1, b.weeks)) }

    var body: some View {
        let list: [ProgramBody.Overlap] = ProgramBodyText.overlaps(b, week: current)
        Panel(title: "OVERLAPS", detail: "\(Fmt.weight(b.summary.overlapsPerWeek)) A WEEK") {
            Text("A muscle hit again before it recovered from the last session.").font(T.mono(9)).foregroundStyle(T.faint)
                .fixedSize(horizontal: false, vertical: true)
            if b.weeks > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(1...b.weeks, id: \.self) { w in
                            Chip(title: "WEEK \(w) · \(w <= b.overlapsByWeek.count ? b.overlapsByWeek[w - 1] : 0)", on: w == current) { week = w }
                        }
                    }
                    .padding(1)
                }
            }
            if list.isEmpty {
                Text(b.weeks > 1 ? "None in week \(current): every muscle recovers before its next hit." : "None: every muscle recovers before its next hit.")
                    .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(list.enumerated()), id: \.offset) { i, o in
                if i > 0 { Divider1() }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(o.short).font(T.mono(10, .bold)).foregroundStyle(T.down).lineLimit(1).frame(width: 84, alignment: .leading)
                    Text(ProgramBodyText.line(o)).font(T.mono(9)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Text(ProgramBodyText.percent(o.share)).font(T.mono(10)).foregroundStyle(T.text)
                }
            }
        }
    }
}
