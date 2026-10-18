import XCTest
@testable import Ironterm

/// The program page's BODY tab: GET /api/app/programs/{id}/body (docs/api/app/programs-*-body*.json).
final class ProgramBodyTests: XCTestCase {
    func doc(_ name: String) throws -> ProgramBody {
        try AppAPI.decode(ProgramBody.self, LiveTests.fixture(name))
    }

    func testDecodesLoad() throws {
        let b = try doc("programs-gzclp-body")
        XCTAssertEqual(b.id, "gzclp")
        XCTAssertEqual(b.mode, "load")
        XCTAssertTrue(b.svgFront?.hasPrefix("<svg") ?? false)
        XCTAssertTrue(b.svgBack?.contains("</svg>") ?? false)
        XCTAssertEqual(b.legend.count, 2)
        XCTAssertGreaterThan(b.muscles.count, 20)
        XCTAssertTrue(zip(b.muscles, b.muscles.dropFirst()).allSatisfy { $0.load >= $1.load }, "most loaded first")
        XCTAssertTrue(b.muscles.allSatisfy { ["none", "low", "ok", "high", "n/a"].contains($0.status) })
        XCTAssertEqual(b.overlapsByWeek.count, b.weeks)
        XCTAssertEqual(b.overlapsByWeek.reduce(0, +), b.overlaps.count)
        XCTAssertEqual(b.summary.lines.count, 3)
        XCTAssertEqual(b.summary.mostTrained.count, 3)
        for g in b.summary.gaps {
            let t: [Double] = try XCTUnwrap(g.target)
            XCTAssertLessThan(try XCTUnwrap(g.hardSets), t[0])
        }
    }

    func testDecodesGapsAndNoFigures() throws {
        let load = try doc("programs-gzclp-body")
        let gaps = try doc("programs-gzclp-body-gaps")
        XCTAssertEqual(gaps.mode, "gaps")
        XCTAssertNotEqual(gaps.svgFront, load.svgFront)
        XCTAssertTrue(zip(gaps.muscles, gaps.muscles.dropFirst()).allSatisfy { $0.gap >= $1.gap }, "least recovered first")
        let pct = try doc("programs-531-body-gaps")
        XCTAssertNil(pct.svgFront, "svg=0")
        XCTAssertGreaterThan(pct.weeks, 1)
        XCTAssertTrue(pct.overlaps.isEmpty)
    }

    func testFiguresParse() throws {
        let b = try doc("programs-gzclp-body")
        XCTAssertNotNil(SVGCache.doc(try XCTUnwrap(b.svgFront)))
        XCTAssertNotNil(SVGCache.doc(try XCTUnwrap(b.svgBack)))
    }

    func testRangeBarAndStatus() throws {
        let b = try doc("programs-gzclp-body")
        let m = try XCTUnwrap(b.muscles.first { $0.target != nil && $0.hardSets > 0 })
        let bar = ProgramBodyText.bar(m)
        XCTAssertEqual(bar.fill, m.hardSets / 30, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(bar.lo), m.target![0] / 30, accuracy: 1e-9)
        XCTAssertEqual(try XCTUnwrap(bar.hi), m.target![1] / 30, accuracy: 1e-9)
        var big = m
        big.hardSets = 99
        XCTAssertEqual(ProgramBodyText.bar(big).fill, 1)
        var none = m
        none.target = nil
        XCTAssertNil(ProgramBodyText.bar(none).lo)
        XCTAssertEqual(ProgramBodyText.status("low"), "BELOW")
        XCTAssertEqual(ProgramBodyText.status("ok"), "IN RANGE")
        XCTAssertEqual(ProgramBodyText.status("high"), "ABOVE")
        XCTAssertEqual(ProgramBodyText.status("n/a"), "INDIRECT")
        XCTAssertEqual(ProgramBodyText.status("none"), "NONE")
    }

    func testGroupsAndOverlaps() throws {
        let b = try doc("programs-gzclp-body")
        let g = ProgramBodyText.grouped(b)
        let order: [String] = ProgramBodyText.groups.map(\.1)
        XCTAssertEqual(g.map(\.0), order.filter { o in g.contains { $0.0 == o } }, "body order")
        for (_, rows) in g {
            XCTAssertTrue(zip(rows, rows.dropFirst()).allSatisfy { $0.hardSets >= $1.hardSets })
            XCTAssertTrue(rows.allSatisfy { $0.target != nil || $0.sets >= 0.5 })
        }
        XCTAssertEqual(ProgramBodyText.overlaps(b, week: 1).count, b.overlaps.count)
        XCTAssertTrue(ProgramBodyText.overlaps(b, week: 2).isEmpty)
        let o = try XCTUnwrap(b.overlaps.first)
        XCTAssertEqual(ProgramBodyText.line(o), "\(o.from) → \(o.to) · \(o.prev.prefix(2).joined(separator: "+")) → \(o.now.prefix(2).joined(separator: "+")) · \(Int(o.gapH))h")
        XCTAssertEqual(ProgramBodyText.days([0, 1, 3, 4]), "Mon Tue Thu Fri")
        XCTAssertEqual(ProgramBodyText.percent(1.31), "131%")
        let m = try XCTUnwrap(b.muscles.first { $0.overlaps > 0 })
        XCTAssertTrue(ProgramBodyText.detail(m).hasPrefix(m.name + " · "))
        XCTAssertTrue(ProgramBodyText.detail(m).contains("overlaps/wk"))
    }

    func testPath() {
        XCTAssertEqual(AppAPI.programBodyPath("gzclp", options: [:], mode: "load"), "/api/app/programs/gzclp/body?mode=load")
        XCTAssertEqual(AppAPI.programBodyPath("531", options: ["supp": "fsl", "deload": "off"], mode: "gaps"),
                       "/api/app/programs/531/body?mode=gaps&opt.deload=off&opt.supp=fsl")
        XCTAssertNotEqual(ProgramBodyTab.key("531", [:], "load"), ProgramBodyTab.key("531", [:], "gaps"))
        XCTAssertNotEqual(ProgramBodyTab.key("531", ["supp": "fsl"], "load"), ProgramBodyTab.key("531", [:], "load"))
    }
}
