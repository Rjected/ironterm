package dev.ironterm

import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotJson
import dev.ironterm.data.WeekDay
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate

class SnapshotParseTest {
    private val s = TestData.fixture

    @Test fun topLevel() {
        assertEquals(1, s.v)
        assertEquals("2026-10-15", s.today)
        assertEquals("lb", s.unit)
        assertEquals("America/New_York", s.tz)
        assertTrue(s.demo)
        assertEquals(Snapshot.SOURCE_SERVER, s.origin)
    }

    @Test fun serverSaysWhereWorkoutsComeFrom() {
        val local = SnapshotJson.parse("""{"v":1,"source":"local"}""")
        assertTrue(local.isLocal)
        assertFalse(local.isDirect)
        assertEquals(Snapshot.SOURCE_SERVER, local.origin)
        assertFalse(SnapshotJson.parse("""{"v":1,"source":"hevy"}""").isLocal)
        assertFalse("older servers send no source", s.isLocal)
        // the phone's own tag survives the disk cache, and caches from before it moved still read as Direct
        assertTrue(SnapshotJson.parse(SnapshotJson.encode(s.copy(origin = Snapshot.SOURCE_DIRECT))).isDirect)
        assertTrue(SnapshotJson.parse("""{"v":1,"source":"direct"}""").isDirect)
    }

    @Test fun graphIs53MondayWeeksEndingToday() {
        val days = s.graph.days
        assertEquals(LocalDate.parse(s.graph.start), LocalDate.parse(days.first().date))
        assertEquals(DayOfWeek.MONDAY, LocalDate.parse(days.first().date).dayOfWeek)
        assertEquals(s.today, days.last().date)
        assertEquals(52 * 7 + 4, days.size) // Thursday: 52 full weeks + Mon..Thu
        assertTrue(days.all { it.level in 0..4 })
        assertTrue(days.any { it.level == 4 })
        assertTrue(days.filter { it.level == 0 }.all { it.value == 0.0 })
    }

    @Test fun weekStreakTotalsLast() {
        assertEquals(1, s.streak.current); assertEquals(14, s.streak.best)
        assertEquals(4, s.week.target); assertEquals(3, s.week.done)
        assertEquals(listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"), s.week.days.map { it.dow })
        assertEquals(WeekDay.STATUS_PLANNED, s.week.days[4].status)
        assertEquals(178, s.totals.sessions52)
        assertEquals(52756.0, s.totals.vol7, 0.0)
        val last = s.last!!
        assertEquals("GZCLP · B1", last.title)
        assertEquals(16, last.sets)
    }

    @Test fun programNextSession() {
        val p = s.program!!
        assertEquals("GZCLP 4-Day", p.name)
        val n = p.next!!
        assertEquals("TOMORROW", n.whenLabel) // "when" is a Kotlin keyword
        assertEquals("Day A2 · Bench", n.dayName)
        assertFalse(n.reentry)
        assertNull(n.weekName)
        assertEquals(3, n.exercises.size)
        val bench = n.exercises[0]
        assertEquals("BENCH", bench.short); assertEquals("T1", bench.tier)
        assertEquals("9×1 @ 325, 1×1+ @ 325", bench.summary)
        assertEquals(325.0, bench.top, 0.0)
        assertEquals(10, bench.sets.size)
        assertTrue(bench.sets.last().amrap)
    }

    @Test fun liftsAndRecovery() {
        assertEquals(listOf("squat", "bench", "deadlift", "ohp"), s.lifts.take(4).map { it.key })
        assertTrue(s.lifts.size <= 8)
        assertTrue(s.lifts.all { it.spark.size == 12 })
        assertEquals(589.2, s.lifts[0].e1rm, 0.0)
        assertEquals(-1.0, s.lifts[2].delta28!!, 0.0)
        val r = s.recovery!!
        assertEquals(0.76, r.overall, 0.0)
        assertEquals("frontDelt", r.muscles.first().id)
        assertEquals(r.muscles.sortedBy { it.readiness }.map { it.id }, r.muscles.map { it.id })
    }

    @Test fun roundTripKeepsEverything() {
        val again = SnapshotJson.parse(SnapshotJson.encode(s))
        assertEquals(s, again)
    }

    @Test fun toleratesUnknownFieldsNullsAndMissingSections() {
        val json = """{"v":1,"today":"2026-01-01","unit":"kg","futureField":{"x":1},
            "graph":{"start":"2025-12-29","days":[{"date":"2025-12-29","level":2,"value":10,"extra":true}]},
            "program":null,"recovery":null,"last":null,"lifts":[{"key":"squat","e1rm":100,"delta28":null,"spark":[]}]}"""
        val p = SnapshotJson.parse(json)
        assertNull(p.program); assertNull(p.recovery); assertNull(p.last)
        assertEquals(1, p.graph.days.size)
        assertNull(p.lifts[0].delta28)
        assertNotNull(p.week)
        assertEquals(0, p.week.days.size)
    }
}
