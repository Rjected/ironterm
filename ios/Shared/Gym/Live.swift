import Foundation

// Swift port of web/shared/live.ts: the in-progress gym session, logged set by set on the phone
// and sent to the server (PUT /api/live, POST /api/live/finish). Pure value functions, so the GYM
// screen works fully offline. IrontermTests/LiveTests replays golden cases generated from the TS.

struct LiveTarget: Codable, Equatable, Hashable {
    var weight: Double
    var reps: Int
    var repsMax: Int?
    var amrap: Bool
    var rpe: Double?
    /// fraction of today's top set e1RM (back-offs)
    var ofTop: Double?
}

struct LiveSet: Codable, Equatable, Hashable {
    /// normal | warmup | failure | dropset
    var type: String
    /// in the session's unit; nil = bodyweight / not entered
    var weight: Double?
    var reps: Int?
    var rpe: Double?
    var durationSec: Double?
    var distanceM: Double?
    var done: Bool
    var doneAt: String?
    var target: LiveTarget?

    init(type: String = "normal", weight: Double? = nil, reps: Int? = nil, rpe: Double? = nil, durationSec: Double? = nil,
         distanceM: Double? = nil, done: Bool = false, doneAt: String? = nil, target: LiveTarget? = nil) {
        self.type = type; self.weight = weight; self.reps = reps; self.rpe = rpe; self.durationSec = durationSec
        self.distanceM = distanceM; self.done = done; self.doneAt = doneAt; self.target = target
    }

    enum CodingKeys: String, CodingKey { case type, weight, reps, rpe, durationSec, distanceM, done, doneAt, target }

    // Lenient: the web stepper can store a fractional rep count; never fail the whole session on it.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = (try? c.decode(String.self, forKey: .type)) ?? "normal"
        weight = try? c.decodeIfPresent(Double.self, forKey: .weight)
        if let r = try? c.decodeIfPresent(Int.self, forKey: .reps) { reps = r }
        else if let r = try? c.decodeIfPresent(Double.self, forKey: .reps) { reps = Int(r.rounded()) }
        else { reps = nil }
        rpe = try? c.decodeIfPresent(Double.self, forKey: .rpe)
        durationSec = try? c.decodeIfPresent(Double.self, forKey: .durationSec)
        distanceM = try? c.decodeIfPresent(Double.self, forKey: .distanceM)
        done = (try? c.decode(Bool.self, forKey: .done)) ?? false
        doneAt = try? c.decodeIfPresent(String.self, forKey: .doneAt)
        target = try? c.decodeIfPresent(LiveTarget.self, forKey: .target)
    }

    var isWarmup: Bool { type == "warmup" }
}

struct LiveExercise: Codable, Equatable, Hashable, Identifiable {
    var id: String
    var lift: String
    /// Hevy title for exercises outside the lift library
    var title: String?
    var templateId: String?
    var slotId: String?
    var tier: String?
    var scheme: String?
    /// program note, e.g. "Retest 5RM"
    var note: String?
    /// your own note; saved to Hevy as the exercise note
    var userNote: String?
    var ifSuccess: String?
    var ifFail: String?
    var restSeconds: Double
    var cardio: Bool?
    var sets: [LiveSet]

    var isCardio: Bool { cardio == true }
}

struct LiveSession: Codable, Equatable, Hashable, Identifiable {
    var id: String
    var startedAt: String
    var unit: String
    var programName: String?
    var dayId: String?
    var dayName: String?
    var title: String
    var exercises: [LiveExercise]
    /// rest timer end (ISO)
    var restEndsAt: String?
    var restFor: String?
    var notes: String?

    var startDate: Date { Live.parse(startedAt) ?? Date() }
    var restEnd: Date? { restEndsAt.flatMap(Live.parse) }
}

/// A planned day as the server's program engine produces it (web/shared/program.ts PlannedSession).
struct PlannedSession: Codable, Equatable {
    var dayIndex: Int?
    var dayId: String
    var dayName: String
    var exercises: [PlannedExercise]

