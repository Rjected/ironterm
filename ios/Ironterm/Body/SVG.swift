import CoreGraphics
import Foundation
import SwiftUI

// A small SVG renderer for the body figures the server sends (GET /api/app/body): standalone
// documents made of <path d> (plus <rect>, <g>, <clipPath>) with fill / stroke attributes and
// clip-path references. No WebView and no third-party library: the path data is parsed into
// CGPaths and drawn with a SwiftUI Canvas.

// MARK: - path data

enum SVGPathParser {
    struct ParseError: Error, Equatable { var message: String }

    /// Parse SVG path data (`M L H V C S Q T A Z`, absolute and relative) into a CGPath.
    static func parse(_ d: String) throws -> CGPath {
        var s = Scanner(Array(d.utf8))
        let p = CGMutablePath()
        var cur = CGPoint.zero, start = CGPoint.zero
        var lastCubic: CGPoint?, lastQuad: CGPoint?
        var cmd: UInt8 = 0

        while true {
            s.skipSeparators()
            guard let c = s.peek() else { break }
            if Scanner.isCommand(c) { cmd = c; s.i += 1 } else if cmd == 0 { throw ParseError(message: "path must start with a command") }
            let rel = cmd >= 97 // lowercase
            let base = rel ? cur : .zero
            switch cmd | 0x20 { // lowercase
            case 0x6D: // m
                let pt = try s.point()
                cur = CGPoint(x: base.x + pt.x, y: base.y + pt.y)
                start = cur
                p.move(to: cur)
                // further pairs are implicit line-tos
                cmd = rel ? 0x6C : 0x4C
                lastCubic = nil; lastQuad = nil
            case 0x6C: // l
                let pt = try s.point()
                cur = CGPoint(x: base.x + pt.x, y: base.y + pt.y)
                p.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case 0x68: // h
                let x = try s.number()
                cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y)
                p.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case 0x76: // v
                let y = try s.number()
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y)
                p.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case 0x63: // c
                let c1 = try s.point(), c2 = try s.point(), e = try s.point()
                let a = CGPoint(x: base.x + c1.x, y: base.y + c1.y), b = CGPoint(x: base.x + c2.x, y: base.y + c2.y)
                cur = CGPoint(x: base.x + e.x, y: base.y + e.y)
                p.addCurve(to: cur, control1: a, control2: b)
                lastCubic = b; lastQuad = nil
            case 0x73: // s
                let c2 = try s.point(), e = try s.point()
                let a = lastCubic.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let b = CGPoint(x: base.x + c2.x, y: base.y + c2.y)
                cur = CGPoint(x: base.x + e.x, y: base.y + e.y)
                p.addCurve(to: cur, control1: a, control2: b)
                lastCubic = b; lastQuad = nil
            case 0x71: // q
                let c1 = try s.point(), e = try s.point()
                let a = CGPoint(x: base.x + c1.x, y: base.y + c1.y)
                cur = CGPoint(x: base.x + e.x, y: base.y + e.y)
                p.addQuadCurve(to: cur, control: a)
                lastQuad = a; lastCubic = nil
            case 0x74: // t
                let e = try s.point()
                let a = lastQuad.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                cur = CGPoint(x: base.x + e.x, y: base.y + e.y)
                p.addQuadCurve(to: cur, control: a)
                lastQuad = a; lastCubic = nil
            case 0x61: // a
                let rx = try s.number(), ry = try s.number(), rot = try s.number()
                let large = try s.flag(), sweep = try s.flag()
                let e = try s.point()
                let to = CGPoint(x: base.x + e.x, y: base.y + e.y)
                addArc(p, from: cur, to: to, rx: rx, ry: ry, rotation: rot, large: large, sweep: sweep)
                cur = to
                lastCubic = nil; lastQuad = nil
            case 0x7A: // z
                p.closeSubpath()
                cur = start
                lastCubic = nil; lastQuad = nil
                // a number right after Z can't belong to it
                s.skipSeparators()
                if let n = s.peek(), !Scanner.isCommand(n) { throw ParseError(message: "number after Z") }
            default:
                throw ParseError(message: "unknown command \(Character(UnicodeScalar(cmd)))")
            }
        }
        return p
    }

    /// Endpoint arc → cubic Béziers (SVG implementation notes, F.6).
    static func addArc(_ p: CGMutablePath, from: CGPoint, to: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool) {
        if from == to { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { p.addLine(to: to); return }
        let phi: CGFloat = rotation * .pi / 180
        let cosP: CGFloat = cos(phi), sinP: CGFloat = sin(phi)
        let dx: CGFloat = (from.x - to.x) / 2, dy: CGFloat = (from.y - to.y) / 2
        let x1p: CGFloat = cosP * dx + sinP * dy
        let y1p: CGFloat = -sinP * dx + cosP * dy
        let lambda: CGFloat = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { let r: CGFloat = sqrt(lambda); rx *= r; ry *= r }
        let num: CGFloat = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den: CGFloat = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef: CGFloat = den == 0 ? 0 : sqrt(max(0, num / den))
        if large == sweep { coef = -coef }
        let cxp: CGFloat = coef * rx * y1p / ry
        let cyp: CGFloat = -coef * ry * x1p / rx
        let cx: CGFloat = cosP * cxp - sinP * cyp + (from.x + to.x) / 2
        let cy: CGFloat = sinP * cxp + cosP * cyp + (from.y + to.y) / 2
        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let a: CGFloat = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let theta1: CGFloat = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta: CGFloat = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi } else if sweep && delta < 0 { delta += 2 * .pi }
        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step: CGFloat = delta / CGFloat(segments)
        let t: CGFloat = 4 / 3 * tan(step / 4)
        var a1: CGFloat = theta1
        for _ in 0..<segments {
            let a2: CGFloat = a1 + step
            let c1 = CGPoint(x: cos(a1) - t * sin(a1), y: sin(a1) + t * cos(a1))
            let c2 = CGPoint(x: cos(a2) + t * sin(a2), y: sin(a2) - t * cos(a2))
            let e = CGPoint(x: cos(a2), y: sin(a2))
            func map(_ q: CGPoint) -> CGPoint {
                let x: CGFloat = q.x * rx, y: CGFloat = q.y * ry
                return CGPoint(x: cosP * x - sinP * y + cx, y: sinP * x + cosP * y + cy)
            }
            p.addCurve(to: map(e), control1: map(c1), control2: map(c2))
            a1 = a2
        }
    }

    struct Scanner {
        var b: [UInt8]
        var i = 0
        init(_ b: [UInt8]) { self.b = b }

        func peek() -> UInt8? { i < b.count ? b[i] : nil }

        static func isCommand(_ c: UInt8) -> Bool {
            switch c | 0x20 {
            case 0x6D, 0x6C, 0x68, 0x76, 0x63, 0x73, 0x71, 0x74, 0x61, 0x7A: return c != 0x65 && c != 0x45
            default: return false
            }
        }

        mutating func skipSeparators() {
            while i < b.count, b[i] == 0x20 || b[i] == 0x2C || b[i] == 0x0A || b[i] == 0x0D || b[i] == 0x09 { i += 1 }
        }

        mutating func number() throws -> CGFloat {
            skipSeparators()
            let st = i
            if i < b.count, b[i] == 0x2D || b[i] == 0x2B { i += 1 }
            var digits = false, dot = false
            while i < b.count {
                let c = b[i]
                if c >= 0x30 && c <= 0x39 { digits = true; i += 1 }
                else if c == 0x2E && !dot { dot = true; i += 1 }
                else { break }
            }
            if digits, i < b.count, b[i] == 0x65 || b[i] == 0x45 { // exponent
                var j = i + 1
                if j < b.count, b[j] == 0x2D || b[j] == 0x2B { j += 1 }
                if j < b.count, b[j] >= 0x30 && b[j] <= 0x39 {
                    i = j
                    while i < b.count, b[i] >= 0x30 && b[i] <= 0x39 { i += 1 }
                }
            }
            guard digits, let str = String(bytes: b[st..<i], encoding: .ascii), let v = Double(str) else {
                throw ParseError(message: "expected a number at \(st)")
            }
            return CGFloat(v)
        }

        mutating func point() throws -> CGPoint {
            let x = try number()
            let y = try number()
            return CGPoint(x: x, y: y)
        }

        /// arc flags may be packed without separators: "a1 1 0 01.5.5"
        mutating func flag() throws -> Bool {
            skipSeparators()
            guard i < b.count, b[i] == 0x30 || b[i] == 0x31 else { throw ParseError(message: "expected an arc flag at \(i)") }
            defer { i += 1 }
            return b[i] == 0x31
        }
    }
}

