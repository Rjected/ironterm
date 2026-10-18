package dev.ironterm

import dev.ironterm.TestData.set
import dev.ironterm.TestData.workout
import dev.ironterm.data.Snapshot
import dev.ironterm.data.WeekDay
import dev.ironterm.data.direct.DirectAggregator
import dev.ironterm.data.direct.DirectAggregator.epley
import dev.ironterm.data.direct.DirectAggregator.levels
import dev.ironterm.data.direct.DirectAggregator.weekStreak
import dev.ironterm.data.hevy.Exercise
import dev.ironterm.data.hevy.ExerciseSet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate

class DirectAggregatorTest {
    private val today = LocalDate.parse("2026-10-15") // Thursday

    @Test fun quartileLevels() {
        assertEquals(listOf(0, 0), levels(listOf(0.0, 0.0)))
        // 8 non-zero values → quartile cut-offs at sorted[2]=3, sorted[4]=5, sorted[6]=7
        val v = listOf(0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0)
        assertEquals(listOf(0, 1, 1, 1, 2, 2, 3, 3, 4), levels(v))
        assertEquals(listOf(1, 0, 1), levels(listOf(5.0, 0.0, 5.0))) // all equal → lightest
    }

    @Test fun epleyE1rm() {
        assertEquals(116.667, epley(100.0, 5)!!, 0.001)
        assertEquals(103.333, epley(100.0, 1)!!, 0.001)
        assertNull(epley(0.0, 5))
        assertNull(epley(100.0, 0))
        assertNull(epley(100.0, 20)) // too many reps to estimate
    }

    @Test fun streakCountsFullWeeksAndSkipsUnfinishedCurrentWeek() {
        val mon = today.minusDays(3) // 2026-10-12
        fun wk(weeksAgo: Long, n: Int) = (0 until n).map { mon.minusWeeks(weeksAgo).plusDays(it.toLong()) }
        val days = (wk(1, 3) + wk(2, 3) + wk(3, 3) + wk(5, 4) + wk(6, 4) + wk(7, 4) + wk(8, 4) + wk(0, 1)).toSet()
        val s = weekStreak(days, today, 3)
        assertEquals(3, s.current) // this week has 1 (not over), last 3 weeks ok, week 4 empty
        assertEquals(4, s.best)
        assertEquals(4, weekStreak(days + wk(0, 3), today, 3).current) // this week counts once it hits target
        assertEquals(0, weekStreak(emptySet(), today, 3).current)
    }

    @Test fun buildsSnapshotFromWorkouts() {
        val ws = listOf(
            workout("a", today, "Upper", Exercise("Bench Press (Barbell)", sets = listOf(set(40.0, 10, "warmup"), set(100.0, 5), set(100.0, 5)))),
            workout("b", today.minusDays(2), "Lower", Exercise("Squat (Barbell)", sets = listOf(set(140.0, 3)))),
            workout("c", today.minusDays(40), "Lower", Exercise("Squat (Barbell)", sets = listOf(set(120.0, 5)))),
            workout("d", today.minusDays(3), "Cardio", Exercise("Running", sets = listOf(ExerciseSet(type = "normal", distanceMeters = 5000.0)))),
        )
        val s = DirectAggregator.build(ws, today, TestData.zone, "kg", weeklyTarget = 3)
        assertEquals(Snapshot.SOURCE_DIRECT, s.source)
        assertNull(s.program); assertNull(s.recovery)
        // graph shape matches the server: 53 Monday weeks ending today
        assertEquals(DayOfWeek.MONDAY, LocalDate.parse(s.graph.start).dayOfWeek)
        assertEquals(52 * 7 + 4, s.graph.days.size)
        assertEquals(today.toString(), s.graph.days.last().date)
        val byDate = s.graph.days.associateBy { it.date }
        assertEquals(1000.0, byDate[today.toString()]!!.value, 0.0) // warm-up excluded
        assertEquals(1.0, byDate[today.minusDays(3).toString()]!!.value, 0.0) // cardio still counts
        assertTrue(byDate[today.minusDays(3).toString()]!!.level >= 1)
        assertEquals(0, byDate[today.minusDays(1).toString()]!!.level)
        // this week: Mon (cardio) Tue (squat) Thu (today) done
        assertEquals(listOf("done", "done", "rest", "done", "rest", "rest", "rest"), s.week.days.map { it.status })
        assertEquals(3, s.week.done)
        assertEquals(1, s.streak.current)
        // totals + last
        assertEquals(4, s.totals.sessions52)
        assertEquals(1000.0 + 420.0, s.totals.vol7, 0.0) // cardio adds no volume
        assertEquals("Upper", s.last!!.title)
        assertEquals(2, s.last!!.sets) // working sets only
        // lifts: big four first; squat e1rm = best of last 28 days = 140×1.1 = 154
        assertEquals(listOf("squat", "bench"), s.lifts.map { it.key })
        val sq = s.lifts[0]
        assertEquals(154.0, sq.e1rm, 0.05)
        assertEquals(154.0 - 140.0, sq.delta28!!, 0.05) // vs 120×(1+5/30)=140 at day -40
        assertEquals(12, sq.spark.size)
        assertNull(s.lifts[1].delta28) // bench has no history before 28 days
    }

    @Test fun convertsToPoundsAndTodayStatus() {
        val ws = listOf(workout("a", today.minusDays(1), "Upper", Exercise("Bench Press (Barbell)", sets = listOf(set(100.0, 1)))))
        val s = DirectAggregator.build(ws, today, TestData.zone, "lb")
        assertEquals("lb", s.unit)
        assertEquals(100 * DirectAggregator.KG_TO_LB * (1 + 1 / 30.0), s.lifts[0].e1rm, 0.1)
        assertEquals(WeekDay.STATUS_TODAY, s.week.days[3].status)
    }

    @Test fun localDateUsesTimeZone() {
        // 01:00 UTC on Oct 15 is still Oct 14 in New York
        val w = dev.ironterm.data.hevy.Workout("late", "Late", "2026-10-15T01:00:00Z", "2026-10-15T02:00:00Z",
            exercises = listOf(Exercise("Deadlift (Barbell)", sets = listOf(set(200.0, 1)))))
        val s = DirectAggregator.build(listOf(w), today, TestData.zone, "kg")
        assertEquals("2026-10-14", s.last!!.date)
        assertEquals(60.0, s.last!!.durationMin, 0.0)
    }

    @Test fun realisticHistory() {
        val s = DirectAggregator.build(TestData.history(today), today, TestData.zone, "kg", 3)
        assertEquals(listOf("squat", "bench", "deadlift", "ohp"), s.lifts.take(4).map { it.key })
        assertTrue(s.lifts.all { it.spark.size == 12 })
        assertTrue(s.lifts.first().spark.zipWithNext().all { (a, b) -> b >= a - 0.01 }) // progressing
        assertTrue(s.streak.best >= 2)
        assertTrue(s.graph.days.count { it.level > 0 } > 100)
        assertNotNull(s.lifts.first().delta28)
        assertTrue((1..4).all { l -> s.graph.days.any { it.level == l } })
    }
}
