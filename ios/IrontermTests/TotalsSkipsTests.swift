import XCTest
@testable import Ironterm

/// Rep totals ("100 total reps") and skipped sets: the Swift port replayed against golden cases from
/// web/shared/live.ts (Fixtures/totals_golden.json: 5/3/1 Building the Monolith day 1 planned by the
/// server's program engine, then each op with the session, current() and progress() after it), plus
/// the behaviour spec web/shared/totals-skips.test.ts written out in Swift.
final class TotalsSkipsTests: XCTestCase {
    lazy var golden: [String: Any] = try! JSONSerialization.jsonObject(with: LiveTests.fixture("totals_golden")) as! [String: Any]

    func plan() throws -> PlannedSession {
        try JSONDecoder().decode(PlannedSession.self, from: JSONSerialization.data(withJSONObject: golden["plan"]!))
    }

    func monolith() throws -> LiveSession {
        Live.sessionFromPlan(try plan(), unit: "lb", programName: "Monolith", now: Fmt.parseISO(golden["now"] as! String)!)
    }

    // MARK: comparing with the TypeScript

    /// Drop nulls and `false` for the flags the TS writes as false and Swift leaves out (skipped,
    /// auto), numbers as Doubles, exercise ids as positions.
    func normalize(_ v: Any, ids: [String: String]) -> Any {
        if let d = v as? [String: Any] {
            var out: [String: Any] = [:]
            for (k, x) in d where !(x is NSNull) {
                if (k == "skipped" || k == "auto"), let b = x as? NSNumber, CFGetTypeID(b) == CFBooleanGetTypeID(), !b.boolValue { continue }
                if (k == "id" || k == "restFor"), let s = x as? String, let m = ids[s] { out[k] = m; continue }
                out[k] = normalize(x, ids: ids)
            }
            return out
        }
        if let a = v as? [Any] { return a.map { normalize($0, ids: ids) } }
        if let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { return n.doubleValue }
        return v
    }

    func idMap(_ s: [String: Any]) -> [String: String] {
        var m: [String: String] = [:]
        for (i, e) in ((s["exercises"] as? [[String: Any]]) ?? []).enumerated() { if let id = e["id"] as? String { m[id] = "ex\(i)" } }
        m[s["id"] as? String ?? ""] = "session"
        return m
    }

    func assertSame(_ s: LiveSession, _ ts: [String: Any], _ msg: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let swift = try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as! [String: Any]
        let a = normalize(swift, ids: idMap(swift)) as! NSDictionary
        let b = normalize(ts, ids: idMap(ts)) as! NSDictionary
        if a != b {
            let ad = String(data: try JSONSerialization.data(withJSONObject: a, options: [.sortedKeys]), encoding: .utf8)!
            let bd = String(data: try JSONSerialization.data(withJSONObject: b, options: [.sortedKeys]), encoding: .utf8)!
            XCTFail("\(msg)\nswift: \(ad.prefix(3000))\nts:    \(bd.prefix(3000))", file: file, line: line)
        }
    }

    func apply(_ op: [String: Any], to s: LiveSession) -> LiveSession {
        let id = s.exercises[op["ex"] as! Int].id
        let set = op["set"] as? Int ?? 0
        switch op["op"] as! String {
        case "update":
            let p = op["patch"] as! [String: Any]
            XCTAssertEqual(Array(p.keys), ["reps"], "only reps patches in the fixture")
            // the app's reps edits are Live.setReps (the TS updateSet with {reps})
            return Live.setReps(s, exId: id, set, (p["reps"] as! NSNumber).intValue)
        case "complete": return Live.completeSet(s, exId: id, set, now: Fmt.parseISO(op["now"] as! String)!)
        case "skip": return Live.skipSet(s, exId: id, set, skipped: op["on"] as? Bool ?? true)
        case "skipExercise": return Live.skipExercise(s, exId: id)
        case "addSet": return Live.addSet(s, exId: id)
        default:
            XCTFail("unknown op \(op)")
            return s
        }
    }

