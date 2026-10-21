package dev.ironterm

import dev.ironterm.data.AuthException
import dev.ironterm.data.app.ApiException
import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppBody
import dev.ironterm.data.app.AppCalendar
import dev.ironterm.data.app.AppGym
import dev.ironterm.data.app.AppHistory
import dev.ironterm.data.app.AppHome
import dev.ironterm.data.app.AppInsights
import dev.ironterm.data.app.AppJson
import dev.ironterm.data.app.AppLiftDetail
import dev.ironterm.data.app.AppLiftList
import dev.ironterm.data.app.AppProgram
import dev.ironterm.data.app.AppStats
import dev.ironterm.data.app.AppWorkout
import dev.ironterm.data.app.NotesEdit
import dev.ironterm.data.app.isRetryable
import dev.ironterm.gym.Live
import dev.ironterm.gym.SetType
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import dev.ironterm.testing.Dispatcher
import dev.ironterm.testing.MockResponse
import dev.ironterm.testing.MockWebServer
import dev.ironterm.testing.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.ServerSocket

object Fixtures {
    fun text(name: String): String = Fixtures::class.java.classLoader!!.getResource("app/$name.json")!!.readText()
    fun <T> parse(name: String, ser: KSerializer<T>): T = AppJson.json.decodeFromString(ser, text(name))
    val home by lazy { parse("home", AppHome.serializer()) }
    val gym by lazy { parse("gym", AppGym.serializer()) }
    val gymStart by lazy { Live.decode(text("gym-start")) }
    val lifts by lazy { parse("lifts", AppLiftList.serializer()) }
    val squat by lazy { parse("lift-squat", AppLiftDetail.serializer()) }
    val history by lazy { parse("history", AppHistory.serializer()) }
    val workout by lazy { parse("workout", AppWorkout.serializer()) }
    val calendar by lazy { parse("calendar", AppCalendar.serializer()) }
    val program by lazy { parse("program", AppProgram.serializer()) }
    val body by lazy { parse("body", AppBody.serializer()) }
    val bodyLoad by lazy { parse("body-load", AppBody.serializer()) }
    val insights by lazy { parse("insights", AppInsights.serializer()) }
    val stats by lazy { parse("stats", AppStats.serializer()) }
}

/** Every /api/app document parses from the server's fixtures (docs/api/app), field by field where it matters. */
class AppModelsTest {
    @Test fun home() {
        val h = Fixtures.home
        assertEquals("lb", h.snapshot.unit)
        assertTrue(h.snapshot.graph.days.size > 300)
        assertEquals("squat", h.e1rm.first().lift)
        assertEquals(589.2, h.e1rm.first().now, 0.0)
        assertEquals(4, h.trend.size)
        assertTrue(h.trend[0].points.size > 40)
        assertEquals(26, h.weekly.size)
        assertTrue(h.watch.any { it.status == "stalled" })
        assertTrue(h.recentPRs.isNotEmpty())
        assertNotNull(h.snapshot.program?.next)
    }

    @Test fun gym() {
        val g = Fixtures.gym
        assertEquals("GZCLP 4-Day", g.programName)
        assertNull(g.live)
        assertEquals(4, g.days.size)
        assertEquals("A1", g.days[0].dayId)
        assertEquals(106, g.catalog.size)
        assertEquals("barbell", g.catalog.first { it.key == "squat" }.kind)
        assertEquals("TOMORROW", g.next!!.whenLabel)
        assertEquals(10, g.next!!.exercises[0].sets.size)
        assertTrue(g.next!!.exercises[0].sets.last().amrap)
        // the full plan: offline starts build exactly what the server's sessionFromPlan builds
        val plan = g.plan!!
        assertEquals("A2", plan.dayId)
        assertEquals("a2-t1", plan.exercises[0].slotId)
        assertEquals(180, plan.exercises[0].restSeconds)
        val local = Live.sessionFromPlan(plan, g.unit, g.programName!!, Fixtures.gymStart.startedAt)
        val server = Fixtures.gymStart
        assertEquals(server.exercises.map { e -> e.copy(id = "") }, local.exercises.map { e -> e.copy(id = "") })
        assertEquals(server.copy(id = "", exercises = emptyList()), local.copy(id = "", exercises = emptyList()))
    }

