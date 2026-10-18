package dev.ironterm.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Snapshot v1, mirrors web/shared/snapshot.ts (GET /api/snapshot). Both data sources produce it:
 * Server mode downloads it, Direct mode computes the subset it can from the Hevy API. The UI and
 * the widgets only ever read this type, so they don't care which source is active.
 *
 * Every field has a default so additive server changes and partial documents never break parsing.
 */
@Serializable
data class Snapshot(
    val v: Int = 1,
    val generatedAt: String = "",
    val today: String = "",
    val unit: String = "kg",
    val tz: String = "UTC",
    val demo: Boolean = false,
    val graph: Graph = Graph(),
    val streak: Streak = Streak(),
    val week: Week = Week(),
    val totals: Totals = Totals(),
    val last: LastWorkout? = null,
    val program: Program? = null,
    val lifts: List<Lift> = emptyList(),
    val recovery: Recovery? = null,
    /**
     * From the server: where the workouts come from. "hevy" (synced from Hevy), "local" (no Hevy
     * connected: a Strong import and sessions logged in GYM live on the server) or "demo"; null from
     * older servers.
     */
    val source: String? = null,
    /** Local only (not sent by the server): which data source produced this, "server" or "direct". */
    val origin: String = SOURCE_SERVER,
) {
    companion object {
        const val SOURCE_SERVER = "server"
        const val SOURCE_DIRECT = "direct"
        const val LOG_LOCAL = "local"
    }

    // Caches written before [origin] existed kept "direct" in the source field.
    val isDirect: Boolean get() = origin == SOURCE_DIRECT || source == SOURCE_DIRECT

    /** The server has no Hevy key: it is the training log, nothing goes to or comes from Hevy. */
    val isLocal: Boolean get() = source == LOG_LOCAL
}

@Serializable
data class Graph(val start: String = "", val days: List<GraphDay> = emptyList())

@Serializable
data class GraphDay(val date: String, val level: Int = 0, val value: Double = 0.0)

@Serializable
data class Streak(val current: Int = 0, val best: Int = 0)

@Serializable
data class Week(val target: Int = 0, val done: Int = 0, val days: List<WeekDay> = emptyList())

@Serializable
data class WeekDay(val date: String, val dow: String, val status: String = STATUS_REST) {
    companion object {
        const val STATUS_DONE = "done"
        const val STATUS_PLANNED = "planned"
        const val STATUS_TODAY = "today"
        const val STATUS_REST = "rest"
        const val STATUS_MISSED = "missed"
        const val STATUS_TRAVEL = "travel"
    }
}

@Serializable
data class Totals(
    val sessions52: Int = 0,
    val sessionsPrev52: Int = 0,
    val vol7: Double = 0.0,
    val volPrev7: Double = 0.0,
    val avgMin: Double = 0.0,
    val allTime: Int = 0,
)

@Serializable
data class LastWorkout(
    val title: String = "",
    val date: String = "",
    val durationMin: Double = 0.0,
    val volume: Double = 0.0,
    val sets: Int = 0,
    val exercises: Int = 0,
)

@Serializable
data class Program(val name: String = "", val next: NextSession? = null)

@Serializable
data class NextSession(
    val dayName: String = "",
    val weekName: String? = null,
    @SerialName("when") val whenLabel: String = "",
    val date: String? = null,
    val reentry: Boolean = false,
    val exercises: List<PlannedExercise> = emptyList(),
)

@Serializable
data class PlannedExercise(
    val lift: String = "",
    val name: String = "",
    val short: String = "",
    val tier: String = "",
    val scheme: String = "",
    val summary: String = "",
    val top: Double = 0.0,
    val sets: List<PlannedSet> = emptyList(),
)

@Serializable
data class PlannedSet(
    val reps: Int = 0,
    val repsMax: Int? = null,
    val weight: Double = 0.0,
    val amrap: Boolean = false,
    val rpe: Double? = null,
)

@Serializable
data class Lift(
    val key: String,
    val name: String = "",
    val short: String = "",
    val e1rm: Double = 0.0,
    val delta28: Double? = null,
    val spark: List<Double> = emptyList(),
)

@Serializable
data class Recovery(val overall: Double = 0.0, val muscles: List<Muscle> = emptyList())

@Serializable
data class Muscle(val id: String, val name: String = "", val readiness: Double = 1.0, val readyInH: Double = 0.0)

object SnapshotJson {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }

    fun parse(text: String): Snapshot = json.decodeFromString(Snapshot.serializer(), text)
    fun encode(s: Snapshot): String = json.encodeToString(Snapshot.serializer(), s)
}
