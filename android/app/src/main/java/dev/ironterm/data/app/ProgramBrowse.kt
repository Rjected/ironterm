package dev.ironterm.data.app

import dev.ironterm.Fmt
import dev.ironterm.gym.LiftLibrary

/** Pure logic for the program browser: filter/search, labels, and the start request body. */
object ProgramBrowse {
    val LEVELS = listOf("beginner", "intermediate", "advanced")
    /** the server rejects start numbers outside 0–2000 */
    const val MAX_NUMBER = 2000.0
    val DOW = listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")

    /** "4 days · 12-week block · beginner", "4 days · cycles forever · intermediate", "3–4 days · ongoing · beginner" */
    fun tags(p: ProgramSummary): String = listOfNotNull(
        days(p.daysPerWeek),
        length(p),
        p.level.ifBlank { null },
    ).joinToString(" · ")

    /**
     * How long it runs: a block ends ("12-week block"), cycles repeat forever with the maxes rising
     * ("cycles forever"), ongoing programs have no weeks at all ("ongoing"). Older servers send only
     * the week count: "12 weeks" / "open-ended".
     */
    fun length(p: ProgramSummary): String = when (p.length) {
        "cycles" -> "cycles forever"
        "ongoing" -> "ongoing"
        "block" -> (p.weeks ?: p.cycleWeeks)?.let { "$it-week block" } ?: "block"
        else -> p.weeks?.let { if (it == 1) "1 week" else "$it weeks" } ?: "open-ended"
    }

    fun days(d: List<Int>): String? {
        val s = d.distinct().sorted()
        return when {
            s.isEmpty() -> null
            s.size == 1 -> if (s[0] == 1) "1 day" else "${s[0]} days"
            s.zipWithNext().all { (a, b) -> b == a + 1 } -> "${s.first()}–${s.last()} days"
            else -> s.joinToString("/") + " days"
        }
    }

    /** Header line: "GZCL · 4 DAYS · OPEN-ENDED" */
    fun header(p: ProgramSummary): String = listOfNotNull(
        p.category.ifBlank { null }, days(p.daysPerWeek), length(p),
    ).joinToString(" · ").uppercase()

    data class Filter(val query: String = "", val days: Int? = null, val level: String? = null) {
        val all: Boolean get() = days == null && level == null
    }

    fun matches(p: ProgramSummary, f: Filter): Boolean {
        if (f.days != null && f.days !in p.daysPerWeek) return false
        if (f.level != null && !p.level.equals(f.level, ignoreCase = true)) return false
        val words = f.query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return true
        val hay = listOf(p.name, p.author, p.summary, p.category, p.level, p.id).joinToString(" ").lowercase()
        // "5x5" should find "5×5"
        val hay2 = hay.replace('×', 'x')
        return words.all { w -> hay.contains(w) || hay2.contains(w.replace('×', 'x')) }
    }

    /** Matching programs grouped by category, keeping the catalog's order (groups and rows). */
    fun groups(c: ProgramCatalog, f: Filter): List<Pair<String, List<ProgramSummary>>> =
        c.programs.filter { matches(it, f) }.groupBy { it.category }.toList()

    /** Day-count chips present in the catalog, ascending. */
    fun dayChips(c: ProgramCatalog): List<Int> = c.programs.flatMap { it.daysPerWeek }.distinct().sorted()

    /** Levels present in the catalog, in LEVELS order. */
    fun levelChips(c: ProgramCatalog): List<String> {
        val have = c.programs.map { it.level.lowercase() }.toSet()
        return LEVELS.filter { it in have } + have.filter { it !in LEVELS && it.isNotBlank() }.sorted()
    }

    /** "weights from your current e1RMs · lb" */
    fun basisLine(basis: String, unit: String): String = "weights from " + when (basis) {
        "active" -> "your running program"
        "e1rm" -> "your current e1RMs"
        else -> "default starting weights"
    } + " · $unit"

    /** Cache / map key for a detail with options. */
    fun detailKey(id: String, opts: Map<String, String>): String =
        if (opts.isEmpty()) id else id + "?" + opts.toSortedMap().entries.joinToString("&") { "${it.key}=${it.value}" }

    /**
     * Display name for a startWeights / trainingMaxes key: the server's label if it sent one, a lift
     * key ("squat" → "SQUAT"), or a slot id ("a1-t3b" → "A1 T3 CURL", found in week 1's day A1).
     */
    fun keyLabel(key: String, d: ProgramDetail): String {
        d.start.labels[key]?.let { return it }
        LiftLibrary[key]?.let { return it.short }
        val m = Regex("^([a-z0-9]+)-(t\\d|main|supp|acc|[a-z]+?)([a-z]?)$", RegexOption.IGNORE_CASE).find(key)
        if (m != null) {
            val (dayId, tier, suffix) = m.destructured
            val day = d.plan.firstOrNull()?.days?.firstOrNull { it.dayId.equals(dayId, ignoreCase = true) }
            val sameTier = day?.exercises?.filter { it.tier.equals(tier, ignoreCase = true) }.orEmpty()
            val idx = if (suffix.isEmpty()) 0 else suffix.lowercase()[0] - 'a'
            val ex = sameTier.getOrNull(idx)
            if (ex != null) return "${dayId.uppercase()} ${ex.tier.uppercase()} ${short(ex)}"
        }
        return key.uppercase()
    }

