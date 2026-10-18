package dev.ironterm

import dev.ironterm.data.app.AppApi
import dev.ironterm.data.app.AppJson
import dev.ironterm.data.app.ProgramBody
import dev.ironterm.data.app.ProgramBrowse
import dev.ironterm.data.app.ProgramCatalog
import dev.ironterm.data.app.ProgramDetail
import dev.ironterm.data.app.ProgramDetailSerializer
import dev.ironterm.data.app.ProgramStartBody
import dev.ironterm.data.app.ProgramStartResult
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

object ProgramFixtures {
    val catalog: ProgramCatalog by lazy { Fixtures.parse("programs", ProgramCatalog.serializer()) }
    val gzclp: ProgramDetail by lazy { Fixtures.parse("programs-gzclp", ProgramDetailSerializer) }
    /** a percent-of-training-max program */
    val pct: ProgramDetail by lazy { Fixtures.parse("programs-531", ProgramDetailSerializer) }
    /** a finite percent-of-1RM block */
    val smolov: ProgramDetail by lazy { Fixtures.parse("programs-smolov-jr", ProgramDetailSerializer) }
    val gzclpBody: ProgramBody by lazy { Fixtures.parse("programs-gzclp-body", ProgramBody.serializer()) }
    val gzclpBodyGaps: ProgramBody by lazy { Fixtures.parse("programs-gzclp-body-gaps", ProgramBody.serializer()) }
    /** 4 weeks, sent with svg=0 */
    val pctBodyGaps: ProgramBody by lazy { Fixtures.parse("programs-531-body-gaps", ProgramBody.serializer()) }
}

/** /api/app/programs* documents (docs/api/app/programs*.json) parse field by field. */
class ProgramParseTest {
    @Test fun catalog() {
        val c = ProgramFixtures.catalog
        assertTrue(c.programs.size >= 5)
        assertTrue(c.active != null && c.programs.any { it.id == c.active })
        assertTrue(c.programs.all { it.id.isNotBlank() && it.name.isNotBlank() && it.daysPerWeek.isNotEmpty() })
        assertTrue(c.programs.all { it.level in ProgramBrowse.LEVELS })
        assertTrue(c.programs.any { it.weeks == null }) // open-ended
        assertTrue(c.programs.any { it.weeks != null })
        assertTrue(c.programs.map { it.category }.toSet().containsAll(listOf("gzcl", "novice")))
    }

    @Test fun gzclpDetail() {
        val d = ProgramFixtures.gzclp
        assertEquals("gzcl", d.category)
        assertTrue(d.name.startsWith("GZCLP"))
        assertNull(d.weeks)
        assertTrue(d.source.isNotBlank())
        assertTrue(d.options.isNotEmpty())
        assertTrue(d.options.all { o -> o.choices.any { it.value == o.selected } })
        assertTrue(d.unit == "lb" || d.unit == "kg")
        assertTrue(d.basis in setOf("active", "e1rm", "defaults"))
        assertTrue(d.rules.overview.isNotEmpty())
        assertTrue(d.rules.rotation.size >= 2)
        assertTrue(d.rules.tiers.any { it.title.startsWith("T1") && it.text.isNotBlank() })
        assertTrue("open-ended: weeks 1–4", d.plan.size in 1..4)
        val day = d.plan[0].days[0]
        assertTrue(day.exercises.any { it.tier == "T1" && it.top > 0 && !it.ifSuccess.isNullOrBlank() && !it.ifFail.isNullOrBlank() })
        assertTrue(day.exercises.all { it.sets.isNotEmpty() })
        assertTrue(d.start.trainingDays.isNotEmpty() && d.start.trainingDays.all { it in 0..6 })
        assertTrue(d.start.startWeights.isNotEmpty())
    }

