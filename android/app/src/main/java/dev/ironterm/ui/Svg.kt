package dev.ironterm.ui

import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

// A small SVG renderer for the body figures the server sends (GET /api/app/body): standalone
// documents made of <path d> (plus <rect>, <circle>, <g>, <clipPath>) with fill / stroke attributes
// and clip-path references. A port of ios/Ironterm/Body/SVG.swift: the platform's XML pull parser,
// android.graphics.Path and Canvas; no third-party library.

/** Where parsed path commands go: an android.graphics.Path in the app, a recorder in tests. */
interface PathSink {
    fun moveTo(x: Float, y: Float)
    fun lineTo(x: Float, y: Float)
    fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float)
    fun quadTo(x1: Float, y1: Float, x: Float, y: Float)
    fun close()
}

class SvgParseException(message: String) : Exception(message)

object SvgPath {
    /** Parses SVG path data (`M L H V C S Q T A Z`, absolute and relative). */
    fun parse(d: String, out: PathSink) {
        val s = Scanner(d)
        var cx = 0f; var cy = 0f; var sx = 0f; var sy = 0f
        var lastCubic: FloatArray? = null
        var lastQuad: FloatArray? = null
        var cmd = ' '
        while (true) {
            s.skipSeparators()
            val c = s.peek() ?: break
            if (isCommand(c)) { cmd = c; s.i++ } else if (cmd == ' ') throw SvgParseException("path must start with a command")
            val rel = cmd.isLowerCase()
            val bx = if (rel) cx else 0f
            val by = if (rel) cy else 0f
            when (cmd.lowercaseChar()) {
                'm' -> {
                    cx = bx + s.number(); cy = by + s.number()
                    sx = cx; sy = cy
                    out.moveTo(cx, cy)
                    cmd = if (rel) 'l' else 'L' // further pairs are implicit line-tos
                    lastCubic = null; lastQuad = null
                }
                'l' -> {
                    cx = bx + s.number(); cy = by + s.number()
                    out.lineTo(cx, cy)
                    lastCubic = null; lastQuad = null
                }
                'h' -> {
                    val x = s.number(); cx = if (rel) cx + x else x
                    out.lineTo(cx, cy)
                    lastCubic = null; lastQuad = null
                }
                'v' -> {
                    val y = s.number(); cy = if (rel) cy + y else y
                    out.lineTo(cx, cy)
                    lastCubic = null; lastQuad = null
                }
                'c' -> {
                    val x1 = bx + s.number(); val y1 = by + s.number()
                    val x2 = bx + s.number(); val y2 = by + s.number()
                    cx = bx + s.number(); cy = by + s.number()
                    out.cubicTo(x1, y1, x2, y2, cx, cy)
                    lastCubic = floatArrayOf(x2, y2); lastQuad = null
                }
                's' -> {
                    val lc = lastCubic
                    val x1 = if (lc != null) 2 * cx - lc[0] else cx
                    val y1 = if (lc != null) 2 * cy - lc[1] else cy
                    val x2 = bx + s.number(); val y2 = by + s.number()
                    cx = bx + s.number(); cy = by + s.number()
                    out.cubicTo(x1, y1, x2, y2, cx, cy)
                    lastCubic = floatArrayOf(x2, y2); lastQuad = null
                }
                'q' -> {
                    val x1 = bx + s.number(); val y1 = by + s.number()
                    cx = bx + s.number(); cy = by + s.number()
                    out.quadTo(x1, y1, cx, cy)
                    lastQuad = floatArrayOf(x1, y1); lastCubic = null
                }
                't' -> {
                    val lq = lastQuad
                    val x1 = if (lq != null) 2 * cx - lq[0] else cx
                    val y1 = if (lq != null) 2 * cy - lq[1] else cy
                    cx = bx + s.number(); cy = by + s.number()
                    out.quadTo(x1, y1, cx, cy)
                    lastQuad = floatArrayOf(x1, y1); lastCubic = null
                }
                'a' -> {
                    val rx = s.number(); val ry = s.number(); val rot = s.number()
                    val large = s.flag(); val sweep = s.flag()
                    val tx = bx + s.number(); val ty = by + s.number()
                    arc(out, cx, cy, tx, ty, rx, ry, rot, large, sweep)
                    cx = tx; cy = ty
                    lastCubic = null; lastQuad = null
                }
                'z' -> {
                    out.close()
                    cx = sx; cy = sy
                    lastCubic = null; lastQuad = null
                    // a number right after Z can't belong to it
                    s.skipSeparators()
                    val n = s.peek()
                    if (n != null && !isCommand(n)) throw SvgParseException("number after Z")
                }
                else -> throw SvgParseException("unknown command $cmd")
            }
        }
    }

