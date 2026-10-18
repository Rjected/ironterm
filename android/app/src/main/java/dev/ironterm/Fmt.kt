package dev.ironterm

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/** Number/date formatting shared by the app and the widgets (Terminal style: uppercase, compact). */
object Fmt {
    private val sym = DecimalFormatSymbols(Locale.US)
    private val oneDp = DecimalFormat("#,##0.#", sym)
    private val grouped = DecimalFormat("#,##0", sym)
    private val MON = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
    private val DOW = listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")

    /** 325 → "325", 302.5 → "302.5" */
    fun w(x: Double): String = oneDp.format(Math.round(x * 10) / 10.0)

    /** whole number with grouping: 52756 → "52,756" */
    fun n(x: Double): String = grouped.format(x.roundToLong())
    fun n(x: Int): String = grouped.format(x)

    /** 52756 → "52.8K" */
    fun compact(x: Double): String = when {
        abs(x) >= 1_000_000 -> oneDp.format(Math.round(x / 100_000.0) / 10.0) + "M"
        abs(x) >= 10_000 -> oneDp.format(Math.round(x / 100.0) / 10.0) + "K"
        else -> grouped.format(x.roundToLong())
    }

    /** signed delta: "+43.2", "−1", "±0" */
    fun delta(x: Double): String {
        val r = Math.round(x * 10) / 10.0
        return when {
            r > 0 -> "+" + oneDp.format(r)
            r < 0 -> "−" + oneDp.format(-r)
            else -> "±0"
        }
    }

    fun pct(r: Double): String = "${(r * 100).roundToLong()}%"

    /** percent change a vs b, null when b is 0 */
    fun change(a: Double, b: Double): String? {
        if (b <= 0) return null
        val p = ((a - b) / b * 100).roundToLong()
        return if (p >= 0) "▲$p%" else "▼${-p}%"
    }

    /** "2026-10-15" → "THU 15 OCT" */
    fun day(iso: String?): String {
        val d = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return iso.orEmpty()
        return "${DOW[d.dayOfWeek.value - 1]} ${d.dayOfMonth} ${MON[d.monthValue - 1]}"
    }

    fun month(d: LocalDate): String = MON[d.monthValue - 1]

    /** last sync label: "JUST NOW", "12 MIN AGO", "3 H AGO", "THU 15 OCT 09:12" */
    fun ago(epochMs: Long, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        if (epochMs <= 0) return "NEVER"
        val s = (now - epochMs) / 1000
        return when {
            s < 60 -> "JUST NOW"
            s < 3600 -> "${s / 60} MIN AGO"
            s < 86400 -> "${s / 3600} H AGO"
            else -> {
                val z = Instant.ofEpochMilli(epochMs).atZone(zone)
                day(z.toLocalDate().toString()) + " " + z.format(DateTimeFormatter.ofPattern("HH:mm"))
            }
        }
    }

    fun hours(h: Double): String = if (h <= 0) "READY" else "${h.roundToLong()}H"
}
