package dev.ironterm

import dev.ironterm.data.app.AppGym
import dev.ironterm.data.app.AppJson
import dev.ironterm.data.app.SkipResult
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveExercise
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.PlannedSession
import dev.ironterm.gym.SetType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Rep totals and skips, mirroring web/shared/totals-skips.test.ts. The plan is the server's
 * 5/3/1 Building the Monolith day 1 (src/test/resources/app/plan-monolith-day0.json, from
 * derive(...).plan(0) of the TS engine).
 */
class LiveTotalsTest {
    private fun monolithDay0(): LiveSession {
        val text = LiveTotalsTest::class.java.classLoader!!.getResource("app/plan-monolith-day0.json")!!.readText()
        val plan = Live.json.decodeFromString(PlannedSession.serializer(), text)
        return Live.sessionFromPlan(plan, "lb", "Monolith", "2026-10-21T22:00:00.000Z")
    }

    private fun ex(s: LiveSession, lift: String): LiveExercise = s.exercises.first { it.lift == lift }
    private fun work(s: LiveSession, lift: String) = ex(s, lift).sets.withIndex().filter { it.value.type != SetType.WARMUP }

    /** do the next open set of [lift] for [reps] reps */
    private fun doSet(s: LiveSession, lift: String, reps: Int): LiveSession {
        val e = ex(s, lift)
        val i = e.sets.indexOfFirst { it.isOpen && it.type != SetType.WARMUP }
        check(i >= 0) { "no open set left on $lift" }
        return Live.completeSet(Live.setReps(s, e.id, i, reps), e.id, i)
    }

    /** Drop ids, nulls and `skipped: false` (TS writes it, Kotlin leaves it out: both mean not skipped); numbers as doubles. */
    private fun norm(e: JsonElement): JsonElement = when (e) {
        is JsonObject -> JsonObject(e.filter { (k, v) -> k != "id" && k != "restFor" && v !is JsonNull && !(k == "skipped" && v is JsonPrimitive && v.booleanOrNull == false) }.mapValues { norm(it.value) })
        is JsonArray -> JsonArray(e.map { norm(it) })
        is JsonPrimitive -> if (!e.isString && e.booleanOrNull == null) JsonPrimitive(e.doubleOrNull) else e
        else -> e
    }

    /** Scenarios replayed against the real TS functions (src/test/resources/totals_golden.json, generated from live.ts). */
    @Test fun goldenScenariosMatchTypeScript() {
        val golden = Json.parseToJsonElement(LiveTotalsTest::class.java.classLoader!!.getResource("totals_golden.json")!!.readText()).jsonObject
        val cases = golden["cases"]!!.jsonArray
        assertEquals(5, cases.size)
        for (c in cases) {
            val name = c.jsonObject["name"]!!.jsonPrimitive.content
            var s = Live.decode(c.jsonObject["start"].toString())
            for ((k, step) in c.jsonObject["steps"]!!.jsonArray.withIndex()) {
                val o = step.jsonObject["op"]!!.jsonObject
                val id = s.exercises[o["ex"]!!.jsonPrimitive.int].id
                val set = o["set"]?.jsonPrimitive?.int ?: -1
                val now = o["now"]?.jsonPrimitive?.content?.let { Live.parseMs(it)!! } ?: 0L
                s = when (o["op"]!!.jsonPrimitive.content) {
                    "do" -> Live.completeSet(Live.setReps(s, id, set, o["reps"]!!.jsonPrimitive.int), id, set, now)
                    "complete" -> Live.completeSet(s, id, set, now)
                    "reps" -> Live.setReps(s, id, set, o["reps"]!!.jsonPrimitive.int)
                    "skip" -> Live.skipSet(s, id, set, o["on"]!!.jsonPrimitive.boolean)
                    "skipExercise" -> Live.skipExercise(s, id)
                    "addSet" -> Live.addSet(s, id)
                    else -> error("op $o")
                }
                val label = "$name step $k $o"
                assertEquals(label, norm(step.jsonObject["session"]!!), norm(Json.parseToJsonElement(Live.encode(s))))
                val cur = step.jsonObject["current"]!!
                val kc = Live.current(s)
                if (cur is JsonNull) assertNull(label, kc) else {
                    assertEquals(label, cur.jsonObject["ex"]!!.jsonPrimitive.int, s.exercises.indexOfFirst { it.id == kc!!.exId })
                    assertEquals(label, cur.jsonObject["set"]!!.jsonPrimitive.int, kc!!.set)
                }
                val p = step.jsonObject["progress"]!!.jsonObject
                assertEquals(label, p["done"]!!.jsonPrimitive.int, Live.progress(s).done)
                assertEquals(label, p["total"]!!.jsonPrimitive.int, Live.progress(s).total)
            }
        }
    }

    @Test fun monolithAccessoriesPlanAsRepTotals() {
        val s = monolithDay0()
        assertEquals(100, ex(s, "chinUp").totalReps)
        assertEquals(100, ex(s, "dip").totalReps)
        assertEquals(200, ex(s, "dip").totalRepsMax)
        assertNull(ex(s, "squat").totalReps)
        assertEquals("0/100 reps", Live.countLabel(ex(s, "chinUp")))
        assertEquals("0/100–200 reps", Live.countLabel(ex(s, "dip")))
        assertEquals("100 reps to go · sets are added as you go", Live.totalLine(ex(s, "chinUp")))
        assertNull(Live.totalLine(ex(s, "squat")))
    }