    @Test fun gymStartIsALiveSession() {
        val s = Fixtures.gymStart
        assertEquals("A2", s.dayId)
        val t1 = s.exercises[0]
        assertEquals(180, t1.restSeconds)
        assertEquals(4, t1.sets.count { it.type == SetType.WARMUP })
        assertEquals(325.0, t1.sets[4].target!!.weight, 0.0)
        assertEquals(SetType.FAILURE, t1.sets.last().type)
        // and the Kotlin port drives it
        var x = s
        x = Live.completeSet(x, t1.id, 0, Live.parseMs(s.startedAt)!! + 60_000)
        assertEquals(Live.iso(Live.parseMs(s.startedAt)!! + 120_000), x.restEndsAt) // warmup: 60 s cap
        assertEquals(Live.current(x)!!.set, 1)
    }

    @Test fun lifts() {
        val l = Fixtures.lifts.lifts
        assertTrue(l.size >= 4)
        assertEquals("squat", l[0].key)
        assertEquals("progressing", l[0].status)
        assertEquals(16, l[0].spark.size)
        val d = Fixtures.squat
        assertEquals("lb", d.unit)
        assertEquals(589.2, d.e1rm!!, 0.0)
        assertEquals("2026-10-13", d.best!!.date)
        assertTrue(d.points.size > 50)
        assertTrue(d.points.last().sets.isNotEmpty())
        assertTrue(d.repPRs.map { it.reps }.all { it in 1..12 })
        assertTrue(d.prWall.isNotEmpty())
        assertEquals("progressing", d.stall!!.status)
        assertEquals("ok", d.projection!!.status)
        assertTrue(d.projection!!.band.size > 5)
        assertTrue(d.rpe.isNotEmpty())
    }

    @Test fun historyAndWorkout() {
        val h = Fixtures.history
        assertEquals(178, h.total)
        assertTrue(h.workouts.isNotEmpty())
        assertEquals(h.workouts.last().id, h.next)
        assertEquals("B1", h.workouts[0].programDay)
        val w = Fixtures.workout
        assertEquals("demo-2026-10-15", w.summary.id)
        assertEquals("warmup", w.exercises[0].sets[0].type)
        assertNull(w.exercises[0].sets[0].e1rm)
        assertTrue(w.exercises[0].sets.any { it.e1rm != null })
        assertEquals("B1", w.program!!.dayId)
        assertEquals("success", w.program!!.results[0].outcome)
    }

    @Test fun calendar() {
        val c = Fixtures.calendar
        assertEquals("2026-10", c.month)
        assertEquals(42, c.days.size)
        val statuses = setOf("done", "planned", "missed", "rest", "travel", "today")
        assertTrue(c.days.all { it.status in statuses })
        assertTrue(c.days.any { it.status == "done" && it.workouts.isNotEmpty() })
        assertTrue(c.days.any { it.planned != null })
        assertEquals(4, c.week.planned)
        assertEquals(java.time.DayOfWeek.MONDAY, java.time.LocalDate.parse(c.days[0].date).dayOfWeek)
    }

    @Test fun programSwaps() {
        // the fixtures predate swaps: an older server's document still parses, with none
        assertTrue(Fixtures.program.program!!.swaps.isEmpty())
        val doc = AppJson.json.decodeFromString(AppProgram.serializer(), """{"program":{"name":"Building the Monolith","templateId":"531-monolith","swaps":[
            {"lift":"facePull","name":"Face Pull","to":{"lift":"rearDeltFly","name":"Rear Delt Fly"},"options":[{"lift":"rearDeltFly","name":"Rear Delt Fly","score":0.998},{"lift":"bandPullApart","name":"Band Pull-Apart","score":0.971}]},
            {"lift":"dip","name":"Dip","to":null,"options":[{"lift":"pushUp","name":"Push Up","score":1}],"future":"ignored"}]}}""")
        val sw = doc.program!!.swaps
        assertEquals(listOf("facePull", "dip"), sw.map { it.lift })
        assertEquals("rearDeltFly", sw[0].to?.lift)
        assertEquals("bandPullApart", sw[0].options[1].lift)
        assertEquals(null, sw[1].to)
        assertEquals(1.0, sw[1].options[0].score, 0.0)
    }

