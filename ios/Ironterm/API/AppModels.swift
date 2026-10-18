import Foundation

// Swift mirror of web/shared/appapi.ts: one ready-to-render document per screen. The server
// computes, the app renders. Fields are only ever added, so unknown keys are ignored and
// anything the TS type allows to be null is optional here. Samples: docs/api/app/*.json.

struct AppHome: Codable, Equatable {
    var snapshot: Snapshot
    var e1rm: [E1RM]
    var trend: [Trend]
    var weekly: [Week]
    var watch: [Watch]
    var recentPRs: [PR]

    struct E1RM: Codable, Equatable, Identifiable {
        var lift: String; var name: String; var short: String
        var now: Double; var d4w: Double?; var d12w: Double?; var best: Double
        var id: String { lift }
    }
    struct Trend: Codable, Equatable, Identifiable {
        var lift: String; var short: String; var points: [Point]
        var id: String { lift }
        struct Point: Codable, Equatable { var date: String; var v: Double }
    }
    struct Week: Codable, Equatable { var week: String; var volume: Double; var sessions: Int; var sets: Int }
    struct Watch: Codable, Equatable { var lift: String; var short: String; var status: String; var text: String; var rate: Double? }
    struct PR: Codable, Equatable { var lift: String; var short: String; var kind: String; var reps: Int; var weight: Double; var date: String }
}

struct AppGym: Codable, Equatable {
    var unit: String
    var programName: String?
    var live: LiveSession?
    var next: Snapshot.NextSession?
    /// the next session as the program engine plans it (rest times, slot ids, what happens next);
    /// lets the app start it offline exactly like the server would
    var plan: PlannedSession?
    var days: [ProgramDay]
    var catalog: [CatalogItem]

    struct ProgramDay: Codable, Equatable, Identifiable { var dayIndex: Int; var dayId: String; var dayName: String; var id: Int { dayIndex } }
    struct CatalogItem: Codable, Equatable, Identifiable { var key: String; var name: String; var kind: String; var hevy: String?; var id: String { key } }
}

struct AppLiftList: Codable, Equatable {
    var lifts: [Lift]
    struct Lift: Codable, Equatable, Identifiable {
        var key: String; var name: String; var short: String; var kind: String
        var e1rm: Double; var best: Double; var sessions: Int; var last: String; var status: String?
        var spark: [Double]
        var id: String { key }
    }
}

struct AppLiftDetail: Codable, Equatable {
    var key: String; var name: String; var short: String; var kind: String; var unit: String
    var e1rm: Double?
    var best: Best?
    var yearAgo: Double?
    var points: [Point]
    var repPRs: [RepPR]
    var prWall: [WallItem]
    var stall: Stall?
    var projection: Projection?
    var rpe: [RPE]

    struct Best: Codable, Equatable { var e1rm: Double; var date: String }
    struct Point: Codable, Equatable, Identifiable {
        var date: String; var workoutId: String; var e1rm: Double; var topWeight: Double; var topReps: Int; var volume: Double
        var sets: [PSet]
        var id: String { workoutId + date }
        struct PSet: Codable, Equatable { var weight: Double; var reps: Int; var rpe: Double? }
    }
    struct RepPR: Codable, Equatable { var reps: Int; var weight: Double; var date: String }
    struct WallItem: Codable, Equatable { var reps: Int; var weight: Double; var date: String; var stoodDays: Int }
    struct Stall: Codable, Equatable { var status: String; var reason: String; var change6w: Double?; var change12w: Double? }
    struct Projection: Codable, Equatable {
        var status: String; var note: String; var current: Double?; var projected: Double?
        var band: [Band]
        struct Band: Codable, Equatable { var date: String; var lo: Double; var mid: Double; var hi: Double }
    }
    struct RPE: Codable, Equatable { var reps: Int; var rpe: Double; var pct: Double }
}

struct AppWorkoutSummary: Codable, Equatable, Identifiable, Hashable {
    var id: String; var date: String; var start: String; var title: String
    var durationMin: Double; var volume: Double; var sets: Int
    var exercises: [String]
    var programDay: String?
    var hasNotes: Bool
}

struct AppHistory: Codable, Equatable {
    var workouts: [AppWorkoutSummary]
    var next: String?
    var total: Int
}

struct AppWorkout: Codable, Equatable {
    var summary: AppWorkoutSummary
    var unit: String
    var note: String
    var exercises: [Ex]
    var program: Program?

    struct Ex: Codable, Equatable {
        var title: String; var lift: String?; var note: String?
        var sets: [WSet]
    }
    struct WSet: Codable, Equatable {
        var type: String; var weight: Double?; var reps: Int?; var rpe: Double?
        var distanceM: Double?; var durationSec: Double?; var e1rm: Double?
    }
    struct Program: Codable, Equatable { var dayId: String; var results: [ProgramResult] }
}

