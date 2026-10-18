package dev.ironterm

import android.media.AudioManager
import dev.ironterm.data.direct.DirectAggregator
import dev.ironterm.data.direct.DirectApp
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSet
import dev.ironterm.gym.PickItem
import dev.ironterm.gym.RestAlert
import dev.ironterm.gym.RestTimerService
import dev.ironterm.gym.SetType
import dev.ironterm.ui.AppViewModel
import dev.ironterm.ui.Nav
import dev.ironterm.ui.Route
import dev.ironterm.ui.Tabs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** Direct mode documents built on the phone, plus small pure pieces of the gym UI. */
class DirectAppTest {
    private val today = LocalDate.parse("2026-10-15")
    private val workouts = TestData.history(today)
    private val app = DirectApp(workouts, "kg", TestData.zone, today)

    @Test fun liftsAndDetail() {
        val l = app.lifts().lifts
        assertEquals(listOf("squat", "bench", "deadlift", "ohp"), l.take(4).map { it.key })
        val sq = app.lift("squat")!!
        assertTrue(sq.points.size > 30)
        assertEquals(sq.points.maxOf { it.e1rm }, sq.best!!.e1rm, 0.0)
        assertEquals((1..5).toList(), sq.repPRs.map { it.reps }) // only sets of 5 in the fixture
        assertNull("no stall detector without the server", sq.stall)
        assertNull(app.lift("nope"))
    }

    @Test fun homeMatchesTheSnapshotsLifts() {
        val snap = DirectAggregator.build(workouts, today, TestData.zone, "kg", 3, Instant.parse("2026-10-15T16:00:00Z"))
        val h = app.home(snap)
        assertEquals(snap.lifts.first { it.key == "squat" }.e1rm, h.e1rm.first { it.lift == "squat" }.now, 0.0)
        assertEquals(26, h.weekly.size)
        assertEquals(4, h.trend.size)
        assertTrue(h.watch.isEmpty())
    }

    @Test fun historyPagesAndSearches() {
        val p1 = app.history(null, 10, null)
        assertEquals(workouts.size, p1.total)
        assertEquals(10, p1.workouts.size)
        assertEquals(workouts.first().id, p1.workouts.first().id) // newest first
        val p2 = app.history(p1.next, 10, null)
        assertEquals(workouts[10].id, p2.workouts.first().id)
        val q = app.history(null, 100, "deadlift")
        assertTrue(q.workouts.all { w -> w.exercises.any { it.contains("Deadlift") } })
        val w = app.workout(p1.workouts.first().id)!!
        assertTrue(w.exercises.isNotEmpty())
        assertTrue(w.exercises.flatMap { it.sets }.any { it.e1rm != null })
    }

    @Test fun catalogComesFromHistoryWithTemplateIds() {
        val c = app.catalog()
        // the fixture has no template ids, so nothing is offered (Hevy can't take an exercise without one)
        assertTrue(c.all { it.templateId != null })
        val withIds = workouts.map { w -> w.copy(exercises = w.exercises.map { it.copy(exerciseTemplateId = "tpl-" + it.title.hashCode()) }) }
        val c2 = DirectApp(withIds, "kg", TestData.zone, today).catalog()
        assertTrue(c2.size >= 8)
        assertEquals("squat", c2.first { it.name == "Squat (Barbell)" }.lift)
        assertEquals("legPress", c2.first { it.name == "Leg Press (Machine)" }.lift)
        assertEquals("tpl-" + "Squat (Barbell)".hashCode(), c2.first { it.name == "Squat (Barbell)" }.templateId)
    }

    @Test fun pickerFilter() {
        val all = PickItem.cardio() + PickItem.library()
        assertTrue(PickItem.filter(all, "squat").all { it.name.lowercase().contains("squat") || it.sub!!.lowercase().contains("squat") })
        assertEquals("Treadmill", PickItem.filter(all, "tread").single().name)
        assertEquals(60, PickItem.filter(all, "").size)
    }