    @Test fun percentDetail() {
        val d = ProgramFixtures.pct
        assertTrue(d.plan.size >= 3)
        assertTrue(d.start.trainingMaxes.isNotEmpty())
        assertTrue(d.start.maxLabel.isNotBlank())
        // percent waves: the main lift's sets climb within a day
        val main = d.plan[0].days[0].exercises[0]
        assertTrue(main.sets.size >= 3 && main.sets.zipWithNext().all { (a, b) -> b.weight >= a.weight })
        assertEquals(main.sets.maxOf { it.weight }, main.top, 0.0)
        assertTrue(d.plan.any { it.name != null })
    }

    @Test fun finiteBlock() {
        val d = ProgramFixtures.smolov
        assertEquals(d.weeks, d.plan.size)
        assertTrue(d.start.maxLabel.isNotBlank())
        assertTrue(d.start.trainingMaxes.isNotEmpty())
        assertTrue(d.plan.all { w -> w.days.isNotEmpty() && w.days.all { it.exercises.isNotEmpty() } })
        assertEquals(ProgramFixtures.catalog.programs.first { it.id == d.id }.weeks, d.weeks)
    }

    @Test fun detailRoundTripsThroughTheCache() {
        val d = ProgramFixtures.gzclp
        val back = AppJson.json.decodeFromString(ProgramDetailSerializer, AppJson.json.encodeToString(ProgramDetailSerializer, d))
        assertEquals(d, back)
    }

    @Test fun summaryLength() {
        assertEquals(12, AppJson.json.decodeFromString(dev.ironterm.data.app.ProgramSummary.serializer(), """{"id":"x","weekCount":12}""").weeks)
        assertEquals(12, AppJson.json.decodeFromString(dev.ironterm.data.app.ProgramSummary.serializer(), """{"id":"x","weeks":12}""").weeks)
        assertNull(AppJson.json.decodeFromString(dev.ironterm.data.app.ProgramSummary.serializer(), """{"id":"x","weekCount":null}""").weeks)
    }

    @Test fun weeksAsLengthOrBrowser() {
        // server shape: `weeks` is the browser, `weekCount` the length
        val s = AppJson.json.decodeFromString(ProgramDetailSerializer, """{"id":"x","weekCount":4,"weeks":[{"week":1},{"week":2}]}""")
        assertEquals(4, s.weeks)
        assertEquals(2, s.plan.size)
        // contract literal: `weeks` is the browser array; the length can come as `length`
        val a = AppJson.json.decodeFromString(ProgramDetailSerializer, """{"id":"x","weeks":[{"week":1,"days":[]}],"length":12}""")
        assertEquals(12, a.weeks)
        assertEquals(1, a.plan.size)
        // `weeks` as the length and the browser under another name
        val b = AppJson.json.decodeFromString(ProgramDetailSerializer, """{"id":"x","weeks":8,"plan":[{"week":1},{"week":2}]}""")
        assertEquals(8, b.weeks)
        assertEquals(2, b.plan.size)
        val c = AppJson.json.decodeFromString(ProgramDetailSerializer, """{"id":"x","weeks":null,"schedule":[{"week":1}]}""")
        assertNull(c.weeks)
        assertEquals(1, c.plan.size)
    }

    @Test fun startResult() {
        val nested = AppJson.json.decodeFromString(ProgramStartResult.serializer(), """{"ok":true,"program":{"program":{"name":"5/3/1","templateId":"wendler531","week":1}}}""")
        assertTrue(nested.ok)
        assertEquals("wendler531", nested.program.program?.templateId)
        val flat = AppJson.json.decodeFromString(ProgramStartResult.serializer(), """{"ok":true,"program":{"name":"5/3/1","templateId":"wendler531"}}""")
        assertEquals("5/3/1", flat.program.program?.name)
        val none = AppJson.json.decodeFromString(ProgramStartResult.serializer(), """{"ok":true,"program":{"program":null}}""")
        assertNull(none.program.program)
    }
}

class ProgramBrowseTest {
    private val c get() = ProgramFixtures.catalog
    private fun ids(f: ProgramBrowse.Filter) = ProgramBrowse.groups(c, f).flatMap { it.second }.map { it.id }

