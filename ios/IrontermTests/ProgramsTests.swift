import XCTest
@testable import Ironterm

/// Program browsing: search / filters, the START body, and the option query string.
final class ProgramsTests: XCTestCase {
    func p(_ id: String, _ cat: String, _ level: String, _ days: [Int], _ weeks: Int? = nil, name: String? = nil, summary: String = "") -> ProgramSummary {
        ProgramSummary(id: id, name: name ?? id, author: "Someone", category: cat, level: level, daysPerWeek: days, weekCount: weeks, summary: summary)
    }

    lazy var catalog: [ProgramSummary] = [
        p("gzclp", "gzcl", "beginner", [3, 4], name: "GZCLP", summary: "Linear progression in three tiers."),
        p("jnt", "gzcl", "intermediate", [4], 12, name: "Jacked & Tan 2.0", summary: "Rep-max work ups."),
        p("sl", "novice", "beginner", [3], name: "StrongLifts 5×5", summary: "Two alternating full-body days."),
        p("531", "strength", "intermediate", [2, 3, 4], 4, name: "5/3/1", summary: "Waves off a training max."),
        p("rippler", "gzcl", "intermediate", [4], 12, name: "The Rippler", summary: "Wave loading on T1."),
        p("sheiko", "powerlifting", "advanced", [3], 4, name: "Sheiko #29", summary: "Russian volume."),
    ]

    func testNoFilterGroupsInCatalogOrder() {
        let g = ProgramFilter().apply(catalog)
        XCTAssertEqual(g.map(\.category), ["gzcl", "novice", "strength", "powerlifting"])
        // a later program of an earlier category joins its group, keeping catalog order inside it
        XCTAssertEqual(g[0].programs.map(\.id), ["gzclp", "jnt", "rippler"])
        XCTAssertEqual(g.reduce(0) { $0 + $1.programs.count }, catalog.count)
        XCTAssertTrue(ProgramFilter().isEmpty)
    }

