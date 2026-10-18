package dev.ironterm

import dev.ironterm.data.Snapshot
import dev.ironterm.data.SnapshotJson
import dev.ironterm.data.hevy.Exercise
import dev.ironterm.data.hevy.ExerciseSet
import dev.ironterm.data.hevy.Workout
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.random.Random

object TestData {
    /** docs/api/snapshot.sample.json, copied into test resources. */
    val fixtureText: String by lazy {
        TestData::class.java.classLoader!!.getResource("snapshot.sample.json")!!.readText()
    }
    val fixture: Snapshot by lazy { SnapshotJson.parse(fixtureText) }

    val zone: ZoneId = ZoneId.of("America/New_York")

    fun set(kg: Double, reps: Int, type: String = "normal") = ExerciseSet(type = type, weightKg = kg, reps = reps)

    fun workout(id: String, date: LocalDate, title: String, vararg ex: Exercise, hour: Int = 18, minutes: Long = 60): Workout {
        val start = date.atTime(hour, 0).atZone(zone).toOffsetDateTime().withOffsetSameInstant(ZoneOffset.UTC)
        return Workout(id, title, start.toString(), start.plusMinutes(minutes).toString(), start.toString(), ex.toList())
    }

    /** ~10 months of a 4-day split with steady progress, deterministic. Newest first like the API. */
    fun history(today: LocalDate, weeks: Int = 44): List<Workout> {
        val r = Random(7)
        val out = ArrayList<Workout>()
        val days = listOf(0L, 1L, 3L, 4L) // Mon Tue Thu Fri
        val monday = today.minusDays((today.dayOfWeek.value - 1).toLong())
        var n = 0
        for (w in weeks downTo 0) {
            val wkStart = monday.minusWeeks(w.toLong())
            val prog = (weeks - w) / weeks.toDouble()
            for ((i, d) in days.withIndex()) {
                val date = wkStart.plusDays(d)
                if (date.isAfter(today)) continue
                if (r.nextDouble() < 0.12) continue // missed sessions
                val ex = when (i) {
                    0 -> arrayOf(Exercise("Squat (Barbell)", sets = listOf(set(60.0, 5, "warmup")) + List(5) { set(120 + 40 * prog, 5) }),
                        Exercise("Leg Press (Machine)", sets = List(3) { set(180 + 60 * prog, 10) }))
                    1 -> arrayOf(Exercise("Bench Press (Barbell)", sets = List(5) { set(90 + 25 * prog, 5) }),
                        Exercise("Lat Pulldown (Cable)", sets = List(3) { set(55 + 15 * prog, 12) }))
                    2 -> arrayOf(Exercise("Deadlift (Barbell)", sets = List(3) { set(150 + 45 * prog, 5) }),
                        Exercise("Dumbbell Row", sets = List(3) { set(30 + 10 * prog, 10) }))
                    else -> arrayOf(Exercise("Overhead Press (Barbell)", sets = List(5) { set(55 + 15 * prog, 5) }),
                        Exercise("Bicep Curl (Dumbbell)", sets = List(3) { set(14 + 4 * prog, 12) }),
                        Exercise("Plank", sets = listOf(ExerciseSet(type = "normal", durationSeconds = 60))))
                }
                out.add(workout("w${n++}", date, listOf("Lower A", "Upper A", "Lower B", "Upper B")[i], *ex, minutes = 55L + r.nextInt(25)))
            }
        }
        return out.reversed()
    }
}
