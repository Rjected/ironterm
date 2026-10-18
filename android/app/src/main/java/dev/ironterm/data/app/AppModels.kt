package dev.ironterm.data.app

import dev.ironterm.data.NextSession
import dev.ironterm.data.Snapshot
import dev.ironterm.gym.LenientInt
import dev.ironterm.gym.LiveSession
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// The native app API (GET /api/app/*), mirrors web/shared/appapi.ts. One ready-to-render document
// per screen. Every field has a default so additive server changes never break parsing.
// Weights are in `unit`; dates are local YYYY-MM-DD.

object AppJson {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }
}

// ───────────── home ─────────────

@Serializable
data class AppHome(
    val snapshot: Snapshot = Snapshot(),
    val e1rm: List<E1rmRow> = emptyList(),
    val trend: List<TrendSeries> = emptyList(),
    val weekly: List<WeekVolume> = emptyList(),
    val watch: List<WatchItem> = emptyList(),
    val recentPRs: List<RecentPR> = emptyList(),
)

@Serializable
data class E1rmRow(
    val lift: String = "",
    val name: String = "",
    val short: String = "",
    val now: Double = 0.0,
    val d4w: Double? = null,
    val d12w: Double? = null,
    val best: Double = 0.0,
)

@Serializable
data class DatePoint(val date: String = "", val v: Double = 0.0)

@Serializable
data class TrendSeries(val lift: String = "", val short: String = "", val points: List<DatePoint> = emptyList())

@Serializable
data class WeekVolume(
    val week: String = "",
    val volume: Double = 0.0,
    @Serializable(LenientInt::class) val sessions: Int = 0,
    @Serializable(LenientInt::class) val sets: Int = 0,
)

@Serializable
data class WatchItem(
    val lift: String = "",
    val short: String = "",
    /** stall detector: progressing | stalled | regressing | …; program flags: severity */
    val status: String = "",
    val text: String = "",
    val rate: Double? = null,
)

@Serializable
data class RecentPR(
    val lift: String = "",
    val short: String = "",
    val kind: String = "",
    @Serializable(LenientInt::class) val reps: Int = 0,
    val weight: Double = 0.0,
    val date: String = "",
)

// ───────────── gym ─────────────

@Serializable
data class AppGym(
    val unit: String = "kg",
    val programName: String? = null,
    val live: LiveSession? = null,
    val next: NextSession? = null,
    /** the next program day in full (rest, slot, notes): offline starts build the same session the server would */
    val plan: dev.ironterm.gym.PlannedSession? = null,
    val days: List<GymDay> = emptyList(),
    val catalog: List<CatalogItem> = emptyList(),
)

@Serializable
data class GymDay(@Serializable(LenientInt::class) val dayIndex: Int = 0, val dayId: String = "", val dayName: String = "")

@Serializable
data class CatalogItem(val key: String = "", val name: String = "", val kind: String = "barbell", val hevy: String? = null)

/** POST /api/app/gym/start body. */
@Serializable
data class GymStart(val dayIndex: Int? = null, val empty: Boolean? = null)

// ───────────── lifts ─────────────

@Serializable
data class AppLiftList(val lifts: List<LiftRow> = emptyList())

@Serializable
data class LiftRow(
    val key: String = "",
    val name: String = "",
    val short: String = "",
    val kind: String = "barbell",
    val e1rm: Double = 0.0,
    val best: Double = 0.0,
    @Serializable(LenientInt::class) val sessions: Int = 0,
    val last: String = "",
    val status: String? = null,
    val spark: List<Double> = emptyList(),
)

@Serializable
data class AppLiftDetail(
    val key: String = "",
    val name: String = "",
    val short: String = "",
    val kind: String = "barbell",
    val unit: String = "kg",
    val e1rm: Double? = null,
    val best: BestE1rm? = null,
    val yearAgo: Double? = null,
    val points: List<LiftPoint> = emptyList(),
    val repPRs: List<RepPR> = emptyList(),
    val prWall: List<PrWallRow> = emptyList(),
    val stall: Stall? = null,
    val projection: Projection? = null,
    val rpe: List<RpeCell> = emptyList(),
)

@Serializable
data class BestE1rm(val e1rm: Double = 0.0, val date: String = "")

@Serializable
data class LiftPoint(
    val date: String = "",
    val workoutId: String = "",
    val e1rm: Double = 0.0,
    val topWeight: Double = 0.0,
    @Serializable(LenientInt::class) val topReps: Int = 0,
    val volume: Double = 0.0,
    val sets: List<PointSet> = emptyList(),
)

@Serializable
data class PointSet(val weight: Double = 0.0, @Serializable(LenientInt::class) val reps: Int = 0, val rpe: Double? = null)

