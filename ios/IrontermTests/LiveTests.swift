import XCTest
@testable import Ironterm

/// The Swift port of web/shared/live.ts, replayed against golden cases generated from the
/// TypeScript (Fixtures/live_golden.json: each op, the session after it, current() and progress()).
final class LiveTests: XCTestCase {
    static func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle(for: LiveTests.self).url(forResource: name, withExtension: "json"), "\(name).json is bundled in the test target")
        return try Data(contentsOf: url)
    }

    lazy var golden: [String: Any] = try! JSONSerialization.jsonObject(with: Self.fixture("live_golden")) as! [String: Any]

    func session(_ o: Any) throws -> LiveSession {
        try JSONDecoder().decode(LiveSession.self, from: JSONSerialization.data(withJSONObject: o))
    }

    // MARK: normalising for comparison

    /// Drop nulls, turn numbers into Doubles and exercise ids into positions (ids are random).
    func normalize(_ v: Any, ids: [String: String]) -> Any {
        if let d = v as? [String: Any] {
            var out: [String: Any] = [:]
            for (k, x) in d where !(x is NSNull) {
                if (k == "id" || k == "restFor"), let s = x as? String, let m = ids[s] { out[k] = m; continue }
                out[k] = normalize(x, ids: ids)
            }
            return out
        }
        if let a = v as? [Any] { return a.map { normalize($0, ids: ids) } }
        if let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.doubleValue }
        return v
    }

    func json(_ s: LiveSession) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as! [String: Any]
    }

    func idMap(_ s: [String: Any]) -> [String: String] {
        var m: [String: String] = [:]
        for (i, e) in ((s["exercises"] as? [[String: Any]]) ?? []).enumerated() { if let id = e["id"] as? String { m[id] = "ex\(i)" } }
        m[s["id"] as? String ?? ""] = "session"
        return m
    }

    func assertSame(_ swift: [String: Any], _ ts: [String: Any], _ msg: String, file: StaticString = #filePath, line: UInt = #line) {
        let a = normalize(swift, ids: idMap(swift)) as! NSDictionary
        let b = normalize(ts, ids: idMap(ts)) as! NSDictionary
        if a != b {
            let ad = String(data: try! JSONSerialization.data(withJSONObject: a, options: [.sortedKeys]), encoding: .utf8)!
            let bd = String(data: try! JSONSerialization.data(withJSONObject: b, options: [.sortedKeys]), encoding: .utf8)!
            XCTFail("\(msg)\nswift: \(ad.prefix(1500))\nts:    \(bd.prefix(1500))", file: file, line: line)
        }
    }

    // MARK: ops

    func apply(_ op: [String: Any], to s: LiveSession) -> LiveSession {
        let ex = op["ex"] as? Int ?? 0
        switch op["op"] as! String {
        case "complete":
            return Live.completeSet(s, exId: s.exercises[ex].id, op["set"] as! Int, now: Fmt.parseISO(op["now"] as! String)!)
        case "addSet":
            return Live.addSet(s, exId: s.exercises[ex].id)
        case "update":
            let p = op["patch"] as! [String: Any]
            return Live.updateSet(s, exId: s.exercises[ex].id, op["set"] as! Int) { x in
                for (k, v) in p {
                    let n = (v as? NSNumber)?.doubleValue
                    switch k {
                    case "weight": x.weight = n
                    case "reps": x.reps = n.map { Int($0) }
                    case "rpe": x.rpe = n
                    case "durationSec": x.durationSec = n
                    case "distanceM": x.distanceM = n
                    case "type": x.type = v as! String
                    case "done": x.done = v as! Bool
                    default: XCTFail("unknown patch key \(k)")
                    }
                }
            }
        case "addExercise":
            return Live.addExercise(s, lift: op["lift"] as! String, cardio: op["cardio"] as? Bool ?? false,
                                    title: op["title"] as? String, templateId: op["templateId"] as? String)
        default:
            XCTFail("unknown op \(op)")
            return s
        }
    }

    func testGoldenCasesMatchTypeScript() throws {
        let cases = golden["cases"] as! [[String: Any]]
        XCTAssertEqual(cases.count, 4)
        var steps = 0
        for c in cases {
            let name = c["name"] as! String
            var s = try session(c["start"]!)
            assertSame(try json(s), c["start"] as! [String: Any], "\(name): start round-trips")
            for (i, step) in (c["steps"] as! [[String: Any]]).enumerated() {
                let op = step["op"] as! [String: Any]
                s = apply(op, to: s)
                assertSame(try json(s), step["session"] as! [String: Any], "\(name) step \(i) \(op)")
                let cur = Live.current(s)
                if let want = step["current"] as? [String: Any] {
                    XCTAssertEqual(cur?.exId, s.exercises[want["ex"] as! Int].id, "\(name) step \(i): current exercise")
                    XCTAssertEqual(cur?.set, want["set"] as? Int, "\(name) step \(i): current set")
                } else {
                    XCTAssertNil(cur, "\(name) step \(i): nothing left")
                }
                let p = step["progress"] as! [String: Int]
                XCTAssertEqual(Live.progress(s), Live.Progress(done: p["done"]!, total: p["total"]!), "\(name) step \(i): progress")
                steps += 1
            }
        }
        XCTAssertGreaterThan(steps, 50)
    }

    func testBackOffsAreKeyedToTheTopSet() throws {
        // the RTS case: after the 300×3 top set the 5-rep back-offs get round(e1RM × pct / 5) × 5
        let c = (golden["cases"] as! [[String: Any]]).first { $0["name"] as? String == "backoff_lb" }!
        var s = try session(c["start"]!)
        let ex = s.exercises[0]
        XCTAssertTrue(ex.sets.contains { $0.target?.ofTop != nil && $0.weight == nil })
        s = Live.updateSet(s, exId: ex.id, 0) { $0.weight = 300; $0.reps = 3; $0.rpe = 8 }
        s = Live.completeSet(s, exId: ex.id, 0, now: Date(timeIntervalSince1970: 0))
        let e1 = 300.0 * (1 + 3.0 / 30)
        for x in s.exercises[0].sets where x.target?.ofTop != nil {
            XCTAssertEqual(x.weight, Live.roundTo(e1 * x.target!.ofTop!, 5))
        }
        XCTAssertEqual(s.restEndsAt, "1970-01-01T00:03:00.000Z", "T1 rest")
    }

    func testSessionFromPlanMatchesTypeScript() throws {
        let plans = golden["plans"] as! [[String: Any]]
        let cases = Dictionary(uniqueKeysWithValues: (golden["cases"] as! [[String: Any]]).map { ($0["name"] as! String, $0) })
        let pairs = ["gzclp_lb": "gzclp_full_lb", "rts_lb": "backoff_lb", "rts_kg": "backoff_kg"]
        for p in plans {
            let plan = try JSONDecoder().decode(PlannedSession.self, from: JSONSerialization.data(withJSONObject: p["plan"]!))
            let s = Live.sessionFromPlan(plan, unit: p["unit"] as! String, programName: p["programName"] as! String, now: Fmt.parseISO(p["now"] as! String)!)
            let want = cases[pairs[p["name"] as! String]!]!["start"] as! [String: Any]
            assertSame(try json(s), want, "sessionFromPlan \(p["name"]!)")
        }
    }

    func testWarmupsMatchTypeScript() {
        for w in golden["warmups"] as! [[String: Any]] {
            let got = Live.warmups(top: (w["top"] as! NSNumber).doubleValue, unit: w["unit"] as! String)
            let want = (w["sets"] as! [[String: Any]]).map { ($0["weight"] as! NSNumber).doubleValue }
            XCTAssertEqual(got.map { $0.weight ?? -1 }, want, "warmups \(w["unit"]!) \(w["top"]!)")
            XCTAssertTrue(got.allSatisfy { $0.type == "warmup" && !$0.done })
            XCTAssertEqual(got.map { $0.reps ?? 0 }, (w["sets"] as! [[String: Any]]).map { $0["reps"] as! Int })
        }
    }

    func testEmptySessionTitleByLocalHour() {
        let ny = TimeZone(identifier: "America/New_York")!
        for t in golden["titles"] as! [[String: Any]] {
            let s = Live.emptySession(unit: "kg", now: Fmt.parseISO(t["now"] as! String)!, tz: ny)
            XCTAssertEqual(s.title, t["title"] as? String, "hour \(t["hour"]!)")
            XCTAssertTrue(s.exercises.isEmpty)
            XCTAssertNil(s.restEndsAt)
        }
    }

    func testLiftKindsMatchTheLibrary() {
        let kinds = golden["kinds"] as! [String: String]
        XCTAssertEqual(kinds.count, LiftLibrary.all.count, "LiftLibrary.swift is regenerated from lifts.ts")
        for (k, v) in kinds { XCTAssertEqual(LiftLibrary.kind(k), v, k) }
        XCTAssertEqual(LiftLibrary.kind("unknown"), "barbell")
    }

    func testRestRules() {
        var s = Live.emptySession(unit: "lb", now: Date(timeIntervalSince1970: 0))
        s = Live.addExercise(s, lift: "bench")
        let a = s.exercises[0].id
        // the only set of the only exercise: no rest after it
        var t = Live.completeSet(s, exId: a, 0, now: Date(timeIntervalSince1970: 100))
        XCTAssertNil(t.restEndsAt)
        XCTAssertEqual(t.restFor, a)
        // with another set to go: 90 s
        s = Live.addSet(s, exId: a)
        t = Live.completeSet(s, exId: a, 0, now: Date(timeIntervalSince1970: 100))
        XCTAssertEqual(t.restEndsAt, Live.iso(Date(timeIntervalSince1970: 190)))
        // −15 / +30 / skip
        let now = Date(timeIntervalSince1970: 120)
        XCTAssertEqual(Live.adjustRest(t, by: -15, now: now).restEndsAt, Live.iso(Date(timeIntervalSince1970: 175)))
        XCTAssertEqual(Live.adjustRest(t, by: 30, now: now).restEndsAt, Live.iso(Date(timeIntervalSince1970: 220)))
        XCTAssertEqual(Live.adjustRest(t, by: 30, now: Date(timeIntervalSince1970: 300)).restEndsAt, Live.iso(Date(timeIntervalSince1970: 330)), "+30 after it ran out counts from now")
        XCTAssertNil(Live.skipRest(t).restEndsAt)
        // cardio has no rest
        var c = Live.addExercise(Live.emptySession(unit: "kg"), lift: "cardio", cardio: true, title: "Treadmill")
        c = Live.addSet(c, exId: c.exercises[0].id)
        XCTAssertNil(Live.completeSet(c, exId: c.exercises[0].id, 0).restEndsAt)
    }

    func testPlatesAndSteps() {
        XCTAssertEqual(Live.plates(225, unit: "lb"), [45, 45])
        XCTAssertEqual(Live.plates(315, unit: "lb"), [45, 45, 45])
        XCTAssertEqual(Live.plates(185, unit: "lb"), [45, 25])
        XCTAssertEqual(Live.plates(142.5, unit: "kg"), [25, 25, 10, 1.25])
        XCTAssertEqual(Live.plates(20, unit: "kg"), [])
        XCTAssertEqual(Live.plates(135, unit: "lb", bar: 35), [45, 5])
        XCTAssertEqual(Live.loadStep(kind: "dumbbell", unit: "kg"), 2)
        XCTAssertEqual(Live.loadStep(kind: "barbell", unit: "lb"), 5)
        XCTAssertEqual(Live.loadStep(kind: "machine", unit: "lb"), 2.5)
        XCTAssertEqual(Live.roundTo(302.5, 5), 305, "JS rounds halves up")
    }

    func testSummaryAndClock() throws {
        let start = try session(JSONSerialization.jsonObject(with: Self.fixture("gym-start")))
        var s = start
        let ex = s.exercises[0]
        for i in 0..<6 { s = Live.completeSet(s, exId: ex.id, i, now: start.startDate.addingTimeInterval(Double(i) * 60)) }
        let sum = Live.summary(s, end: start.startDate.addingTimeInterval(3600)) { $0.lift }
        XCTAssertEqual(sum.durationSec, 3600)
        XCTAssertEqual(sum.sets, 2, "warmups don't count")
        XCTAssertEqual(sum.volume, 650)
        XCTAssertEqual(sum.exercises.first?.best, "325×1")
        XCTAssertEqual(Live.clock(3909), "1:05:09")
        XCTAssertEqual(Live.clock(247), "4:07")
    }

    func testLenientDecoding() throws {
        // a fractional rep count from the web stepper and unknown fields don't break the session
        let json = #"{"id":"x","startedAt":"2026-01-01T10:00:00.000Z","unit":"kg","title":"T","new":1,"exercises":[{"id":"e","lift":"squat","restSeconds":90,"sets":[{"type":"normal","weight":100,"reps":7.6,"done":false}]}]}"#
        let s = try JSONDecoder().decode(LiveSession.self, from: Data(json.utf8))
        XCTAssertEqual(s.exercises[0].sets[0].reps, 8)
        XCTAssertNil(s.restEndsAt)
    }
}
