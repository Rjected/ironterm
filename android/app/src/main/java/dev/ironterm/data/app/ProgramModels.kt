package dev.ironterm.data.app

import dev.ironterm.gym.LenientInt
import dev.ironterm.gym.LenientIntN
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonTransformingSerializer
import kotlinx.serialization.Serializable

// Program browsing (docs/api/programs.md): GET /api/app/programs, GET /api/app/programs/{id},
// POST /api/app/programs/{id}/start. Every field has a default so additive server changes never break parsing.

@Serializable
data class ProgramCatalog(
    /** templateId of the running program */
    val active: String? = null,
    val programs: List<ProgramSummary> = emptyList(),
)

@Serializable
data class ProgramSummary(
    val id: String = "",
    val name: String = "",
    val author: String = "",
    val category: String = "",
    val level: String = "",
    val daysPerWeek: List<@Serializable(LenientInt::class) Int> = emptyList(),
    /** length in weeks, null = open-ended (the server sends it as `weekCount`) */
    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    @kotlinx.serialization.json.JsonNames("weekCount")
    @Serializable(LenientIntN::class) val weeks: Int? = null,
    val summary: String = "",
    /** "block" (ends after [weeks]) | "cycles" (repeats forever) | "ongoing" (no weeks); blank from older servers */
    val length: String = "",
    /** weeks per cycle (cycles) or block length (block) */
    @Serializable(LenientIntN::class) val cycleWeeks: Int? = null,
)

@Serializable
data class ProgramDetail(
    val id: String = "",
    val name: String = "",
    val author: String = "",
    val category: String = "",
    val level: String = "",
    val daysPerWeek: List<@Serializable(LenientInt::class) Int> = emptyList(),
    /** length in weeks (null = open-ended or not sent) */
    @Serializable(LenientIntN::class) val weeks: Int? = null,
    val summary: String = "",
    val source: String = "",
    val notes: List<String> = emptyList(),
    val options: List<ProgramOption> = emptyList(),
    val unit: String = "kg",
    /** where the weights in [plan] come from: "active" | "e1rm" | "defaults" */
    val basis: String = "defaults",
    val rules: ProgramRules = ProgramRules(),
    /** the week-by-week workouts browser (the contract's `weeks` array; see [ProgramDetailSerializer]) */
    val plan: List<PlanWeek> = emptyList(),
    val start: ProgramStartPrefill = ProgramStartPrefill(),
    val length: String = "",
    @Serializable(LenientIntN::class) val cycleWeeks: Int? = null,
) {
    val summaryRow: ProgramSummary get() = ProgramSummary(id, name, author, category, level, daysPerWeek, weeks, summary, length, cycleWeeks)
    /** the options as they are in this document (what POST start should send) */
    val selectedOptions: Map<String, String> get() = options.associate { it.key to it.selected.ifBlank { it.default } }
}

/**
 * The server sends the workouts browser as `weeks` (array) and the length as `weekCount`; an earlier
 * contract draft had `weeks` for both. Accept either: an array goes to [ProgramDetail.plan] and the
 * length is read from `weekCount` (or `length` / `totalWeeks`); a number stays the length. The browser
 * is also accepted as `plan` / `schedule` / `workouts`.
 */
object ProgramDetailSerializer : JsonTransformingSerializer<ProgramDetail>(ProgramDetail.serializer()) {
    private val PLAN_ALIASES = listOf("plan", "schedule", "workouts", "weekPlans")
    private val LENGTH_ALIASES = listOf("weekCount", "length", "lengthWeeks", "totalWeeks", "weeksTotal", "programWeeks")