    private fun isCommand(c: Char) = c in "MmLlHhVvCcSsQqTtAaZz"

    /** Endpoint arc → cubic Béziers (SVG implementation notes, F.6). */
    fun arc(out: PathSink, x0: Float, y0: Float, x: Float, y: Float, rx0: Float, ry0: Float, rotation: Float, large: Boolean, sweep: Boolean) {
        if (x0 == x && y0 == y) return
        var rx = abs(rx0).toDouble(); var ry = abs(ry0).toDouble()
        if (rx == 0.0 || ry == 0.0) { out.lineTo(x, y); return }
        val phi = rotation * PI / 180
        val cosP = cos(phi); val sinP = sin(phi)
        val dx = (x0 - x) / 2.0; val dy = (y0 - y) / 2.0
        val x1p = cosP * dx + sinP * dy
        val y1p = -sinP * dx + cosP * dy
        val lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if (lambda > 1) { val r = sqrt(lambda); rx *= r; ry *= r }
        val num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        val den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef = if (den == 0.0) 0.0 else sqrt(max(0.0, num / den))
        if (large == sweep) coef = -coef
        val cxp = coef * rx * y1p / ry
        val cyp = -coef * ry * x1p / rx
        val ccx = cosP * cxp - sinP * cyp + (x0 + x) / 2.0
        val ccy = sinP * cxp + cosP * cyp + (y0 + y) / 2.0
        fun angle(ux: Double, uy: Double, vx: Double, vy: Double) = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        val theta1 = angle(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if (!sweep && delta > 0) delta -= 2 * PI else if (sweep && delta < 0) delta += 2 * PI
        val segments = max(1, ceil(abs(delta) / (PI / 2) - 1e-9).toInt())
        val step = delta / segments
        val t = 4.0 / 3 * tan(step / 4)
        fun mx(px: Double, py: Double) = (cosP * px * rx - sinP * py * ry + ccx).toFloat()
        fun my(px: Double, py: Double) = (sinP * px * rx + cosP * py * ry + ccy).toFloat()
        var a1 = theta1
        repeat(segments) { i ->
            val a2 = a1 + step
            val c1x = cos(a1) - t * sin(a1); val c1y = sin(a1) + t * cos(a1)
            val c2x = cos(a2) + t * sin(a2); val c2y = sin(a2) - t * cos(a2)
            // the last segment ends exactly on the target, with no rounding drift
            val last = i == segments - 1
            out.cubicTo(mx(c1x, c1y), my(c1x, c1y), mx(c2x, c2y), my(c2x, c2y), if (last) x else mx(cos(a2), sin(a2)), if (last) y else my(cos(a2), sin(a2)))
            a1 = a2
        }
    }

    private class Scanner(val b: String) {
        var i = 0
        fun peek(): Char? = if (i < b.length) b[i] else null
        fun skipSeparators() { while (i < b.length && (b[i] == ' ' || b[i] == ',' || b[i] == '\n' || b[i] == '\r' || b[i] == '\t')) i++ }

        fun number(): Float {
            skipSeparators()
            val st = i
            if (i < b.length && (b[i] == '-' || b[i] == '+')) i++
            var digits = false; var dot = false
            while (i < b.length) {
                val c = b[i]
                if (c in '0'..'9') { digits = true; i++ } else if (c == '.' && !dot) { dot = true; i++ } else break
            }
            if (digits && i < b.length && (b[i] == 'e' || b[i] == 'E')) { // exponent
                var j = i + 1
                if (j < b.length && (b[j] == '-' || b[j] == '+')) j++
                if (j < b.length && b[j] in '0'..'9') { i = j; while (i < b.length && b[i] in '0'..'9') i++ }
            }
            if (!digits) throw SvgParseException("expected a number at $st")
            return b.substring(st, i).toFloat()
        }

        /** arc flags may be packed without separators: "a1 1 0 01.5.5" */
        fun flag(): Boolean {
            skipSeparators()
            if (i >= b.length || (b[i] != '0' && b[i] != '1')) throw SvgParseException("expected an arc flag at $i")
            return b[i++] == '1'
        }
    }
}

/** android.graphics.Path as a [PathSink]. */
class AndroidPath : PathSink {
    val path = Path()
    override fun moveTo(x: Float, y: Float) = path.moveTo(x, y)
    override fun lineTo(x: Float, y: Float) = path.lineTo(x, y)
    override fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float) = path.cubicTo(x1, y1, x2, y2, x, y)
    override fun quadTo(x1: Float, y1: Float, x: Float, y: Float) = path.quadTo(x1, y1, x, y)
    override fun close() = path.close()
}

