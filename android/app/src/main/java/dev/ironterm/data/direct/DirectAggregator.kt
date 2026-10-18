package dev.ironterm.data.direct

import dev.ironterm.data.*
import dev.ironterm.data.hevy.Workout
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import kotlin.math.roundToLong

data class LiftDef(val key: String, val name: String, val short: String, val hevy: List<String>)

/**
 * Direct mode: build a [Snapshot] from raw Hevy workouts on the phone, no server involved.
 * Computes the graph (quartile levels), streak, this week, totals, last workout and lift e1RMs.
 * Program and recovery need the server, so they are always null here.
 */
object DirectAggregator {
    const val KG_TO_LB = 2.20462262
    val BIG_FOUR = listOf("squat", "bench", "deadlift", "ohp")
    private val DOW = listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
    private val byTitle: Map<String, LiftDef> by lazy {
        val m = HashMap<String, LiftDef>()
        for (l in LIFT_TABLE) for (t in l.hevy) m.putIfAbsent(t.lowercase(), l)
        m
    }

    fun liftFor(exerciseTitle: String): LiftDef? = byTitle[exerciseTitle.trim().lowercase()]

    /** Epley estimated 1RM: w × (1 + r/30). Only sets of 1–12 reps with a weight count. */
    fun epley(weight: Double, reps: Int): Double? =
        if (weight <= 0 || reps < 1 || reps > 12) null else weight * (1 + reps / 30.0)

    /** Monday of the week containing [d]. */
    fun weekStart(d: LocalDate): LocalDate = d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    /**
     * Quartile levels like the v1 widget: 0 = no workout, 1..4 = quartiles of the non-zero values.
     * Level 1 is the lightest colour.
     */
    fun levels(values: List<Double>): List<Int> {
        val nonZero = values.filter { it > 0 }.sorted()
        if (nonZero.isEmpty()) return values.map { 0 }
        val q1 = nonZero[(nonZero.size * 0.25).toInt().coerceAtMost(nonZero.size - 1)]
        val q2 = nonZero[(nonZero.size * 0.50).toInt().coerceAtMost(nonZero.size - 1)]
        val q3 = nonZero[(nonZero.size * 0.75).toInt().coerceAtMost(nonZero.size - 1)]
        return values.map { v ->
            when {
                v <= 0 -> 0
                v <= q1 -> 1
                v <= q2 -> 2
                v <= q3 -> 3
                else -> 4
            }
        }
    }

    /** Consecutive Monday-weeks with at least [min] training days, like web/shared/stats.ts weekStreak. */
    fun weekStreak(trainingDays: Set<LocalDate>, today: LocalDate, min: Int): Streak {
        val perWeek = trainingDays.groupingBy { weekStart(it) }.eachCount()
        if (perWeek.isEmpty()) return Streak(0, 0)
        var best = 0
        var run = 0
        var prev: LocalDate? = null
        for (wk in perWeek.keys.sorted()) {
            val ok = (perWeek[wk] ?: 0) >= min
            run = if (ok) (if (prev != null && prev.plusDays(7) == wk) run + 1 else 1) else 0
            prev = if (ok) wk else null
            best = maxOf(best, run)
        }
        var cur = 0
        var wk = weekStart(today)
        if ((perWeek[wk] ?: 0) < min) wk = wk.minusDays(7) // this week isn't over yet
        while ((perWeek[wk] ?: 0) >= min) { cur++; wk = wk.minusDays(7) }
        return Streak(cur, best)
    }

    private fun r1(x: Double) = Math.round(x * 10) / 10.0

    fun build(
        workouts: List<Workout>,
        today: LocalDate,
        zone: ZoneId,
        unit: String,
        weeklyTarget: Int = 3,
        now: Instant = Instant.now(),
    ): Snapshot {
        val toUnit = if (unit == "lb") KG_TO_LB else 1.0
        data class W(val w: Workout, val date: LocalDate, val start: Instant, val volume: Double, val minutes: Double)

        val ws = workouts.mapNotNull { w ->
            val start = runCatching { OffsetDateTime.parse(w.startTime).toInstant() }.getOrNull() ?: return@mapNotNull null
            val end = w.endTime?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }
            var volKg = 0.0
            for (e in w.exercises) for (s in e.sets) if (!s.isWarmup) volKg += (s.weightKg ?: 0.0) * (s.reps ?: 0)
            val minutes = if (end != null && end.isAfter(start)) Duration.between(start, end).toMinutes().toDouble() else 0.0
            W(w, start.atZone(zone).toLocalDate(), start, volKg * toUnit, minutes)
        }.filter { !it.date.isAfter(today) }.sortedByDescending { it.start }