    @Test fun program() {
        val p = Fixtures.program.program!!
        assertEquals("gzclp", p.templateId)
        assertTrue(p.slots.size >= 8)
        assertTrue(p.slots.first().stages.size > 1)
        assertTrue(p.upcoming.isNotEmpty())
        assertTrue(p.log.isNotEmpty())
        assertFalse(p.pushed)
        assertEquals("10 reps → 525", p.slots[0].ifSuccess)
        assertEquals("miss → retest 5RM", p.slots[0].ifFail)
        assertNull(AppJson.json.decodeFromString(AppProgram.serializer(), """{"program":null}""").program)
        assertNull(p.reentry)
    }

    @Test fun programReentryExplainsItself() {
        val r = AppJson.json.decodeFromString(
            dev.ironterm.data.app.Reentry.serializer(),
            """{"done":1,"total":6,"gapDays":40,"headline":"Session 2 of 6 back after 40 days off","summary":"Squat ramps slower.",
               "lifts":[{"short":"SQUAT","name":"Back Squat","load":0.85,"volume":0.5,"slower":true,"back":false}],
               "suggest":[{"templateId":"comeback-squat","name":"Squat Comeback","weeks":"3"}]}""",
        )
        assertEquals(40, r.gapDays)
        assertEquals("Squat ramps slower.", r.summary)
        assertEquals("comeback-squat", r.suggest.single().templateId)
        val old = AppJson.json.decodeFromString(dev.ironterm.data.app.Reentry.serializer(), """{"done":0,"total":3}""")
        assertNull(old.summary)
        assertTrue(old.suggest.isEmpty())
    }

    @Test fun body() {
        val b = Fixtures.body
        assertEquals("ready", b.mode)
        assertTrue(b.svgFront.startsWith("<svg"))
        assertTrue(b.svgBack.startsWith("<svg"))
        assertEquals(listOf("fresh", "fatigued"), b.legend)
        assertTrue(b.muscles.size > 10)
        val l = Fixtures.bodyLoad
        assertEquals("load", l.mode)
        assertTrue(l.muscles.any { it.target != null && it.target!!.size == 2 })
    }

    @Test fun insightsAndStats() {
        val i = Fixtures.insights
        assertTrue(i.projections.isNotEmpty())
        assertTrue(i.balance!!.ratios.isNotEmpty())
        assertTrue(i.achievements.total >= i.achievements.unlocked)
        assertNotNull(i.achievements.recent.first().unlockedAt)
        assertNull(i.achievements.next.first().unlockedAt)
        val s = Fixtures.stats
        assertEquals(178, s.totals.workouts)
        assertTrue(s.weekly.isNotEmpty())
        assertNull(s.cardio)
    }

    @Test fun unknownFieldsAndMissingOptionalsAreTolerated() {
        val h = AppJson.json.decodeFromString(AppHome.serializer(), """{"snapshot":{"v":2,"future":1},"e1rm":[{"lift":"x","now":1}],"newThing":[]}""")
        assertEquals(1.0, h.e1rm[0].now, 0.0)
        assertNull(h.e1rm[0].d4w)
    }
}

/** AppApi against a local mock server: paths, query, auth header, bodies and errors. */
class AppApiTest {
    private lateinit var server: MockWebServer
    private val seen = ArrayList<RecordedRequest>()
    private val bodies = ArrayList<String>()

