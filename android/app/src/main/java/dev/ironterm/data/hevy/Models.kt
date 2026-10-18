package dev.ironterm.data.hevy

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Hevy public API v1 (https://api.hevyapp.com/docs), only the fields Direct mode needs.

@Serializable
data class WorkoutsResponse(
    val page: Int = 1,
    @SerialName("page_count") val pageCount: Int = 1,
    val workouts: List<Workout> = emptyList(),
)

@Serializable
data class Workout(
    val id: String,
    val title: String = "",
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val description: String? = null,
    val exercises: List<Exercise> = emptyList(),
)

@Serializable
data class Exercise(
    val title: String = "",
    @SerialName("exercise_template_id") val exerciseTemplateId: String? = null,
    val notes: String? = null,
    val sets: List<ExerciseSet> = emptyList(),
)

@Serializable
data class ExerciseSet(
    val type: String? = null,
    @SerialName("weight_kg") val weightKg: Double? = null,
    val reps: Int? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    val rpe: Double? = null,
) {
    val isWarmup: Boolean get() = type == "warmup"
}