    struct PlannedExercise: Codable, Equatable {
        var slotId: String?
        var lift: String
        var tier: String
        var scheme: String
        var sets: [PlannedSet]
        var restSeconds: Double
        var note: String?
        var ifSuccess: String?
        var ifFail: String?
    }

    struct PlannedSet: Codable, Equatable {
        var weight: Double
        var reps: Int
        var repsMax: Int?
        var amrap: Bool
        var pct: Double?
        var rpe: Double?
        var ofTop: Bool?
    }
}

enum Live {
    // MARK: units (web/shared/units.ts)

    static func loadStep(kind: String, unit: String) -> Double {
        if kind == "dumbbell" { return unit == "lb" ? 5 : 2 }
        if kind == "machine" { return 2.5 }
        return unit == "lb" ? 5 : 2.5
    }

    /// Math.round(w / step) * step, with JS rounding (half up)
    static func roundTo(_ w: Double, _ step: Double) -> Double {
        jsRound(w / step) * step
    }

    static func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    static func barWeight(_ unit: String) -> Double { unit == "lb" ? 45 : 20 }

    /// Plates per side for a barbell load.
    static func plates(_ total: Double, unit: String, bar: Double? = nil) -> [Double] {
        let avail: [Double] = unit == "lb" ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25]
        var side = (total - (bar ?? barWeight(unit))) / 2
        var out: [Double] = []
        if side <= 0 { return out }
        for p in avail {
            while side >= p - 1e-6 {
                out.append(p)
                side -= p
            }
        }
        return out
    }

    static func e1rm(weight: Double, reps: Int) -> Double {
        reps <= 1 ? weight : weight * (1 + Double(reps) / 30)
    }

    // MARK: dates

    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: d)
    }

    static func parse(_ s: String) -> Date? { Fmt.parseISO(s) }

    static func uid() -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<8).map { _ in chars[Int.random(in: 0..<chars.count)] })
    }

    // MARK: building sessions

    /// Warmup ramp for a heavy barbell top set: bar, then ~40/60/80%.
    static func warmups(top: Double, unit: String) -> [LiveSet] {
        let bar = barWeight(unit)
        if top <= bar * 1.5 { return [] }
        let step: Double = unit == "lb" ? 5 : 2.5
        var out = [LiveSet(type: "warmup", weight: bar, reps: 10)]
        for (f, r) in [(0.4, 5), (0.6, 3), (0.8, 2)] {
            let w = roundTo(top * f, step)
            if w > bar && w < top { out.append(LiveSet(type: "warmup", weight: w, reps: r)) }
        }
        return out
    }

    /// Start a session from a planned day (the server normally does this in POST /api/app/gym/start;
    /// the app uses it offline with the cached plan).
    static func sessionFromPlan(_ plan: PlannedSession, unit: String, programName: String, now: Date = Date(),
                                kind: (String) -> String = LiftLibrary.kind) -> LiveSession {
        let exercises: [LiveExercise] = plan.exercises.map { ex in
            let top = max(0, ex.sets.map(\.weight).max() ?? 0)
            let heavy = (ex.tier == "T1" || ex.tier == "MAIN") && kind(ex.lift) == "barbell"
            let work: [LiveSet] = ex.sets.map { s in
                LiveSet(type: s.amrap ? "failure" : "normal", weight: s.weight != 0 ? s.weight : nil, reps: s.reps, rpe: nil, done: false,
                        target: LiveTarget(weight: s.weight, reps: s.reps, repsMax: s.repsMax, amrap: s.amrap, rpe: s.rpe,
                                           ofTop: s.ofTop == true ? s.pct : nil))
            }
            return LiveExercise(id: uid(), lift: ex.lift, slotId: ex.slotId, tier: ex.tier, scheme: ex.scheme, note: ex.note,
                                ifSuccess: ex.ifSuccess, ifFail: ex.ifFail, restSeconds: ex.restSeconds,
                                sets: (heavy && top > 0 ? warmups(top: top, unit: unit) : []) + work)
        }
        let first = programName.split(separator: " ").first.map(String.init) ?? programName
        return LiveSession(id: uid(), startedAt: iso(now), unit: unit, programName: programName, dayId: plan.dayId, dayName: plan.dayName,
                           title: "\(first) · \(plan.dayId)", exercises: exercises, restEndsAt: nil)
    }

    static func emptySession(unit: String, now: Date = Date(), tz: TimeZone = .current) -> LiveSession {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let h = cal.component(.hour, from: now)
        let part = h < 11 ? "Morning" : h < 17 ? "Afternoon" : "Evening"
        return LiveSession(id: uid(), startedAt: iso(now), unit: unit, title: "\(part) workout", exercises: [], restEndsAt: nil)
    }

    // MARK: editing

    static func addExercise(_ s: LiveSession, lift: String, cardio: Bool = false, title: String? = nil, templateId: String? = nil) -> LiveSession {
        let set = cardio ? LiveSet(type: "normal", weight: nil, reps: nil, durationSec: 1800, distanceM: nil, done: false)
                         : LiveSet(type: "normal", weight: nil, reps: 8, done: false)
        let ex = LiveExercise(id: uid(), lift: lift, title: title, templateId: templateId, restSeconds: cardio ? 0 : 90,
                              cardio: cardio ? true : nil, sets: [set])
        var out = s
        out.exercises.append(ex)
        return out
    }

    /// Copy the last set (weight/reps) as a new undone set.
    static func addSet(_ s: LiveSession, exId: String) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            if var next = ex.sets.last {
                if next.type == "warmup" { next.type = "normal" }
                next.done = false
                next.doneAt = nil
                next.target = nil
                ex.sets.append(next)
            } else {
                ex.sets.append(LiveSet(type: "normal", weight: nil, reps: 5, done: false))
            }
            return ex
        }
    }

    static func mapEx(_ s: LiveSession, _ exId: String, _ f: (LiveExercise) -> LiveExercise) -> LiveSession {
        var out = s
        out.exercises = s.exercises.map { $0.id == exId ? f($0) : $0 }
        return out
    }

    static func updateSet(_ s: LiveSession, exId: String, _ i: Int, _ patch: (inout LiveSet) -> Void) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            if ex.sets.indices.contains(i) { patch(&ex.sets[i]) }
            return ex
        }
    }

    static func removeSet(_ s: LiveSession, exId: String, _ i: Int) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            if ex.sets.indices.contains(i) { ex.sets.remove(at: i) }
            return ex
        }
    }

    static func removeExercise(_ s: LiveSession, exId: String) -> LiveSession {
        var out = s
        out.exercises.removeAll { $0.id == exId }
        return out
    }

    /// Mark a set done and start the rest timer. Back-off sets keyed to today's top set get their load filled in.
    static func completeSet(_ s: LiveSession, exId: String, _ i: Int, now: Date = Date(), kind: (String) -> String = LiftLibrary.kind) -> LiveSession {
        let stamp = iso(now)
        var next = updateSet(s, exId: exId, i) { $0.done = true; $0.doneAt = stamp }
        guard let ex = next.exercises.first(where: { $0.id == exId }), ex.sets.indices.contains(i) else { return next }
        let set = ex.sets[i]
        // A finished top set sets the load for "% of top" back-offs.
        if let w = set.weight, w != 0, let r = set.reps, r != 0,
           ex.sets.contains(where: { ($0.target?.ofTop ?? 0) != 0 && !$0.done && ($0.weight ?? 0) == 0 }) {
            let e1 = r <= 1 ? w : w * (1 + Double(r) / 30)
            let step = loadStep(kind: kind(ex.lift), unit: s.unit)
            next = mapEx(next, exId) { e in
                var e = e
                e.sets = e.sets.map { x in
                    guard let of = x.target?.ofTop, of != 0, !x.done, (x.weight ?? 0) == 0 else { return x }
                    var y = x
                    y.weight = roundTo(e1 * of, step)
                    return y
                }
                return e
            }
        }
        let rest = set.type == "warmup" ? min(60, ex.restSeconds) : ex.restSeconds
        let more = next.exercises.first(where: { $0.id == exId })?.sets.contains { !$0.done } ?? false
        next.restEndsAt = rest != 0 && (more || hasNextExercise(next, exId)) ? iso(now.addingTimeInterval(rest)) : nil
        next.restFor = exId
        return next
    }

    static func hasNextExercise(_ s: LiveSession, _ exId: String) -> Bool {
        guard let i = s.exercises.firstIndex(where: { $0.id == exId }) else { return false }
        return s.exercises[(i + 1)...].contains { $0.sets.contains { !$0.done } }
    }

    struct Cursor: Equatable { var exId: String; var set: Int }

    /// The exercise and set to do next.
    static func current(_ s: LiveSession) -> Cursor? {
        for e in s.exercises {
            if let k = e.sets.firstIndex(where: { !$0.done }) { return Cursor(exId: e.id, set: k) }
        }
        return nil
    }

    struct Progress: Equatable { var done: Int; var total: Int }

    static func progress(_ s: LiveSession) -> Progress {
        let all = s.exercises.flatMap { $0.sets.filter { $0.type != "warmup" } }
        return Progress(done: all.filter(\.done).count, total: all.count)
    }

    // MARK: rest timer adjustments (the web GYM buttons)

    static func adjustRest(_ s: LiveSession, by seconds: Double, now: Date = Date()) -> LiveSession {
        guard let end = s.restEnd else { return s }
        var out = s
        let base = seconds > 0 ? max(now, end) : end
        out.restEndsAt = iso(base.addingTimeInterval(seconds))
        return out
    }

    static func skipRest(_ s: LiveSession) -> LiveSession {
        var out = s
        out.restEndsAt = nil
        return out
    }

    // MARK: summary

    struct Summary: Equatable {
        var durationSec: Double
        var sets: Int
        var volume: Double
        var exercises: [Line]
        struct Line: Equatable { var name: String; var sets: Int; var best: String; var e1rm: Double? }
    }

    static func summary(_ s: LiveSession, end: Date = Date(), name: (LiveExercise) -> String) -> Summary {
        var vol = 0.0, n = 0
        var lines: [Summary.Line] = []
        for ex in s.exercises {
            let done = ex.sets.filter { $0.done && !$0.isWarmup }
            guard !done.isEmpty else { continue }
            n += done.count
            for x in done { vol += (x.weight ?? 0) * Double(x.reps ?? 0) }
            if ex.isCardio {
                let mins = done.reduce(0.0) { $0 + ($1.durationSec ?? 0) } / 60
                lines.append(.init(name: name(ex), sets: done.count, best: "\(Int(mins.rounded())) MIN", e1rm: nil))
                continue
            }
            let best = done.max { e1rm(weight: $0.weight ?? 0, reps: $0.reps ?? 0) < e1rm(weight: $1.weight ?? 0, reps: $1.reps ?? 0) }!
            let e = (best.weight ?? 0) > 0 ? e1rm(weight: best.weight ?? 0, reps: best.reps ?? 0) : nil
            let label = (best.weight ?? 0) > 0 ? "\(Fmt.weight(best.weight ?? 0))×\(best.reps ?? 0)" : "BW×\(best.reps ?? 0)"
            lines.append(.init(name: name(ex), sets: done.count, best: label, e1rm: e.map { ($0 * 10).rounded() / 10 }))
        }
        return Summary(durationSec: max(0, end.timeIntervalSince(s.startDate)), sets: n, volume: vol, exercises: lines)
    }

    /// "1:05:09" / "4:07"
    static func clock(_ sec: Double) -> String {
        let s = max(0, Int(sec.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
    }
}
