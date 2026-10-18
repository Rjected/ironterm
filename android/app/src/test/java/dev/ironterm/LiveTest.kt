package dev.ironterm

import dev.ironterm.gym.HevyWorkoutBody
import dev.ironterm.gym.Live
import dev.ironterm.gym.LiveSession
import dev.ironterm.gym.LiveSet
import dev.ironterm.gym.PlannedSession
import dev.ironterm.gym.SetType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneOffset

/**
 * The Kotlin port of web/shared/live.ts replayed against golden output of the real TS functions
 * (src/test/resources/live_golden.json, generated with esbuild + node from live.ts). Every step's
 * session, cursor and progress must match, ids aside (they're random on both sides).
 */
class LiveTest {
    private val golden: JsonObject by lazy {
        Json.parseToJsonElement(LiveTest::class.java.classLoader!!.getResource("live_golden.json")!!.readText()).jsonObject
    }

    /** Drop ids and nulls (TS omits undefined), compare numbers as doubles, map restFor to an index. */
    private fun norm(e: JsonElement, exIds: List<String> = emptyList()): JsonElement = when (e) {
        is JsonObject -> JsonObject(e.filter { (k, v) -> k != "id" && v !is JsonNull }.mapValues { (k, v) ->
            if (k == "restFor" && v is JsonPrimitive) JsonPrimitive(exIds.indexOf(v.content)) else norm(v, exIds)
        }.filterValues { it !is JsonNull })
        is JsonArray -> JsonArray(e.map { norm(it, exIds) })
        is JsonPrimitive -> if (!e.isString && e.booleanOrNull == null) JsonPrimitive(e.doubleOrNull) else e
        else -> e
    }

    private fun sessionJson(s: LiveSession) = Json.parseToJsonElement(Live.encode(s))

    private fun ids(e: JsonElement) = e.jsonObject["exercises"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }

    private fun assertSame(name: String, expected: JsonElement, actual: LiveSession) {
        val a = sessionJson(actual)
        assertEquals(name, norm(expected, ids(expected)), norm(a, ids(a)))
    }

    @Test fun goldenCasesMatchTypeScript() {
        val cases = golden["cases"]!!.jsonArray
        assertTrue(cases.size >= 4)
        for (c in cases) {
            val name = c.jsonObject["name"]!!.jsonPrimitive.content
            var s = Live.decode(c.jsonObject["start"].toString())
            for ((i, step) in c.jsonObject["steps"]!!.jsonArray.withIndex()) {
                val o = step.jsonObject["op"]!!.jsonObject
                val exIdx = o["ex"]?.jsonPrimitive?.int
                val exId = exIdx?.let { s.exercises[it].id }.orEmpty()
                s = when (o["op"]!!.jsonPrimitive.content) {
                    "complete" -> Live.completeSet(s, exId, o["set"]!!.jsonPrimitive.int, Live.parseMs(o["now"]!!.jsonPrimitive.content)!!)
                    "addSet" -> Live.addSet(s, exId)
                    "update" -> {
                        val patch = o["patch"]!!.jsonObject
                        Live.updateSet(s, exId, o["set"]!!.jsonPrimitive.int) { x -> applyPatch(x, patch) }
                    }
                    "addExercise" -> {
                        val opts = o["opts"]?.jsonObject
                        Live.addExercise(
                            s, o["lift"]!!.jsonPrimitive.content,
                            cardio = opts?.get("cardio")?.jsonPrimitive?.booleanOrNull == true,
                            title = opts?.get("title")?.jsonPrimitive?.content,
                            templateId = opts?.get("templateId")?.jsonPrimitive?.content,
                        )
                    }
                    else -> error("op")
                }
                val label = "$name step $i ${o["op"]}"
                assertSame(label, step.jsonObject["session"]!!, s)
                val cur = step.jsonObject["current"]!!
                val kc = Live.current(s)
                if (cur is JsonNull) assertNull(label, kc)
                else {
                    assertEquals(label, cur.jsonObject["ex"]!!.jsonPrimitive.int, s.exercises.indexOfFirst { it.id == kc!!.exId })
                    assertEquals(label, cur.jsonObject["set"]!!.jsonPrimitive.int, kc!!.set)
                }
                val p = step.jsonObject["progress"]!!.jsonObject
                assertEquals(label, p["done"]!!.jsonPrimitive.int, Live.progress(s).done)
                assertEquals(label, p["total"]!!.jsonPrimitive.int, Live.progress(s).total)
            }
            // The Hevy body (Direct mode posts it) matches toHevyWorkout too.
            val body = Live.toHevyWorkout(s, { ex -> ex.templateId ?: "tpl-${ex.lift}" }, "2026-01-02T16:00:00.000Z")
            val got = Json.parseToJsonElement(Live.json.encodeToString(HevyWorkoutBody.serializer(), body))
            assertEquals("$name hevy body", norm(c.jsonObject["hevy"]!!), norm(got))
        }
    }