    @Test fun tags() {
        val p = c.programs.first { it.weeks == null }
        assertTrue(ProgramBrowse.tags(p).contains("open-ended"))
        assertEquals("4 days · 12 weeks · beginner", ProgramBrowse.tags(p.copy(daysPerWeek = listOf(4), weeks = 12, level = "beginner")))
        assertEquals("3–4 days · open-ended · intermediate", ProgramBrowse.tags(p.copy(daysPerWeek = listOf(4, 3), weeks = null, level = "intermediate")))
        assertEquals("3/5 days · 1 week · advanced", ProgramBrowse.tags(p.copy(daysPerWeek = listOf(3, 5), weeks = 1, level = "advanced")))
        assertEquals("GZCL · 4 DAYS · OPEN-ENDED", ProgramBrowse.header(p.copy(category = "gzcl", daysPerWeek = listOf(4), weeks = null)))
    }

    @Test fun groupsKeepCatalogOrder() {
        val g = ProgramBrowse.groups(c, ProgramBrowse.Filter())
        assertEquals(c.programs.map { it.category }.distinct(), g.map { it.first })
        assertEquals(c.programs.size, g.sumOf { it.second.size })
        g.forEach { (cat, rows) -> assertTrue(rows.all { it.category == cat }) }
    }

    @Test fun filterByDaysAndLevel() {
        val three = ids(ProgramBrowse.Filter(days = 3))
        assertTrue(three.isNotEmpty())
        assertTrue(three.all { id -> 3 in c.programs.first { it.id == id }.daysPerWeek })
        assertEquals(c.programs.count { 3 in it.daysPerWeek }, three.size)
        val beg = ids(ProgramBrowse.Filter(level = "beginner"))
        assertEquals(c.programs.count { it.level == "beginner" }, beg.size)
        val both = ids(ProgramBrowse.Filter(days = 4, level = "beginner"))
        assertEquals(c.programs.count { 4 in it.daysPerWeek && it.level == "beginner" }, both.size)
        assertTrue(ProgramBrowse.Filter().all)
        assertFalse(ProgramBrowse.Filter(days = 3).all)
    }

    @Test fun search() {
        val gz = c.programs.first { it.category == "gzcl" }
        assertTrue(gz.id in ids(ProgramBrowse.Filter(query = gz.name.uppercase())))
        // every word must match, anywhere (name, author, summary, category)
        assertTrue(ids(ProgramBrowse.Filter(query = "zzzz nothing")).isEmpty())
        assertEquals(c.programs.count { it.category == "gzcl" || it.name.contains("gzcl", true) || it.author.contains("gzcl", true) || it.summary.contains("gzcl", true) },
            ids(ProgramBrowse.Filter(query = "  gzcl ")).size)
        // 5x5 finds 5×5
        val x = c.programs.firstOrNull { it.name.contains('×') }
        if (x != null) assertTrue(x.id in ids(ProgramBrowse.Filter(query = x.name.replace('×', 'x'))))
        // search combines with chips
        assertTrue(ids(ProgramBrowse.Filter(query = gz.name, level = "advanced")).none { it == gz.id && gz.level != "advanced" })
    }

    @Test fun chips() {
        val d = ProgramBrowse.dayChips(c)
        assertEquals(d.sorted(), d)
        assertEquals(c.programs.flatMap { it.daysPerWeek }.toSet(), d.toSet())
        val l = ProgramBrowse.levelChips(c)
        assertEquals(ProgramBrowse.LEVELS.filter { lv -> c.programs.any { it.level == lv } }, l)
    }

    @Test fun basisLine() {
        assertEquals("weights from your running program · kg", ProgramBrowse.basisLine("active", "kg"))
        assertEquals("weights from your current e1RMs · lb", ProgramBrowse.basisLine("e1rm", "lb"))
        assertEquals("weights from default starting weights · lb", ProgramBrowse.basisLine("defaults", "lb"))
    }

    @Test fun detailKey() {
        assertEquals("gzclp", ProgramBrowse.detailKey("gzclp", emptyMap()))
        assertEquals("gzclp?a=1&t3=3x12", ProgramBrowse.detailKey("gzclp", mapOf("t3" to "3x12", "a" to "1")))
    }

