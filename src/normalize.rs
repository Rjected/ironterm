/// Compute intensity levels (0-4) for each volume using quantile-based normalization.
/// 
/// - 0 = no workout (volume == 0)
/// - 1-4 = quartile buckets for non-zero volumes
pub fn compute_intensity_levels(volumes: &[f64]) -> Vec<u8> {
    // Collect non-zero volumes and sort them
    let mut non_zero: Vec<f64> = volumes.iter().copied().filter(|&v| v > 0.0).collect();
    non_zero.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // If no non-zero volumes, everything is level 0
    if non_zero.is_empty() {
        return vec![0; volumes.len()];
    }

    // Compute quartile thresholds (25%, 50%, 75%)
    let q1 = percentile(&non_zero, 25.0);
    let q2 = percentile(&non_zero, 50.0);
    let q3 = percentile(&non_zero, 75.0);

    // Map each volume to intensity level
    volumes
        .iter()
        .map(|&v| {
            if v == 0.0 {
                0
            } else if v <= q1 {
                1
            } else if v <= q2 {
                2
            } else if v <= q3 {
                3
            } else {
                4
            }
        })
        .collect()
}

/// Calculate the p-th percentile of a sorted slice using linear interpolation.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }

    let rank = (p / 100.0) * (sorted.len() - 1) as f64;
    let lower = rank.floor() as usize;
    let upper = rank.ceil() as usize;
    let frac = rank - lower as f64;

    if lower == upper {
        sorted[lower]
    } else {
        sorted[lower] * (1.0 - frac) + sorted[upper] * frac
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_zeros() {
        let volumes = vec![0.0, 0.0, 0.0];
        let levels = compute_intensity_levels(&volumes);
        assert_eq!(levels, vec![0, 0, 0]);
    }

    #[test]
    fn test_single_nonzero() {
        // One training day: every quartile equals it, so it's the lightest non-zero level, the
        // same as GitHub's graph and the web / Android / iOS ports of this function.
        let volumes = vec![0.0, 100.0, 0.0];
        let levels = compute_intensity_levels(&volumes);
        assert_eq!(levels, vec![0, 1, 0]);
    }

    #[test]
    fn test_quartile_distribution() {
        let volumes = vec![0.0, 10.0, 20.0, 30.0, 40.0];
        let levels = compute_intensity_levels(&volumes);
        assert_eq!(levels[0], 0); // zero
        assert!(levels[1] >= 1 && levels[1] <= 4);
        assert!(levels[4] >= levels[1]); // highest should be >= lowest
    }
}