@Serializable
data class RepPR(@Serializable(LenientInt::class) val reps: Int = 0, val weight: Double = 0.0, val date: String = "")

@Serializable
data class PrWallRow(
    @Serializable(LenientInt::class) val reps: Int = 0,
    val weight: Double = 0.0,
    val date: String = "",
    @Serializable(LenientInt::class) val stoodDays: Int = 0,
)

@Serializable
data class Stall(val status: String = "", val reason: String = "", val change6w: Double? = null, val change12w: Double? = null)

@Serializable
data class Projection(
    val status: String = "",
    val note: String = "",
    val current: Double? = null,
    val projected: Double? = null,
    val band: List<Band> = emptyList(),
)

@Serializable
data class Band(val date: String = "", val lo: Double = 0.0, val mid: Double = 0.0, val hi: Double = 0.0)

@Serializable
data class RpeCell(@Serializable(LenientInt::class) val reps: Int = 0, val rpe: Double = 0.0, val pct: Double = 0.0)

// ───────────── history ─────────────

@Serializable
data class WorkoutSummary(
    val id: String = "",
    val date: String = "",
    val start: String = "",
    val title: String = "",
    val durationMin: Double = 0.0,
    val volume: Double = 0.0,
    @Serializable(LenientInt::class) val sets: Int = 0,
    val exercises: List<String> = emptyList(),
    val programDay: String? = null,
    val hasNotes: Boolean = false,
)

@Serializable
data class AppHistory(val workouts: List<WorkoutSummary> = emptyList(), val next: String? = null, @Serializable(LenientInt::class) val total: Int = 0)

@Serializable
data class AppWorkout(
    val summary: WorkoutSummary = WorkoutSummary(),
    val unit: String = "kg",
    val note: String = "",
    val exercises: List<WorkoutExercise> = emptyList(),
    val program: WorkoutProgram? = null,
)

@Serializable
data class WorkoutExercise(val title: String = "", val lift: String? = null, val note: String? = null, val sets: List<WorkoutSet> = emptyList())

@Serializable
data class WorkoutSet(
    val type: String = "normal",
    val weight: Double? = null,
    val reps: Double? = null,
    val rpe: Double? = null,
    val distanceM: Double? = null,
    val durationSec: Double? = null,
    val e1rm: Double? = null,
)

@Serializable
data class WorkoutProgram(val dayId: String = "", val results: List<ProgramResult> = emptyList())

@Serializable
data class ProgramResult(
    val lift: String = "",
    val tier: String = "",
    val scheme: String = "",
    val weight: Double = 0.0,
    /** success | hold | fail | stage-down | deload | retest-next | retested | reset | tm-up | tm-down | missed */
    val outcome: String = "",
    val note: String = "",
)

/** PUT /api/workouts/{id}/notes body. */
@Serializable
data class NotesEdit(val description: String, val exercises: List<String?>)

// ───────────── calendar ─────────────

@Serializable
data class AppCalendar(
    val month: String = "",
    val days: List<CalDay> = emptyList(),
    val week: CalWeek = CalWeek(),
    val trips: List<Trip> = emptyList(),
)

@Serializable
data class CalDay(
    val date: String = "",
    val inMonth: Boolean = true,
    /** done | planned | missed | rest | travel | today */
    val status: String = "rest",
    val workouts: List<CalWorkout> = emptyList(),
    val planned: CalPlanned? = null,
    val trip: String? = null,
)

@Serializable
data class CalWorkout(val id: String = "", val title: String = "")

@Serializable
data class CalPlanned(val dayId: String = "", val dayName: String = "")

@Serializable
data class CalWeek(
    @Serializable(LenientInt::class) val planned: Int = 0,
    @Serializable(LenientInt::class) val done: Int = 0,
    @Serializable(LenientInt::class) val left: Int = 0,
    val label: String = "",
)

@Serializable
data class Trip(val id: String = "", val name: String = "", val start: String = "", val end: String = "", val gym: String = "")

// ───────────── program ─────────────

@Serializable
data class AppProgram(val program: ProgramInfo? = null)

@Serializable
data class ProgramInfo(
    val name: String = "",
    val author: String? = null,
    val templateId: String = "",
    val unit: String = "kg",
    @Serializable(LenientInt::class) val week: Int = 1,
    val weekName: String? = null,
    val complete: Boolean = false,
    val reentry: Reentry? = null,
    val slots: List<Slot> = emptyList(),
    val upcoming: List<Upcoming> = emptyList(),
    val log: List<LogEntry> = emptyList(),
    val pushed: Boolean = false,
)

@Serializable
data class Reentry(@Serializable(LenientInt::class) val done: Int = 0, @Serializable(LenientInt::class) val total: Int = 0)

