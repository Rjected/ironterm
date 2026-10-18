import SwiftUI

/// Uppercase monospaced label.
struct Cap: View {
    var text: String
    var color: Color = T.dim
    var size: CGFloat = 10
    var weight: Font.Weight = .regular

    init(_ text: String, _ color: Color = T.dim, size: CGFloat = 10, weight: Font.Weight = .regular) {
        self.text = text; self.color = color; self.size = size; self.weight = weight
    }

    var body: some View {
        Text(text.uppercased())
            .font(T.mono(size, weight))
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// A big number with a small caption under it.
struct Stat: View {
    var value: String
    var label: String
    var color: Color = T.text
    var size: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(T.mono(size, .bold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.6)
            Cap(label, T.faint, size: max(8, size * 0.5))
        }
    }
}

struct Divider1: View {
    var body: some View { Rectangle().fill(T.line).frame(height: 1) }
}

/// GitHub-style contribution grid drawn with Canvas. `days` are Monday-first and contiguous
/// (Snapshot.graph.days); the last `weeks` columns are shown and cells fit the available space.
struct GraphGrid: View {
    var days: [Snapshot.Graph.Day]
    var weeks: Int
    var theme: ColorTheme = .blue
    var gap: CGFloat = 2
    var months = false
    var alignment: Alignment = .leading
    /// with fewer weeks of data than `weeks`, leave the gap on the left (true) or right (false)
    var padLeading = true

    static let monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

    var columns: [[Snapshot.Graph.Day]] {
        var cols: [[Snapshot.Graph.Day]] = []
        var i = 0
        while i < days.count { cols.append(Array(days[i..<min(i + 7, days.count)])); i += 7 }
        return Array(cols.suffix(weeks))
    }

    var body: some View {
        GeometryReader { geo in
            let cols = columns
            let n = CGFloat(max(1, weeks))
            let labelH: CGFloat = months ? 11 : 0
            let cell = max(1, min((geo.size.width - gap * (n - 1)) / n, (geo.size.height - labelH - gap * 6) / 7))
            let gridW = cell * n + gap * (n - 1)
            let x0: CGFloat = alignment == .center ? (geo.size.width - gridW) / 2 : alignment == .trailing ? geo.size.width - gridW : 0
            // left-pad when there are fewer weeks of data than requested
            let offset = padLeading ? weeks - cols.count : 0
            Canvas { ctx, _ in
                var lastMonth = ""
                for (ci, col) in cols.enumerated() {
                    let x = x0 + CGFloat(ci + offset) * (cell + gap)
                    if months, let first = col.first {
                        let m = String(first.date.dropFirst(5).prefix(2))
                        // label a column where the month changes, unless the next change is too close
                        let nextChange = cols.dropFirst(ci + 1).prefix(3).contains { String($0.first?.date.dropFirst(5).prefix(2) ?? "") != m }
                        if m != lastMonth && !(ci == 0 && nextChange) && x + 18 <= x0 + gridW + 2 {
                            let name = Int(m).map { Self.monthNames[($0 - 1) % 12] } ?? ""
                            ctx.draw(Text(name).font(T.mono(8)).foregroundColor(T.faint), at: CGPoint(x: x, y: 0), anchor: .topLeading)
                        }
                        lastMonth = m
                    }
                    for (ri, d) in col.enumerated() {
                        let r = CGRect(x: x, y: labelH + CGFloat(ri) * (cell + gap), width: cell, height: cell)
                        ctx.fill(Path(roundedRect: r, cornerRadius: min(2, cell * 0.2)), with: .color(theme.color(for: d.level)))
                    }
                }
            }
        }
    }

    /// Natural height for a given width (keeps square cells).
    static func height(width: CGFloat, weeks: Int, gap: CGFloat = 2, months: Bool = false) -> CGFloat {
        let n = CGFloat(weeks)
        let cell = (width - gap * (n - 1)) / n
        return cell * 7 + gap * 6 + (months ? 11 : 0)
    }
}

struct Sparkline: View {
    var values: [Double]
    var color: Color = T.up
    var fill = true
    var lineWidth: CGFloat = 1.5