        // ── graph: 53 Monday-first weeks ending today ──
        val start = weekStart(today).minusWeeks(52)
        val perDay = HashMap<LocalDate, Double>()
        // A logged day always counts, even with zero volume (bodyweight / cardio).
        for (x in ws) perDay[x.date] = (perDay[x.date] ?: 0.0) + maxOf(x.volume, 1.0)
        val dates = generateSequence(start) { it.plusDays(1) }.takeWhile { !it.isAfter(today) }.toList()
        val values = dates.map { perDay[it] ?: 0.0 }
        val lv = levels(values)
        val graph = Graph(start.toString(), dates.mapIndexed { i, d -> GraphDay(d.toString(), lv[i], values[i].roundToLong().toDouble()) })

        // ── week / streak ──
        val trained = perDay.keys
        val wk = weekStart(today)
        val weekDays = (0 until 7).map { i ->
            val d = wk.plusDays(i.toLong())
            val status = when {
                d in trained -> WeekDay.STATUS_DONE
                d == today -> WeekDay.STATUS_TODAY
                else -> WeekDay.STATUS_REST // no schedule without a program
            }
            WeekDay(d.toString(), DOW[i], status)
        }
        val target = weeklyTarget.coerceIn(1, 7)
        val week = Week(target, weekDays.count { it.status == WeekDay.STATUS_DONE }, weekDays)
        val streak = weekStreak(trained, today, target)

        // ── totals ──
        fun daysAgo(d: LocalDate) = ChronoUnit.DAYS.between(d, today)
        val last52 = ws.filter { daysAgo(it.date) < 364 }
        val totals = Totals(
            sessions52 = last52.size,
            sessionsPrev52 = ws.count { daysAgo(it.date) in 364 until 728 },
            vol7 = ws.filter { daysAgo(it.date) < 7 }.sumOf { it.volume }.roundToLong().toDouble(),
            volPrev7 = ws.filter { daysAgo(it.date) in 7 until 14 }.sumOf { it.volume }.roundToLong().toDouble(),
            avgMin = last52.filter { it.minutes > 0 }.map { it.minutes }.average().let { if (it.isNaN()) 0.0 else Math.round(it).toDouble() },
            allTime = ws.size,
        )
        val last = ws.firstOrNull()?.let { x ->
            LastWorkout(
                title = x.w.title, date = x.date.toString(), durationMin = Math.round(x.minutes).toDouble(),
                volume = x.volume.roundToLong().toDouble(),
                sets = x.w.exercises.sumOf { e -> e.sets.count { !it.isWarmup } },
                exercises = x.w.exercises.size,
            )
        }

        // ── lifts: best Epley e1RM per day per lift ──
        val points = HashMap<String, MutableMap<LocalDate, Double>>()
        for (x in ws) for (e in x.w.exercises) {
            val def = liftFor(e.title) ?: continue
            for (s in e.sets) {
                if (s.isWarmup) continue
                val est = epley((s.weightKg ?: 0.0) * toUnit, s.reps ?: 0) ?: continue
                val m = points.getOrPut(def.key) { HashMap() }
                m[x.date] = maxOf(m[x.date] ?: 0.0, est)
            }
        }
        val keys = BIG_FOUR.filter { it in points } +
            points.keys.filter { it !in BIG_FOUR }.sortedByDescending { points[it]!!.size }
        val lifts = keys.take(8).mapNotNull { k -> liftSummary(k, points[k]!!, today) }

        return Snapshot(
            v = 1, generatedAt = now.toString(), today = today.toString(), unit = unit, tz = zone.id, demo = false,
            graph = graph, streak = streak, week = week, totals = totals, last = last,
            program = null, lifts = lifts, recovery = null, source = Snapshot.SOURCE_DIRECT,
        )
    }

    /** e1RM now (best of the last 28 days, else the latest), 28-day delta and a 12-week spark. */
    fun liftSummary(key: String, byDay: Map<LocalDate, Double>, today: LocalDate): Lift? {
        if (byDay.isEmpty()) return null
        val def = LIFT_TABLE.firstOrNull { it.key == key }
        val pts = byDay.entries.sortedBy { it.key }
        val cut28 = today.minusDays(28)
        val recent = pts.filter { it.key.isAfter(cut28) }
        val now = if (recent.isNotEmpty()) recent.maxOf { it.value } else pts.last().value
        val old = pts.filter { !it.key.isAfter(cut28) }
        val before = if (old.isEmpty()) null else {
            old.filter { it.key.isAfter(today.minusDays(56)) }.maxOfOrNull { it.value } ?: old.last().value
        }
        // rolling 4-week best at the end of each of the last 12 weeks (deloads don't dip)
        val wk = weekStart(today)
        val spark = ArrayList<Double>()
        for (i in 11 downTo 0) {
            val z = wk.plusDays(7L - i * 7)
            val a = z.minusDays(28)
            val inWin = pts.filter { !it.key.isBefore(a) && it.key.isBefore(z) }.map { it.value }
            spark.add(r1(if (inWin.isNotEmpty()) inWin.max() else spark.lastOrNull() ?: 0.0))
        }
        return Lift(
            key = key, name = def?.name ?: key, short = def?.short ?: key.uppercase(),
            e1rm = r1(now), delta28 = before?.let { r1(now - it) }, spark = spark,
        )
    }
}
