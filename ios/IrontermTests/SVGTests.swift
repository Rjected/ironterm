import SwiftUI
import XCTest
@testable import Ironterm

final class SVGPathParserTests: XCTestCase {
    func bounds(_ d: String) throws -> CGRect { try SVGPathParser.parse(d).boundingBoxOfPath }

    func testAbsoluteAndRelativeLines() throws {
        XCTAssertEqual(try bounds("M0 0L10 0L10 10Z"), CGRect(x: 0, y: 0, width: 10, height: 10))
        XCTAssertEqual(try bounds("m5 5l10 0l0 10z"), CGRect(x: 5, y: 5, width: 10, height: 10))
        XCTAssertEqual(try bounds("M0 0H20V5H0Z"), CGRect(x: 0, y: 0, width: 20, height: 5))
        XCTAssertEqual(try bounds("M1 1h4v4h-4z"), CGRect(x: 1, y: 1, width: 4, height: 4))
    }

    func testImplicitLineToAfterMoveAndPackedNumbers() throws {
        // "M0 0 10 0 10 10" = move then two line-tos; ".5.5" is two numbers; "-" separates
        XCTAssertEqual(try bounds("M0 0 10 0 10 10"), CGRect(x: 0, y: 0, width: 10, height: 10))
        XCTAssertEqual(try bounds("M.5.5l.5-.5"), CGRect(x: 0.5, y: 0, width: 0.5, height: 0.5))
        XCTAssertEqual(try bounds("M0,0L1e1,0L1e1,1E1"), CGRect(x: 0, y: 0, width: 10, height: 10))
        XCTAssertEqual(try bounds("M-5-5L5,5"), CGRect(x: -5, y: -5, width: 10, height: 10))
    }

    func testCurves() throws {
        let c = try bounds("M0 0C0 10 10 10 10 0")
        XCTAssertEqual(c.minX, 0, accuracy: 1e-6)
        XCTAssertEqual(c.maxX, 10, accuracy: 1e-6)
        XCTAssertEqual(c.maxY, 7.5, accuracy: 1e-6, "the curve peaks at 3/4 of the control height")
        // S reflects the previous control point; Q / T quadratic
        XCTAssertEqual(try bounds("M0 0C0 10 10 10 10 0S20 -10 20 0").minY, -7.5, accuracy: 1e-6)
        XCTAssertEqual(try bounds("M0 0Q5 10 10 0T20 0").maxY, 5, accuracy: 1e-6)
        XCTAssertEqual(try bounds("M0 0q5 10 10 0t10 0").minY, -5, accuracy: 1e-6)
    }

    func testArcs() throws {
        // a half circle of radius 5 from (0,0) to (10,0), sweeping down (+y)
        let b = try bounds("M0 0A5 5 0 0 0 10 0")
        XCTAssertEqual(b.width, 10, accuracy: 0.01)
        XCTAssertEqual(b.height, 5, accuracy: 0.05)
        // packed flags "a5 5 0 1010 0" and a radius too small (scaled up)
        XCTAssertEqual(try bounds("M0 0a5 5 0 1010 0").width, 10, accuracy: 0.01)
        XCTAssertEqual(try bounds("M0 0A1 1 0 0 1 10 0").width, 10, accuracy: 0.01)
    }

    func testRejectsGarbage() {
        XCTAssertThrowsError(try SVGPathParser.parse("10 10"))
        XCTAssertThrowsError(try SVGPathParser.parse("M0 0L"))
        XCTAssertThrowsError(try SVGPathParser.parse("M0 0X5 5"))
    }

    func testColors() {
        XCTAssertEqual(SVGColor.parse("#ff6b5e"), SVGColor(r: 1, g: 107 / 255, b: 94 / 255))
        XCTAssertEqual(SVGColor.parse("#000"), SVGColor(r: 0, g: 0, b: 0))
        XCTAssertEqual(SVGColor.parse("rgb(255, 0, 51)"), SVGColor(r: 1, g: 0, b: 0.2))
        XCTAssertNil(SVGColor.parse("none"))
    }
}

