import Foundation

/// Swift mirror of `web/shared/snapshot.ts` (Snapshot v1). Served by GET /api/snapshot in Server
/// mode and built on-device by `DirectAggregator` in Direct mode. Fields are only ever added, so
/// everything that may be missing decodes leniently.
struct Snapshot: Codable, Equatable {
    var v: Int
    var generatedAt: String
    var today: String
    var unit: String
    var tz: String
    var demo: Bool
    var graph: Graph
    var streak: Streak
    var week: Week
    var totals: Totals
    var last: LastWorkout?
    var program: Program?
    var lifts: [Lift]
    var recovery: Recovery?

    struct Graph: Codable, Equatable {
        var start: String
        var days: [Day]
        struct Day: Codable, Equatable {
            var date: String
            var level: Int
            var value: Double
        }
    }

    struct Streak: Codable, Equatable {
        var current: Int
        var best: Int
    }

    struct Week: Codable, Equatable {
        var target: Int
        var done: Int
        var days: [Day]
        struct Day: Codable, Equatable {
            var date: String
            var dow: String
            /// done | planned | rest | missed | today | travel (kept as a string so new values don't break decoding)
            var status: String
        }
    }

    struct Totals: Codable, Equatable {
        var sessions52: Int
        var sessionsPrev52: Int
        var vol7: Double
        var volPrev7: Double
        var avgMin: Double
        var allTime: Int
    }

    struct LastWorkout: Codable, Equatable {
        var title: String
        var date: String
        var durationMin: Double
        var volume: Double
        var sets: Int
        var exercises: Int
    }

    struct Program: Codable, Equatable {
        var name: String
        var next: NextSession?
    }

    struct NextSession: Codable, Equatable {
        var dayName: String
        var weekName: String?
        var when: String
        var date: String?
        var reentry: Bool
        /// what the re-entry ramp does to this session, in words
        var reentryNote: String?
        var exercises: [Exercise]

        struct Exercise: Codable, Equatable {
            var lift: String
            var name: String
            var short: String
            var tier: String
            var scheme: String
            var summary: String
            var top: Double
            var sets: [PlannedSet]
        }

        struct PlannedSet: Codable, Equatable {
            var reps: Int
            var repsMax: Int?
            var weight: Double
            var amrap: Bool
            var rpe: Double?
        }
    }

    struct Lift: Codable, Equatable, Identifiable {
        var key: String
        var name: String
        var short: String
        var e1rm: Double
        var delta28: Double?
        var spark: [Double]
        var id: String { key }
    }

    struct Recovery: Codable, Equatable {
        var overall: Double
        var muscles: [Muscle]
        struct Muscle: Codable, Equatable, Identifiable {
            var id: String
            var name: String
            var readiness: Double
            var readyInH: Double
        }
    }
}

extension Snapshot {
    static func decode(_ data: Data) throws -> Snapshot {
        try JSONDecoder().decode(Snapshot.self, from: data)
    }

    func encoded() throws -> Data {
        try JSONEncoder().encode(self)
    }

    var unitLabel: String { unit.uppercased() }

    var next: NextSession? { program?.next }

    func lift(_ key: String?) -> Lift? {
        guard let key else { return lifts.first }
        return lifts.first { $0.key == key } ?? lifts.first
    }

    /// Lifts for the "big four" style views: the big four when present, else whatever leads the list.
    var bigFour: [Lift] {
        let big = LiftLibrary.bigFour.compactMap { k in lifts.first { $0.key == k } }
        if big.count >= 4 { return big }
        var out = big
        for l in lifts where !out.contains(where: { $0.key == l.key }) && out.count < 4 { out.append(l) }
        return out
    }

    /// "Next: Bench 325 · TOMORROW" for the inline lock screen widget.
    var inlineNext: String {
        if let n = next {
            if let e = n.exercises.first {
                let w = e.top > 0 ? " \(Fmt.weight(e.top))" : ""
                return "Next: \(e.short.capitalized)\(w) · \(n.when)"
            }
            return "Next: \(n.dayName) · \(n.when)"
        }
        return "Week \(week.done)/\(week.target) · streak \(streak.current)w"
    }

    var generatedDate: Date? { Fmt.parseISO(generatedAt) }
}

/// Small formatting helpers shared by the app and the widgets.
enum Fmt {
    static func weight(_ w: Double) -> String {
        let r = (w * 10).rounded() / 10 // float noise (149.99999 → 150)
        if r == r.rounded() { return String(Int(r)) }
        return String(format: "%.1f", r)
    }

    static func signed(_ d: Double) -> String {
        let s = weight(abs(d))
        return d > 0 ? "+\(s)" : d < 0 ? "−\(s)" : "±0"
    }

    static func compact(_ v: Double) -> String {
        let a = abs(v)
        if a >= 1_000_000 { return String(format: "%.1fM", v / 1_000_000) }
        if a >= 10_000 { return String(format: "%.0fK", v / 1000) }
        if a >= 1000 { return String(format: "%.1fK", v / 1000) }
        return String(Int(v.rounded()))
    }

    static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    /// "2026-10-15" → "THU 15 OCT"
    static func dayLabel(_ ymd: String) -> String {
        guard let d = Day.date(ymd) else { return ymd }
        let dow = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][Day.weekdayIndex(ymd)]
        let mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.day, .month], from: d)
        return "\(dow) \(c.day ?? 0) \(mon[(c.month ?? 1) - 1])"
    }

    static func ago(_ date: Date?, now: Date = Date()) -> String {
        guard let date else { return "NEVER" }
        let s = Int(now.timeIntervalSince(date))
        if s < 60 { return "JUST NOW" }
        if s < 3600 { return "\(s / 60)M AGO" }
        if s < 86400 { return "\(s / 3600)H AGO" }
        return "\(s / 86400)D AGO"
    }
}

/// Date-only arithmetic on "YYYY-MM-DD" strings, done at UTC noon exactly like web/shared/stats.ts.
enum Day {
    private static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static func date(_ ymd: String) -> Date? {
        let p = ymd.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
    }

    static func string(_ d: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Local calendar date of an instant in a time zone.
    static func local(_ instant: Date, tz: TimeZone) -> String {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        let x = c.dateComponents([.year, .month, .day], from: instant)
        return String(format: "%04d-%02d-%02d", x.year ?? 0, x.month ?? 0, x.day ?? 0)
    }

    static func add(_ ymd: String, _ n: Int) -> String {
        guard let d = date(ymd), let r = cal.date(byAdding: .day, value: n, to: d) else { return ymd }
        return string(r)
    }

    /// 0 = Monday … 6 = Sunday
    static func weekdayIndex(_ ymd: String) -> Int {
        guard let d = date(ymd) else { return 0 }
        return (cal.component(.weekday, from: d) + 5) % 7
    }

    /// Monday of the week containing `ymd`.
    static func weekStart(_ ymd: String) -> String { add(ymd, -weekdayIndex(ymd)) }
}