    @Test fun setsOfFiveFollowYourPaceUntil100() {
        var s = monolithDay0()
        s = doSet(s, "chinUp", 5)
        // the four planned sets you haven't touched follow your pace
        assertTrue(work(s, "chinUp").filter { !it.value.done }.all { it.value.reps == 5 && it.value.auto == true })
        repeat(19) { s = doSet(s, "chinUp", 5) }
        val c = ex(s, "chinUp")
        assertEquals(100, Live.repsDone(c))
        assertEquals(20, work(s, "chinUp").count { it.value.done })
        // nothing left open, and the session moves on to the next exercise
        assertFalse(c.sets.any { it.isOpen })
        assertNotEquals(c.id, Live.current(s)?.exId)
        assertEquals("100/100 reps", Live.countLabel(c))
        assertEquals("100 reps: total reached", Live.totalLine(c))
        assertTrue(Live.isComplete(c))
    }

    @Test fun theLastSetIsOnlyWhatsLeftAndAnEarlyFinishSkipsLeftovers() {
        var s = monolithDay0()
        repeat(4) { s = doSet(s, "chinUp", 23) } // 92
        assertEquals(listOf(8), work(s, "chinUp").filter { it.value.isOpen }.map { it.value.reps })
        assertEquals("8 reps to go · sets are added as you go", Live.totalLine(ex(s, "chinUp")))
        s = doSet(s, "chinUp", 8)
        assertEquals(100, Live.repsDone(ex(s, "chinUp")))
        var t = monolithDay0()
        repeat(4) { t = doSet(t, "chinUp", 25) }
        assertEquals(1, work(t, "chinUp").count { it.value.isSkipped })
        assertEquals(Live.progress(monolithDay0()).total - 1, Live.progress(t).total)
    }

    @Test fun anAddedSetCopiesTheLoadAndAClearedTarget() {
        var s = monolithDay0()
        val before = ex(s, "chinUp").sets.size
        repeat(5) { s = doSet(s, "chinUp", 10) } // 50 done, nothing planned left
        val sets = ex(s, "chinUp").sets
        // one set is added per set done while the planned ones fall short: what is open now adds up to what is left
        assertEquals(before + 5, sets.size)
        assertEquals(50, sets.filter { it.isOpen }.sumOf { it.reps ?: 0 })
        val added = sets.last()
        assertEquals(10, added.reps)
        assertEquals(true, added.auto)
        assertEquals(10, added.target?.reps)
        assertNull(added.target?.repsMax)
        assertFalse(added.target!!.amrap)
    }

    @Test fun aSetYouEditedKeepsItsReps() {
        var s = monolithDay0()
        val e = ex(s, "chinUp")
        val planned = work(s, "chinUp")
        s = Live.setReps(s, e.id, planned[2].index, 12)
        s = doSet(s, "chinUp", 6)
        assertEquals(12, ex(s, "chinUp").sets[planned[2].index].reps)
        assertEquals(6, ex(s, "chinUp").sets[planned[1].index].reps)
    }

    @Test fun editingRepsStopsPacing() {
        var s = monolithDay0()
        s = doSet(s, "chinUp", 5)
        val e = ex(s, "chinUp")
        val i = e.sets.indexOfFirst { it.isOpen }
        assertEquals(true, e.sets[i].auto)
        s = Live.updateSet(s, e.id, i) { it.copy(reps = 7) }
        assertNull("reps you change are yours", ex(s, "chinUp").sets[i].auto)
        s = Live.updateSet(s, e.id, i) { it.copy(weight = 10.0) }
        assertEquals(7, ex(s, "chinUp").sets[i].reps)
    }

    @Test fun skippedSetsArentCurrentCountedOrSavedAndCanComeBack() {
        var s = monolithDay0()
        val e = ex(s, "squat")
        val first = e.sets.indexOfFirst { !it.done }
        s = Live.skipSet(s, e.id, first)
        assertNotEquals(dev.ironterm.gym.Cursor(e.id, first), Live.current(s))
        val before = Live.progress(monolithDay0())
        assertEquals(if (e.sets[first].type == SetType.WARMUP) before.total else before.total - 1, Live.progress(s).total)
        s = Live.completeSet(s, e.id, first + 1)
        val body = Live.toHevyWorkout(s, { "t" })
        assertEquals(1, body.workout.exercises[0].sets.size)
        s = Live.skipSet(s, e.id, first, false)
        assertEquals(dev.ironterm.gym.Cursor(e.id, first), Live.current(s))
        // doing a skipped set un-skips it
        s = Live.skipSet(s, e.id, first)
        s = Live.completeSet(s, e.id, first)
        assertFalse(ex(s, "squat").sets[first].isSkipped)
        assertTrue(ex(s, "squat").sets[first].done)
    }

