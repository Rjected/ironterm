import XCTest
@testable import Ironterm

/// Every app-screen document decodes from the server's samples (docs/api/app/*.json, copied
/// into the test bundle).
final class AppModelsTests: XCTestCase {
    func decode<T: Decodable>(_ t: T.Type, _ name: String) throws -> T {
        try AppAPI.decode(T.self, LiveTests.fixture(name))
    }

    func testHome() throws {
        let h = try decode(AppHome.self, "home")
        XCTAssertEqual(h.snapshot.unit, "lb")
        XCTAssertEqual(h.snapshot.program?.name, "GZCLP 4-Day")
        XCTAssertEqual(h.e1rm.first?.lift, "squat")
        XCTAssertFalse(h.trend.isEmpty)
        XCTAssertTrue(h.trend.allSatisfy { !$0.points.isEmpty })
        XCTAssertLessThanOrEqual(h.weekly.count, 26)
        XCTAssertFalse(h.watch.isEmpty)
        XCTAssertEqual(h.weekly.map(\.week), h.weekly.map(\.week).sorted(), "oldest first")
    }

    func testGym() throws {
        let g = try decode(AppGym.self, "gym")
        XCTAssertEqual(g.unit, "lb")
        XCTAssertNil(g.live)
        XCTAssertEqual(g.next?.dayName, "Day A2 · Bench")
        XCTAssertEqual(g.days.map(\.dayId), ["A1", "B1", "A2", "B2"])
        XCTAssertEqual(g.days.map(\.dayIndex), [0, 1, 2, 3])
        XCTAssertGreaterThan(g.catalog.count, 50)
        XCTAssertTrue(g.catalog.contains { $0.key == "bench" && $0.kind == "barbell" })
        // the full plan: starting offline gives the same session as POST /api/app/gym/start
        let full = try XCTUnwrap(g.plan)
        XCTAssertEqual(full.dayId, "A2")
        let fromPlan = Live.sessionFromPlan(full, unit: g.unit, programName: g.programName!, now: Fmt.parseISO("2026-10-15T22:00:00.000Z")!)
        let server = try AppAPI.decode(LiveSession.self, LiveTests.fixture("gym-start"))
        XCTAssertEqual(fromPlan.exercises.map(\.sets), server.exercises.map(\.sets))
        XCTAssertEqual(fromPlan.exercises.map(\.slotId), server.exercises.map(\.slotId))
        XCTAssertEqual(fromPlan.exercises.map(\.restSeconds), server.exercises.map(\.restSeconds))
        XCTAssertEqual(fromPlan.exercises.map(\.ifFail), server.exercises.map(\.ifFail))
        XCTAssertEqual(fromPlan.title, server.title)
        // older servers without `plan`: fall back to the cached next session
        let plan = try XCTUnwrap(GymStore.plan(from: g.next!, days: g.days))
        XCTAssertEqual(plan.dayId, "A2")
        let s = Live.sessionFromPlan(plan, unit: g.unit, programName: g.programName!)
        XCTAssertEqual(s.title, "GZCLP · A2")
        XCTAssertEqual(s.exercises.first?.sets.filter(\.isWarmup).count, 4, "warmups before the T1")
        XCTAssertEqual(s.exercises.first?.restSeconds, 180)
    }

    func testGymStartIsALiveSession() throws {
        let s = try decode(LiveSession.self, "gym-start")
        XCTAssertEqual(s.dayId, "A2")
        XCTAssertEqual(s.exercises.count, 3)
        XCTAssertEqual(s.exercises[0].ifSuccess, "10 reps → 330")
        XCTAssertEqual(Live.progress(s), .init(done: 0, total: 16))
        XCTAssertEqual(Live.current(s), .init(exId: s.exercises[0].id, set: 0))
        // round trip
        XCTAssertEqual(try JSONDecoder().decode(LiveSession.self, from: JSONEncoder().encode(s)), s)
    }

    func testLifts() throws {
        let l = try decode(AppLiftList.self, "lifts")
        XCTAssertEqual(l.lifts.prefix(4).map(\.key), ["squat", "bench", "deadlift", "ohp"])
        XCTAssertTrue(l.lifts.allSatisfy { !$0.spark.isEmpty && $0.sessions > 0 })
        let d = try decode(AppLiftDetail.self, "lift-squat")
        XCTAssertEqual(d.key, "squat")
        XCTAssertEqual(d.kind, "barbell")
        XCTAssertNil(d.yearAgo)
        XCTAssertFalse(d.points.isEmpty)
        XCTAssertEqual(d.points.map(\.date), d.points.map(\.date).sorted())
        XCTAssertFalse(d.repPRs.isEmpty)
        XCTAssertFalse(d.prWall.isEmpty)
        XCTAssertEqual(d.stall?.status, "progressing")
        XCTAssertEqual(d.projection?.band.count, 13)
        XCTAssertTrue(d.projection!.band.allSatisfy { $0.lo <= $0.mid && $0.mid <= $0.hi })
        XCTAssertFalse(d.rpe.isEmpty)
    }