    @Before fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                seen.add(request)
                bodies.add(request.body.readUtf8())
                if (request.getHeader("Authorization") != "Bearer ht_ok") return MockResponse().setResponseCode(401).setBody("""{"error":"login required"}""")
                val p = request.requestUrl!!.encodedPath
                fun ok(name: String) = MockResponse().setBody(Fixtures.text(name))
                return when {
                    p == "/api/app/home" -> ok("home")
                    p == "/api/app/gym" -> ok("gym")
                    p == "/api/app/gym/start" -> ok("gym-start")
                    p == "/api/app/lifts" -> ok("lifts")
                    p == "/api/app/lifts/squat" -> ok("lift-squat")
                    p == "/api/app/history" -> ok("history")
                    p.startsWith("/api/app/workouts/") -> ok("workout")
                    p == "/api/app/calendar" -> ok("calendar")
                    p == "/api/app/program" -> ok("program")
                    p == "/api/app/body" -> ok(if (request.requestUrl!!.queryParameter("mode") == "load") "body-load" else "body")
                    p == "/api/app/insights" -> ok("insights")
                    p == "/api/app/stats" -> ok("stats")
                    p == "/api/live" -> MockResponse().setBody("""{"ok":true}""")
                    p == "/api/live/finish" -> MockResponse().setBody("""{"workout":{"id":"w1","title":"x"},"demo":true,"duplicate":true,"prs":[{"lift":"squat","short":"SQUAT","kind":"rep","reps":5,"weight":185,"prev":175},{"lift":"bench","short":"BENCH","kind":"e1rm","reps":1,"weight":225,"prev":null}]}""")
                    p.endsWith("/notes") -> MockResponse().setBody("""{"ok":true}""")
                    p == "/api/routines/push" -> MockResponse().setResponseCode(400).setBody("""{"error":"Demo mode: add HEVY_API_KEY to push routines."}""")
                    p == "/api/app/program/skip" -> if (bodies.last().contains("A1")) MockResponse().setResponseCode(409).setBody("""{"error":"the next session is A2, not A1"}""")
                        else MockResponse().setBody("""{"ok":true,"message":"Skipped A2","gym":{"unit":"lb","skipped":{"dayId":"A2","dayName":"Day A2 · Bench","date":"2026-10-21T12:00:00.000Z"}},"program":{"program":{"name":"GZCLP","templateId":"gzclp"}}}""")
                    p == "/api/templates" -> MockResponse().setBody("""[{"id":"t1","title":"Treadmill","equipment":"none"}]""")
                    else -> MockResponse().setResponseCode(404).setBody("""{"error":"not found"}""")
                }
            }
        }
        server.start()
    }

    @After fun tearDown() = server.shutdown()

    private fun api(token: String = "ht_ok") = AppApi(server.url("/").toString(), token)

    @Test fun everyEndpoint() = runBlocking {
        val a = api()
        assertEquals("squat", a.home().e1rm[0].lift)
        assertEquals(4, a.gym().days.size)
        assertEquals("squat", a.lifts().lifts[0].key)
        assertEquals("squat", a.lift("squat").key)
        assertEquals(178, a.history("demo-2026-10-01", 30, "squat bench").total)
        val hq = seen.last().requestUrl!!
        assertEquals("demo-2026-10-01", hq.queryParameter("cursor"))
        assertEquals("30", hq.queryParameter("limit"))
        assertEquals("squat bench", hq.queryParameter("q"))
        assertEquals("B1", a.workout("demo-2026-10-15").program!!.dayId)
        assertEquals("/api/app/workouts/demo-2026-10-15", seen.last().requestUrl!!.encodedPath)
        assertEquals("2026-10", a.calendar("2026-10").month)
        assertEquals("2026-10", seen.last().requestUrl!!.queryParameter("month"))
        assertEquals("gzclp", a.program().program!!.templateId)
        assertEquals("load", a.body("load").mode)
        assertTrue(a.insights().projections.isNotEmpty())
        assertEquals(178, a.stats().totals.workouts)
        assertEquals("t1", a.templates()[0].id)
        assertTrue(seen.all { it.getHeader("Authorization") == "Bearer ht_ok" })
    }

    @Test fun gymWrites() = runBlocking {
        val a = api()
        val s = a.startGym(2, empty = false)
        assertEquals("A2", s.dayId)
        assertEquals("POST", seen.last().method)
        assertEquals("""{"dayIndex":2}""", bodies.last())
        a.startGym(null, empty = true)
        assertEquals("""{"empty":true}""", bodies.last())
        a.putLive(s)
        assertEquals("PUT", seen.last().method)
        assertEquals(s, Live.decode(bodies.last()))
        a.deleteLive()
        assertEquals("DELETE", seen.last().method)
        val r = a.finishLive(s)
        assertEquals("w1", r.workout.id)
        assertTrue(r.demo)
        assertTrue(r.duplicate)
        assertEquals(listOf("SQUAT 185×5 · REP PR (was 175)", "BENCH 225×1 · E1RM PR"), r.prs!!.map { it.line() })
        assertTrue(ApiException(409, "still being saved").isRetryable())
        assertEquals(s.id, Json.parseToJsonElement(bodies.last()).jsonObject["id"].toString().trim('"'))
        a.saveNotes("w 1", NotesEdit("new note", listOf("ok", null)))
        assertEquals("/api/workouts/w%201/notes", seen.last().requestUrl!!.encodedPath)
        assertEquals("""{"description":"new note","exercises":["ok",null]}""", bodies.last())
    }

    @Test fun skipWorkout() = runBlocking {
        val a = api()
        val r = a.skipWorkout("A2")
        assertEquals("POST", seen.last().method)
        assertEquals("/api/app/program/skip", seen.last().requestUrl!!.encodedPath)
        assertEquals("""{"dayId":"A2"}""", bodies.last())
        assertEquals("Skipped A2", r.message)
        assertEquals("A2", r.gym?.skipped?.dayId)
        assertEquals("gzclp", r.program?.program?.templateId)
        a.skipWorkout(null, undo = true)
        assertEquals("""{"undo":true}""", bodies.last())
        // a stale day: 409 with the server's words
        try { a.skipWorkout("A1"); throw AssertionError() } catch (e: ApiException) {
            assertEquals(409, e.code)
            assertEquals("the next session is A2, not A1", e.message)
        }
    }

    @Test fun errors() = runBlocking {
        try { api("ht_bad").home(); throw AssertionError() } catch (e: AuthException) { assertFalse(e.isRetryable()) }
        try { api().pushRoutines(); throw AssertionError() } catch (e: ApiException) {
            assertEquals(400, e.code)
            assertEquals("Demo mode: add HEVY_API_KEY to push routines.", e.message)
            assertFalse(e.isRetryable())
        }
        try { api().lift("nope"); throw AssertionError() } catch (e: ApiException) { assertEquals(404, e.code) }
        // nothing listening: a network error, retryable
        val port = ServerSocket(0).use { it.localPort }
        try { AppApi("http://127.0.0.1:$port", "ht_ok").gym(); throw AssertionError() } catch (e: java.io.IOException) { assertTrue(e.isRetryable()) }
        assertTrue(ApiException(503, "x").isRetryable())
    }
}

