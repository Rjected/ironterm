use std::collections::HashMap;

use chrono::{Local, NaiveDate};

use crate::models::Workout;

pub fn aggregate_daily_volume(workouts: &[Workout]) -> HashMap<NaiveDate, f64> {
    let mut volumes: HashMap<NaiveDate, f64> = HashMap::new();

    for workout in workouts {
        let date = workout.start_time.with_timezone(&Local).date_naive();
        let mut workout_volume: f64 = 0.0;

        for exercise in &workout.exercises {
            for set in &exercise.sets {
                let weight = set.weight_kg.unwrap_or(0.0);
                let reps = set.reps.unwrap_or(0) as f64;
                workout_volume += weight * reps;
            }
        }

        // Cardio-only (or bodyweight) workouts produce no weight×reps volume.
        // Ensure every logged workout with exercises shows as at least a filled
        // square on the graph by using a small minimum volume.
        if !workout.exercises.is_empty() && workout_volume == 0.0 {
            workout_volume = 1.0;
        }

        *volumes.entry(date).or_insert(0.0) += workout_volume;
    }

    volumes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Exercise, ExerciseSet, Workout};
    use chrono::DateTime;

    fn make_workout(
        start: &str,
        exercises: Vec<Exercise>,
    ) -> Workout {
        Workout {
            id: "test".to_string(),
            title: "Test Workout".to_string(),
            start_time: DateTime::parse_from_rfc3339(start).unwrap(),
            end_time: DateTime::parse_from_rfc3339(start).unwrap(),
            exercises,
        }
    }

    fn cardio_set(duration_seconds: i32) -> ExerciseSet {
        ExerciseSet {
            set_type: "cardio".to_string(),
            weight_kg: None,
            reps: None,
            distance_meters: None,
            duration_seconds: Some(duration_seconds),
            rpe: None,
        }
    }

    fn strength_set(weight_kg: f64, reps: i32) -> ExerciseSet {
        ExerciseSet {
            set_type: "normal".to_string(),
            weight_kg: Some(weight_kg),
            reps: Some(reps),
            distance_meters: None,
            duration_seconds: None,
            rpe: None,
        }
    }

    #[test]
    fn test_cardio_only_workout_shows_as_nonzero() {
        let workouts = vec![make_workout(
            "2024-01-01T10:00:00+00:00",
            vec![Exercise {
                title: "Running".to_string(),
                exercise_template_id: "run".to_string(),
                sets: vec![cardio_set(1800)],
            }],
        )];

        let volumes = aggregate_daily_volume(&workouts);
        let date = chrono::NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        assert!(
            volumes.get(&date).copied().unwrap_or(0.0) > 0.0,
            "cardio-only workout should produce non-zero volume"
        );
    }

    #[test]
    fn test_strength_workout_volume_unaffected() {
        let workouts = vec![make_workout(
            "2024-01-02T10:00:00+00:00",
            vec![Exercise {
                title: "Bench Press".to_string(),
                exercise_template_id: "bench".to_string(),
                sets: vec![strength_set(100.0, 5)],
            }],
        )];

        let volumes = aggregate_daily_volume(&workouts);
        let date = chrono::NaiveDate::from_ymd_opt(2024, 1, 2).unwrap();
        assert_eq!(
            volumes.get(&date).copied().unwrap_or(0.0),
            500.0,
            "strength workout volume should be weight × reps"
        );
    }

    #[test]
    fn test_mixed_workout_uses_strength_volume() {
        // A workout with both cardio and strength sets should use the
        // actual strength volume (not fall back to the 1.0 minimum).
        let workouts = vec![make_workout(
            "2024-01-03T10:00:00+00:00",
            vec![
                Exercise {
                    title: "Running".to_string(),
                    exercise_template_id: "run".to_string(),
                    sets: vec![cardio_set(600)],
                },
                Exercise {
                    title: "Squat".to_string(),
                    exercise_template_id: "squat".to_string(),
                    sets: vec![strength_set(80.0, 10)],
                },
            ],
        )];

        let volumes = aggregate_daily_volume(&workouts);
        let date = chrono::NaiveDate::from_ymd_opt(2024, 1, 3).unwrap();
        assert_eq!(
            volumes.get(&date).copied().unwrap_or(0.0),
            800.0,
            "mixed workout should use actual strength volume"
        );
    }

    #[test]
    fn test_no_exercises_produces_no_entry() {
        let workouts = vec![make_workout("2024-01-04T10:00:00+00:00", vec![])];
        let volumes = aggregate_daily_volume(&workouts);
        let date = chrono::NaiveDate::from_ymd_opt(2024, 1, 4).unwrap();
        assert_eq!(
            volumes.get(&date).copied().unwrap_or(0.0),
            0.0,
            "workout with no exercises should not produce a non-zero volume"
        );
    }
}
