import XCTest
@testable import Ironterm

final class SnapshotDecodingTests: XCTestCase {
    func fixtureData() throws -> Data {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "snapshot.sample", withExtension: "json"), "sample fixture is bundled in the app")
        return try Data(contentsOf: url)
    }

    func testDecodesSampleFixture() throws {
        let s = try Snapshot.decode(fixtureData())
        XCTAssertEqual(s.v, 1)
        XCTAssertEqual(s.unit, "lb")
        XCTAssertEqual(s.today, "2026-10-15")
        XCTAssertTrue(s.demo)
        // 53 Monday-first weeks ending today
        XCTAssertEqual(s.graph.start, "2025-10-13")
        XCTAssertEqual(Day.weekdayIndex(s.graph.start), 0)
        XCTAssertEqual(s.graph.days.first?.date, s.graph.start)
        XCTAssertEqual(s.graph.days.last?.date, s.today)
        XCTAssertEqual(s.graph.days.count, 52 * 7 + Day.weekdayIndex(s.today) + 1)
        XCTAssertTrue(s.graph.days.allSatisfy { (0...4).contains($0.level) })
        XCTAssertEqual(s.week.days.map(\.dow), ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])
        XCTAssertEqual(s.week.done, s.week.days.filter { $0.status == "done" }.count)
        let next = try XCTUnwrap(s.next)
        XCTAssertEqual(next.when, "TOMORROW")
        XCTAssertEqual(next.exercises.first?.short, "BENCH")
        XCTAssertEqual(next.exercises.first?.summary, "9×1 @ 325, 1×1+ @ 325")
        XCTAssertEqual(next.exercises.first?.top, 325)
        XCTAssertNil(next.weekName)
        XCTAssertEqual(s.lifts.prefix(4).map(\.key), ["squat", "bench", "deadlift", "ohp"])
        XCTAssertTrue(s.lifts.allSatisfy { $0.spark.count == 12 })
        let r = try XCTUnwrap(s.recovery)
        XCTAssertEqual(r.muscles.first?.id, "frontDelt")
        XCTAssertEqual(r.muscles.map(\.readiness), r.muscles.map(\.readiness).sorted(), "least ready first")
        XCTAssertEqual(s.inlineNext, "Next: Bench 325 · TOMORROW")
    }

    func testFixtureHelperMatchesBundle() throws {
        XCTAssertEqual(Fixture.sample, try Snapshot.decode(fixtureData()))
        XCTAssertNil(Fixture.directSample.program)
        XCTAssertNil(Fixture.directSample.recovery)
    }

    func testRoundTrip() throws {
        let s = try Snapshot.decode(fixtureData())
        XCTAssertEqual(try Snapshot.decode(s.encoded()), s)
    }

    func testSourceSaysWhetherHevyIsConnected() throws {
        var s = try Snapshot.decode(fixtureData())
        XCTAssertFalse(s.isLocal, "older servers send no source")
        s.source = "local"
        let local = try Snapshot.decode(s.encoded())
        XCTAssertEqual(local.source, "local")
        XCTAssertTrue(local.isLocal)
        s.source = "hevy"
        XCTAssertFalse(s.isLocal)
    }

    func testLenientToAdditionsAndNulls() throws {
        let json = """
        {"v":1,"generatedAt":"2026-01-01T00:00:00Z","today":"2026-01-01","unit":"kg","tz":"UTC","demo":false,
         "newTopLevelField":{"x":1},
         "graph":{"start":"2025-12-29","days":[{"date":"2025-12-29","level":0,"value":0,"extra":true}]},
         "streak":{"current":0,"best":0},
         "week":{"target":3,"done":0,"days":[{"date":"2025-12-29","dow":"MON","status":"sick"}]},
         "totals":{"sessions52":0,"sessionsPrev52":0,"vol7":0,"volPrev7":0,"avgMin":0,"allTime":0},
         "last":null,"program":{"name":"P","next":null},"lifts":[{"key":"bench","name":"Bench","short":"BENCH","e1rm":100,"delta28":null,"spark":[]}],
         "recovery":null}
        """
        let s = try Snapshot.decode(Data(json.utf8))
        XCTAssertEqual(s.week.days.first?.status, "sick")
        XCTAssertNil(s.next)
        XCTAssertNil(s.lifts.first?.delta28)
        XCTAssertEqual(s.inlineNext, "Week 0/3 · streak 0w")
    }
}
