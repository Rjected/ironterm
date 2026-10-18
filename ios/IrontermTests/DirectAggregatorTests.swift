import XCTest
@testable import Ironterm

final class DirectAggregatorTests: XCTestCase {
    let utc = TimeZone(identifier: "UTC")!
    /// Thursday 15 Oct 2026, 18:00 UTC
    let now = Fmt.parseISO("2026-10-15T18:00:00Z")!

    func set(_ kg: Double?, _ reps: Int?, warmup: Bool = false) -> ExerciseSet {
        ExerciseSet(type: warmup ? "warmup" : "normal", weightKg: kg, reps: reps)
    }

    func workout(_ date: String, _ ex: [Exercise], id: String? = nil, minutes: Int = 60) -> Workout {
        let start = "\(date)T10:00:00Z"
        let end = Fmt.parseISO(start)!.addingTimeInterval(Double(minutes) * 60)
        let f = ISO8601DateFormatter()
        return Workout(id: id ?? UUID().uuidString, title: "W \(date)", startTime: start, endTime: f.string(from: end), exercises: ex)
    }

    func bench(_ kg: Double, _ reps: Int) -> Exercise { Exercise(title: "Bench Press (Barbell)", sets: [set(kg, reps)]) }

    func opts(_ unit: String = "kg", target: Int = 3) -> DirectAggregator.Options {
        .init(unit: unit, tz: utc, weekTarget: target, now: now)
    }

    func testEpley() {
        XCTAssertEqual(DirectAggregator.epley(100, 1), 100)
        XCTAssertEqual(DirectAggregator.epley(100, 5), 100 * (1 + 5.0 / 30), accuracy: 1e-9)
        XCTAssertEqual(DirectAggregator.epley(100, 0), 0)
    }

    func testQuartileLevels() {
        let c = DirectAggregator.levels(["a": 100, "b": 200, "c": 300, "d": 400])
        XCTAssertEqual(c["a"]?.level, 1)
        XCTAssertEqual(c["b"]?.level, 2)
        XCTAssertEqual(c["c"]?.level, 3)
        XCTAssertEqual(c["d"]?.level, 4)
        // a single training day is level 1 (the lightest), like the web app
        XCTAssertEqual(DirectAggregator.levels(["x": 5]).first?.value.level, 1)
    }

    func testGraphShapeAndLevels() {
        let ws = [
            workout("2026-10-12", [bench(100, 1)]),            // 100 kg vol
            workout("2026-10-13", [bench(100, 2)]),            // 200
            workout("2026-10-14", [bench(100, 3)]),            // 300
            workout("2026-10-15", [bench(100, 4), Exercise(title: "Bench Press (Barbell)", sets: [set(500, 10, warmup: true)])]), // 400, warmup ignored
            workout("2025-11-03", [Exercise(title: "Pull Up", sets: [set(nil, 10)])]),  // bodyweight still counts
        ]
        let s = DirectAggregator.snapshot(workouts: ws, options: opts())
        XCTAssertEqual(s.today, "2026-10-15")
        XCTAssertEqual(s.graph.start, "2025-10-13")
        XCTAssertEqual(s.graph.days.first?.date, "2025-10-13")
        XCTAssertEqual(s.graph.days.last?.date, "2026-10-15")
        XCTAssertEqual(s.graph.days.count, 52 * 7 + 4)
        let lv = Dictionary(uniqueKeysWithValues: s.graph.days.map { ($0.date, $0.level) })
        XCTAssertEqual(lv["2025-11-03"], 1)
        XCTAssertEqual(lv["2026-10-12"], 1)   // values 1,100,200,300,400 → q1=100, q2=200, q3=300
        XCTAssertEqual(lv["2026-10-13"], 2)
        XCTAssertEqual(lv["2026-10-14"], 3)
        XCTAssertEqual(lv["2026-10-15"], 4)
        XCTAssertEqual(lv["2026-10-11"], 0)
        XCTAssertEqual(s.graph.days.last?.value, 400)
        XCTAssertNil(s.program)
        XCTAssertNil(s.recovery)
        XCTAssertEqual(s.week.days.map(\.status), ["done", "done", "done", "done", "rest", "rest", "rest"])
        XCTAssertEqual(s.week.done, 4)
        XCTAssertEqual(s.totals.allTime, 5)
        XCTAssertEqual(s.totals.sessions52, 5)
        XCTAssertEqual(s.totals.vol7, 1000)
        XCTAssertEqual(s.totals.avgMin, 60)
        XCTAssertEqual(s.last?.date, "2026-10-15")
        XCTAssertEqual(s.last?.sets, 1, "warmups are not working sets")
        XCTAssertEqual(s.last?.volume, 400)
    }