    override fun transformDeserialize(element: JsonElement): JsonElement {
        val o = element as? JsonObject ?: return element
        val m = o.toMutableMap()
        // a week count: a number (or numeric string). `length` is also the server's "block" / "cycles" /
        // "ongoing" kind, which must not be read as a count.
        fun count(): JsonElement? = LENGTH_ALIASES.firstNotNullOfOrNull { k -> (o[k] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.content.toDoubleOrNull() != null } }
        val w = o["weeks"]
        if (w is JsonArray) {
            m["plan"] = w
            m["weeks"] = count() ?: JsonNull
        }
        if (m["plan"] !is JsonArray) PLAN_ALIASES.firstNotNullOfOrNull { k -> o[k] as? JsonArray }?.let { m["plan"] = it }
        if (m["weeks"] == null || m["weeks"] is JsonNull) count()?.let { m["weeks"] = it }
        LENGTH_ALIASES.forEach { m.remove(it) }
        (o["length"] as? JsonPrimitive)?.takeIf { it.isString && it.content.toDoubleOrNull() == null }?.let { m["length"] = it }
        return JsonObject(m)
    }
}

@Serializable
data class ProgramOption(
    val key: String = "",
    val label: String = "",
    val choices: List<OptionChoice> = emptyList(),
    val default: String = "",
    val selected: String = "",
)

@Serializable
data class OptionChoice(val value: String = "", val label: String = "")

@Serializable
data class ProgramRules(
    val overview: List<String> = emptyList(),
    val rotation: List<RotationDay> = emptyList(),
    val tiers: List<TierRule> = emptyList(),
)

@Serializable
data class RotationDay(val day: String = "", val lifts: List<String> = emptyList())

@Serializable
data class TierRule(val title: String = "", val lifts: List<String> = emptyList(), val text: String = "")

@Serializable
data class PlanWeek(
    @Serializable(LenientInt::class) val week: Int = 1,
    val name: String? = null,
    val days: List<PlanDay> = emptyList(),
)

@Serializable
data class PlanDay(val dayId: String = "", val name: String = "", val exercises: List<PlanExercise> = emptyList())

@Serializable
data class PlanExercise(
    val lift: String = "",
    val name: String = "",
    val tier: String = "",
    val scheme: String = "",
    /** heaviest planned set (0 = bodyweight / RPE-only) */
    val top: Double = 0.0,
    val sets: List<PlanSet> = emptyList(),
    @Serializable(LenientInt::class) val restSeconds: Int = 0,
    val note: String? = null,
    val ifSuccess: String? = null,
    val ifFail: String? = null,
)

@Serializable
data class PlanSet(
    @Serializable(LenientInt::class) val reps: Int = 0,
    @Serializable(LenientIntN::class) val repsMax: Int? = null,
    val weight: Double = 0.0,
    val amrap: Boolean = false,
    val rpe: Double? = null,
)

@Serializable
data class ProgramStartPrefill(
    /** Mon = 0 */
    val trainingDays: List<@Serializable(LenientInt::class) Int> = emptyList(),
    val startWeights: Map<String, Double> = emptyMap(),
    val trainingMaxes: Map<String, Double> = emptyMap(),
    val maxLabel: String = "Training max",
    /** optional display names for [startWeights] / [trainingMaxes] keys (slot ids, lift keys) */
    val labels: Map<String, String> = emptyMap(),
)

/** POST /api/app/programs/{id}/start body. Nulls are left out (AppJson has explicitNulls = false). */
@Serializable
data class ProgramStartBody(
    val options: Map<String, String>? = null,
    val trainingDays: List<Int>? = null,
    val startWeights: Map<String, Double>? = null,
    val trainingMaxes: Map<String, Double>? = null,
    val startDate: String? = null,
)

/** POST start answer: `{ ok, program }` where program is GET /api/app/program's document (or, leniently, its inner ProgramInfo). */
@Serializable(with = ProgramStartResultSerializer::class)
data class ProgramStartResult(val ok: Boolean = false, val program: AppProgram = AppProgram())

@Serializable
data class ProgramStartResultRaw(val ok: Boolean = false, val program: AppProgram = AppProgram())

