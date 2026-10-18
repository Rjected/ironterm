import Foundation

// Program browsing (docs/api/programs.md): the catalog, one program's generated rules and
// week-by-week workouts, and the body that starts it. Types mirror web/shared/appapi.ts and
// web/shared/describe.ts. Samples: docs/api/app/programs*.json.

/// GET /api/app/programs
struct AppProgramCatalog: Codable, Equatable, Sendable {
    /// templateId of the running program
    var active: String?
    /// every template, in catalog order (grouped by category)
    var programs: [ProgramSummary]
}

struct ProgramSummary: Codable, Equatable, Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var author: String
    /// gzcl | novice | strength | powerlifting | hypertrophy | peaking (kept as a string so new ones decode)
    var category: String
    /// beginner | intermediate | advanced
    var level: String
    var daysPerWeek: [Int]
    /// length of one run in weeks; nil = open-ended
    var weekCount: Int?
    var summary: String
}

/// GET /api/app/programs/{id}
struct ProgramDetail: Codable, Equatable, Sendable {
    var id: String
    var name: String
    var author: String
    var category: String
    var level: String
    var daysPerWeek: [Int]
    /// length of one run in weeks; nil = open-ended
    var weekCount: Int?
    var summary: String
    var source: String
    var notes: [String]
    var options: [Option]
    var unit: String
    /// active | e1rm | defaults: where the weights in `weeks` come from
    var basis: String
    var rules: Rules
    /// week-by-week workouts (`weeks` in the JSON). Cycles: every week; finite blocks up to 16;
    /// open-ended: weeks 1–4 as if every session succeeds.
    var plan: [Week]
    /// prefill for starting it. `startWeights` is keyed by slot id ("a1-t1"), `trainingMaxes` by lift.
    var start: Start

    enum CodingKeys: String, CodingKey {
        case id, name, author, category, level, daysPerWeek, weekCount, summary, source, notes, options, unit, basis, rules, start
        case plan = "weeks"
    }

    struct Option: Codable, Equatable, Identifiable, Sendable {
        var key: String
        var label: String
        var choices: [Choice]
        var `default`: String
        var selected: String
        var id: String { key }
        struct Choice: Codable, Equatable, Sendable { var value: String; var label: String }
    }

    struct Rules: Codable, Equatable, Sendable {
        var overview: [String]
        var rotation: [Rotation]
        var tiers: [TierRule]
        struct Rotation: Codable, Equatable, Sendable { var day: String; var lifts: [String] }
        struct TierRule: Codable, Equatable, Sendable { var title: String; var lifts: [String]; var text: String }
    }

    struct Week: Codable, Equatable, Identifiable, Sendable {
        /// 1-based
        var week: Int
        var name: String?
        var days: [Day]
        var id: Int { week }
    }

    struct Day: Codable, Equatable, Sendable {
        var dayId: String
        var name: String
        var exercises: [Exercise]
    }

    struct Exercise: Codable, Equatable, Sendable {
        var lift: String
        var name: String
        var tier: String
        var scheme: String
        /// heaviest planned set (0 = bodyweight / RPE-only)
        var top: Double
        var sets: [PSet]
        var restSeconds: Double
        var note: String?
        var ifSuccess: String?
        var ifFail: String?
    }

    struct PSet: Codable, Equatable, Sendable {
        var reps: Int
        var repsMax: Int?
        var weight: Double
        var amrap: Bool
        var rpe: Double?
    }

    struct Start: Codable, Equatable, Sendable {
        /// Mon = 0
        var trainingDays: [Int]
        var startWeights: [String: Double]
        var trainingMaxes: [String: Double]
        var maxLabel: String
        /// display name per startWeights slot id and trainingMaxes lift ("a1-t3b": "A1 · T3 Bicep Curl");
        /// older servers leave it out
        var labels: [String: String]?
    }
}

extension ProgramDetail {
    var summaryRow: ProgramSummary {
        ProgramSummary(id: id, name: name, author: author, category: category, level: level, daysPerWeek: daysPerWeek, weekCount: weekCount, summary: summary)
    }

    /// lift key → display name, from the planned workouts
    var liftNames: [String: String] {
        var m: [String: String] = [:]
        for w in plan { for d in w.days { for e in d.exercises where m[e.lift] == nil { m[e.lift] = e.name } } }
        return m
    }