    func testDaysFilter() {
        var f = ProgramFilter()
        f.days = 3
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["gzclp", "sl", "531", "sheiko"])
        f.days = 4
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["gzclp", "jnt", "rippler", "531"], "grouped by category")
        f.days = 6
        XCTAssertTrue(f.apply(catalog).isEmpty)
        XCTAssertEqual(ProgramFilter.dayChoices(catalog), [2, 3, 4])
    }

    func testLevelAndDaysCombine() {
        var f = ProgramFilter()
        f.level = "beginner"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["gzclp", "sl"])
        f.days = 4
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["gzclp"])
        XCTAssertFalse(f.isEmpty)
    }

    func testSearch() {
        var f = ProgramFilter()
        f.query = "  gzcl "
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["gzclp", "jnt", "rippler"], "category matches")
        f.query = "WAVE"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["531", "rippler"], "summary, case-insensitive")
        f.query = "wave t1"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["rippler"], "every word must match")
        f.query = "5×5"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["sl"])
        f.query = "jacked & tan"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["jnt"])
        f.query = "advanced"
        XCTAssertEqual(f.apply(catalog).flatMap(\.programs).map(\.id), ["sheiko"], "level matches")
        f.query = "russian"
        f.level = "beginner"
        XCTAssertTrue(f.apply(catalog).isEmpty, "search and filters combine")
    }

    func testTags() {
        XCTAssertEqual(ProgramText.tags(catalog[0]), "3–4 days · open-ended · beginner")
        XCTAssertEqual(ProgramText.tags(catalog[1]), "4 days · 12 weeks · intermediate")
        XCTAssertEqual(ProgramText.days([2, 4]), "2/4 days")
        XCTAssertEqual(ProgramText.days([2, 3, 4]), "2–4 days")
        XCTAssertEqual(ProgramText.category("gzcl"), "GZCL")
        XCTAssertEqual(ProgramText.category("powerlifting"), "POWERLIFTING")
    }

    func testOptionPath() {
        XCTAssertEqual(AppAPI.programPath("gzclp", options: [:]), "/api/app/programs/gzclp")
        XCTAssertEqual(AppAPI.programPath("531", options: ["t1": "modified", "days": "3"]), "/api/app/programs/531?opt.days=3&opt.t1=modified")
        XCTAssertEqual(AppAPI.programPath("a/b", options: ["x": "a&b c"]), "/api/app/programs/a%2Fb?opt.x=a%26b%20c")
    }

    func testNumberParsing() {
        XCTAssertEqual(ProgramText.number("82.5"), 82.5)
        XCTAssertEqual(ProgramText.number(" 82,5 "), 82.5)
        XCTAssertEqual(ProgramText.number("0"), 0)
        XCTAssertNil(ProgramText.number(""))
        XCTAssertNil(ProgramText.number("abc"))
        XCTAssertNil(ProgramText.number("-5"))
    }

    func detail(_ json: String) throws -> ProgramDetail {
        try AppAPI.decode(ProgramDetail.self, Data(json.utf8))
    }

    static let minimalDetail = """
    {"id":"gzclp","name":"GZCLP 4-Day","author":"A","category":"gzcl","level":"beginner","daysPerWeek":[3,4],"weekCount":null,
     "summary":"s","source":"src","notes":[],"unit":"lb","basis":"e1rm",
     "options":[{"key":"days","label":"Days","choices":[{"value":"3","label":"3"},{"value":"4","label":"4"}],"default":"4","selected":"3"},
                {"key":"t1","label":"T1","choices":[{"value":"default","label":"d"}],"default":"default","selected":"default"}],
     "rules":{"overview":[],"rotation":[],"tiers":[]},
     "weeks":[{"week":1,"name":null,"days":[{"dayId":"A1","name":"Day A1","exercises":[
        {"lift":"squat","name":"Back Squat","tier":"T1","scheme":"5×3+","top":185,"restSeconds":180,
         "sets":[{"reps":3,"weight":185,"amrap":false},{"reps":3,"weight":185,"amrap":true}],"ifSuccess":"x"}]}]}],
     "start":{"trainingDays":[0,1,3,4],"startWeights":{"squat":185,"bench":145},"trainingMaxes":{},"maxLabel":"Training max"}}
    """

    func testStartBody() throws {
        let d = try detail(Self.minimalDetail)
        let b = ProgramStartBody.make(detail: d, days: [4, 0, 2], weights: ["squat": 190, "bench": 145], maxes: [:])
        XCTAssertEqual(b.options, ["days": "3", "t1": "default"], "the options the page was generated with")
        XCTAssertEqual(b.trainingDays, [0, 2, 4], "sorted, Mon = 0")
        XCTAssertEqual(b.startWeights, ["squat": 190, "bench": 145])
        XCTAssertNil(b.trainingMaxes, "empty maps are left out")
        XCTAssertNil(b.startDate)
        let json = try XCTUnwrap(String(data: try b.json(), encoding: .utf8))
        XCTAssertEqual(json, #"{"options":{"days":"3","t1":"default"},"startWeights":{"bench":145,"squat":190},"trainingDays":[0,2,4]}"#)
        // out-of-range days are dropped; no days at all → left out
        let none = ProgramStartBody.make(detail: d, days: [7, -1], weights: [:], maxes: ["squat": 200])
        XCTAssertNil(none.trainingDays)
        XCTAssertNil(none.startWeights)
        XCTAssertEqual(none.trainingMaxes, ["squat": 200])
    }

    func testDetailPlanAndLength() throws {
        let d = try detail(Self.minimalDetail)
        XCTAssertNil(d.weekCount, "open-ended")
        XCTAssertEqual(d.plan.count, 1)
        XCTAssertEqual(d.plan[0].days[0].exercises[0].sets[1].amrap, true)
        XCTAssertEqual(d.liftNames["squat"], "Back Squat")
        XCTAssertEqual(d.basisLine, "weights from your current e1RMs · lb")
        // round trip through the offline cache encoding
        let again = try JSONDecoder().decode(ProgramDetail.self, from: JSONEncoder().encode(d))
        XCTAssertEqual(again, d)
    }

    func testSetsLine() throws {
        func ex(_ sets: [ProgramDetail.PSet]) -> ProgramDetail.Exercise {
            ProgramDetail.Exercise(lift: "squat", name: "Squat", tier: "T1", scheme: "5/3/1+", top: 0, sets: sets, restSeconds: 180)
        }
        let wave = ex([.init(reps: 5, weight: 135, amrap: false), .init(reps: 3, weight: 155, amrap: false), .init(reps: 1, weight: 175.5, amrap: true)])
        XCTAssertEqual(ProgramSets.line(wave), "135×5 · 155×3 · 175.5×1+")
        let flat = ex([.init(reps: 5, weight: 100, amrap: false), .init(reps: 5, weight: 100, amrap: false)])
        XCTAssertNil(ProgramSets.line(flat), "same weight: the scheme says it all")
        let rpe = ex([.init(reps: 8, repsMax: 10, weight: 0, amrap: false, rpe: 8), .init(reps: 8, weight: 0, amrap: false, rpe: 9)])
        XCTAssertEqual(ProgramSets.line(rpe), "8–10 @8 · 8 @9")
    }

    // MARK: fixtures (copies of docs/api/app/programs*.json)

    func fixture<T: Decodable>(_ t: T.Type, _ name: String) throws -> T {
        try AppAPI.decode(T.self, LiveTests.fixture(name))
    }

    func testCatalogFixture() throws {
        let c = try fixture(AppProgramCatalog.self, "programs")
        XCTAssertEqual(c.active, "gzclp")
        XCTAssertGreaterThan(c.programs.count, 50)
        XCTAssertEqual(Set(c.programs.map(\.id)).count, c.programs.count, "ids are unique")
        let gz = try XCTUnwrap(c.programs.first { $0.id == "gzclp" })
        XCTAssertEqual(gz.daysPerWeek, [3, 4])
        XCTAssertNil(gz.weekCount, "open-ended")
        XCTAssertTrue(c.programs.contains { $0.weekCount != nil }, "finite programs have a length")
        // grouped by category in catalog order: applying no filter keeps the server's order
        let groups = ProgramFilter().apply(c.programs)
        XCTAssertEqual(groups.flatMap(\.programs).map(\.id), c.programs.map(\.id))
        XCTAssertEqual(groups.first?.category, "gzcl")
        XCTAssertEqual(Set(groups.map(\.category)).count, groups.count, "each category once")
        XCTAssertTrue(c.programs.allSatisfy { ProgramFilter.levels.contains($0.level) })
        XCTAssertTrue(c.programs.allSatisfy { !$0.daysPerWeek.isEmpty && !$0.summary.isEmpty })
        // filters on the real catalog
        var f = ProgramFilter()
        f.days = 3
        f.level = "beginner"
        let r = f.apply(c.programs).flatMap(\.programs)
        XCTAssertFalse(r.isEmpty)
        XCTAssertTrue(r.allSatisfy { $0.daysPerWeek.contains(3) && $0.level == "beginner" })
        f = ProgramFilter()
        f.query = "smolov"
        XCTAssertTrue(f.apply(c.programs).flatMap(\.programs).contains { $0.id == "smolov-jr" })
    }

    func testGZCLPFixture() throws {
        let d = try fixture(ProgramDetail.self, "programs-gzclp")
        XCTAssertEqual(d.id, "gzclp")
        XCTAssertEqual(d.unit, "lb")
        XCTAssertEqual(d.basis, "active")
        XCTAssertNil(d.weekCount)
        XCTAssertEqual(d.plan.map(\.week), [1, 2, 3, 4], "open-ended: weeks 1–4")
        XCTAssertEqual(d.plan[0].days.map(\.dayId), ["A1", "B1", "A2", "B2"])
        XCTAssertEqual(d.options.map(\.key), ["days", "t1", "t2", "t3", "curls"])
        XCTAssertTrue(d.options.allSatisfy { o in o.choices.contains { $0.value == o.selected } })
        XCTAssertEqual(d.rules.rotation.count, 4)
        XCTAssertFalse(d.rules.tiers.isEmpty)
        XCTAssertTrue(d.rules.tiers[0].title.hasPrefix("T1"))
        let squat = d.plan[0].days[0].exercises[0]
        XCTAssertEqual(squat.lift, "squat")
        XCTAssertEqual(squat.tier, "T1")
        XCTAssertNotNil(squat.ifSuccess)
        XCTAssertNotNil(squat.ifFail)
        XCTAssertEqual(squat.top, squat.sets.map(\.weight).max())
        // start prefill: slot ids, labelled from the plan
        XCTAssertEqual(d.start.trainingDays, [0, 1, 3, 4])
        XCTAssertTrue(d.start.trainingMaxes.isEmpty)
        XCTAssertEqual(d.start.startWeights.count, 13)
        XCTAssertEqual(d.startLabel("a1-t1"), "A1 · T1 Back Squat")
        XCTAssertEqual(d.startLabel("a1-t3b"), "A1 · T3 Bicep Curl", "trailing b = the second T3 of the day")
        XCTAssertEqual(d.startLabel("b2-t2"), "B2 · T2 Overhead Press")
        XCTAssertEqual(d.startLabel("x-y"), "X-Y", "unknown shapes fall back to the key")
        // the server's labels cover every key, and the plan-matching fallback agrees with them
        let labels = try XCTUnwrap(d.start.labels)
        XCTAssertEqual(Set(labels.keys), Set(d.start.startWeights.keys))
        var noLabels = d
        noLabels.start.labels = nil
        for k in d.start.startWeights.keys {
            XCTAssertEqual(d.startLabel(k), labels[k])
            XCTAssertEqual(noLabels.startLabel(k), labels[k], "fallback for \(k)")
        }
        // a server label wins over the heuristic
        var custom = d
        custom.start.labels = ["a1-t1": "Squat (T1)"]
        XCTAssertEqual(custom.startLabel("a1-t1"), "Squat (T1)")
        XCTAssertEqual(custom.startLabel("a1-t2"), "A1 · T2 Bench Press", "missing keys fall back")
        let order = d.startOrder(d.start.startWeights.keys)
        XCTAssertEqual(Array(order.prefix(5)), ["a1-t1", "a1-t2", "a1-t3", "a1-t3b", "b1-t1"])
        // what START sends for it
        let body = ProgramStartBody.make(detail: d, days: Set(d.start.trainingDays), weights: d.start.startWeights, maxes: d.start.trainingMaxes)
        XCTAssertEqual(body.options?["days"], d.options.first { $0.key == "days" }?.selected)
        XCTAssertEqual(body.startWeights?.count, 13)
        XCTAssertNil(body.trainingMaxes)
        // the offline cache round trip
        XCTAssertEqual(try JSONDecoder().decode(ProgramDetail.self, from: JSONEncoder().encode(d)), d)
    }

    func test531Fixture() throws {
        let d = try fixture(ProgramDetail.self, "programs-531")
        XCTAssertEqual(d.basis, "e1rm")
        XCTAssertEqual(d.basisLine, "weights from your current e1RMs · lb")
        XCTAssertEqual(d.plan.map { $0.name ?? "" }, ["5s week", "3s week", "5/3/1 week", "Deload"])
        XCTAssertTrue(d.start.startWeights.isEmpty)
        XCTAssertEqual(Set(d.start.trainingMaxes.keys), ["ohp", "deadlift", "bench", "squat"])
        XCTAssertEqual(d.startOrder(d.start.trainingMaxes.keys), ["ohp", "deadlift", "bench", "squat"], "order the days train them")
        XCTAssertEqual(d.startLabel("ohp"), "Overhead Press")
        XCTAssertEqual(d.start.labels?["squat"], "Back Squat")
        let main = d.plan[0].days[0].exercises[0]
        XCTAssertEqual(main.tier, "MAIN")
        XCTAssertNotNil(ProgramSets.line(main), "percent waves list each set")
        XCTAssertTrue(d.rules.overview.contains { $0.contains("training max") })
        let body = ProgramStartBody.make(detail: d, days: [0, 2, 4], weights: [:], maxes: ["squat": 500, "bench": 300, "deadlift": 550, "ohp": 200])
        let json = try XCTUnwrap(String(data: try body.json(), encoding: .utf8))
        XCTAssertTrue(json.contains(#""trainingDays":[0,2,4]"#))
        XCTAssertTrue(json.contains(#""trainingMaxes":{"bench":300,"deadlift":550,"ohp":200,"squat":500}"#))
        XCTAssertFalse(json.contains("startWeights"))
    }

    func testSmolovFixture() throws {
        let d = try fixture(ProgramDetail.self, "programs-smolov-jr")
        XCTAssertEqual(d.weekCount, 3, "finite block")
        XCTAssertEqual(d.plan.count, 3)
        XCTAssertEqual(d.start.maxLabel, "1RM")
        XCTAssertEqual(StartSummary.maxTitle(d), "1RM")
        XCTAssertEqual(ProgramText.length(d.weekCount), "3 weeks")
        XCTAssertEqual(d.options.map(\.key), ["lift", "add"])
        XCTAssertEqual(ProgramText.weekTitle(d.plan[1]), "WEEK 2 (+10 LB / +5 KG)")
        XCTAssertEqual(ProgramText.weekTitle(ProgramDetail.Week(week: 1, name: "5s week", days: [])), "WEEK 1 · 5S WEEK")
        XCTAssertEqual(ProgramText.weekTitle(ProgramDetail.Week(week: 3, name: nil, days: [])), "WEEK 3")
    }

    func testStartResultFixtureShape() throws {
        // `{ok, program: AppProgram}`: the GET /api/app/program document, so program.program.name
        let doc = try String(data: LiveTests.fixture("program"), encoding: .utf8)!
        let r = try AppAPI.decode(ProgramStartResult.self, Data((#"{"ok":true,"program":"# + doc + "}").utf8))
        XCTAssertEqual(r.program?.program?.name, "GZCLP 4-Day")
    }

    func testStartResultShapes() throws {
        let wrapped = #"{"ok":true,"program":{"program":{"name":"5/3/1","templateId":"531","unit":"lb","week":1,"complete":false,"slots":[],"upcoming":[],"log":[],"pushed":false}}}"#
        let bare = #"{"ok":true,"program":{"name":"5/3/1","templateId":"531","unit":"lb","week":1,"complete":false,"slots":[],"upcoming":[],"log":[],"pushed":false}}"#
        for s in [wrapped, bare] {
            let r = try AppAPI.decode(ProgramStartResult.self, Data(s.utf8))
            XCTAssertTrue(r.ok)
            XCTAssertEqual(r.program?.program?.templateId, "531")
        }
    }

    func testConfirmText() throws {
        XCTAssertEqual(StartSummary.replaces(name: "5/3/1", current: "GZCLP 4-Day", restarting: false), "This replaces GZCLP 4-Day. Your past workouts are kept.")
        XCTAssertEqual(StartSummary.replaces(name: "5/3/1", current: nil, restarting: false), "Your past workouts are kept.")
        XCTAssertEqual(StartSummary.replaces(name: "GZCLP", current: nil, restarting: true), "This restarts GZCLP from today. Your past workouts are kept.")
        XCTAssertEqual(StartSummary.days([4, 0, 1, 3]), "Mon, Tue, Thu, Fri")
        let d = try detail(Self.minimalDetail)
        XCTAssertEqual(StartSummary.options(d), "3 · d")
        XCTAssertEqual(d.startOrder(["bench", "squat", "zz"]), ["squat", "bench", "zz"], "workout order first")
        XCTAssertEqual(StartSummary.changed(["squat": 185, "bench": 150], d.start.startWeights), "2 · 1 changed")
        XCTAssertEqual(StartSummary.changed(["squat": 185, "bench": 145], d.start.startWeights), "2 as prefilled")
        XCTAssertEqual(StartSummary.weights(["squat": 185, "bench": 142.5], label: d.startLabel, order: d.startOrder(["bench", "squat"])), "Back Squat 185 · Bench Press 142.5", "LiftLibrary names lifts the plan doesn't show")
    }
}
