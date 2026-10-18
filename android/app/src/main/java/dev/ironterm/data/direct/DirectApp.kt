package dev.ironterm.data.direct

import dev.ironterm.data.Snapshot
import dev.ironterm.data.app.AppHistory
import dev.ironterm.data.app.AppHome
import dev.ironterm.data.app.AppLiftDetail
import dev.ironterm.data.app.AppLiftList
import dev.ironterm.data.app.AppWorkout
import dev.ironterm.data.app.BestE1rm
import dev.ironterm.data.app.DatePoint
import dev.ironterm.data.app.E1rmRow
import dev.ironterm.data.app.LiftPoint
import dev.ironterm.data.app.LiftRow
import dev.ironterm.data.app.PointSet
import dev.ironterm.data.app.PrWallRow
import dev.ironterm.data.app.RecentPR
import dev.ironterm.data.app.RepPR
import dev.ironterm.data.app.TrendSeries
import dev.ironterm.data.app.WeekVolume
import dev.ironterm.data.app.WorkoutExercise
import dev.ironterm.data.app.WorkoutSet
import dev.ironterm.data.app.WorkoutSummary
import dev.ironterm.data.hevy.Workout
import dev.ironterm.gym.LiftLibrary
import dev.ironterm.gym.PickItem
import java.time.Duration
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Direct mode (no server): the same screen documents as /api/app, built on the phone from the
 * cached Hevy workouts. Only what the raw log can tell: e1RMs, rep PRs, history. Program, recovery,
 * projections and the stall detector need the server and stay empty.
 */
class DirectApp(workouts: List<Workout>, private val unit: String, private val zone: ZoneId, private val today: LocalDate) {
    private val toUnit = if (unit == "lb") DirectAggregator.KG_TO_LB else 1.0
    private fun r1(x: Double) = Math.round(x * 10) / 10.0

    private data class W(val w: Workout, val date: LocalDate, val minutes: Double)

    private val ws: List<W> = workouts.mapNotNull { w ->
        val start = runCatching { OffsetDateTime.parse(w.startTime) }.getOrNull() ?: return@mapNotNull null
        val end = w.endTime?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
        val min = if (end != null && end.isAfter(start)) Duration.between(start, end).toMinutes().toDouble() else 0.0
        W(w, start.atZoneSameInstant(zone).toLocalDate(), min)
    }.sortedByDescending { it.w.startTime }

    /** Per lift, one point per workout (oldest first). */
    val points: Map<String, List<LiftPoint>> by lazy {
        val out = HashMap<String, MutableList<LiftPoint>>()
        for (x in ws.reversed()) for (e in x.w.exercises) {
            val def = DirectAggregator.liftFor(e.title) ?: continue
            val sets = e.sets.filter { !it.isWarmup && (it.reps ?: 0) > 0 }
            if (sets.isEmpty()) continue
            val ps = sets.map { PointSet(r1((it.weightKg ?: 0.0) * toUnit), it.reps ?: 0, it.rpe) }
            val best = ps.mapNotNull { s -> DirectAggregator.epley(s.weight, s.reps)?.let { it to s } }.maxByOrNull { it.first }
            val top = ps.maxByOrNull { it.weight } ?: continue
            out.getOrPut(def.key) { ArrayList() }.add(
                LiftPoint(
                    date = x.date.toString(), workoutId = x.w.id, e1rm = r1(best?.first ?: 0.0), topWeight = top.weight, topReps = top.reps,
                    volume = Math.round(ps.sumOf { it.weight * it.reps }).toDouble(), sets = ps,
                ),
            )
        }
        out
    }

    private val keys: List<String> by lazy {
        val withE1 = points.filterValues { pts -> pts.any { it.e1rm > 0 } }.keys
        DirectAggregator.BIG_FOUR.filter { it in withE1 } + withE1.filter { it !in DirectAggregator.BIG_FOUR }.sortedByDescending { points[it]!!.size }
    }

    private fun bestIn(pts: List<LiftPoint>, from: LocalDate, to: LocalDate): Double? =
        pts.filter { val d = LocalDate.parse(it.date); !d.isBefore(from) && !d.isAfter(to) && it.e1rm > 0 }.maxOfOrNull { it.e1rm }