/** Direct mode FINISH: the workout goes straight to Hevy's POST /v1/workouts with the API key. */
class DirectGymTest {
    @Test fun postsTheWorkoutToHevy() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"workout":[{"id":"hevy-123","title":"x"}]}"""))
        server.start()
        try {
            var s = Live.emptySession("kg", "2026-01-02T18:00:00.000Z")
            s = Live.addExercise(s, "bench", title = "Bench Press (Barbell)", templateId = "79D0BB3A")
            val id = s.exercises[0].id
            s = Live.updateSet(s, id, 0) { it.copy(weight = 100.0, reps = 5) }
            s = Live.completeSet(s, id, 0, 0)
            s = Live.addSet(s, id) // not done: not sent
            val t = dev.ironterm.gym.DirectGymTransport(dev.ironterm.data.hevy.HevyApi(server.url("/").toString()), "key-1")
            assertEquals(dev.ironterm.gym.Finished("hevy-123"), t.finish(s))
            val req = server.takeRequest()
            assertEquals("POST", req.method)
            assertEquals("/v1/workouts", req.requestUrl!!.encodedPath)
            assertEquals("key-1", req.getHeader("api-key"))
            val body = Json.parseToJsonElement(req.body.readUtf8()).jsonObject["workout"]!!.jsonObject
            val ex = (body["exercises"] as kotlinx.serialization.json.JsonArray)
            assertEquals(1, ex.size)
            val ex0 = ex[0].jsonObject
            assertEquals("\"79D0BB3A\"", ex0["exercise_template_id"].toString())
            assertTrue("explicit nulls for Hevy", ex0.containsKey("superset_id"))
            assertEquals(1, (ex0["sets"] as kotlinx.serialization.json.JsonArray).size)
            // an exercise without a Hevy template can't be posted
            val bad = Live.addExercise(Live.emptySession("kg"), "squat")
            try { t.finish(Live.completeSet(bad, bad.exercises[0].id, 0, 0)); throw AssertionError() } catch (e: ApiException) { assertEquals(400, e.code) }
        } finally { server.shutdown() }
    }
}