    @Test fun keyLabels() {
        // the server's labels win
        val d = ProgramFixtures.gzclp
        assertEquals(d.start.startWeights.keys, d.start.labels.keys)
        d.start.startWeights.keys.forEach { assertEquals(d.start.labels.getValue(it), ProgramBrowse.keyLabel(it, d)) }
        assertEquals("A1 · T3 Bicep Curl", ProgramBrowse.keyLabel("a1-t3b", d))
        val p = ProgramFixtures.pct
        assertEquals(p.start.trainingMaxes.keys, p.start.labels.keys)
        assertEquals("Back Squat", ProgramBrowse.keyLabel("squat", p))
        // fallback without labels (older servers): lift keys and slot ids are worked out
        val bare = d.copy(start = d.start.copy(labels = emptyMap()))
        assertTrue(ProgramBrowse.keyLabel("a1-t1", bare).contains("SQUAT"))
        assertTrue(ProgramBrowse.keyLabel("a1-t3b", bare).startsWith("A1 T3"))
        assertEquals("SQUAT", ProgramBrowse.keyLabel("squat", p.copy(start = p.start.copy(labels = emptyMap()))))
        assertEquals("ZZ-UNKNOWN", ProgramBrowse.keyLabel("zz-unknown", bare))
    }

    @Test fun setsLine() {
        val main = ProgramFixtures.pct.plan[0].days[0].exercises[0]
        val line = ProgramBrowse.setsLine(main)!!
        assertEquals(main.sets.size, line.split(" · ").size)
        assertTrue(line.contains("+×") == main.sets.any { it.amrap })
        // straight sets: the scheme says it all
        assertNull(ProgramBrowse.setsLine(ProgramFixtures.gzclp.plan[0].days[0].exercises[0]))
    }

    @Test fun daysHelpers() {
        assertEquals(listOf(0, 2, 4), ProgramBrowse.normDays(listOf(4, 2, 0, 2, 9, -1)))
        assertEquals("Mon, Wed, Fri", ProgramBrowse.daysText(setOf(4, 0, 2)))
        val p = ProgramFixtures.gzclp.summaryRow.copy(daysPerWeek = listOf(4))
        assertNull(ProgramBrowse.daysHint(setOf(0, 1, 3, 4), p))
        assertEquals("Pick at least one day.", ProgramBrowse.daysHint(emptySet(), p))
        assertTrue(ProgramBrowse.daysHint(setOf(0, 2, 4), p)!!.startsWith("3 days picked"))
        assertEquals(5.0, ProgramBrowse.step("lb"), 0.0)
        assertEquals(2.5, ProgramBrowse.step("kg"), 0.0)
    }
}

/** The POST start body, and the requests the client sends. */
class ProgramStartTest {
    @Test fun bodyFromPrefill() {
        val d = ProgramFixtures.gzclp
        val b = ProgramBrowse.startBody(d, d.start.trainingDays, emptyMap(), emptyMap())
        assertEquals(d.selectedOptions, b.options)
        assertEquals(d.start.trainingDays.sorted(), b.trainingDays)
        assertEquals(d.start.startWeights, b.startWeights)
        assertNull("no maxes asked for → left out", b.trainingMaxes)
        assertNull(b.startDate)
        val json = AppJson.json.parseToJsonElement(AppJson.json.encodeToString(ProgramStartBody.serializer(), b)).jsonObject
        assertEquals(setOf("options", "trainingDays", "startWeights"), json.keys)
        assertEquals(d.start.trainingDays.size, json.getValue("trainingDays").jsonArray.size)
    }

