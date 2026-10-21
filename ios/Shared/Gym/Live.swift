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
    /// skipped on purpose: not done, not saved, not counted (nil = not skipped; false is never stored)
    var skipped: Bool?
    /// reps were set by the app (a rep-total exercise following your pace), not by you
    var auto: Bool?

    init(type: String = "normal", weight: Double? = nil, reps: Int? = nil, rpe: Double? = nil, durationSec: Double? = nil,
         distanceM: Double? = nil, done: Bool = false, doneAt: String? = nil, target: LiveTarget? = nil,
         skipped: Bool? = nil, auto: Bool? = nil) {
        self.type = type; self.weight = weight; self.reps = reps; self.rpe = rpe; self.durationSec = durationSec
        self.distanceM = distanceM; self.done = done; self.doneAt = doneAt; self.target = target
        self.skipped = skipped == true ? true : nil
        self.auto = auto == true ? true : nil
    }

    enum CodingKeys: String, CodingKey { case type, weight, reps, rpe, durationSec, distanceM, done, doneAt, target, skipped, auto }

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
        // sessions saved before rep totals and skips have neither field; `false` is the same as absent
        skipped = (try? c.decodeIfPresent(Bool.self, forKey: .skipped)) == true ? true : nil
        auto = (try? c.decodeIfPresent(Bool.self, forKey: .auto)) == true ? true : nil
    }

    var isWarmup: Bool { type == "warmup" }
    var isSkipped: Bool { skipped == true }
    var isAuto: Bool { auto == true }
    /// still to do: not done and not skipped
    var isOpen: Bool { !done && !isSkipped }
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
    /// reach this many working reps in as many sets as it takes ("100 total reps"); sets are added as you go
    var totalReps: Int?
    /// the top of a range ("100–200 total reps")
    var totalRepsMax: Int?
    var sets: [LiveSet]

    var isCardio: Bool { cardio == true }
    /// the rep total to chase, if this exercise has one
    var repTotal: Int? { (totalReps ?? 0) > 0 ? totalReps : nil }
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
        /// reach this many reps across the sets, in as many sets as it takes (Monolith's "100 total reps")
        var totalReps: Int?
        var totalRepsMax: Int?
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
            let total: Int? = (ex.totalReps ?? 0) > 0 ? ex.totalReps : nil
            let totalMax: Int? = total != nil && (ex.totalRepsMax ?? 0) != 0 ? ex.totalRepsMax : nil
            return LiveExercise(id: uid(), lift: ex.lift, slotId: ex.slotId, tier: ex.tier, scheme: ex.scheme, note: ex.note,
                                ifSuccess: ex.ifSuccess, ifFail: ex.ifFail, restSeconds: ex.restSeconds,
                                totalReps: total, totalRepsMax: totalMax,
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

    /// Copy the last set (weight/reps) as a new undone set (never a skipped one).
    static func addSet(_ s: LiveSession, exId: String) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            if var next = ex.sets.last {
                if next.type == "warmup" { next.type = "normal" }
                next.done = false
                next.doneAt = nil
                next.target = nil
                next.skipped = nil
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

    /// Change a set. Reps you change are yours: the app stops pacing that set (`auto` is cleared unless
    /// the patch sets it). `setReps` clears it even when the number stays the same.
    static func updateSet(_ s: LiveSession, exId: String, _ i: Int, _ patch: (inout LiveSet) -> Void) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            if ex.sets.indices.contains(i) {
                let before = ex.sets[i]
                patch(&ex.sets[i])
                if ex.sets[i].reps != before.reps && ex.sets[i].auto == before.auto { ex.sets[i].auto = nil }
                // false is stored as absent
                if ex.sets[i].skipped == false { ex.sets[i].skipped = nil }
                if ex.sets[i].auto == false { ex.sets[i].auto = nil }
            }
            return ex
        }
    }

    /// Reps typed or stepped by you (the web's updateSet with {reps}): the set stops following your pace.
    static func setReps(_ s: LiveSession, exId: String, _ i: Int, _ reps: Int?) -> LiveSession {
        updateSet(s, exId: exId, i) { $0.reps = reps; $0.auto = nil }
    }

    /// Working reps done so far (warm-ups and skipped sets don't count).
    static func repsDone(_ ex: LiveExercise) -> Int {
        ex.sets.reduce(0) { (n: Int, x: LiveSet) -> Int in
            x.done && !x.isSkipped && !x.isWarmup ? n + (x.reps ?? 0) : n
        }
    }

    /// Done: a rep-total exercise once the total is reached; otherwise at least one work set done
    /// and nothing left open (warm-ups alone don't count).
    static func isComplete(_ ex: LiveExercise) -> Bool {
        if let total = ex.repTotal { return repsDone(ex) >= total }
        let workDone: Bool = ex.sets.contains { $0.done && !$0.isWarmup && !$0.isSkipped }
        return workDone && !ex.sets.contains { $0.isOpen }
    }

    /// Nothing left to do but not complete: the rest was skipped (the header says " · skipped").
    static func isSkippedOut(_ ex: LiveExercise) -> Bool {
        !isComplete(ex) && !ex.sets.contains { $0.isOpen }
    }

    /// Skip a set (or bring it back): skipped sets aren't done, saved or counted.
    static func skipSet(_ s: LiveSession, exId: String, _ i: Int, skipped: Bool = true) -> LiveSession {
        updateSet(s, exId: exId, i) { x in
            if skipped {
                x.skipped = true
                x.done = false
                x.doneAt = nil
            } else {
                x.skipped = nil
            }
        }
    }

    /// Skip every set of an exercise that isn't done yet.
    static func skipExercise(_ s: LiveSession, exId: String) -> LiveSession {
        mapEx(s, exId) { ex in
            var ex = ex
            for k in ex.sets.indices where !ex.sets[k].done {
                ex.sets[k].skipped = true
                ex.sets[k].doneAt = nil
            }
            return ex
        }
    }

    /// A rep-total exercise ("100 total reps") after set `i`: the sets still planned follow the reps
    /// you actually do (sets of 5 instead of 20), one more set is added while you're short (never more
    /// than what's left), and once the total is reached any planned sets left over are skipped.
    static func chaseTotal(_ ex: LiveExercise, _ i: Int) -> LiveExercise {
        guard let total = ex.repTotal, !ex.isCardio, ex.sets.indices.contains(i) else { return ex }
        let set: LiveSet = ex.sets[i]
        if set.isWarmup || !set.done { return ex }
        let left: Int = total - repsDone(ex)
        let pace: Int? = (set.reps ?? 0) > 0 ? set.reps : nil
        var out = ex
        for k in out.sets.indices where k > i {
            let x: LiveSet = out.sets[k]
            if x.done || x.isSkipped || x.isWarmup { continue }
            if left <= 0 {
                out.sets[k].skipped = true
                continue
            }
            // a planned set you haven't touched takes your pace (and never more than what's left)
            let matchesTarget: Bool = x.target.map { x.reps == $0.reps } ?? false
            if let pace, x.isAuto || matchesTarget {
                out.sets[k].reps = min(pace, left)
                out.sets[k].auto = true
            }
        }
        let planned: Int = out.sets.reduce(0) { (n: Int, x: LiveSet) -> Int in
            x.isOpen && !x.isWarmup ? n + (x.reps ?? 0) : n
        }
        if left > 0 && planned < left {
            let base: Int = pace ?? set.target?.reps ?? 10
            let reps: Int = min(base, left - planned)
            if reps > 0 {
                var target: LiveTarget? = set.target
                target?.reps = reps
                target?.repsMax = nil
                target?.amrap = false
                out.sets.append(LiveSet(type: "normal", weight: set.weight, reps: reps, rpe: nil, done: false, target: target, auto: true))
            }
        }
        return out
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
        var next = updateSet(s, exId: exId, i) { $0.done = true; $0.doneAt = stamp; $0.skipped = nil }
        next = mapEx(next, exId) { chaseTotal($0, i) }
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
        let more = next.exercises.first(where: { $0.id == exId })?.sets.contains { $0.isOpen } ?? false
        next.restEndsAt = rest != 0 && (more || hasNextExercise(next, exId)) ? iso(now.addingTimeInterval(rest)) : nil
        next.restFor = exId
        return next
    }

    static func hasNextExercise(_ s: LiveSession, _ exId: String) -> Bool {
        guard let i = s.exercises.firstIndex(where: { $0.id == exId }) else { return false }
        return s.exercises[(i + 1)...].contains { $0.sets.contains { $0.isOpen } }
    }

    struct Cursor: Equatable { var exId: String; var set: Int }

    /// The exercise and set to do next.
    static func current(_ s: LiveSession) -> Cursor? {
        for e in s.exercises {
            if let k = e.sets.firstIndex(where: { $0.isOpen }) { return Cursor(exId: e.id, set: k) }
        }
        return nil
    }

    struct Progress: Equatable { var done: Int; var total: Int }

    static func progress(_ s: LiveSession) -> Progress {
        let all: [LiveSet] = s.exercises.flatMap { $0.sets.filter { $0.type != "warmup" && !$0.isSkipped } }
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