    var body: some View {
        GeometryReader { geo in
            let pts = points(geo.size)
            ZStack {
                if fill, pts.count > 1 {
                    Path { p in
                        p.move(to: CGPoint(x: pts[0].x, y: geo.size.height))
                        for q in pts { p.addLine(to: q) }
                        p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: geo.size.height))
                        p.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [color.opacity(0.28), color.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                }
                Path { p in
                    guard let f = pts.first else { return }
                    p.move(to: f)
                    for q in pts.dropFirst() { p.addLine(to: q) }
                }
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                if let l = pts.last {
                    Circle().fill(color).frame(width: lineWidth * 2.6, height: lineWidth * 2.6).position(l)
                }
            }
        }
    }

    private func points(_ size: CGSize) -> [CGPoint] {
        let v = values.filter { $0 > 0 }.isEmpty ? values : values.map { $0 > 0 ? $0 : (values.filter { $0 > 0 }.min() ?? 0) }
        guard v.count > 1, let lo = v.min(), let hi = v.max() else { return [] }
        let span = max(hi - lo, max(1, hi * 0.02))
        let pad = 2.0
        return v.enumerated().map { i, x in
            CGPoint(x: CGFloat(i) / CGFloat(v.count - 1) * size.width,
                    y: pad + (1 - CGFloat((x - lo) / span)) * (size.height - pad * 2))
        }
    }
}

struct Ring: View {
    var progress: Double
    var color: Color = T.amber
    var track: Color = T.line
    var lineWidth: CGFloat = 6

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle().trim(from: 0, to: max(0, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        }
        .padding(lineWidth / 2)
    }
}

struct Bar: View {
    var value: Double
    var color: Color
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(T.line)
                Rectangle().fill(color).frame(width: geo.size.width * max(0, min(1, value)))
            }
        }
        .frame(height: height)
    }
}

/// Mon–Sun strip of this week's statuses.
struct WeekStrip: View {
    var days: [Snapshot.Week.Day]
    var today: String
    var cell: CGFloat = 18
    var showLabels = true

    var body: some View {
        HStack(spacing: 4) {
            ForEach(days, id: \.date) { d in
                VStack(spacing: 3) {
                    if showLabels {
                        Text(String(d.dow.prefix(cell >= 22 ? 3 : 1)))
                            .font(T.mono(max(8, cell * 0.42), d.date == today ? .bold : .regular))
                            .foregroundStyle(d.date == today ? T.amber : T.dim)
                    }
                    WeekCell(status: d.status, future: d.date > today, size: cell)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct WeekCell: View {
    var status: String
    var future = false
    var size: CGFloat = 18

    var body: some View {
        ZStack {
            switch status {
            case "done":
                Rectangle().fill(T.up)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(T.bg)
            case "planned":
                Rectangle().stroke(T.amber, lineWidth: 1.5)
            case "today":
                Rectangle().fill(T.amber.opacity(0.18))
                Rectangle().stroke(T.amber, lineWidth: 2)
            case "missed":
                Rectangle().stroke(T.down.opacity(0.8), lineWidth: 1)
                Image(systemName: "xmark").font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(T.down)
            case "travel":
                Rectangle().stroke(T.faint, lineWidth: 1)
                Image(systemName: "airplane").font(.system(size: size * 0.45)).foregroundStyle(T.dim)
            default: // rest
                Rectangle().fill(future ? Color.clear : Color(hex: 0x16181D))
                Rectangle().stroke(T.line, lineWidth: 1)
            }
        }
        .frame(width: size, height: size)
    }
}

/// "RE-ENTRY" badge for a session after a long break.
struct Badge: View {
    var text: String
    var color: Color = T.amber
    var body: some View {
        Text(text.uppercased())
            .font(T.mono(8, .bold))
            .foregroundStyle(T.bg)
            .padding(.horizontal, 4).padding(.vertical, 1)
            .background(color)
    }
}