/** `#rgb`, `#rrggbb`, `rgb(r,g,b[,a])`, black / white, or a gradient's flat stand-in, as ARGB; null for none / unknown. */
object SvgColor {
    fun parse(raw: String, gradients: Map<String, Int> = emptyMap()): Int? {
        val s = raw.trim().lowercase()
        if (s == "none" || s == "transparent" || s.isEmpty()) return null
        if (s.startsWith("url(#")) return gradients[s.removePrefix("url(#").substringBefore(')')]
        if (s.startsWith("#")) {
            var h = s.substring(1)
            if (h.length == 3) h = h.map { "$it$it" }.joinToString("")
            if (h.length != 6) return null
            return h.toLongOrNull(16)?.let { (0xFF000000 or it).toInt() }
        }
        if (s.startsWith("rgb")) {
            val parts = s.substringAfter('(').substringBefore(')').split(',').map { it.trim().toDoubleOrNull() ?: 0.0 }
            if (parts.size < 3) return null
            val a = if (parts.size > 3) parts[3] else 1.0
            return argb(a, parts[0].toInt(), parts[1].toInt(), parts[2].toInt())
        }
        return when (s) { "black" -> 0xFF000000.toInt(); "white" -> 0xFFFFFFFF.toInt(); else -> null }
    }

    fun argb(alpha: Double, r: Int, g: Int, b: Int): Int =
        ((alpha.coerceIn(0.0, 1.0) * 255 + 0.5).toInt() shl 24) or (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)

    /** [color] with its alpha multiplied by [k]. */
    fun fade(color: Int, k: Double): Int = argb(((color ushr 24) / 255.0) * k, (color shr 16) and 0xFF, (color shr 8) and 0xFF, color and 0xFF)
}

class SvgShape(
    val path: Path,
    val fill: Int?,
    val stroke: Int?,
    val strokeWidth: Float,
    val dash: FloatArray,
    /** vector-effect="non-scaling-stroke": the width is in screen pixels */
    val nonScaling: Boolean,
    val clips: List<Path>,
)

class SvgDocument(val viewBox: RectF, val shapes: List<SvgShape>) {
    class Node(val name: String, val attrs: Map<String, String>, val children: MutableList<Node> = mutableListOf())