    @Test fun skipTheRestOfAnExerciseKeepsDoneSets() {
        var s = monolithDay0()
        val e = ex(s, "squat")
        s = Live.completeSet(s, e.id, 0)
        s = Live.skipExercise(s, e.id)
        assertTrue(ex(s, "squat").sets[0].done)
        assertTrue(ex(s, "squat").sets.drop(1).all { it.isSkipped && !it.done })
        assertNotEquals(e.id, Live.current(s)?.exId)
        // header: sets done / sets not skipped (like the web, what you did counts as complete)
        assertEquals("1/1", Live.countLabel(ex(s, "squat")))
        assertFalse(Live.isSkippedOut(ex(s, "squat")))
        // nothing done at all: flagged as skipped
        val o = ex(s, "ohp")
        s = Live.skipExercise(s, o.id)
        assertEquals("0/0 · skipped", Live.countLabel(ex(s, "ohp")))
        assertTrue(Live.isSkippedOut(ex(s, "ohp")))
        // undoing the done set makes it the one to do again
        s = Live.undoSet(s, e.id, 0)
        assertEquals("0/1", Live.countLabel(ex(s, "squat")))
        assertEquals(dev.ironterm.gym.Cursor(e.id, 0), Live.current(s))
    }

    @Test fun headerLabelsWithSkips() {
        var s = monolithDay0()
        val c = ex(s, "chinUp")
        s = doSet(s, "chinUp", 10)
        s = Live.skipExercise(s, c.id)
        assertEquals("10/100 reps · skipped", Live.countLabel(ex(s, "chinUp")))
        assertEquals("skipped at 10 of 100 reps · + SET to keep going", Live.totalLine(ex(s, "chinUp")))
        // + SET brings an open set back (not skipped)
        s = Live.addSet(s, c.id)
        assertTrue(ex(s, "chinUp").sets.last().isOpen)
        assertEquals("10/100 reps", Live.countLabel(ex(s, "chinUp")))
        assertEquals("90 reps to go · sets are added as you go", Live.totalLine(ex(s, "chinUp")))
    }

    @Test fun skippedSetsDontKeepTheRestTimerGoing() {
        var s = monolithDay0()
        // skip every exercise but the first; its last open set ends the session: no rest
        s.exercises.drop(1).forEach { e -> s = Live.skipExercise(s, e.id) }
        val e = s.exercises[0]
        val open = e.sets.withIndex().filter { it.value.isOpen }
        open.dropLast(1).forEach { s = Live.completeSet(s, e.id, it.index, 0) }
        s = Live.skipSet(s, e.id, open.last().index)
        val last = open[open.size - 2].index
        s = Live.completeSet(Live.undoSet(s, e.id, last), e.id, last, 0)
        assertNull(s.restEndsAt)
        assertNull(Live.current(s))
    }

    @Test fun oldSessionsWithoutTheFieldsDecode() {
        val old = """{"id":"a","startedAt":"2026-01-02T15:00:00.000Z","unit":"lb","title":"x","exercises":[{"id":"e","lift":"squat","restSeconds":90,"sets":[{"type":"normal","weight":225,"reps":5,"done":false}]}]}"""
        val s = Live.decode(old)
        assertNull(s.exercises[0].totalReps)
        assertNull(s.exercises[0].sets[0].skipped)
        assertTrue(s.exercises[0].sets[0].isOpen)
        // and a session that has them round-trips; unset ones aren't written
        val enc = Live.encode(s)
        assertFalse(enc.contains("skipped") || enc.contains("auto") || enc.contains("totalReps"))
        val t = Live.decode(Live.encode(Live.skipSet(Live.mapEx(s, "e") { it.copy(totalReps = 50, totalRepsMax = 75) }, "e", 0)))
        assertEquals(50, t.exercises[0].totalReps)
        assertEquals(75, t.exercises[0].totalRepsMax)
        assertEquals(true, t.exercises[0].sets[0].skipped)
    }

    @Test fun gymDocumentAndSkipAnswerParse() {
        val g = AppJson.json.decodeFromString(AppGym.serializer(), """{"unit":"lb","programName":"P","skipped":{"dayId":"D1","dayName":"D1 · Squat","date":"2026-10-21T12:00:00Z"},"days":[]}""")
        assertEquals("D1", g.skipped?.dayId)
        assertNull(AppJson.json.decodeFromString(AppGym.serializer(), """{"unit":"lb","skipped":null}""").skipped)
        val r = AppJson.json.decodeFromString(SkipResult.serializer(), """{"ok":true,"message":"Skipped D1","gym":{"unit":"lb","skipped":{"dayId":"D1","dayName":"x","date":"d"}},"program":{"program":{"name":"P"}}}""")
        assertEquals("Skipped D1", r.message)
        assertEquals("P", r.program?.program?.name)
        // the plan document carries totalReps for each exercise
        val plan = Json.parseToJsonElement(LiveTotalsTest::class.java.classLoader!!.getResource("app/plan-monolith-day0.json")!!.readText())
        assertTrue(plan.jsonObject["exercises"]!!.jsonArray.any { it.jsonObject["totalReps"] != null })
    }
}
