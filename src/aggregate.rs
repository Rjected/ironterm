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

        // Ensure any workout counts, even bodyweight-only ones
        let entry = volumes.entry(date).or_insert(0.0);
        *entry += workout_volume.max(1.0);
    }

    volumes
}
