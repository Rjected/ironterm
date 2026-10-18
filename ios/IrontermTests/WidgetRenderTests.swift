import SwiftUI
import WidgetKit
import XCTest
@testable import Ironterm

/// Renders every widget kind × family with ImageRenderer. Always checks that each one renders at
/// its family size; with TEST_RUNNER_SCREENSHOT_DIR set it also writes the PNGs there.
@MainActor
final class WidgetRenderTests: XCTestCase {
    func render(_ data: WidgetData, suffix: String) throws -> Int {
        let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"].map { URL(fileURLWithPath: $0) }
        if let dir { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
        var n = 0
        for item in WidgetCatalog.all {
            let view = WidgetCatalog.frame(item, data: data, theme: .blue)
                .padding(item.kind == "lock" ? 10 : 6)
                .background(item.kind == "lock" ? Color(hex: 0x24304A) : Color(hex: 0x1A1B1F))
            let r = ImageRenderer(content: view)
            r.scale = 3
            let img = try XCTUnwrap(r.uiImage, "\(item.id) rendered")
            let size = WidgetCatalog.size(item.family)
            XCTAssertGreaterThanOrEqual(img.size.width, size.width, item.id)
            XCTAssertGreaterThanOrEqual(img.size.height, size.height, item.id)
            if let dir, let png = img.pngData() {
                try png.write(to: dir.appendingPathComponent("widget-\(item.id)\(suffix).png"))
            }
            n += 1
        }
        return n
    }

    func testRenderServerSample() throws {
        XCTAssertEqual(try render(.sample, suffix: ""), WidgetCatalog.all.count)
    }

    func testRenderDirectSample() throws {
        XCTAssertGreaterThan(try render(.directSample, suffix: "-direct"), 0)
    }

    func testRenderNotConnected() throws {
        XCTAssertGreaterThan(try render(WidgetData(snapshot: nil, source: .none, error: nil), suffix: "-empty"), 0)
    }

    func testCatalogCoversEveryFamily() {
        let fams = Set(WidgetCatalog.all.map(\.familyName))
        XCTAssertEqual(fams, ["small", "medium", "large", "extraLarge", "circular", "rectangular", "inline"])
        XCTAssertEqual(WidgetCatalog.all.filter { $0.kind == "activity" }.count, 4)
    }
}