    func testPlanAndSessionCarryTheTotals() throws {
        let p = try plan()
        let chin = try XCTUnwrap(p.exercises.first { $0.lift == "chinUp" })
        XCTAssertEqual(chin.totalReps, 100)
        XCTAssertNil(chin.totalRepsMax)
        XCTAssertEqual(p.exercises.first { $0.lift == "dip" }?.totalRepsMax, 200)
        let s = try monolith()
        try assertSame(s, golden["start"] as! [String: Any], "sessionFromPlan")
        XCTAssertEqual(s.exercises.first { $0.lift == "chinUp" }?.totalReps, 100)
        XCTAssertEqual(s.exercises.first { $0.lift == "dip" }?.totalRepsMax, 200)
        XCTAssertNil(s.exercises.first { $0.lift == "squat" }?.totalReps, "main lifts aren't rep totals")
    }

    func testServerGymDocumentCarriesTotalsAndSkip() throws {
        // GET /api/app/gym from a local server running Building the Monolith
        let g = try AppAPI.decode(AppGym.self, LiveTests.fixture("gym-monolith"))
        XCTAssertNil(g.skipped)
        XCTAssertEqual(g.plan?.exercises.first { $0.lift == "chinUp" }?.totalReps, 100)
        XCTAssertEqual(g.plan?.exercises.first { $0.lift == "dip" }?.totalRepsMax, 200)
        // offline start from the cached plan keeps the totals
        let s = Live.sessionFromPlan(try XCTUnwrap(g.plan), unit: g.unit, programName: g.programName ?? "")
        XCTAssertEqual(s.exercises.first { $0.lift == "chinUp" }?.totalReps, 100)
        let skipped = #"{"unit":"lb","days":[],"catalog":[],"skipped":{"dayId":"1","dayName":"Monday · Squat / Press","date":"2026-10-21T16:33:45.115Z"}}"#
        XCTAssertEqual(try AppAPI.decode(AppGym.self, Data(skipped.utf8)).skipped?.dayName, "Monday · Squat / Press")
    }

    func testGoldenCasesMatchTypeScript() throws {
        let cases = golden["cases"] as! [[String: Any]]
        XCTAssertEqual(cases.count, 8)
        var steps = 0
        for c in cases {
            let name = c["name"] as! String
            var s = try monolith()
            for (i, step) in (c["steps"] as! [[String: Any]]).enumerated() {
                let op = step["op"] as! [String: Any]
                s = apply(op, to: s)
                try assertSame(s, step["session"] as! [String: Any], "\(name) step \(i) \(op)")
                let cur = Live.current(s)
                if let want = step["current"] as? [String: Any] {
                    XCTAssertEqual(cur?.exId, s.exercises[want["ex"] as! Int].id, "\(name) step \(i): current exercise")
                    XCTAssertEqual(cur?.set, want["set"] as? Int, "\(name) step \(i): current set")
                } else {
                    XCTAssertNil(cur, "\(name) step \(i): nothing left")
                }
                let p = step["progress"] as! [String: Int]
                XCTAssertEqual(Live.progress(s), Live.Progress(done: p["done"]!, total: p["total"]!), "\(name) step \(i): progress")
                XCTAssertEqual(s.exercises.map(Live.repsDone), step["repsDone"] as! [Int], "\(name) step \(i): repsDone")
                steps += 1
            }
        }
        XCTAssertGreaterThan(steps, 100)
    }

    // MARK: the web spec (totals-skips.test.ts), in Swift

    func ex(_ s: LiveSession, _ lift: String) -> LiveExercise { s.exercises.first { $0.lift == lift }! }
    func work(_ s: LiveSession, _ lift: String) -> [LiveSet] { ex(s, lift).sets.filter { !$0.isWarmup } }

    /// do the next open set of `lift` for `reps` reps
    func doSet(_ s: LiveSession, _ lift: String, _ reps: Int) throws -> LiveSession {
        let e = ex(s, lift)
        let i = try XCTUnwrap(e.sets.firstIndex { $0.isOpen && !$0.isWarmup }, "no open set left on \(lift)")
        return Live.completeSet(Live.setReps(s, exId: e.id, i, reps), exId: e.id, i)
    }

