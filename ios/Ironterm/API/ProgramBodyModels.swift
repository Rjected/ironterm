import Foundation

// GET /api/app/programs/{id}/body?mode=load|gaps&opt.* (docs/api/programs.md): what a program does
// to each muscle before you start it. Mirrors ProgramBody in web/shared/appapi.ts.
// Samples: docs/api/app/programs-*-body*.json.

struct ProgramBody: Codable, Equatable, Sendable {
    var id: String
    /// load | gaps
    var mode: String
    var sex: String
    /// Mon = 0
    var trainingDays: [Int]
    /// calendar weeks measured; per-week numbers average over them
    var weeks: Int
    /// standalone SVGs coloured for `mode` (left out when asked with svg=0)
    var svgFront: String?
    var svgBack: String?
    var legend: [String]
    var muscles: [Muscle]
    var overlaps: [Overlap]
    var overlapsByWeek: [Int]
    var summary: Summary

    struct Muscle: Codable, Equatable, Identifiable, Sendable {
        var id: String
        var name: String
        var short: String
        var group: String
        /// 0–1 colour on the LOAD figure
        var load: Double
        /// 0–1 colour on the GAPS figure (1 − lowest readiness)
        var gap: Double
        var sets: Double
        var hardSets: Double
        /// weekly hard-set range [lo, hi]; nil = indirect only
        var target: [Double]?
        /// none | low | ok | high | n/a
        var status: String
        var hits: Double
        var minGapH: Double?
        var recoverH: Double?
        var minReadiness: Double
        /// per week
        var overlaps: Double
        var lifts: [String]
    }

    struct Overlap: Codable, Equatable, Sendable {
        /// 1-based
        var week: Int
        var muscle: String
        var short: String
        /// "MON A1" → "TUE B1"
        var from: String
        var to: String
        var gapH: Double
        /// residual fatigue as a share of the previous dose (can pass 1 when older sessions add up)
        var share: Double
        var prev: [String]
        var now: [String]
    }

    struct Summary: Codable, Equatable, Sendable {
        var mostTrained: [Ref]
        var gaps: [Ref]
        var overlapping: [Ref]
        var overlapsPerWeek: Double
        /// most trained · below range · overlaps, as sentences
        var lines: [String]
    }

    struct Ref: Codable, Equatable, Sendable {
        var id: String
        var short: String
        var hardSets: Double?
        var target: [Double]?
        var perWeek: Double?
    }
}

/// Pure helpers for the BODY tab (unit-tested).
enum ProgramBodyText {
    /// range bars run 0 → this many hard sets a week (as on the web)
    static let scale: Double = 30
    static let groups: [(String, String)] = [
        ("chest", "CHEST"), ("shoulders", "SHOULDERS"), ("arms", "ARMS"), ("back", "BACK"),
        ("core", "CORE"), ("hips", "HIPS"), ("legs", "LEGS"),
    ]

    struct RangeBar: Equatable {
        var fill: Double
        var lo: Double?
        var hi: Double?
    }

    static func frac(_ x: Double) -> Double { max(0, min(1, x / scale)) }

    /// The hard sets and the target band as fractions of `scale`.
    static func bar(_ m: ProgramBody.Muscle) -> RangeBar {
        guard let t = m.target, t.count == 2 else { return RangeBar(fill: frac(m.hardSets), lo: nil, hi: nil) }
        return RangeBar(fill: frac(m.hardSets), lo: frac(t[0]), hi: frac(t[1]))
    }

    static func status(_ s: String) -> String {
        switch s {
        case "low": return "BELOW"
        case "ok": return "IN RANGE"
        case "high": return "ABOVE"
        case "n/a": return "INDIRECT"
        default: return "NONE"
        }
    }

    /// Muscles worth listing (a target range, or trained at all), by body group, most hard sets first.
    static func grouped(_ b: ProgramBody) -> [(String, [ProgramBody.Muscle])] {
        var out: [(String, [ProgramBody.Muscle])] = []
        for (g, label) in groups {
            let rows: [ProgramBody.Muscle] = b.muscles
                .filter { $0.group == g && ($0.target != nil || $0.sets >= 0.5) }
                .sorted { $0.hardSets > $1.hardSets }
            if !rows.isEmpty { out.append((label, rows)) }
        }
        return out
    }

    static func overlaps(_ b: ProgramBody, week: Int) -> [ProgramBody.Overlap] {
        b.overlaps.filter { $0.week == week }
    }

    /// "MON A1 → TUE B1 · SQUAT → DEADLIFT+OHP · 24h"
    static func line(_ o: ProgramBody.Overlap) -> String {
        let prev: String = o.prev.prefix(2).joined(separator: "+")
        let now: String = o.now.prefix(2).joined(separator: "+")
        return "\(o.from) → \(o.to) · \(prev) → \(now) · \(Int(o.gapH))h"
    }

    /// "Mon Tue Thu Fri"
    static func days(_ d: [Int]) -> String {
        d.filter { $0 >= 0 && $0 < 7 }.map { (i: Int) -> String in
            let w: String = ProgramText.weekdays[i]
            return w.prefix(1) + w.dropFirst().lowercased()
        }.joined(separator: " ")
    }

    static func percent(_ x: Double) -> String { "\(Int((x * 100).rounded()))%" }

    /// one muscle's details, for its expanded row
    static func detail(_ m: ProgramBody.Muscle) -> String {
        var parts: [String] = [m.name, "\(Fmt.weight(m.sets)) sets/wk (\(Fmt.weight(m.hardSets)) hard)"]
        if let t = m.target, t.count == 2 { parts.append("range \(Fmt.weight(t[0]))–\(Fmt.weight(t[1]))") }
        parts.append("\(Fmt.weight(m.hits)) hits/wk")
        if let g = m.minGapH { parts.append("shortest gap \(Int(g))h") }
        if let r = m.recoverH { parts.append("needs ~\(Int(r))h") }
        parts.append("lowest readiness " + percent(m.minReadiness))
        if m.overlaps > 0 { parts.append("\(Fmt.weight(m.overlaps)) overlaps/wk") }
        if !m.lifts.isEmpty { parts.append(m.lifts.joined(separator: ", ")) }
        return parts.joined(separator: " · ")
    }
}