    private data class Style(
        val fill: String? = null,
        val stroke: String? = null,
        val strokeWidth: String? = null,
        val dash: String? = null,
        val nonScaling: Boolean = false,
        val fillOpacity: Double = 1.0,
        val strokeOpacity: Double = 1.0,
        val opacity: Double = 1.0,
    ) {
        fun merged(a: Map<String, String>): Style {
            val attrs = a.toMutableMap()
            // inline style="fill:…;stroke:…" wins over attributes
            a["style"]?.split(';')?.forEach { decl ->
                val kv = decl.split(':', limit = 2).map { it.trim() }
                if (kv.size == 2) attrs[kv[0]] = kv[1]
            }
            return copy(
                fill = attrs["fill"] ?: fill,
                stroke = attrs["stroke"] ?: stroke,
                strokeWidth = attrs["stroke-width"] ?: strokeWidth,
                dash = attrs["stroke-dasharray"] ?: dash,
                nonScaling = attrs["vector-effect"]?.let { it == "non-scaling-stroke" } ?: nonScaling,
                fillOpacity = attrs["fill-opacity"]?.toDoubleOrNull() ?: fillOpacity,
                strokeOpacity = attrs["stroke-opacity"]?.toDoubleOrNull() ?: strokeOpacity,
                opacity = opacity * (attrs["opacity"]?.toDoubleOrNull() ?: 1.0),
            )
        }
    }

    /** Transform and scale that fit the viewBox into [w]×[h] (preserveAspectRatio xMidYMid meet). */
    fun fit(w: Float, h: Float): Pair<Matrix, Float> {
        val m = Matrix()
        if (viewBox.width() <= 0 || viewBox.height() <= 0) return m to 1f
        val k = min(w / viewBox.width(), h / viewBox.height())
        m.setScale(k, k)
        m.postTranslate((w - viewBox.width() * k) / 2 - viewBox.left * k, (h - viewBox.height() * k) / 2 - viewBox.top * k)
        return m to k
    }

    fun draw(canvas: Canvas, w: Float, h: Float) {
        val (m, k) = fit(w, h)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val p = Path()
        for (s in shapes) {
            s.path.transform(m, p)
            canvas.save()
            for (clip in s.clips) {
                val cp = Path()
                clip.transform(m, cp)
                canvas.clipPath(cp)
            }
            s.fill?.let {
                paint.reset(); paint.isAntiAlias = true
                paint.style = Paint.Style.FILL; paint.color = it
                canvas.drawPath(p, paint)
            }
            val lw = if (s.nonScaling) s.strokeWidth else s.strokeWidth * k
            if (s.stroke != null && lw > 0) {
                paint.reset(); paint.isAntiAlias = true
                paint.style = Paint.Style.STROKE; paint.color = s.stroke; paint.strokeWidth = lw
                // an odd-length dash list repeats to make it even, as in SVG
                val dash = if (s.dash.size % 2 == 1) s.dash + s.dash else s.dash
                if (dash.isNotEmpty() && dash.any { it > 0 }) paint.pathEffect = DashPathEffect(if (s.nonScaling) dash else FloatArray(dash.size) { dash[it] * k }, 0f)
                canvas.drawPath(p, paint)
            }
            canvas.restore()
        }
    }

    companion object {
        private val SKIP = setOf("defs", "clipPath", "linearGradient", "radialGradient", "mask", "title", "desc", "style")

        fun parse(svg: String): SvgDocument {
            val root = parseXml(svg)
            val clips = HashMap<String, Path>()
            val gradients = HashMap<String, Int>()
            collectDefs(root, clips, gradients)
            val vb = root.attrs["viewBox"]?.split(' ', ',')?.mapNotNull { it.toFloatOrNull() }.orEmpty()
            val viewBox = if (vb.size == 4) RectF(vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3])
            else RectF(0f, 0f, root.attrs["width"]?.toFloatOrNull() ?: 100f, root.attrs["height"]?.toFloatOrNull() ?: 100f)
            val shapes = ArrayList<SvgShape>()
            walk(root, Style(), emptyList(), clips, gradients, shapes)
            return SvgDocument(viewBox, shapes)
        }