// MARK: - document

struct SVGColor: Equatable {
    var r: Double, g: Double, b: Double, a: Double = 1
    var color: Color { Color(.sRGB, red: r, green: g, blue: b, opacity: a) }

    /// `#rgb`, `#rrggbb`, `rgb(r,g,b)`, a few names; nil for `none` / unknown.
    static func parse(_ raw: String, gradients: [String: SVGColor] = [:]) -> SVGColor? {
        let s = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if s == "none" || s == "transparent" || s.isEmpty { return nil }
        if s.hasPrefix("url(#") {
            let id = String(s.dropFirst(5).prefix { $0 != ")" })
            return gradients[id]
        }
        if s.hasPrefix("#") {
            var h = String(s.dropFirst())
            if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
            guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
            return SVGColor(r: Double((v >> 16) & 0xFF) / 255, g: Double((v >> 8) & 0xFF) / 255, b: Double(v & 0xFF) / 255)
        }
        if s.hasPrefix("rgb") {
            let inner = s.drop { $0 != "(" }.dropFirst().prefix { $0 != ")" }
            let parts = inner.split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
            guard parts.count >= 3 else { return nil }
            return SVGColor(r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts.count > 3 ? parts[3] : 1)
        }
        switch s {
        case "black": return SVGColor(r: 0, g: 0, b: 0)
        case "white": return SVGColor(r: 1, g: 1, b: 1)
        default: return nil
        }
    }
}