/// The server's body figures (docs/api/app/body*.json) parse and draw without a WebView.
@MainActor
final class SVGFigureTests: XCTestCase {
    func body(_ name: String) throws -> AppBody { try AppAPI.decode(AppBody.self, LiveTests.fixture(name)) }

    func testParsesTheBodyFigures() throws {
        for name in ["body", "body-load"] {
            let b = try body(name)
            for svg in [b.svgFront, b.svgBack] {
                let doc = try SVGDocument.parse(svg)
                XCTAssertGreaterThan(doc.viewBox.width, 100)
                XCTAssertGreaterThan(doc.viewBox.height, doc.viewBox.width, "a standing figure")
                // every <path d> in the document became a shape (none dropped by the parser)
                let drawn = svg.components(separatedBy: "<path ").count - 1 - svg.components(separatedBy: "<clipPath").count + 1
                XCTAssertEqual(doc.shapes.count, drawn, name)
                XCTAssertTrue(doc.shapes.contains { !$0.clips.isEmpty }, "clip-path references resolve")
                // shapes lie inside the viewBox (with the 6 unit pad)
                let all = doc.shapes.reduce(CGRect.null) { $0.union($1.path.boundingBoxOfPath) }
                XCTAssertTrue(doc.viewBox.insetBy(dx: -1, dy: -1).contains(all), "\(all) in \(doc.viewBox)")
                XCTAssertTrue(doc.shapes.contains { $0.nonScaling && $0.stroke != nil })
            }
        }
    }

    func testMusclesAreColouredByValue() throws {
        let b = try body("body")
        let doc = try SVGDocument.parse(b.svgFront)
        let idle = SVGColor.parse("#121317")!
        let fills = doc.shapes.compactMap(\.fill)
        XCTAssertTrue(fills.contains(idle), "untrained muscles are idle grey")
        // "ready" mode: warn ramp, faint → red; some muscle carries fatigue
        XCTAssertTrue(fills.contains { $0 != idle && $0.r > $0.g + 0.01 }, "a fatigued muscle on the faint → red ramp")
        let load = try SVGDocument.parse(try body("body-load").svgFront)
        XCTAssertTrue(load.shapes.compactMap(\.fill).contains { $0.b > $0.r + 0.2 }, "load mode uses the blue ramp")
    }

