import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// The Live Activity shown on the lock screen and in the Dynamic Island while a GYM session runs:
/// the rest countdown when resting, otherwise the session clock, plus the set to do next.
struct GymActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// rest ends at (nil = not resting)
        var restEnd: Date?
        /// when the current rest started (for the progress bar)
        var restStart: Date?
        /// e.g. "BENCH PRESS"
        var exercise: String
        /// e.g. "SET 3/5 · 185 × 5"
        var setLine: String
        var done: Int
        var total: Int
    }

    var title: String
    var startedAt: Date
}
#endif