struct SVGShape {
    var path: CGPath
    var fill: SVGColor?
    var stroke: SVGColor?
    var strokeWidth: CGFloat
    var dash: [CGFloat]
    /// vector-effect="non-scaling-stroke": the width is in screen points
    var nonScaling: Bool
    var clips: [CGPath]
}

struct SVGDocument {
    var viewBox: CGRect
    var shapes: [SVGShape]

    struct Node {
        var name: String
        var attrs: [String: String]
        var children: [Node] = []
    }

    enum Failure: Error { case xml(String) }

    static func parse(_ svg: String) throws -> SVGDocument {
        let root = try XMLTree.parse(svg)
        var clips: [String: CGPath] = [:]
        var gradients: [String: SVGColor] = [:]
        collectDefs(root, clips: &clips, gradients: &gradients)
        let vb = root.attrs["viewBox"].map { $0.split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) } } ?? []
        let viewBox = vb.count == 4 ? CGRect(x: vb[0], y: vb[1], width: vb[2], height: vb[3])
            : CGRect(x: 0, y: 0, width: Double(root.attrs["width"] ?? "") ?? 100, height: Double(root.attrs["height"] ?? "") ?? 100)
        var shapes: [SVGShape] = []
        walk(root, inherited: Style(), clipStack: [], clips: clips, gradients: gradients, into: &shapes)
        return SVGDocument(viewBox: viewBox, shapes: shapes)
    }

    struct Style {
        var fill: String? = nil
        var stroke: String? = nil
        var strokeWidth: String? = nil
        var dash: String? = nil
        var nonScaling = false
        var fillOpacity: Double = 1
        var strokeOpacity: Double = 1
        var opacity: Double = 1

        func merged(_ a: [String: String]) -> Style {
            var s = self
            var attrs = a
            // inline style="fill:…;stroke:…" wins over attributes
            if let st = a["style"] {
                for decl in st.split(separator: ";") {
                    let kv = decl.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                    if kv.count == 2 { attrs[kv[0]] = kv[1] }
                }
            }
            if let v = attrs["fill"] { s.fill = v }
            if let v = attrs["stroke"] { s.stroke = v }
            if let v = attrs["stroke-width"] { s.strokeWidth = v }
            if let v = attrs["stroke-dasharray"] { s.dash = v }
            if let v = attrs["vector-effect"] { s.nonScaling = v == "non-scaling-stroke" }
            if let v = attrs["fill-opacity"].flatMap(Double.init) { s.fillOpacity = v }
            if let v = attrs["stroke-opacity"].flatMap(Double.init) { s.strokeOpacity = v }
            if let v = attrs["opacity"].flatMap(Double.init) { s.opacity *= v }
            return s
        }
    }

    static func geometry(_ n: Node) -> CGPath? {
        switch n.name {
        case "path":
            guard let d = n.attrs["d"] else { return nil }
            return try? SVGPathParser.parse(d)
        case "rect":
            let v = { (k: String) in CGFloat(Double(n.attrs[k] ?? "") ?? 0) }
            let r = CGRect(x: v("x"), y: v("y"), width: v("width"), height: v("height"))
            return r.isEmpty ? nil : CGPath(rect: r, transform: nil)
        case "circle":
            let v = { (k: String) in CGFloat(Double(n.attrs[k] ?? "") ?? 0) }
            let r = v("r")
            return r > 0 ? CGPath(ellipseIn: CGRect(x: v("cx") - r, y: v("cy") - r, width: 2 * r, height: 2 * r), transform: nil) : nil
        default:
            return nil
        }
    }

    static func collectDefs(_ n: Node, clips: inout [String: CGPath], gradients: inout [String: SVGColor]) {
        if n.name == "clipPath", let id = n.attrs["id"] {
            let p = CGMutablePath()
            func add(_ x: Node) { if let g = geometry(x) { p.addPath(g) }; x.children.forEach(add) }
            n.children.forEach(add)
            clips[id] = p
        }
        if n.name.hasSuffix("Gradient"), let id = n.attrs["id"] {
            // a flat stand-in: the first stop's colour
            if let stop = n.children.first(where: { $0.name == "stop" }), let c = stop.attrs["stop-color"].flatMap({ SVGColor.parse($0) }) {
                var c2 = c
                c2.a = Double(stop.attrs["stop-opacity"] ?? "") ?? 1
                gradients[id] = c2
            }
        }
        for c in n.children { collectDefs(c, clips: &clips, gradients: &gradients) }
    }

    static func clipRef(_ a: [String: String], _ clips: [String: CGPath]) -> CGPath? {
        guard let v = a["clip-path"], v.hasPrefix("url(#") else { return nil }
        return clips[String(v.dropFirst(5).prefix { $0 != ")" })]
    }

    static func walk(_ n: Node, inherited: Style, clipStack: [CGPath], clips: [String: CGPath], gradients: [String: SVGColor], into out: inout [SVGShape]) {
        if ["defs", "clipPath", "linearGradient", "radialGradient", "mask", "title", "desc", "style"].contains(n.name) { return }
        if n.attrs["display"] == "none" { return }
        let st = inherited.merged(n.attrs)
        var stack = clipStack
        if let c = clipRef(n.attrs, clips) { stack.append(c) }
        if let g = geometry(n) {
            var fill = SVGColor.parse(st.fill ?? "#000", gradients: gradients)
            fill?.a *= st.fillOpacity * st.opacity
            var stroke = st.stroke.flatMap { SVGColor.parse($0, gradients: gradients) }
            stroke?.a *= st.strokeOpacity * st.opacity
            let dash = (st.dash ?? "").split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }.map { CGFloat($0) }
            if fill != nil || stroke != nil {
                out.append(SVGShape(path: g, fill: fill, stroke: stroke, strokeWidth: CGFloat(Double(st.strokeWidth ?? "1") ?? 1),
                                    dash: dash, nonScaling: st.nonScaling, clips: stack))
            }
        }
        for c in n.children { walk(c, inherited: st, clipStack: stack, clips: clips, gradients: gradients, into: &out) }
    }

    /// Transform that fits the viewBox into `size` (preserveAspectRatio xMidYMid meet).
    func fit(_ size: CGSize) -> (CGAffineTransform, CGFloat) {
        guard viewBox.width > 0, viewBox.height > 0 else { return (.identity, 1) }
        let k: CGFloat = min(size.width / viewBox.width, size.height / viewBox.height)
        let tx: CGFloat = (size.width - viewBox.width * k) / 2 - viewBox.minX * k
        let ty: CGFloat = (size.height - viewBox.height * k) / 2 - viewBox.minY * k
        return (CGAffineTransform(a: k, b: 0, c: 0, d: k, tx: tx, ty: ty), k)
    }

    func draw(in ctx: GraphicsContext, size: CGSize) {
        let (t, k) = fit(size)
        for s in shapes {
            let path = Path(s.path).applying(t)
            let lw: CGFloat = s.nonScaling ? s.strokeWidth : s.strokeWidth * k
            let dash: [CGFloat] = s.nonScaling ? s.dash : s.dash.map { $0 * k }
            func paint(_ c: GraphicsContext) {
                if let f = s.fill { c.fill(path, with: .color(f.color)) }
                if let st = s.stroke, lw > 0 { c.stroke(path, with: .color(st.color), style: StrokeStyle(lineWidth: lw, dash: dash)) }
            }
            if s.clips.isEmpty { paint(ctx) } else {
                var c = ctx
                for clip in s.clips { c.clip(to: Path(clip).applying(t)) }
                paint(c)
            }
        }
    }
}