    @Test fun notificationContent() {
        var s = Live.addExercise(Live.emptySession("lb", "2026-01-02T15:00:00.000Z"), "squat")
        val id = s.exercises[0].id
        s = Live.mapEx(s, id) { it.copy(sets = listOf(LiveSet(SetType.WARMUP, 45.0, 10), LiveSet(SetType.NORMAL, 225.0, 5), LiveSet(SetType.NORMAL, 225.0, 5))) }
        val t0 = Live.parseMs(s.startedAt)!!
        var c = RestTimerService.content(s, t0)
        assertEquals("Back Squat · Warmup · 45 lb × 10", c.text)
        assertTrue(!c.resting && !c.countDown && c.hasNext)
        s = Live.completeSet(s, id, 0, t0 + 1000)
        c = RestTimerService.content(s, t0 + 2000)
        assertTrue(c.resting && c.countDown)
        assertEquals("REST", c.title)
        assertEquals("Next: Back Squat · Set 1/2 · 225 lb × 5", c.text)
        assertEquals(Live.parseMs(s.restEndsAt), c.whenMs)
        c = RestTimerService.content(s, t0 + 120_000)
        assertTrue("rest over → GO", c.title.startsWith("GO"))
    }

    @Test fun restAlertRespectsSilentMode() {
        assertEquals(RestAlert.Output.SOUND_AND_VIBRATE, RestAlert.decide(AudioManager.RINGER_MODE_NORMAL, sound = true, vibrate = true))
        assertEquals(RestAlert.Output.VIBRATE, RestAlert.decide(AudioManager.RINGER_MODE_VIBRATE, sound = true, vibrate = true))
        assertEquals(RestAlert.Output.NONE, RestAlert.decide(AudioManager.RINGER_MODE_SILENT, sound = true, vibrate = true))
        assertEquals(RestAlert.Output.VIBRATE, RestAlert.decide(AudioManager.RINGER_MODE_NORMAL, sound = false, vibrate = true))
        assertEquals(RestAlert.Output.SOUND, RestAlert.decide(AudioManager.RINGER_MODE_NORMAL, sound = true, vibrate = false))
    }

    @Test fun prLinesFlagSetsAboveTheBest() {
        var s = Live.addExercise(Live.emptySession("kg", "2026-01-02T15:00:00.000Z"), "bench")
        val id = s.exercises[0].id
        s = Live.mapEx(s, id) { it.copy(sets = listOf(LiveSet(SetType.NORMAL, 100.0, 5, done = true), LiveSet(SetType.WARMUP, 140.0, 1, done = true))) }
        assertEquals(listOf("BENCH 100×5 · e1RM 116.7 (was 110)"), AppViewModel.prLines(s, mapOf("bench" to 110.0)))
        assertTrue(AppViewModel.prLines(s, mapOf("bench" to 120.0)).isEmpty())
        assertTrue("unknown lift: no claim", AppViewModel.prLines(s, emptyMap()).isEmpty())
    }

    @Test fun deepLinksLandOnTheRightScreen() {
        assertEquals(Nav(Tabs.GYM), Nav.resolve(Tabs.GYM))
        assertEquals(Nav(Tabs.HISTORY), Nav.resolve(Tabs.GRAPH))
        assertEquals(listOf(Route.Body), Nav.resolve(Tabs.BODY)!!.stack)
        assertEquals(Tabs.MORE, Nav.resolve(Tabs.SETUP)!!.tab)
        assertNull(Nav.resolve("web"))
        val n = Nav(Tabs.LIFTS).push(Route.Lift("squat"))
        assertEquals(Nav(Tabs.LIFTS), n.select(Tabs.LIFTS))
        assertEquals(Nav(Tabs.TODAY), n.select(Tabs.TODAY))
        assertNotNull(n.top)
    }
}