@Serializable
data class Slot(
    val slotId: String = "",
    val lift: String = "",
    val name: String = "",
    val tier: String = "",
    val scheme: String = "",
    val weight: Double = 0.0,
    @Serializable(LenientInt::class) val stage: Int = 0,
    val stages: List<String> = emptyList(),
    /** what happens next: "10 reps → 525" / "miss → retest 5RM" */
    val ifSuccess: String? = null,
    val ifFail: String? = null,
    val note: String? = null,
)

@Serializable
data class Upcoming(val date: String = "", val dayId: String = "", val dayName: String = "", val exercises: List<UpcomingExercise> = emptyList())

@Serializable
data class UpcomingExercise(val short: String = "", val tier: String = "", val summary: String = "")

@Serializable
data class LogEntry(val date: String = "", val dayId: String = "", val results: List<ProgramResult> = emptyList())

// ───────────── body ─────────────

@Serializable
data class AppBody(
    val mode: String = "ready",
    val sex: String = "m",
    val svgFront: String = "",
    val svgBack: String = "",
    val legend: List<String> = emptyList(),
    val muscles: List<BodyMuscle> = emptyList(),
)

@Serializable
data class BodyMuscle(
    val id: String = "",
    val name: String = "",
    val short: String = "",
    val group: String = "",
    val value: Double = 0.0,
    val readiness: Double = 1.0,
    val readyInH: Double = 0.0,
    val sets7: Double = 0.0,
    val sets28: Double = 0.0,
    val target: List<Double>? = null,
    val status: String? = null,
)

// ───────────── insights / stats ─────────────

@Serializable
data class AppInsights(
    val projections: List<LiftProjection> = emptyList(),
    val balance: Balance? = null,
    val achievements: Achievements = Achievements(),
)

@Serializable
data class LiftProjection(
    val lift: String = "",
    val short: String = "",
    val status: String = "",
    val note: String = "",
    val current: Double? = null,
    val projected: Double? = null,
)

@Serializable
data class Balance(val summary: String = "", val lagging: List<String> = emptyList(), val ratios: List<Ratio> = emptyList())

@Serializable
data class Ratio(val name: String = "", val value: Double = 0.0, val lo: Double = 0.0, val hi: Double = 0.0, val status: String = "balanced")

@Serializable
data class Achievements(
    @Serializable(LenientInt::class) val unlocked: Int = 0,
    @Serializable(LenientInt::class) val total: Int = 0,
    val recent: List<Achievement> = emptyList(),
    val next: List<Achievement> = emptyList(),
)

@Serializable
data class Achievement(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    /** bronze | silver | gold */
    val tier: String = "bronze",
    val category: String = "",
    val unlockedAt: String? = null,
    val progress: Double = 0.0,
    val current: Double = 0.0,
    val target: Double = 0.0,
    val measure: String = "",
)

@Serializable
data class AppStats(
    val unit: String = "kg",
    val weekly: List<WeekVolume> = emptyList(),
    val totals: StatsTotals = StatsTotals(),
    val cardio: CardioTotals? = null,
)

@Serializable
data class StatsTotals(
    @Serializable(LenientInt::class) val workouts: Int = 0,
    @Serializable(LenientInt::class) val sessions52: Int = 0,
    val avgMin: Double = 0.0,
    val streak: dev.ironterm.data.Streak = dev.ironterm.data.Streak(),
)

@Serializable
data class CardioTotals(
    @Serializable(LenientInt::class) val sessions: Int = 0,
    val distance: Double = 0.0,
    val durationMin: Double = 0.0,
    val unit: String = "km",
)

/** POST /api/live/finish response. */
@Serializable
data class FinishResult(
    val workout: FinishedWorkout = FinishedWorkout(),
    val demo: Boolean = false,
    /** local mode: stored on the server, no Hevy connected */
    val local: Boolean = false,
    /** the server already had this session (idempotent retry) */
    val duplicate: Boolean = false,
    /** PRs this workout set, null on servers that don't send them */
    val prs: List<FinishPr>? = null,
)

@Serializable
data class FinishPr(
    val lift: String = "",
    val short: String = "",
    val kind: String = "",
    @Serializable(LenientInt::class) val reps: Int = 0,
    val weight: Double = 0.0,
    val prev: Double? = null,
) {
    /** "SQUAT 185×5 · REP PR (was 175)" */
    fun line(): String = "$short ${dev.ironterm.Fmt.w(weight)}×$reps · ${kind.uppercase()} PR" + (prev?.let { " (was ${dev.ironterm.Fmt.w(it)})" } ?: "")
}

@Serializable
data class FinishedWorkout(val id: String = "")

/** GET /api/templates row. */
@Serializable
data class HevyTemplate(val id: String = "", val title: String = "", val equipment: String? = null)