    func testSetsOfFiveFollowYourPaceUntil100() throws {
        var s = try monolith()
        s = try doSet(s, "chinUp", 5)
        XCTAssertTrue(work(s, "chinUp").filter { !$0.done }.allSatisfy { $0.reps == 5 && $0.isAuto }, "untouched planned sets take your pace")
        for _ in 0..<19 { s = try doSet(s, "chinUp", 5) }
        XCTAssertEqual(Live.repsDone(ex(s, "chinUp")), 100)
        XCTAssertEqual(work(s, "chinUp").filter(\.done).count, 20)
        XCTAssertFalse(ex(s, "chinUp").sets.contains { $0.isOpen }, "nothing left open")
        XCTAssertNotEqual(Live.current(s)?.exId, ex(s, "chinUp").id, "the session moves on")
    }

    func testLastSetIsWhatsLeftAndAnEarlyFinishSkipsTheRest() throws {
        var s = try monolith()
        for _ in 0..<4 { s = try doSet(s, "chinUp", 23) }
        XCTAssertEqual(work(s, "chinUp").filter(\.isOpen).map(\.reps), [8])
        s = try doSet(s, "chinUp", 8)
        XCTAssertEqual(Live.repsDone(ex(s, "chinUp")), 100)
        var t = try monolith()
        for _ in 0..<4 { t = try doSet(t, "chinUp", 25) }
        XCTAssertEqual(work(t, "chinUp").filter(\.isSkipped).count, 1)
        XCTAssertEqual(Live.progress(t).total, Live.progress(try monolith()).total - 1)
    }

    func testASetYouEditedKeepsItsReps() throws {
        var s = try monolith()
        let e = ex(s, "chinUp")
        let planned = e.sets.indices.filter { !e.sets[$0].isWarmup }
        s = Live.setReps(s, exId: e.id, planned[2], 12)
        s = try doSet(s, "chinUp", 6)
        XCTAssertEqual(ex(s, "chinUp").sets[planned[2]].reps, 12)
        XCTAssertEqual(ex(s, "chinUp").sets[planned[1]].reps, 6)
    }

    func testEditingRepsClearsAuto() throws {
        var s = try monolith()
        s = try doSet(s, "chinUp", 5)
        let e = ex(s, "chinUp")
        let i = try XCTUnwrap(e.sets.firstIndex { $0.isOpen })
        XCTAssertTrue(e.sets[i].isAuto)
        // the stepper (updateSet changing reps) and the number pad (setReps, even the same number)
        XCTAssertFalse(ex(Live.updateSet(s, exId: e.id, i) { $0.reps = 7 }, "chinUp").sets[i].isAuto)
        XCTAssertFalse(ex(Live.setReps(s, exId: e.id, i, 5), "chinUp").sets[i].isAuto)
        // other edits leave it
        XCTAssertTrue(ex(Live.updateSet(s, exId: e.id, i) { $0.weight = 10 }, "chinUp").sets[i].isAuto)
    }

    func testSkippedSetsArentCurrentCountedOrSavedAndComeBack() throws {
        var s = try monolith()
        let e = ex(s, "squat")
        let first = try XCTUnwrap(e.sets.firstIndex { !$0.done })
        s = Live.skipSet(s, exId: e.id, first)
        XCTAssertNotEqual(Live.current(s), Live.Cursor(exId: e.id, set: first))
        let before = Live.progress(try monolith())
        XCTAssertEqual(Live.progress(s).total, e.sets[first].isWarmup ? before.total : before.total - 1)
        s = Live.completeSet(s, exId: e.id, first + 1)
        XCTAssertEqual(Live.summary(s) { $0.lift }.sets, e.sets[first + 1].isWarmup ? 0 : 1)
        XCTAssertFalse(ex(s, "squat").sets[first].done)
        s = Live.skipSet(s, exId: e.id, first, skipped: false)
        XCTAssertEqual(Live.current(s), Live.Cursor(exId: e.id, set: first))
    }