        fun parseXml(svg: String): Node {
            val xp = Xml.newPullParser()
            xp.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            xp.setInput(StringReader(svg))
            val stack = ArrayList<Node>()
            var root: Node? = null
            while (true) {
                when (xp.next()) {
                    XmlPullParser.START_TAG -> {
                        val attrs = HashMap<String, String>()
                        for (i in 0 until xp.attributeCount) attrs[xp.getAttributeName(i)] = xp.getAttributeValue(i)
                        val n = Node(xp.name, attrs)
                        stack.lastOrNull()?.children?.add(n)
                        stack.add(n)
                    }
                    XmlPullParser.END_TAG -> { val n = stack.removeAt(stack.size - 1); if (stack.isEmpty()) root = n }
                    XmlPullParser.END_DOCUMENT -> break
                }
            }
            return root?.takeIf { it.name == "svg" } ?: throw SvgParseException("not an SVG document")
        }

        private fun geometry(n: Node): Path? = when (n.name) {
            "path" -> n.attrs["d"]?.let { d -> runCatching { AndroidPath().also { SvgPath.parse(d, it) }.path }.getOrNull() }
            "rect" -> {
                fun v(k: String) = n.attrs[k]?.toFloatOrNull() ?: 0f
                if (v("width") <= 0 || v("height") <= 0) null
                else Path().apply { addRect(v("x"), v("y"), v("x") + v("width"), v("y") + v("height"), Path.Direction.CW) }
            }
            "circle" -> {
                fun v(k: String) = n.attrs[k]?.toFloatOrNull() ?: 0f
                if (v("r") > 0) Path().apply { addCircle(v("cx"), v("cy"), v("r"), Path.Direction.CW) } else null
            }
            else -> null
        }

        private fun collectDefs(n: Node, clips: MutableMap<String, Path>, gradients: MutableMap<String, Int>) {
            val id = n.attrs["id"]
            if (n.name == "clipPath" && id != null) {
                val p = Path()
                fun add(x: Node) { geometry(x)?.let { p.addPath(it) }; x.children.forEach(::add) }
                n.children.forEach(::add)
                clips[id] = p
            }
            if (n.name.endsWith("Gradient") && id != null) {
                // a flat stand-in: the first stop's colour
                val stop = n.children.firstOrNull { it.name == "stop" }
                val c = stop?.attrs?.get("stop-color")?.let { SvgColor.parse(it) }
                if (c != null) gradients[id] = SvgColor.fade(c, stop.attrs["stop-opacity"]?.toDoubleOrNull() ?: 1.0)
            }
            n.children.forEach { collectDefs(it, clips, gradients) }
        }

        private fun clipRef(a: Map<String, String>, clips: Map<String, Path>): Path? {
            val v = a["clip-path"] ?: return null
            if (!v.startsWith("url(#")) return null
            return clips[v.removePrefix("url(#").substringBefore(')')]
        }

        private fun walk(n: Node, inherited: Style, clipStack: List<Path>, clips: Map<String, Path>, gradients: Map<String, Int>, out: MutableList<SvgShape>) {
            if (n.name in SKIP || n.attrs["display"] == "none") return
            val st = inherited.merged(n.attrs)
            val stack = clipRef(n.attrs, clips)?.let { clipStack + it } ?: clipStack
            val g = geometry(n)
            if (g != null) {
                val fill = SvgColor.parse(st.fill ?: "#000", gradients)?.let { SvgColor.fade(it, st.fillOpacity * st.opacity) }
                val stroke = st.stroke?.let { SvgColor.parse(it, gradients) }?.let { SvgColor.fade(it, st.strokeOpacity * st.opacity) }
                val dash = st.dash.orEmpty().split(' ', ',').mapNotNull { it.toFloatOrNull() }.toFloatArray()
                if (fill != null || stroke != null) {
                    out.add(SvgShape(g, fill, stroke, st.strokeWidth?.toFloatOrNull() ?: 1f, dash, st.nonScaling, stack))
                }
            }
            n.children.forEach { walk(it, st, stack, clips, gradients, out) }
        }
    }
}