    func testStreak() {
        // target 3; this week (12 Oct) only has 2 so far, so the streak counts back from last week
        var days: [String] = ["2026-10-12", "2026-10-13"]
        days += ["2026-10-05", "2026-10-07", "2026-10-09"]          // 3 ✓
        days += ["2026-09-28", "2026-09-29", "2026-10-01"]          // 3 ✓
        days += ["2026-09-22"]                                      // 1 ✗ breaks it
        days += ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"] // ✓
        days += ["2026-09-07", "2026-09-08", "2026-09-09"]          // ✓
        days += ["2026-08-31", "2026-09-01", "2026-09-02"]          // ✓
        let s = DirectAggregator.snapshot(workouts: days.map { workout($0, [bench(60, 5)]) }, options: opts())
        XCTAssertEqual(s.streak.current, 2)
        XCTAssertEqual(s.streak.best, 3)
        XCTAssertEqual(s.week.target, 3)
        // two sessions on one day count as one training day
        let dup = DirectAggregator.snapshot(workouts: ["2026-10-05", "2026-10-05", "2026-10-06"].map { workout($0, [bench(60, 5)]) }, options: opts(target: 3))
        XCTAssertEqual(dup.streak.current, 0)
        // meeting the target this week counts this week too
        let met = DirectAggregator.snapshot(workouts: ["2026-10-12", "2026-10-13", "2026-10-14"].map { workout($0, [bench(60, 5)]) }, options: opts())
        XCTAssertEqual(met.streak.current, 1)
    }

    func testLiftE1rmDeltaAndSpark() throws {
        let ws = [
            workout("2026-08-01", [bench(200, 1)]),                // older than 56 days: ignored for delta
            workout("2026-09-10", [bench(90, 5)]),                 // 35 days ago: the "before" (105)
            workout("2026-10-13", [Exercise(title: "Bench Press (Barbell)", sets: [set(120, 1, warmup: true), set(100, 5), set(95, 8)])]),
            workout("2026-10-14", [Exercise(title: "Squat (Barbell)", sets: [set(140, 3)])]),
            workout("2026-10-14", [Exercise(title: "Lat Pulldown (Cable)", sets: [set(60, 10)])]),
            workout("2026-10-01", [Exercise(title: "Lat Pulldown (Cable)", sets: [set(55, 10)])]),
            workout("2026-10-02", [Exercise(title: "Some Custom Thing", sets: [set(55, 10)])]),
        ]
        let s = DirectAggregator.snapshot(workouts: ws, options: opts())
        XCTAssertEqual(Array(s.lifts.prefix(2).map(\.key)), ["squat", "bench"], "big four first, in big-four order")
        let b = try XCTUnwrap(s.lifts.first { $0.key == "bench" })
        // best of 100×5 (116.67) and 95×8 (120.33); the 120 kg warmup single is ignored
        XCTAssertEqual(b.e1rm, 120.3)
        XCTAssertEqual(b.delta28, 15.3)  // 120.33 − 105 rounded
        XCTAssertEqual(b.spark.count, 12)
        XCTAssertEqual(b.spark.last, 120.3)
        XCTAssertEqual(b.short, "BENCH")
        let sq = try XCTUnwrap(s.lifts.first { $0.key == "squat" })
        XCTAssertEqual(sq.e1rm, 154)
        XCTAssertNil(sq.delta28, "no history 4 weeks back")
        XCTAssertFalse(s.lifts.contains { $0.name == "Some Custom Thing" })
    }

    func testPoundsConversion() throws {
        let s = DirectAggregator.snapshot(workouts: [workout("2026-10-14", [bench(100, 1)])], options: opts("lb"))
        XCTAssertEqual(s.unit, "lb")
        XCTAssertEqual(try XCTUnwrap(s.lifts.first).e1rm, 220.5)
        XCTAssertEqual(s.totals.vol7, 220)
    }

    func testTimeZoneDecidesTheDay() {
        // 02:00 UTC on the 15th is still the 14th in New York
        let w = Workout(id: "x", title: "late", startTime: "2026-10-15T02:00:00Z", endTime: "2026-10-15T03:00:00Z", exercises: [bench(60, 5)])
        let s = DirectAggregator.snapshot(workouts: [w], options: .init(unit: "kg", tz: TimeZone(identifier: "America/New_York")!, weekTarget: 3, now: now))
        XCTAssertEqual(s.last?.date, "2026-10-14")
        XCTAssertEqual(s.graph.days.first { $0.date == "2026-10-14" }?.level, 1)
    }

    func testEmpty() {
        let s = DirectAggregator.snapshot(workouts: [], options: opts())
        XCTAssertEqual(s.streak, .init(current: 0, best: 0))
        XCTAssertTrue(s.lifts.isEmpty)
        XCTAssertNil(s.last)
        XCTAssertTrue(s.graph.days.allSatisfy { $0.level == 0 })
    }

    func testDecodesHevyPageWithFractionalSeconds() throws {
        let json = """
        {"page":1,"page_count":3,"workouts":[{"id":"a","title":"Push","start_time":"2026-10-14T10:00:00.000Z","end_time":"2026-10-14T11:05:00.000Z",
          "updated_at":"2026-10-14T11:06:00.000Z","exercises":[{"index":0,"title":"Bench Press (Barbell)","exercise_template_id":"79D0BB3A",
          "sets":[{"index":0,"type":"warmup","weight_kg":40,"reps":10},{"index":1,"type":"normal","weight_kg":100,"reps":5,"rpe":8}]}]}]}
        """
        let p = try JSONDecoder().decode(WorkoutsPage.self, from: Data(json.utf8))
        XCTAssertEqual(p.pageCount, 3)
        let w = try XCTUnwrap(p.workouts.first)
        XCTAssertNotNil(w.startDate)
        XCTAssertEqual(DirectAggregator.durationMin(w), 65)
        XCTAssertEqual(DirectAggregator.volumeKg(w), 500)
    }
}