    private fun short(e: PlanExercise) = LiftLibrary[e.lift]?.short ?: e.name.uppercase()

    /** Training days as Mon=0 indexes, sorted and de-duplicated. */
    fun normDays(days: Collection<Int>): List<Int> = days.filter { it in 0..6 }.distinct().sorted()

    /** Increment for the steppers. */
    fun step(unit: String): Double = if (unit == "lb") 5.0 else 2.5

    /**
     * The start request: the document's selected options, the picked days, and only the weights /
     * maxes the program asked for (keys of the prefill), each ≥ 0. Empty maps are left out.
     */
    fun startBody(d: ProgramDetail, days: Collection<Int>, weights: Map<String, Double>, maxes: Map<String, Double>, startDate: String? = null): ProgramStartBody {
        val w = d.start.startWeights.keys.associateWith { k -> (weights[k] ?: d.start.startWeights.getValue(k)).coerceIn(0.0, MAX_NUMBER) }
        val m = d.start.trainingMaxes.keys.associateWith { k -> (maxes[k] ?: d.start.trainingMaxes.getValue(k)).coerceIn(0.0, MAX_NUMBER) }
        return ProgramStartBody(
            options = d.selectedOptions.takeIf { it.isNotEmpty() },
            trainingDays = normDays(days).takeIf { it.isNotEmpty() },
            startWeights = w.takeIf { it.isNotEmpty() },
            trainingMaxes = m.takeIf { it.isNotEmpty() },
            startDate = startDate,
        )
    }

    /** "Mon, Wed, Fri, Sat" */
    fun daysText(days: Collection<Int>): String = normDays(days).joinToString(", ") { DOW[it].lowercase().replaceFirstChar(Char::uppercase) }

    /** Hint under the day chips when the count doesn't fit the program. */
    fun daysHint(days: Collection<Int>, d: ProgramSummary): String? {
        val n = normDays(days).size
        if (n == 0) return "Pick at least one day."
        if (d.daysPerWeek.isEmpty() || n in d.daysPerWeek) return null
        return "$n days picked · ${d.name} is written for ${days(d.daysPerWeek)} a week."
    }

    // ── BODY tab ──

    /** Cache / map key for a body document. */
    fun bodyKey(id: String, opts: Map<String, String>, mode: String): String = detailKey(id, opts) + "#" + mode

    /** Range bars run 0 → this many hard sets a week (as on the web). */
    const val RANGE_SCALE = 30.0
    val GROUPS = listOf("chest" to "CHEST", "shoulders" to "SHOULDERS", "arms" to "ARMS", "back" to "BACK", "core" to "CORE", "hips" to "HIPS", "legs" to "LEGS")

    /** A range bar as fractions of [RANGE_SCALE]: the hard sets, and the target band (null = no target). */
    data class RangeBar(val fill: Float, val lo: Float?, val hi: Float?)

    fun rangeBar(m: ProgramBodyMuscle): RangeBar {
        val f = { x: Double -> (x / RANGE_SCALE).coerceIn(0.0, 1.0).toFloat() }
        val t = m.target?.takeIf { it.size == 2 }
        return RangeBar(f(m.hardSets), t?.let { f(it[0]) }, t?.let { f(it[1]) })
    }

    /** "BELOW" · "IN RANGE" · "ABOVE" · "NONE" · "INDIRECT" */
    fun bodyStatus(status: String): String = when (status) {
        "low" -> "BELOW"
        "ok" -> "IN RANGE"
        "high" -> "ABOVE"
        "n/a" -> "INDIRECT"
        else -> "NONE"
    }

    /** Muscles worth listing (a target range, or trained at all), by body group, most hard sets first. */
    fun bodyGroups(b: ProgramBody): List<Pair<String, List<ProgramBodyMuscle>>> =
        GROUPS.mapNotNull { (g, label) ->
            val rows = b.muscles.filter { it.group == g && (it.target != null || it.sets >= 0.5) }.sortedByDescending { it.hardSets }
            if (rows.isEmpty()) null else label to rows
        }

    /** Overlaps of 1-based [week]. */
    fun overlapsIn(b: ProgramBody, week: Int): List<ProgramBodyOverlap> = b.overlaps.filter { it.week == week }

    /** "MON A1 → TUE B1 · SQUAT → DEADLIFT+OHP · 24h" */
    fun overlapLine(o: ProgramBodyOverlap): String =
        "${o.from} → ${o.to} · ${o.prev.take(2).joinToString("+")} → ${o.now.take(2).joinToString("+")} · ${o.gapH.toInt()}h"

    /** "5×95 · 5×110 · 5+×125" when the sets differ, else null (the scheme says it all). */
    fun setsLine(e: PlanExercise): String? {
        if (e.sets.size < 2 || e.sets.map { it.weight }.distinct().size < 2) return null
        return e.sets.joinToString(" · ") { s ->
            val reps = if (s.repsMax != null && s.repsMax > s.reps) "${s.reps}-${s.repsMax}" else "${s.reps}"
            "$reps${if (s.amrap) "+" else ""}×${if (s.weight > 0) Fmt.w(s.weight) else "BW"}"
        }
    }
}