    /** Best e1RM of the 28 days ending at [at] (the server's "e1rmAt"). */
    private fun e1At(pts: List<LiftPoint>, at: LocalDate) = bestIn(pts, at.minusDays(27), at)

    private fun e1Now(pts: List<LiftPoint>) = e1At(pts, today) ?: pts.lastOrNull { it.e1rm > 0 }?.e1rm

    fun home(snapshot: Snapshot): AppHome {
        val e1rm = keys.take(10).mapNotNull { k ->
            val pts = points[k]!!
            val now = e1Now(pts) ?: return@mapNotNull null
            val a = e1At(pts, today.minusDays(28))
            val c = e1At(pts, today.minusDays(84))
            val def = LiftLibrary[k]
            E1rmRow(k, def?.name ?: k, def?.short ?: k, r1(now), a?.let { r1(now - it) }, c?.let { r1(now - it) }, r1(pts.maxOf { it.e1rm }))
        }
        val wk = DirectAggregator.weekStart(today)
        val trend = DirectAggregator.BIG_FOUR.filter { points[it]?.isNotEmpty() == true }.map { k ->
            val pts = points[k]!!
            val series = (52 downTo 0).mapNotNull { i ->
                val end = wk.plusDays(7L - i * 7)
                e1At(pts, end.minusDays(1))?.let { DatePoint(end.toString(), r1(it)) }
            }
            TrendSeries(k, LiftLibrary[k]?.short ?: k, series)
        }
        return AppHome(snapshot = snapshot, e1rm = e1rm, trend = trend, weekly = weekly(26), watch = emptyList(), recentPRs = recentPRs())
    }

    fun weekly(n: Int): List<WeekVolume> {
        val wk = DirectAggregator.weekStart(today)
        return (n - 1 downTo 0).map { i ->
            val start = wk.minusWeeks(i.toLong())
            val inWeek = ws.filter { !it.date.isBefore(start) && it.date.isBefore(start.plusDays(7)) }
            WeekVolume(
                start.toString(),
                Math.round(inWeek.sumOf { x -> x.w.exercises.sumOf { e -> e.sets.filter { !it.isWarmup }.sumOf { (it.weightKg ?: 0.0) * toUnit * (it.reps ?: 0) } } }).toDouble(),
                inWeek.size,
                inWeek.sumOf { x -> x.w.exercises.sumOf { e -> e.sets.count { !it.isWarmup } } },
            )
        }
    }

    /** New all-time e1RM records in the last 30 days. */
    private fun recentPRs(): List<RecentPR> {
        val from = today.minusDays(30)
        val out = ArrayList<RecentPR>()
        for (k in keys) {
            var best = 0.0
            for (p in points[k]!!) {
                if (p.e1rm > best + 1e-6) {
                    if (best > 0 && !LocalDate.parse(p.date).isBefore(from)) {
                        val s = p.sets.maxByOrNull { DirectAggregator.epley(it.weight, it.reps) ?: 0.0 }
                        if (s != null) out.add(RecentPR(k, LiftLibrary[k]?.short ?: k, "e1rm", s.reps, s.weight, p.date))
                    }
                    best = p.e1rm
                }
            }
        }
        return out.sortedByDescending { it.date }.take(12)
    }

    fun lifts(): AppLiftList = AppLiftList(keys.map { k ->
        val pts = points[k]!!
        val def = LiftLibrary[k]
        LiftRow(
            key = k, name = def?.name ?: k, short = def?.short ?: k, kind = def?.kind ?: "barbell",
            e1rm = r1(e1Now(pts) ?: 0.0), best = r1(pts.maxOf { it.e1rm }), sessions = pts.size, last = pts.last().date,
            status = null, spark = pts.takeLast(16).map { it.e1rm },
        )
    })