    @Test fun bodyWithEdits() {
        val d = ProgramFixtures.pct
        val k = d.start.trainingMaxes.keys.first()
        val b = ProgramBrowse.startBody(d, setOf(6, 0, 2, 2), emptyMap(), mapOf(k to 2500.0, "notAsked" to 5.0, d.start.trainingMaxes.keys.last() to -10.0))
        assertEquals(listOf(0, 2, 6), b.trainingDays)
        assertEquals("clamped to the server's 0–2000", 2000.0, b.trainingMaxes!!.getValue(k), 0.0)
        assertFalse("only keys the program asked for", "notAsked" in b.trainingMaxes!!)
        assertEquals(0.0, b.trainingMaxes!!.getValue(d.start.trainingMaxes.keys.last()), 0.0)
        assertEquals(d.start.trainingMaxes.keys, b.trainingMaxes!!.keys)
        assertNull("5/3/1 has no start weights", b.startWeights)
        val withOpt = d.copy(options = d.options.map { if (it.key == d.options[0].key) it.copy(selected = it.choices.last().value) else it })
        assertEquals(withOpt.options[0].choices.last().value, ProgramBrowse.startBody(withOpt, setOf(0), emptyMap(), emptyMap()).options!![d.options[0].key])
        assertNull(ProgramBrowse.startBody(d, emptySet(), emptyMap(), emptyMap()).trainingDays)
    }

