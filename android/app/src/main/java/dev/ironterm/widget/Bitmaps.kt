package dev.ironterm.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import dev.ironterm.data.GraphDay
import kotlin.math.max
import kotlin.math.min

/**
 * Canvas renderers for things Glance can't draw itself (graph, sparklines, rings). The app's
 * Compose screens draw their own versions; these are only used by widgets and the widget gallery.
 */
object Bitmaps {
    const val AMBER = 0xFFFFB000.toInt()
    const val LINE = 0xFF222428.toInt()
    const val UP = 0xFF8CB4FF.toInt()
    const val DOWN = 0xFFFF6B5E.toInt()
    const val FAINT = 0xFF55585E.toInt()
    private val MONTHS = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")

    /** Columns (Monday-first weeks) of the snapshot graph; the last one may be partial. */
    fun columns(days: List<GraphDay>): List<List<GraphDay>> = days.chunked(7)

    /**
     * The contribution graph: the last [weeks] columns, 7 rows (Mon..Sun), square cells.
     * Today gets an amber outline. Bitmap size = weeks × cell + gaps.
     */
    fun graph(days: List<GraphDay>, weeks: Int, theme: ColorTheme, cellPx: Float, gapPx: Float, today: String?, labelPx: Float = 0f): Bitmap {
        val cols = columns(days).takeLast(weeks)
        val top = if (labelPx > 0) labelPx * 1.5f else 0f
        val w = max(1, (weeks * cellPx + (weeks - 1) * gapPx).toInt())
        val h = max(1, (top + 7 * cellPx + 6 * gapPx).toInt())
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        if (labelPx > 0) {
            val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = labelPx; color = FAINT; typeface = android.graphics.Typeface.MONOSPACE }
            val offset0 = weeks - cols.size
            var prev = -1
            var lastX = -1e9f
            cols.forEachIndexed { ci, col ->
                val m = col.first().date.substring(5, 7).toIntOrNull() ?: return@forEachIndexed
                if (m != prev) {
                    prev = m
                    val x = (ci + offset0) * (cellPx + gapPx)
                    val label = MONTHS[m - 1]
                    if (x - lastX > tp.measureText(label) + labelPx && x + tp.measureText(label) <= w) {
                        c.drawText(label, x, labelPx, tp); lastX = x
                    }
                }
            }
            c.translate(0f, top)
        }
        val radius = min(cellPx * 0.18f, 3f)
        // Pad on the left when there are fewer columns than requested (new accounts).
        val offset = weeks - cols.size
        for (ci in cols.indices) {
            val x = (ci + offset) * (cellPx + gapPx)
            cols[ci].forEachIndexed { ri, d ->
                val y = ri * (cellPx + gapPx)
                p.style = Paint.Style.FILL
                p.color = theme.level(d.level)
                c.drawRoundRect(RectF(x, y, x + cellPx, y + cellPx), radius, radius, p)
                if (d.date == today) {
                    p.style = Paint.Style.STROKE
                    val sw = max(1f, cellPx * 0.14f)
                    p.strokeWidth = sw
                    p.color = AMBER
                    c.drawRoundRect(RectF(x + sw / 2, y + sw / 2, x + cellPx - sw / 2, y + cellPx - sw / 2), radius, radius, p)
                }
            }
        }
        // empty placeholder cells for missing columns
        p.style = Paint.Style.FILL
        p.color = theme.level(0)
        for (ci in 0 until offset) for (ri in 0 until 7) {
            val x = ci * (cellPx + gapPx)
            val y = ri * (cellPx + gapPx)
            c.drawRoundRect(RectF(x, y, x + cellPx, y + cellPx), radius, radius, p)
        }
        return bmp
    }

    /** Line sparkline with a dot on the latest point. */
    fun spark(values: List<Double>, wPx: Int, hPx: Int, color: Int = UP, strokePx: Float = 2f): Bitmap {
        val bmp = Bitmap.createBitmap(max(1, wPx), max(1, hPx), Bitmap.Config.ARGB_8888)
        if (values.size < 2) return bmp
        val c = Canvas(bmp)
        val lo = values.min()
        val hi = values.max()
        val span = if (hi - lo < 1e-6) 1.0 else hi - lo
        val pad = strokePx * 2
        fun px(i: Int) = pad + (wPx - 2 * pad) * i / (values.size - 1).toFloat()
        fun py(v: Double) = (hPx - pad - (hPx - 2 * pad) * ((v - lo) / span)).toFloat()
        val path = Path()
        values.forEachIndexed { i, v -> if (i == 0) path.moveTo(px(i), py(v)) else path.lineTo(px(i), py(v)) }
        val fill = Path(path).apply {
            lineTo(px(values.size - 1), hPx.toFloat()); lineTo(px(0), hPx.toFloat()); close()
        }
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.style = Paint.Style.FILL
        p.color = (color and 0x00FFFFFF) or 0x22000000
        c.drawPath(fill, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = strokePx
        p.strokeJoin = Paint.Join.ROUND
        p.color = color
        c.drawPath(path, p)
        p.style = Paint.Style.FILL
        c.drawCircle(px(values.size - 1), py(values.last()), strokePx * 1.6f, p)
        return bmp
    }

    /** Ring gauge: [fraction] 0..1 of the circle in [color] over a [LINE] track, starting at 12 o'clock. */
    fun ring(fraction: Double, sizePx: Int, strokePx: Float, color: Int, track: Int = LINE): Bitmap {
        val bmp = Bitmap.createBitmap(max(1, sizePx), max(1, sizePx), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = strokePx; strokeCap = Paint.Cap.BUTT }
        val r = RectF(strokePx / 2, strokePx / 2, sizePx - strokePx / 2, sizePx - strokePx / 2)
        p.color = track
        c.drawArc(r, 0f, 360f, false, p)
        val f = fraction.coerceIn(0.0, 1.0).toFloat()
        if (f > 0) {
            p.color = color
            c.drawArc(r, -90f, 360f * f, false, p)
        }
        return bmp
    }

    /** Segmented ring for done/target sessions (one segment per session). */
    fun segments(done: Int, target: Int, sizePx: Int, strokePx: Float, color: Int, track: Int = LINE): Bitmap {
        val n = max(1, max(done, target))
        val bmp = Bitmap.createBitmap(max(1, sizePx), max(1, sizePx), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = strokePx }
        val r = RectF(strokePx / 2, strokePx / 2, sizePx - strokePx / 2, sizePx - strokePx / 2)
        val gap = if (n > 1) 6f else 0f
        val sweep = 360f / n
        for (i in 0 until n) {
            p.color = if (i < done) color else track
            c.drawArc(r, -90f + i * sweep + gap / 2, sweep - gap, false, p)
        }
        return bmp
    }
}