/// XMLParser → a plain node tree.
final class XMLTree: NSObject, XMLParserDelegate {
    private var stack: [SVGDocument.Node] = []
    private var root: SVGDocument.Node?

    static func parse(_ s: String) throws -> SVGDocument.Node {
        let t = XMLTree()
        let p = XMLParser(data: Data(s.utf8))
        p.delegate = t
        guard p.parse(), let r = t.root else {
            throw SVGDocument.Failure.xml(p.parserError?.localizedDescription ?? "not an SVG document")
        }
        return r
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        stack.append(.init(name: name, attrs: attributes))
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        guard let n = stack.popLast() else { return }
        if stack.isEmpty { root = n } else { stack[stack.count - 1].children.append(n) }
    }
}

/// Parsed documents, keyed by the SVG text (the figures are big; parse each once).
@MainActor
enum SVGCache {
    private static var docs: [Int: SVGDocument] = [:]
    static func doc(_ svg: String) -> SVGDocument? {
        let k = svg.hashValue
        if let d = docs[k] { return d }
        guard let d = try? SVGDocument.parse(svg) else { return nil }
        if docs.count > 8 { docs.removeAll() }
        docs[k] = d
        return d
    }
}

struct SVGView: View {
    var svg: String

    var body: some View {
        if let doc = SVGCache.doc(svg) {
            Canvas { ctx, size in doc.draw(in: ctx, size: size) }
                .aspectRatio(doc.viewBox.width / max(1, doc.viewBox.height), contentMode: .fit)
        } else {
            Cap("COULDN'T DRAW THE FIGURE", T.down, size: 9)
        }
    }
}