    @Test fun requests() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(Fixtures.text("programs")))
        server.enqueue(MockResponse().setBody(Fixtures.text("programs-gzclp")))
        server.enqueue(MockResponse().setBody("""{"ok":true,"program":{"program":{"name":"5/3/1","templateId":"wendler531","week":1}}}"""))
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"unknown program"}"""))
        server.start()
        try {
            val api = AppApi(server.url("/").toString(), "ht_test")
            assertEquals(ProgramFixtures.catalog, api.programs())
            assertEquals("/api/app/programs", server.takeRequest().path)

            assertEquals(ProgramFixtures.gzclp, api.programDetail("gzclp", mapOf("t3" to "3x12", "days" to "4")))
            val r2 = server.takeRequest()
            assertEquals("/api/app/programs/gzclp?opt.days=4&opt.t3=3x12", r2.path)
            assertEquals("Bearer ht_test", r2.getHeader("Authorization"))

            val res = api.startProgram("wendler531", ProgramStartBody(options = mapOf("days" to "4"), trainingDays = listOf(0, 2, 4), trainingMaxes = mapOf("squat" to 250.0)))
            assertEquals("wendler531", res.program.program?.templateId)
            val r3 = server.takeRequest()
            assertEquals("POST", r3.method)
            assertEquals("/api/app/programs/wendler531/start", r3.path)
            val body = AppJson.json.parseToJsonElement(r3.body.readUtf8()) as JsonObject
            assertEquals(setOf("options", "trainingDays", "trainingMaxes"), body.keys)
            assertEquals("4", body.getValue("options").jsonObject.getValue("days").jsonPrimitive.content)

            val err = runCatching { api.startProgram("nope", ProgramStartBody()) }.exceptionOrNull()
            assertTrue(err is dev.ironterm.data.app.ApiException && err.code == 400 && err.message == "unknown program")
            assertEquals("{}", server.takeRequest().body.readUtf8())
        } finally { server.shutdown() }
    }
}

/** GET /api/app/programs/{id}/body (docs/api/app/programs-*-body*.json): parsing, the tab's helpers, the request. */
class ProgramBodyTest {
    private val load get() = ProgramFixtures.gzclpBody
    private val gaps get() = ProgramFixtures.gzclpBodyGaps
    private val pct get() = ProgramFixtures.pctBodyGaps

    @Test fun parses() {
        val b = load
        assertEquals("gzclp", b.id)
        assertEquals("load", b.mode)
        assertTrue(b.svgFront.startsWith("<svg") && b.svgBack.contains("</svg>"))
        assertEquals(2, b.legend.size)
        assertTrue(b.muscles.size > 20)
        assertTrue(b.muscles.zipWithNext().all { (a, c) -> a.load >= c.load })
        assertTrue(b.muscles.all { it.status in setOf("none", "low", "ok", "high", "n/a") })
        assertTrue(b.muscles.filter { it.target != null }.all { it.target!!.size == 2 })
        assertEquals(b.weeks, b.overlapsByWeek.size)
        assertEquals(b.overlaps.size, b.overlapsByWeek.sum())
        assertEquals(3, b.summary.lines.size)
        assertEquals(3, b.summary.mostTrained.size)
        assertTrue(b.summary.gaps.all { g -> g.target != null && g.hardSets < g.target!![0] })
        assertTrue(b.overlaps.all { it.from.isNotBlank() && it.to.isNotBlank() && it.share > 0 })
        // gaps: least recovered first, other colours
        assertEquals("gaps", gaps.mode)
        assertTrue(gaps.muscles.zipWithNext().all { (a, c) -> a.gap >= c.gap })
        assertFalse(gaps.svgFront == b.svgFront)
        // svg=0 sample: no figures, several weeks
        assertEquals("", pct.svgFront)
        assertTrue(pct.weeks > 1)
    }

    @Test fun helpers() {
        assertEquals("gzclp#load", ProgramBrowse.bodyKey("gzclp", emptyMap(), "load"))
        assertEquals("531?deload=off&supp=fsl#gaps", ProgramBrowse.bodyKey("531", mapOf("supp" to "fsl", "deload" to "off"), "gaps"))
        val m = load.muscles.first { it.target != null && it.hardSets > 0 }
        val bar = ProgramBrowse.rangeBar(m)
        assertEquals((m.hardSets / 30).toFloat(), bar.fill, 1e-4f)
        assertEquals((m.target!![0] / 30).toFloat(), bar.lo!!, 1e-4f)
        assertEquals((m.target!![1] / 30).toFloat(), bar.hi!!, 1e-4f)
        assertEquals(1f, ProgramBrowse.rangeBar(m.copy(hardSets = 99.0)).fill, 0f)
        assertNull(ProgramBrowse.rangeBar(m.copy(target = null)).lo)
        assertEquals("BELOW", ProgramBrowse.bodyStatus("low"))
        assertEquals("IN RANGE", ProgramBrowse.bodyStatus("ok"))
        assertEquals("ABOVE", ProgramBrowse.bodyStatus("high"))
        assertEquals("INDIRECT", ProgramBrowse.bodyStatus("n/a"))
        assertEquals("NONE", ProgramBrowse.bodyStatus("none"))
        // groups in body order, each sorted by hard sets, untrained stabilisers left out
        val groups = ProgramBrowse.bodyGroups(load)
        assertEquals(ProgramBrowse.GROUPS.map { it.second }.filter { g -> groups.any { it.first == g } }, groups.map { it.first })
        assertTrue(groups.all { (_, rows) -> rows.zipWithNext().all { (a, c) -> a.hardSets >= c.hardSets } })
        assertTrue(groups.flatMap { it.second }.all { it.target != null || it.sets >= 0.5 })
        // overlaps per week
        assertEquals(load.overlaps.size, ProgramBrowse.overlapsIn(load, 1).size)
        assertTrue(ProgramBrowse.overlapsIn(load, 2).isEmpty())
        val o = load.overlaps.first()
        assertEquals("${o.from} → ${o.to} · ${o.prev.take(2).joinToString("+")} → ${o.now.take(2).joinToString("+")} · ${o.gapH.toInt()}h", ProgramBrowse.overlapLine(o))
    }

    @Test fun request() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(Fixtures.text("programs-gzclp-body-gaps")))
        server.enqueue(MockResponse().setBody("""{"id":"x","future":1,"muscles":[{"id":"lats","hardSets":12.5,"extra":true}]}"""))
        server.start()
        try {
            val api = AppApi(server.url("/").toString(), "ht_test")
            assertEquals(gaps, api.programBody("gzclp", mapOf("t3" to "3x12", "days" to "4"), "gaps"))
            assertEquals("/api/app/programs/gzclp/body?mode=gaps&opt.days=4&opt.t3=3x12", server.takeRequest().path)
            // unknown fields are ignored, missing ones default
            val lenient = api.programBody("x")
            assertEquals("load", lenient.mode)
            assertEquals(12.5, lenient.muscles[0].hardSets, 0.0)
            assertEquals("/api/app/programs/x/body?mode=load", server.takeRequest().path)
        } finally { server.shutdown() }
    }
}