    fun lift(key: String): AppLiftDetail? {
        val pts = points[key] ?: return null
        val def = LiftLibrary[key]
        val best = pts.maxByOrNull { it.e1rm }
        val prs = repPRs(pts)
        return AppLiftDetail(
            key = key, name = def?.name ?: key, short = def?.short ?: key, kind = def?.kind ?: "barbell", unit = unit,
            e1rm = e1Now(pts)?.let(::r1), best = best?.let { BestE1rm(it.e1rm, it.date) }, yearAgo = e1At(pts, today.minusDays(365)),
            points = pts, repPRs = prs,
            prWall = prs.map { PrWallRow(it.reps, it.weight, it.date, ChronoUnit.DAYS.between(LocalDate.parse(it.date), today).toInt()) },
        )
    }

    /** Heaviest weight lifted for at least N reps, N = 1…12 (stats.ts repPRs). */
    private fun repPRs(pts: List<LiftPoint>): List<RepPR> = (1..12).mapNotNull { n ->
        var best: RepPR? = null
        for (p in pts) for (s in p.sets) if (s.reps >= n && s.weight > 0 && (best == null || s.weight > best.weight)) best = RepPR(n, s.weight, p.date)
        best
    }

    private fun summary(x: W) = WorkoutSummary(
        id = x.w.id, date = x.date.toString(), start = x.w.startTime, title = x.w.title, durationMin = Math.round(x.minutes).toDouble(),
        volume = Math.round(x.w.exercises.sumOf { e -> e.sets.filter { !it.isWarmup }.sumOf { (it.weightKg ?: 0.0) * toUnit * (it.reps ?: 0) } }).toDouble(),
        sets = x.w.exercises.sumOf { e -> e.sets.count { !it.isWarmup } }, exercises = x.w.exercises.map { it.title }, programDay = null,
        hasNotes = !x.w.description?.replace(Regex("\\[ht:[^\\]]+\\]"), "")?.trim().isNullOrEmpty() || x.w.exercises.any { !it.notes.isNullOrBlank() },
    )

    fun history(cursor: String?, limit: Int, q: String?): AppHistory {
        val t = q?.trim()?.lowercase()
        val all = if (t.isNullOrEmpty()) ws else ws.filter { x -> x.w.title.lowercase().contains(t) || x.w.exercises.any { it.title.lowercase().contains(t) } }
        val start = if (cursor != null) all.indexOfFirst { it.w.id == cursor } + 1 else 0
        val page = all.drop(start).take(limit)
        return AppHistory(page.map(::summary), if (start + limit < all.size) page.lastOrNull()?.w?.id else null, all.size)
    }

    fun workout(id: String): AppWorkout? {
        val x = ws.firstOrNull { it.w.id == id } ?: return null
        return AppWorkout(
            summary = summary(x), unit = unit,
            note = (x.w.description ?: "").replace(Regex("\\s*\\[ht:[^\\]]+\\]\\s*"), "\n").trim(),
            exercises = x.w.exercises.map { e ->
                WorkoutExercise(
                    title = e.title, lift = DirectAggregator.liftFor(e.title)?.key, note = e.notes,
                    sets = e.sets.map { s ->
                        val wt = s.weightKg?.let { r1(it * toUnit) }
                        val reps = s.reps
                        WorkoutSet(
                            type = s.type ?: "normal", weight = wt, reps = reps?.toDouble(), rpe = s.rpe, distanceM = s.distanceMeters, durationSec = s.durationSeconds?.toDouble(),
                            e1rm = if (wt != null && wt > 0 && reps != null && reps > 0 && !s.isWarmup) r1(if (reps == 1) wt else wt * (1 + reps / 30.0)) else null,
                        )
                    },
                )
            },
        )
    }

    /** Direct-mode GYM picker: every exercise you've logged in Hevy (title + template id), most used first. */
    fun catalog(): List<PickItem> {
        val counts = LinkedHashMap<String, Pair<String, Int>>()
        for (x in ws) for (e in x.w.exercises) {
            val id = e.exerciseTemplateId ?: continue
            val cur = counts[id]
            counts[id] = (cur?.first ?: e.title) to ((cur?.second ?: 0) + 1)
        }
        return counts.entries.sortedByDescending { it.value.second }.map { (id, v) ->
            val lift = DirectAggregator.liftFor(v.first)
            PickItem(lift = lift?.key ?: "custom", name = v.first, sub = "${v.second}× logged", kind = LiftLibrary[lift?.key]?.kind ?: "machine", title = v.first, templateId = id)
        }
    }
}