    func testSkipTheRestOfAnExerciseKeepsDoneSets() throws {
        var s = try monolith()
        let e = ex(s, "squat")
        s = Live.completeSet(s, exId: e.id, 0)
        s = Live.skipExercise(s, exId: e.id)
        XCTAssertTrue(ex(s, "squat").sets[0].done)
        XCTAssertTrue(ex(s, "squat").sets.dropFirst().allSatisfy { $0.isSkipped && !$0.done })
        XCTAssertNotEqual(Live.current(s)?.exId, e.id)
    }

    func testAddSetNeverCopiesSkippedAndCompleteClearsIt() throws {
        var s = try monolith()
        let e = ex(s, "chinUp")
        s = Live.skipExercise(s, exId: e.id)
        s = Live.addSet(s, exId: e.id)
        let last = try XCTUnwrap(ex(s, "chinUp").sets.last)
        XCTAssertFalse(last.isSkipped)
        XCTAssertTrue(last.isOpen, "+ SET after skipping keeps going")
        for other in s.exercises where other.id != e.id { s = Live.skipExercise(s, exId: other.id) }
        XCTAssertEqual(Live.current(s), Live.Cursor(exId: e.id, set: ex(s, "chinUp").sets.count - 1))
        s = Live.completeSet(s, exId: e.id, 0)
        XCTAssertTrue(ex(s, "chinUp").sets[0].done)
        XCTAssertFalse(ex(s, "chinUp").sets[0].isSkipped)
    }

    func testCompleteNeedsAWorkSetAndWarmupsPlusSkipsShowSkipped() throws {
        var s = try monolith()
        let sq = ex(s, "squat")
        XCTAssertTrue(sq.sets.contains(where: \.isWarmup))
        XCTAssertFalse(Live.isComplete(sq))
        XCTAssertFalse(Live.isSkippedOut(sq))
        // warm-ups done, work sets skipped: not complete, " · skipped"
        for i in sq.sets.indices where sq.sets[i].isWarmup { s = Live.completeSet(s, exId: sq.id, i) }
        s = Live.skipExercise(s, exId: sq.id)
        XCTAssertFalse(Live.isComplete(ex(s, "squat")), "warm-ups alone don't count")
        XCTAssertTrue(Live.isSkippedOut(ex(s, "squat")))
        // one work set back and done, the rest still skipped: complete
        let w = try XCTUnwrap(ex(s, "squat").sets.firstIndex { !$0.isWarmup })
        s = Live.completeSet(s, exId: sq.id, w)
        XCTAssertTrue(Live.isComplete(ex(s, "squat")))
        XCTAssertFalse(Live.isSkippedOut(ex(s, "squat")))
        // an open set left: not complete, not skipped out
        s = Live.skipSet(s, exId: sq.id, w + 1, skipped: false)
        XCTAssertFalse(Live.isComplete(ex(s, "squat")))
        XCTAssertFalse(Live.isSkippedOut(ex(s, "squat")))
        // a rep total: complete at the total, skipped out short of it
        var t = try monolith()
        let chin = ex(t, "chinUp")
        t = try doSet(t, "chinUp", 40)
        t = Live.skipExercise(t, exId: chin.id)
        XCTAssertFalse(Live.isComplete(ex(t, "chinUp")))
        XCTAssertTrue(Live.isSkippedOut(ex(t, "chinUp")))
        t = Live.addSet(t, exId: chin.id)
        t = try doSet(t, "chinUp", 60)
        XCTAssertTrue(Live.isComplete(ex(t, "chinUp")))
        XCTAssertFalse(Live.isSkippedOut(ex(t, "chinUp")))
        // a set still to do: neither
        XCTAssertFalse(Live.isSkippedOut(Live.addExercise(Live.emptySession(unit: "kg"), lift: "bench").exercises[0]))
    }