object ProgramStartResultSerializer : kotlinx.serialization.KSerializer<ProgramStartResult> {
    private val raw = ProgramStartResultRaw.serializer()
    override val descriptor = raw.descriptor
    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ProgramStartResult) =
        encoder.encodeSerializableValue(raw, ProgramStartResultRaw(value.ok, value.program))
    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ProgramStartResult {
        val jd = decoder as? kotlinx.serialization.json.JsonDecoder ?: return decoder.decodeSerializableValue(raw).let { ProgramStartResult(it.ok, it.program) }
        val o = jd.decodeJsonElement() as? JsonObject ?: return ProgramStartResult()
        val ok = (o["ok"] as? JsonPrimitive)?.content == "true"
        val p = o["program"] as? JsonObject
        val doc = when {
            p == null -> AppProgram()
            "program" in p || p.isEmpty() -> jd.json.decodeFromJsonElement(AppProgram.serializer(), p)
            else -> AppProgram(jd.json.decodeFromJsonElement(ProgramInfo.serializer(), p))
        }
        return ProgramStartResult(ok, doc)
    }
}

/**
 * GET /api/app/programs/{id}/body?mode=load|gaps&opt.* (docs/api/programs.md): what the program does to
 * each muscle (weekly hard sets vs range, overlaps, a summary) and the two coloured figures.
 */
@Serializable
data class ProgramBody(
    val id: String = "",
    /** "load" | "gaps" */
    val mode: String = "load",
    val sex: String = "m",
    /** Mon = 0 */
    val trainingDays: List<@Serializable(LenientInt::class) Int> = emptyList(),
    /** calendar weeks measured; per-week numbers average over them */
    @Serializable(LenientInt::class) val weeks: Int = 1,
    val svgFront: String = "",
    val svgBack: String = "",
    val legend: List<String> = emptyList(),
    val muscles: List<ProgramBodyMuscle> = emptyList(),
    val overlaps: List<ProgramBodyOverlap> = emptyList(),
    val overlapsByWeek: List<@Serializable(LenientInt::class) Int> = emptyList(),
    val summary: ProgramBodySummary = ProgramBodySummary(),
)

@Serializable
data class ProgramBodyMuscle(
    val id: String = "",
    val name: String = "",
    val short: String = "",
    val group: String = "",
    /** 0–1 colour on the LOAD figure */
    val load: Double = 0.0,
    /** 0–1 colour on the GAPS figure (1 − lowest readiness) */
    val gap: Double = 0.0,
    val sets: Double = 0.0,
    val hardSets: Double = 0.0,
    /** weekly hard-set range [lo, hi], null = indirect only */
    val target: List<Double>? = null,
    /** "none" | "low" | "ok" | "high" | "n/a" */
    val status: String = "none",
    val hits: Double = 0.0,
    val minGapH: Double? = null,
    val recoverH: Double? = null,
    val minReadiness: Double = 1.0,
    /** per week */
    val overlaps: Double = 0.0,
    val lifts: List<String> = emptyList(),
)

@Serializable
data class ProgramBodyOverlap(
    @Serializable(LenientInt::class) val week: Int = 1,
    val muscle: String = "",
    val short: String = "",
    /** "MON A1" → "TUE B1" */
    val from: String = "",
    val to: String = "",
    val gapH: Double = 0.0,
    /** residual fatigue as a share of the previous dose (can pass 1 when older sessions add up) */
    val share: Double = 0.0,
    val prev: List<String> = emptyList(),
    val now: List<String> = emptyList(),
)

@Serializable
data class ProgramBodySummary(
    val mostTrained: List<BodyMuscleRef> = emptyList(),
    val gaps: List<BodyMuscleRef> = emptyList(),
    val overlapping: List<BodyMuscleRef> = emptyList(),
    val overlapsPerWeek: Double = 0.0,
    /** most trained · below range · overlaps, as sentences */
    val lines: List<String> = emptyList(),
)

@Serializable
data class BodyMuscleRef(
    val id: String = "",
    val short: String = "",
    val hardSets: Double = 0.0,
    val target: List<Double>? = null,
    val perWeek: Double = 0.0,
)