    private fun applyPatch(x: LiveSet, p: JsonObject): LiveSet {
        var r = x
        for ((k, v) in p) r = when (k) {
            "weight" -> r.copy(weight = v.jsonPrimitive.doubleOrNull)
            "reps" -> r.copy(reps = v.jsonPrimitive.doubleOrNull?.toInt())
            "rpe" -> r.copy(rpe = v.jsonPrimitive.doubleOrNull)
            "type" -> r.copy(type = v.jsonPrimitive.content)
            "distanceM" -> r.copy(distanceM = v.jsonPrimitive.doubleOrNull)
            "durationSec" -> r.copy(durationSec = v.jsonPrimitive.doubleOrNull)
            else -> error("patch $k")
        }
        return r
    }

    @Test fun warmupsMatchTypeScript() {
        for (w in golden["warmups"]!!.jsonArray) {
            val o = w.jsonObject
            val unit = o["unit"]!!.jsonPrimitive.content
            val top = o["top"]!!.jsonPrimitive.doubleOrNull!!
            val expected = o["sets"]!!.jsonArray.map { it.jsonObject["weight"]!!.jsonPrimitive.doubleOrNull!! to it.jsonObject["reps"]!!.jsonPrimitive.int }
            assertEquals("$unit $top", expected, Live.warmups(top, unit).map { it.weight!! to it.reps!! })
        }
    }

    @Test fun emptySessionTitlesFollowTheLocalHour() {
        for (t in golden["titles"]!!.jsonArray) {
            val now = t.jsonObject["now"]!!.jsonPrimitive.content
            assertEquals(now, t.jsonObject["title"]!!.jsonPrimitive.content, Live.emptySession("kg", now, ZoneOffset.UTC).title)
        }
    }

    @Test fun sessionFromPlanMatchesTypeScript() {
        for (p in golden["plans"]!!.jsonArray) {
            val o = p.jsonObject
            val plan = Live.json.decodeFromString(PlannedSession.serializer(), o["plan"].toString())
            val s = Live.sessionFromPlan(plan, o["unit"]!!.jsonPrimitive.content, o["programName"]!!.jsonPrimitive.content, "2026-01-02T15:00:00.000Z")
            assertSame("plan", o["session"]!!, s)
        }
    }

    // ── the behaviours the brief calls out, spelled out ──

    private fun session(vararg sets: LiveSet, rest: Int = 120, lift: String = "squat", unit: String = "lb"): LiveSession {
        val s = Live.addExercise(Live.emptySession(unit, "2026-01-02T15:00:00.000Z"), lift)
        return Live.mapEx(s, s.exercises[0].id) { it.copy(restSeconds = rest, sets = sets.toList()) }
    }