    func testNoRestWhenEverythingLeftIsSkipped() throws {
        var s = try monolith()
        for e in s.exercises.dropFirst() { s = Live.skipExercise(s, exId: e.id) }
        let a = s.exercises[0]
        let n = a.sets.count
        s = Live.skipSet(s, exId: a.id, n - 1)
        for i in 0..<(n - 2) { s = Live.completeSet(s, exId: a.id, i) }
        XCTAssertNotNil(s.restEndsAt, "a set still to do: rest")
        s = Live.completeSet(s, exId: a.id, n - 2)
        XCTAssertNil(s.restEndsAt, "only skipped sets left: no rest")
        XCTAssertNil(Live.current(s))
    }

    // MARK: JSON

    func testOldSessionsDecodeAndFlagsRoundTrip() throws {
        // a session saved before rep totals and skips
        let old = #"{"id":"x","startedAt":"2026-01-01T10:00:00.000Z","unit":"kg","title":"T","exercises":[{"id":"e","lift":"chinUp","restSeconds":90,"sets":[{"type":"normal","weight":null,"reps":5,"done":false}]}]}"#
        let s = try JSONDecoder().decode(LiveSession.self, from: Data(old.utf8))
        XCTAssertNil(s.exercises[0].totalReps)
        XCTAssertFalse(s.exercises[0].sets[0].isSkipped)
        XCTAssertFalse(s.exercises[0].sets[0].isAuto)
        // new fields from the server (false is the same as absent)
        let new = #"{"id":"x","startedAt":"2026-01-01T10:00:00.000Z","unit":"kg","title":"T","exercises":[{"id":"e","lift":"chinUp","restSeconds":90,"totalReps":100,"totalRepsMax":200,"sets":[{"type":"normal","reps":5,"done":false,"skipped":true,"auto":true},{"type":"normal","reps":5,"done":true,"skipped":false,"auto":false}]}]}"#
        let t = try JSONDecoder().decode(LiveSession.self, from: Data(new.utf8))
        XCTAssertEqual(t.exercises[0].totalReps, 100)
        XCTAssertEqual(t.exercises[0].totalRepsMax, 200)
        XCTAssertTrue(t.exercises[0].sets[0].isSkipped)
        XCTAssertTrue(t.exercises[0].sets[0].isAuto)
        XCTAssertNil(t.exercises[0].sets[1].skipped)
        let back = try JSONSerialization.jsonObject(with: JSONEncoder().encode(t)) as! [String: Any]
        let sets = ((back["exercises"] as! [[String: Any]])[0]["sets"] as! [[String: Any]])
        XCTAssertEqual(sets[0]["skipped"] as? Bool, true)
        XCTAssertEqual(sets[0]["auto"] as? Bool, true)
        XCTAssertNil(sets[1]["skipped"], "not written when not skipped")
        XCTAssertEqual((back["exercises"] as! [[String: Any]])[0]["totalReps"] as? Int, 100)
    }

    // MARK: Live Activity

    @MainActor
    func testLiveActivityShowsRepTotalsAndSkipsSkippedSets() throws {
        var s = try monolith()
        for e in s.exercises where e.lift == "squat" || e.lift == "ohp" { s = Live.skipExercise(s, exId: e.id) }
        s = try doSet(s, "chinUp", 5)
        let st = RestController.state(s) { $0.lift.uppercased() }
        XCTAssertEqual(st.exercise, "CHINUP")
        XCTAssertEqual(st.setLine, "5/100 REPS · BW × 5")
        XCTAssertEqual(st.done, 1)
        // a set-count exercise with a skipped set: SET n/total counts only the sets left in
        var t = try monolith()
        let sq = ex(t, "squat")
        let work = sq.sets.indices.filter { !sq.sets[$0].isWarmup }
        for i in sq.sets.indices where sq.sets[i].isWarmup { t = Live.completeSet(t, exId: sq.id, i) }
        t = Live.skipSet(t, exId: sq.id, work[1])
        t = Live.completeSet(t, exId: sq.id, work[0])
        let line = RestController.state(t) { $0.lift }.setLine
        XCTAssertTrue(line.hasPrefix("SET 2/\(work.count - 1) · "), line)
    }
}