    /// Where a start-weight slot id ("a1-t1", "a1-t3b") sits in the plan: day `A1`, the first (or
    /// second for a trailing "b", …) exercise of tier `T1` there. nil when the id has another shape.
    func slot(_ key: String) -> (order: Int, day: String, exercise: Exercise)? {
        let parts: [Substring] = key.lowercased().split(separator: "-", maxSplits: 1)
        guard parts.count == 2 else { return nil }
        var tier: String = String(parts[1])
        var index = 0
        if let last = tier.last, last.isLetter, tier.count > 1, tier.dropLast().last?.isNumber == true,
           let a = Character("a").asciiValue, let l = last.asciiValue, l > a {
            index = Int(l - a)
            tier = String(tier.dropLast())
        }
        for w in plan {
            for (di, d) in w.days.enumerated() where d.dayId.lowercased() == String(parts[0]) {
                let matches: [(Int, Exercise)] = d.exercises.enumerated().filter { $0.element.tier.lowercased() == tier }.map { ($0.offset, $0.element) }
                guard index < matches.count else { return nil }
                return (di * 100 + matches[index].0, d.dayId, matches[index].1)
            }
        }
        return nil
    }

    /// The server's label when it sends one; else "A1 · T1 Back Squat" matched from the plan for a
    /// slot id, a lift name for a lift key, or the key itself.
    func startLabel(_ key: String) -> String {
        if let l = start.labels?[key], !l.isEmpty { return l }
        if let s = slot(key) { return "\(s.day) · \(s.exercise.tier) \(s.exercise.name)" }
        return liftNames[key] ?? LiftLibrary.byKey[key]?.name ?? key.uppercased()
    }

    /// Start keys in plan order (slots by day and position, lifts by first appearance), the rest alphabetically.
    func startOrder<S: Sequence>(_ keys: S) -> [String] where S.Element == String {
        var firstLift: [String: Int] = [:]
        var n = 0
        for w in plan { for d in w.days { for e in d.exercises { if firstLift[e.lift] == nil { firstLift[e.lift] = n }; n += 1 } } }
        func rank(_ k: String) -> Int { slot(k)?.order ?? firstLift[k].map { 100_000 + $0 } ?? Int.max }
        return keys.sorted { a, b in
            let ra: Int = rank(a), rb: Int = rank(b)
            return ra != rb ? ra < rb : a < b
        }
    }

    /// "your current e1RMs"
    var basisSource: String {
        switch basis {
        case "active": return "your running program"
        case "e1rm": return "your current e1RMs"
        default: return "the program's default starting weights"
        }
    }

    /// "weights from your current e1RMs · lb"
    var basisLine: String { "weights from \(basisSource) · \(unit)" }
}

/// POST /api/app/programs/{id}/start body
struct ProgramStartBody: Codable, Equatable {
    var options: [String: String]?
    /// Mon = 0
    var trainingDays: [Int]?
    var startWeights: [String: Double]?
    var trainingMaxes: [String: Double]?
    var startDate: String?

    /// What START sends: the options the detail was generated with, the picked days (sorted),
    /// and the weights / maxes as edited. Empty maps are left out so the server keeps its defaults.
    static func make(detail: ProgramDetail, days: Set<Int>, weights: [String: Double], maxes: [String: Double]) -> ProgramStartBody {
        var opts: [String: String] = [:]
        for o in detail.options { opts[o.key] = o.selected }
        let sortedDays: [Int] = days.filter { $0 >= 0 && $0 <= 6 }.sorted()
        return ProgramStartBody(
            options: opts.isEmpty ? nil : opts,
            trainingDays: sortedDays.isEmpty ? nil : sortedDays,
            startWeights: weights.isEmpty ? nil : weights,
            trainingMaxes: maxes.isEmpty ? nil : maxes,
            startDate: nil)
    }

    func json() throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return try e.encode(self)
    }
}

/// POST /api/app/programs/{id}/start response: `{ ok, program: AppProgram }`. Accepts the
/// program both wrapped (`{ program: {…} }`, the GET /api/app/program shape) and bare.
struct ProgramStartResult: Decodable, Equatable {
    var ok: Bool
    var program: AppProgram?

    enum CodingKeys: String, CodingKey { case ok, program }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ok = try c.decodeIfPresent(Bool.self, forKey: .ok) ?? true
        if let wrapped = try? c.decode(AppProgram.self, forKey: .program), wrapped.program != nil {
            program = wrapped
        } else if let bare = try? c.decode(AppProgram.Program.self, forKey: .program) {
            program = AppProgram(program: bare)
        } else {
            program = nil
        }
    }
}

/// Search + filters of the program list. Pure, so it is unit tested.
struct ProgramFilter: Equatable {
    var query = ""
    /// sessions per week the program must offer
    var days: Int?
    var level: String?

    var isEmpty: Bool { days == nil && level == nil && query.trimmingCharacters(in: .whitespaces).isEmpty }