    func testRendersToPixels() throws {
        let b = try body("body")
        let view = SVGView(svg: b.svgFront).frame(width: 200, height: 390).background(Color.black)
        let r = ImageRenderer(content: view)
        r.scale = 1
        let img = try XCTUnwrap(r.cgImage)
        // sample the middle column: the figure isn't empty
        let data = try XCTUnwrap(img.dataProvider?.data as Data?)
        var lit = 0
        let bpr = img.bytesPerRow
        for y in stride(from: 0, to: img.height, by: 4) {
            let o = y * bpr + (img.width / 2) * 4
            if Int(data[o]) + Int(data[o + 1]) + Int(data[o + 2]) > 20 { lit += 1 }
        }
        XCTAssertGreaterThan(lit, 20, "the figure was drawn")
        if let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] {
            try UIImage(cgImage: img).pngData()?.write(to: URL(fileURLWithPath: dir).appendingPathComponent("body-figure-test.png"))
        }
    }

    func testFemaleStyleDocument() throws {
        // groups, rects, inherited fills, a clip on a group, a gradient and relative arcs, as the female figure uses
        let svg = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"><defs>
        <radialGradient id="g"><stop offset="0" stop-color="#ff0000" stop-opacity=".5"/></radialGradient>
        <clipPath id="c"><rect x="0" y="0" width="50" height="200"/></clipPath></defs>
        <g fill="#00ff00" clip-path="url(#c)"><path d="M10 10h30v30h-30z"/><path d="m10 50a10 10 0 1 0 20 0a10 10 0 1 0-20 0" fill="url(#g)"/></g>
        <rect x="60" y="60" width="10" height="10" style="fill:#0000ff;stroke:none"/></svg>
        """
        let doc = try SVGDocument.parse(svg)
        XCTAssertEqual(doc.shapes.count, 3)
        XCTAssertEqual(doc.shapes[0].fill, SVGColor(r: 0, g: 1, b: 0))
        XCTAssertEqual(doc.shapes[0].clips.count, 1)
        XCTAssertEqual(doc.shapes[1].fill, SVGColor(r: 1, g: 0, b: 0, a: 0.5))
        XCTAssertEqual(doc.shapes[1].path.boundingBoxOfPath.width, 20, accuracy: 0.05)
        XCTAssertEqual(doc.shapes[2].fill, SVGColor(r: 0, g: 0, b: 1))
        XCTAssertNil(doc.shapes[2].stroke)
        let (t, k) = doc.fit(CGSize(width: 50, height: 50))
        XCTAssertEqual(k, 0.25)
        XCTAssertEqual(CGPoint(x: 0, y: 0).applying(t).x, 12.5)
    }
}

final class DirectScreensTests: XCTestCase {
    func workout(_ id: String, _ date: String, _ kg: Double, reps: Int, desc: String? = nil) -> Workout {
        Workout(id: id, title: "W\(id)", startTime: "\(date)T10:00:00Z", endTime: "\(date)T11:00:00Z",
                exercises: [Exercise(title: "Squat (Barbell)", sets: [ExerciseSet(type: "warmup", weightKg: 20, reps: 10),
                                                                      ExerciseSet(weightKg: kg, reps: reps)], notes: "felt good"),
                            Exercise(title: "Bench Press (Barbell)", sets: [ExerciseSet(weightKg: 80, reps: 5)])],
                description: desc)
    }

    func testLiftsHistoryAndWorkoutFromCachedWorkouts() throws {
        let ws = [workout("1", "2026-09-01", 100, reps: 5), workout("2", "2026-09-08", 110, reps: 3, desc: "pr day\n[ht:A1]"), workout("3", "2026-10-01", 105, reps: 5)]
        let d = DirectScreens(workouts: ws, unit: "kg", tz: TimeZone(identifier: "UTC")!, now: Fmt.parseISO("2026-10-15T12:00:00Z")!)
        let l = d.liftList()
        XCTAssertEqual(l.lifts.map(\.key), ["squat", "bench"])
        XCTAssertEqual(l.lifts[0].sessions, 3)
        let sq = d.liftDetail("squat")
        XCTAssertEqual(sq.points.map(\.date), ["2026-09-01", "2026-09-08", "2026-10-01"])
        XCTAssertEqual(sq.points[1].e1rm, 121, "Epley 110×3")
        XCTAssertEqual(sq.best?.date, "2026-10-01", "105×5 (122.5) beats 110×3 (121)")
        XCTAssertEqual(sq.repPRs.map(\.reps), [3, 5])
        XCTAssertEqual(sq.repPRs.first { $0.reps == 5 }?.weight, 105)
        XCTAssertEqual(sq.points[0].sets.count, 1, "warmups excluded")

        let h = d.history(cursor: nil, limit: 2, q: nil)
        XCTAssertEqual(h.workouts.map(\.id), ["3", "2"], "newest first")
        XCTAssertEqual(h.next, "2")
        XCTAssertEqual(h.total, 3)
        XCTAssertEqual(d.history(cursor: h.next, limit: 2, q: nil).workouts.map(\.id), ["1"])
        XCTAssertNil(d.history(cursor: h.next, limit: 2, q: nil).next)
        XCTAssertEqual(d.history(cursor: nil, q: "bench").total, 3)
        XCTAssertEqual(d.history(cursor: nil, q: "w2").workouts.map(\.id), ["2"])

        let w = try XCTUnwrap(d.workout("2"))
        XCTAssertEqual(w.note, "pr day")
        XCTAssertEqual(w.summary.programDay, "A1")
        XCTAssertTrue(w.summary.hasNotes)
        XCTAssertEqual(w.exercises[0].lift, "squat")
        XCTAssertEqual(w.exercises[0].note, "felt good")
        XCTAssertNil(w.exercises[0].sets[0].e1rm, "no e1RM for warmups")
        XCTAssertEqual(w.exercises[0].sets[1].e1rm, 121)
    }
}