    @Test fun backOffsAreKeyedToTheTopSet() {
        val t = dev.ironterm.gym.LiveTarget(weight = 0.0, reps = 5, ofTop = 0.8)
        var s = session(
            LiveSet(SetType.NORMAL, 300.0, 3),
            LiveSet(SetType.NORMAL, null, 5, target = t),
            LiveSet(SetType.NORMAL, 250.0, 5, target = t), // typed by hand: kept
        )
        s = Live.completeSet(s, s.exercises[0].id, 0, 0)
        // e1RM 300 × 1.1 = 330 → 80% = 264 → nearest 5 lb = 265
        assertEquals(265.0, s.exercises[0].sets[1].weight!!, 1e-9)
        assertEquals(250.0, s.exercises[0].sets[2].weight!!, 1e-9)
        // dumbbells step 2 kg: 30 × (1 + 8/30) × 0.7 = 26.6 → 26
        var d = session(LiveSet(SetType.NORMAL, 30.0, 8), LiveSet(SetType.NORMAL, null, 10, target = t.copy(ofTop = 0.7)), lift = "dbBench", unit = "kg")
        d = Live.completeSet(d, d.exercises[0].id, 0, 0)
        assertEquals(26.0, d.exercises[0].sets[1].weight!!, 1e-9)
    }

    @Test fun warmupRestIsCappedAt60s() {
        var s = session(LiveSet(SetType.WARMUP, 45.0, 10), LiveSet(SetType.NORMAL, 225.0, 5), rest = 180)
        s = Live.completeSet(s, s.exercises[0].id, 0, 1_000_000)
        assertEquals(Live.iso(1_060_000), s.restEndsAt)
        s = Live.completeSet(s, s.exercises[0].id, 1, 2_000_000)
        assertNull("last set of the last exercise: no rest", s.restEndsAt)
        var r = session(LiveSet(SetType.WARMUP, 45.0, 10), LiveSet(SetType.NORMAL, 225.0, 5), rest = 45)
        r = Live.completeSet(r, r.exercises[0].id, 0, 0)
        assertEquals("rest shorter than the cap stays", Live.iso(45_000), r.restEndsAt)
    }

    @Test fun restControls() {
        val s = session(LiveSet(SetType.NORMAL, 1.0, 1)).copy(restEndsAt = Live.iso(100_000))
        assertEquals(Live.iso(85_000), Live.restMinus(s).restEndsAt)
        assertEquals(Live.iso(130_000), Live.restPlus(s, 50_000).restEndsAt)
        assertEquals("+30 after it ran out starts from now", Live.iso(230_000), Live.restPlus(s, 200_000).restEndsAt)
        assertNull(Live.skipRest(s).restEndsAt)
        assertEquals(-100.0, Live.restLeft(s, 200_000)!!, 1e-9)
    }

    @Test fun platesAndSteps() {
        assertEquals(listOf(45.0, 45.0, 35.0, 2.5), Live.plates(300.0, "lb"))
        assertEquals(listOf(45.0, 45.0), Live.plates(225.0, "lb"))
        assertEquals(listOf(25.0, 25.0, 1.25), Live.plates(122.5, "kg"))
        assertTrue(Live.plates(45.0, "lb").isEmpty())
        assertEquals(5.0, Live.loadStep("barbell", "lb"), 0.0)
        assertEquals(2.0, Live.loadStep("dumbbell", "kg"), 0.0)
        assertEquals(2.5, Live.loadStep("machine", "lb"), 0.0)
    }

    @Test fun summaryCountsOnlyDoneWorkSets() {
        var s = session(LiveSet(SetType.WARMUP, 45.0, 10), LiveSet(SetType.NORMAL, 200.0, 5), LiveSet(SetType.NORMAL, 200.0, 5))
        s = Live.completeSet(s, s.exercises[0].id, 0, 0)
        s = Live.completeSet(s, s.exercises[0].id, 1, 0)
        val sum = Live.summary(s, Live.parseMs(s.startedAt)!! + 3_600_000)
        assertEquals(1, sum.sets)
        assertEquals(1000.0, sum.volume, 0.0)
        assertEquals(3600L, sum.durationSec)
    }

    @Test fun sessionJsonRoundTripsAndToleratesWebInput() {
        val web = """{"id":"x","startedAt":"2026-01-02T15:00:00.000Z","unit":"kg","title":"T","exercises":[{"id":"e","lift":"bench","restSeconds":90,"sets":[{"type":"normal","weight":60,"reps":8.0,"done":false,"extra":1}]}],"future":true}"""
        val s = Live.decode(web)
        assertEquals(8, s.exercises[0].sets[0].reps)
        assertEquals(s, Live.decode(Live.encode(s)))
    }
}