struct ProgramResult: Codable, Equatable {
    var lift: String; var tier: String; var scheme: String; var weight: Double
    /// success | fail | hold | … (kept as a string so new outcomes don't break decoding)
    var outcome: String
    var note: String
}

struct AppCalendar: Codable, Equatable {
    var month: String
    var days: [CDay]
    var week: WeekInfo
    var trips: [Trip]

    struct CDay: Codable, Equatable, Identifiable {
        var date: String; var inMonth: Bool
        /// done | planned | missed | rest | travel | today
        var status: String
        var workouts: [WRef]
        var planned: Planned?
        var trip: String?
        var id: String { date }
        struct WRef: Codable, Equatable, Identifiable { var id: String; var title: String }
        struct Planned: Codable, Equatable { var dayId: String; var dayName: String }
    }
    struct WeekInfo: Codable, Equatable { var planned: Int; var done: Int; var left: Int; var label: String }
    struct Trip: Codable, Equatable, Identifiable { var id: String; var name: String; var start: String; var end: String; var gym: String }
}

struct AppProgram: Codable, Equatable {
    var program: Program?

    struct Program: Codable, Equatable {
        var name: String; var author: String?; var templateId: String; var unit: String
        var week: Int; var weekName: String?; var complete: Bool
        var reentry: Reentry?
        var slots: [Slot]
        var upcoming: [Upcoming]
        var log: [LogEntry]
        var pushed: Bool
    }
    struct Reentry: Codable, Equatable { var done: Int; var total: Int }
    struct Slot: Codable, Equatable, Identifiable {
        var slotId: String; var lift: String; var name: String; var tier: String; var scheme: String
        var weight: Double; var stage: Int; var stages: [String]
        /// what happens next session
        var ifSuccess: String?; var ifFail: String?; var note: String?
        var id: String { slotId }
    }
    struct Upcoming: Codable, Equatable {
        var date: String; var dayId: String; var dayName: String
        var exercises: [UEx]
        struct UEx: Codable, Equatable { var short: String; var tier: String; var summary: String }
    }
    struct LogEntry: Codable, Equatable { var date: String; var dayId: String; var results: [ProgramResult] }
}

struct AppBody: Codable, Equatable {
    var mode: String
    var sex: String
    var svgFront: String
    var svgBack: String
    var legend: [String]
    var muscles: [Muscle]

    struct Muscle: Codable, Equatable, Identifiable {
        var id: String; var name: String; var short: String; var group: String
        var value: Double; var readiness: Double; var readyInH: Double
        var sets7: Double; var sets28: Double
        var target: [Double]?
        var status: String?
    }
}

struct Achievement: Codable, Equatable, Identifiable {
    var id: String; var title: String; var description: String; var tier: String; var category: String
    var current: Double?; var target: Double?; var measure: String?
    var unlockedAt: String?
    var progress: Double
}

struct AppInsights: Codable, Equatable {
    var projections: [Projection]
    var balance: Balance?
    var achievements: Achievements

    struct Projection: Codable, Equatable, Identifiable {
        var lift: String; var short: String; var status: String; var note: String; var current: Double?; var projected: Double?
        var id: String { lift }
    }
    struct Balance: Codable, Equatable {
        var summary: String; var lagging: [String]
        var ratios: [Ratio]
        struct Ratio: Codable, Equatable { var name: String; var value: Double; var lo: Double; var hi: Double; var status: String }
    }
    struct Achievements: Codable, Equatable { var unlocked: Int; var total: Int; var recent: [Achievement]; var next: [Achievement] }
}

struct AppStats: Codable, Equatable {
    var unit: String
    var weekly: [AppHome.Week]
    var totals: Totals
    var cardio: Cardio?

    struct Totals: Codable, Equatable { var workouts: Int; var sessions52: Int; var avgMin: Double; var streak: Snapshot.Streak }
    struct Cardio: Codable, Equatable { var sessions: Int; var distance: Double; var durationMin: Double; var unit: String }
}

/// PUT /api/workouts/{id}/notes body (web/shared/notes.ts NotesEdit)
struct NotesEdit: Codable, Equatable {
    var description: String
    /// one per exercise, same order as the workout's exercises
    var exercises: [String?]
}

struct FinishResult: Codable, Equatable {
    struct W: Codable, Equatable { var id: String }
    var workout: W
    var demo: Bool?
    /// local mode: stored on the server, which has no Hevy connected
    var local: Bool?
    /// a retry of a finish the server already logged (POST /api/live/finish is idempotent per session id)
    var duplicate: Bool?
    /// records set by this workout
    var prs: [FinishPR]?
}

struct FinishPR: Codable, Equatable {
    var lift: String; var short: String
    /// rep | e1rm | …
    var kind: String
    var reps: Int; var weight: Double; var prev: Double?
}

struct PushResult: Codable, Equatable {
    struct P: Codable, Equatable { var dayId: String; var title: String }
    var pushed: [P]?
}