    func testHistoryAndWorkout() throws {
        let h = try decode(AppHistory.self, "history")
        XCTAssertFalse(h.workouts.isEmpty)
        XCTAssertNotNil(h.next)
        XCTAssertGreaterThan(h.total, h.workouts.count)
        let w = try decode(AppWorkout.self, "workout")
        XCTAssertEqual(w.summary.programDay, "B1")
        XCTAssertEqual(w.program?.dayId, "B1")
        XCTAssertTrue(w.exercises.contains { $0.lift == "ohp" })
        XCTAssertTrue(w.exercises.flatMap(\.sets).contains { $0.type == "warmup" && $0.e1rm == nil })
        XCTAssertTrue(w.program!.results.allSatisfy { ["success", "hold", "fail"].contains($0.outcome) })
    }

    func testCalendar() throws {
        let c = try decode(AppCalendar.self, "calendar")
        XCTAssertEqual(c.month, "2026-10")
        XCTAssertEqual(c.days.count, 42)
        XCTAssertEqual(Day.weekdayIndex(c.days[0].date), 0, "Monday first")
        XCTAssertTrue(c.days.contains { $0.status == "done" && !$0.workouts.isEmpty })
        XCTAssertTrue(c.days.contains { $0.status == "planned" && $0.planned != nil })
        XCTAssertEqual(c.week.label, "on track · 1 to go")
    }

    func testProgram() throws {
        let p = try XCTUnwrap(decode(AppProgram.self, "program").program)
        XCTAssertEqual(p.templateId, "gzclp")
        XCTAssertEqual(p.slots.count, 13)
        XCTAssertFalse(p.upcoming.isEmpty)
        XCTAssertFalse(p.log.isEmpty)
        XCTAssertNil(p.reentry)
        XCTAssertTrue(p.slots.contains { $0.ifSuccess != nil && $0.ifFail != nil }, "slots say what happens next")
        // no program at all
        XCTAssertNil(try AppAPI.decode(AppProgram.self, Data(#"{"program":null}"#.utf8)).program)
        // coming back from a break: the ramp explains itself
        let json: String = #"{"done":1,"total":6,"gapDays":21,"headline":"Session 2 of 6 back after 21 days off","summary":"Squat ramps slower.","lifts":[],"suggest":[]}"#
        let r: AppProgram.Reentry = try AppAPI.decode(AppProgram.Reentry.self, Data(json.utf8))
        XCTAssertEqual(r.gapDays, 21)
        XCTAssertEqual(r.summary, "Squat ramps slower.")
        let old: AppProgram.Reentry = try AppAPI.decode(AppProgram.Reentry.self, Data(#"{"done":0,"total":3}"#.utf8))
        XCTAssertNil(old.summary)
    }

    func testBody() throws {
        for (name, mode) in [("body", "ready"), ("body-load", "load")] {
            let b = try decode(AppBody.self, name)
            XCTAssertEqual(b.mode, mode)
            XCTAssertTrue(b.svgFront.hasPrefix("<svg"))
            XCTAssertTrue(b.svgBack.hasPrefix("<svg"))
            XCTAssertEqual(b.legend.count, 2)
            XCTAssertGreaterThan(b.muscles.count, 20)
            XCTAssertEqual(b.muscles.map(\.value), b.muscles.map(\.value).sorted(by: >))
        }
    }

    func testInsightsAndStats() throws {
        let i = try decode(AppInsights.self, "insights")
        XCTAssertEqual(i.projections.map(\.lift).sorted(), ["bench", "deadlift", "ohp", "squat"])
        XCTAssertEqual(i.balance?.lagging, ["bench", "deadlift"])
        XCTAssertGreaterThan(i.achievements.total, i.achievements.unlocked)
        XCTAssertTrue(i.achievements.recent.allSatisfy { $0.unlockedAt != nil })
        XCTAssertTrue(i.achievements.next.allSatisfy { $0.unlockedAt == nil })
        let s = try decode(AppStats.self, "stats")
        XCTAssertEqual(s.unit, "lb")
        XCTAssertGreaterThan(s.totals.workouts, 0)
        XCTAssertNil(s.cardio)
    }

    func testFinishResult() throws {
        let r = try AppAPI.decode(FinishResult.self, Data(#"{"workout":{"id":"w"},"duplicate":true,"prs":[{"lift":"squat","short":"SQUAT","kind":"e1rm","reps":3,"weight":300.5,"prev":null}]}"#.utf8))
        XCTAssertEqual(r.duplicate, true)
        XCTAssertNil(r.prs?.first?.prev)
        XCTAssertNil(try AppAPI.decode(FinishResult.self, Data(#"{"workout":{"id":"w"}}"#.utf8)).prs, "older servers")
        XCTAssertTrue(ApiError.http(409, "still being saved").isTransient)
    }

    func testIgnoresAddedFields() throws {
        let json = #"{"workouts":[],"next":null,"total":0,"brandNew":{"x":1}}"#
        XCTAssertEqual(try AppAPI.decode(AppHistory.self, Data(json.utf8)).total, 0)
    }

    func testHistoryPathEncoding() {
        XCTAssertEqual(AppAPI.historyPath(cursor: nil, limit: 30, q: nil), "/api/app/history?limit=30")
        XCTAssertEqual(AppAPI.historyPath(cursor: "demo-1", limit: 10, q: "bench press"), "/api/app/history?limit=10&cursor=demo-1&q=bench%20press")
        XCTAssertEqual(AppAPI.seg("a/b c"), "a%2Fb%20c")
    }
}