    func matches(_ p: ProgramSummary) -> Bool {
        if let d = days, !p.daysPerWeek.contains(d) { return false }
        if let l = level, p.level != l { return false }
        let words: [Substring] = query.lowercased().split(whereSeparator: { $0 == " " })
        if words.isEmpty { return true }
        let hay: String = [p.name, p.author, p.summary, p.category, p.id, p.level].joined(separator: " ")
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).lowercased()
        return words.allSatisfy { w in
            let needle: String = String(w).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            return hay.contains(needle)
        }
    }

    struct Group: Equatable, Identifiable {
        var category: String
        var programs: [ProgramSummary]
        var id: String { category }
    }

    /// Matching programs grouped by category, in catalog order (categories in first-seen order).
    func apply(_ all: [ProgramSummary]) -> [Group] {
        var groups: [Group] = []
        var index: [String: Int] = [:]
        for p in all where matches(p) {
            if let i = index[p.category] {
                groups[i].programs.append(p)
            } else {
                index[p.category] = groups.count
                groups.append(Group(category: p.category, programs: [p]))
            }
        }
        return groups
    }

    /// Day chips offered: every sessions-per-week value in the catalog.
    static func dayChoices(_ all: [ProgramSummary]) -> [Int] {
        Array(Set(all.flatMap(\.daysPerWeek))).sorted()
    }

    static let levels = ["beginner", "intermediate", "advanced"]
}

/// Display strings shared by the list and the program page.
enum ProgramText {
    static func days(_ d: [Int]) -> String {
        let s = d.sorted()
        guard let lo = s.first, let hi = s.last else { return "" }
        if lo == hi { return lo == 1 ? "1 day" : "\(lo) days" }
        if s.count == hi - lo + 1 { return "\(lo)–\(hi) days" }
        return s.map(String.init).joined(separator: "/") + " days"
    }

    static func length(_ w: Int?) -> String {
        guard let w else { return "open-ended" }
        return w == 1 ? "1 week" : "\(w) weeks"
    }

    /// "4 days · open-ended · beginner"
    static func tags(_ p: ProgramSummary) -> String {
        [days(p.daysPerWeek), length(p.weekCount), p.level].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func category(_ c: String) -> String {
        c == "gzcl" ? "GZCL" : c.uppercased()
    }

    /// "WEEK 1 · 5S WEEK"; names that already say the week ("Week 2 (+10 lb)") stand alone.
    static func weekTitle(_ w: ProgramDetail.Week) -> String {
        guard let n = w.name, !n.isEmpty else { return "WEEK \(w.week)" }
        if n.lowercased().hasPrefix("week") { return n.uppercased() }
        return "WEEK \(w.week) · " + n.uppercased()
    }

    /// the server refuses start weights / maxes above this
    static let maxWeight: Double = 2000

    static let weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

    /// Edited text → number ("82,5" works too); nil when empty or not a number.
    static func number(_ s: String) -> Double? {
        let t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !t.isEmpty, let v = Double(t), v.isFinite, v >= 0 else { return nil }
        return v
    }

    /// Query string of picked options: `opt.days=3&opt.t1=modified` (sorted, encoded).
    static func optionQuery(_ opts: [String: String]) -> String {
        var c = URLComponents()
        c.queryItems = opts.keys.sorted().map { URLQueryItem(name: "opt." + $0, value: opts[$0]) }
        return c.percentEncodedQuery ?? ""
    }
}

extension AppAPI {
    func programs() async throws -> AppProgramCatalog { try await get("/api/app/programs") }

    static func programPath(_ id: String, options: [String: String]) -> String {
        let q = ProgramText.optionQuery(options)
        return "/api/app/programs/" + seg(id) + (q.isEmpty ? "" : "?" + q)
    }

    func programDetail(_ id: String, options: [String: String]) async throws -> ProgramDetail {
        try await get(Self.programPath(id, options: options))
    }

    /// `/api/app/programs/{id}/body?mode=load&opt.…` (mode first, options sorted)
    static func programBodyPath(_ id: String, options: [String: String], mode: String) -> String {
        let q = ProgramText.optionQuery(options)
        return "/api/app/programs/" + seg(id) + "/body?mode=" + mode + (q.isEmpty ? "" : "&" + q)
    }

    func programBody(_ id: String, options: [String: String], mode: String) async throws -> ProgramBody {
        try await get(Self.programBodyPath(id, options: options, mode: mode))
    }

    func startProgram(_ id: String, _ body: ProgramStartBody) async throws -> ProgramStartResult {
        try await send("/api/app/programs/\(Self.seg(id))/start", method: "POST", json: try body.json())
    }
}
