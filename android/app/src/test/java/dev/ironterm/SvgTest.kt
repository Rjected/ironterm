package dev.ironterm

import dev.ironterm.ui.PathSink
import dev.ironterm.ui.SvgColor
import dev.ironterm.ui.SvgDocument
import dev.ironterm.ui.SvgParseException
import dev.ironterm.ui.SvgPath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** The in-repo SVG renderer (replaces AndroidSVG): path data, colours, and the server's body figures. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SvgTest {
    private class Recorder : PathSink {
        val ops = mutableListOf<String>()
        private fun f(v: Float) = if (v == v.toLong().toFloat()) v.toLong().toString() else "%.3f".format(java.util.Locale.ROOT, v)
        override fun moveTo(x: Float, y: Float) { ops += "M${f(x)},${f(y)}" }
        override fun lineTo(x: Float, y: Float) { ops += "L${f(x)},${f(y)}" }
        override fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float) { ops += "C${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x)},${f(y)}" }
        override fun quadTo(x1: Float, y1: Float, x: Float, y: Float) { ops += "Q${f(x1)},${f(y1)} ${f(x)},${f(y)}" }
        override fun close() { ops += "Z" }
    }

    private fun ops(d: String) = Recorder().also { SvgPath.parse(d, it) }.ops

    @Test fun absoluteAndRelativeCommands() {
        assertEquals(listOf("M10,20", "L30,20", "L30,50", "L25,55", "Z", "M10,20", "L11,21"), ops("M10 20 H30 V50 l-5 5 z m0 0 1 1"))
        assertEquals(listOf("M0,0", "L1,1", "L3,3"), ops("M0,0 1,1 3,3")) // implicit line-tos after M
    }

    @Test fun curvesAndSmoothReflections() {
        assertEquals(listOf("M0,0", "C0,10 10,10 10,0", "C10,-10 20,-10 20,0"), ops("M0 0C0 10 10 10 10 0S20-10 20 0"))
        assertEquals(listOf("M0,0", "Q5,10 10,0", "Q15,-10 20,0"), ops("M0 0Q5 10 10 0T20 0"))
        assertEquals(listOf("M0,0", "C1,1 2,2 3,3"), ops("m0 0c1 1 2 2 3 3"))
    }

    @Test fun compactNumbersAndExponents() {
        assertEquals(listOf("M0.500,0.500", "L-0.500,0.250", "L100,0.001"), ops("M.5.5L-.5.25 1e2 1E-3"))
    }

    @Test fun arcsBecomeCubicsEndingAtTheTarget() {
        val o = ops("M0 0A10 10 0 0 1 20 0")
        assertEquals("M0,0", o.first())
        assertEquals(2, o.size - 1) // a half circle = two quarter-circle cubics
        assertTrue(o.last(), o.last().endsWith(" 20,0"))
        assertEquals(listOf("M0,0", "L5,5"), ops("M0 0a0 4 0 0 1 5 5")) // zero radius: a line
        assertEquals(o, ops("M0 0a10 10 0 0120 0")) // packed flags
    }

    @Test fun rejectsBadPathData() {
        for (bad in listOf("10 10", "M10", "M0 0 Z 5", "M0 0 X1 1", "M0 0 A1 1 0 2 0 1 1")) {
            try { ops(bad); throw AssertionError("parsed '$bad'") } catch (_: SvgParseException) {}
        }
    }

    @Test fun colours() {
        assertEquals(0xFFFF0000.toInt(), SvgColor.parse("#f00"))
        assertEquals(0xFF1A2B3C.toInt(), SvgColor.parse(" #1A2B3C "))
        assertEquals(0x80FF8000.toInt(), SvgColor.parse("rgb(255, 128, 0, 0.5)"))
        assertEquals(0xFFFFFFFF.toInt(), SvgColor.parse("white"))
        assertNull(SvgColor.parse("none"))
        assertNull(SvgColor.parse("#12345"))
        assertEquals(0xFF00FF00.toInt(), SvgColor.parse("url(#g)", mapOf("g" to 0xFF00FF00.toInt())))
    }

    @Test fun documentStylesClipsAndViewBox() {
        val doc = SvgDocument.parse(
            """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400">
              <defs><clipPath id="c"><rect x="0" y="0" width="100" height="400"/></clipPath>
                <linearGradient id="g"><stop stop-color="#0f0" stop-opacity="0.5"/></linearGradient></defs>
              <g fill="#ff0000" fill-opacity="0.5">
                <path d="M0 0H10V10Z"/>
                <path d="M0 0H10V10Z" style="fill:none;stroke:#000" stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray="3 2"/>
                <path d="M0 0H10V10Z" clip-path="url(#c)" fill="url(#g)"/>
              </g>
              <path d="M0 0H10" display="none"/>
              <path d="not a path"/>
            </svg>""",
        )
        assertEquals(200f, doc.viewBox.width())
        assertEquals(400f, doc.viewBox.height())
        assertEquals(3, doc.shapes.size)
        val (a, b, c) = doc.shapes
        assertEquals(0x80FF0000.toInt(), a.fill)
        assertNull(b.fill)
        assertEquals(0xFF000000.toInt(), b.stroke)
        assertEquals(2f, b.strokeWidth)
        assertTrue(b.nonScaling)
        assertEquals(listOf(3f, 2f), b.dash.toList())
        assertEquals(1, c.clips.size)
        assertEquals(0x4000FF00, c.fill) // gradient stand-in at 0.5, times the group's fill-opacity 0.5
    }

    @Test fun notSvg() {
        try { SvgDocument.parse("<html/>"); throw AssertionError() } catch (_: SvgParseException) {}
    }

    @Test fun serverBodyFiguresParse() {
        val body = Fixtures.body
        for (svg in listOf(body.svgFront, body.svgBack)) {
            val doc = SvgDocument.parse(svg)
            assertTrue(doc.viewBox.width() > 0)
            assertTrue("figure has shapes", doc.shapes.size > 10)
            assertTrue("muscles are clipped to the figure", doc.shapes.any { it.clips.isNotEmpty() })
        }
    }
}
