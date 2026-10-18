import Foundation

/// Direct mode: builds a `Snapshot` on-device from raw Hevy workouts, without our server.
/// A Swift port of the parts of web/shared/stats.ts + snapshot.ts that need no program or
/// recovery model: the graph (quartile levels), streak, this week, totals, last workout and lift
/// e1RMs (Epley). `program` and `recovery` are always nil.
enum DirectAggregator {
    static let lbPerKg = 2.20462262185

    struct Options {
        var unit: String = "kg"          // "kg" | "lb"
        var tz: TimeZone = .current
        var weekTarget: Int = 3          // sessions/week the streak needs
        var now: Date = Date()
    }

    static func fromKg(_ kg: Double, _ unit: String) -> Double { unit == "lb" ? kg * lbPerKg : kg }

    static func epley(_ w: Double, _ r: Int) -> Double {
        r <= 0 ? 0 : r == 1 ? w : w * (1 + Double(r) / 30)
    }

    static func r1(_ x: Double) -> Double { (x * 10).rounded() / 10 }

    static func volumeKg(_ w: Workout) -> Double {
        var total: Double = 0
        for e in w.exercises {
            for set in e.sets where !set.isWarmup {
                let kg: Double = set.weightKg ?? 0
                let reps: Double = Double(set.reps ?? 0)
                total += kg * reps
            }
        }
        return total
    }

    static func workingSets(_ w: Workout) -> Int {
        w.exercises.reduce(0) { $0 + $1.sets.filter { !$0.isWarmup }.count }
    }

    static func durationMin(_ w: Workout) -> Double {
        guard let s = w.startDate, let e = w.endDate else { return 0 }
        return max(0, e.timeIntervalSince(s) / 60)
    }

    // MARK: graph levels

    struct Cell { var value: Double; var level: Int }

    /// Quartiles of non-zero days, the same interpolation as normalize.rs / dailyCells().
    static func levels(_ values: [String: Double]) -> [String: Cell] {
        let sorted = values.values.sorted()
        func q(_ p: Double) -> Double {
            guard !sorted.isEmpty else { return 0 }
            let r = p / 100 * Double(sorted.count - 1)
            let lo = Int(r.rounded(.down)), hi = Int(r.rounded(.up))
            return sorted[lo] * (1 - (r - Double(lo))) + sorted[hi] * (r - Double(lo))
        }
        let q1 = q(25), q2 = q(50), q3 = q(75)
        var out: [String: Cell] = [:]
        for (d, v) in values {
            out[d] = Cell(value: v, level: v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4)
        }
        return out
    }

    /// Consecutive weeks (ending this week or last) with at least `min` sessions (training days).
    static func weekStreak(trainingDays: Set<String>, today: String, min: Int) -> Snapshot.Streak {
        var perWeek: [String: Int] = [:]
        for d in trainingDays { perWeek[Day.weekStart(d), default: 0] += 1 }
        let weeks = perWeek.keys.sorted()
        guard !weeks.isEmpty else { return .init(current: 0, best: 0) }
        var best = 0, run = 0
        var prev: String?
        for wk in weeks {
            let ok = (perWeek[wk] ?? 0) >= min
            if ok { run = (prev.map { Day.add($0, 7) == wk } ?? false) ? run + 1 : 1; prev = wk } else { run = 0; prev = nil }
            best = max(best, run)
        }
        var cur = 0
        var wk = Day.weekStart(today)
        if (perWeek[wk] ?? 0) < min { wk = Day.add(wk, -7) } // this week isn't over yet
        while (perWeek[wk] ?? 0) >= min { cur += 1; wk = Day.add(wk, -7) }
        return .init(current: cur, best: best)
    }

    // MARK: lifts

    static let titleIndex: [String: String] = {
        var m: [String: String] = [:]
        for d in LiftLibrary.all { for t in d.titles where m[t.lowercased()] == nil { m[t.lowercased()] = d.key } }
        return m
    }()

    static func matchLift(_ title: String) -> String? {
        titleIndex[title.trimmingCharacters(in: .whitespaces).lowercased()]
    }

    struct LiftPoint { var date: String; var e1rm: Double }

    static func liftHistory(_ asc: [Workout], key: String, unit: String, tz: TimeZone) -> [LiftPoint] {
        var out: [LiftPoint] = []
        for w in asc {
            guard let start = w.startDate else { continue }
            let sets = w.exercises.filter { matchLift($0.title) == key }
                .flatMap { $0.sets.filter { !$0.isWarmup && ($0.reps ?? 0) > 0 } }
            guard !sets.isEmpty else { continue }
            let best = sets.map { epley(fromKg($0.weightKg ?? 0, unit), $0.reps ?? 0) }.max() ?? 0
            out.append(LiftPoint(date: Day.local(start, tz: tz), e1rm: best))
        }
        return out
    }

    // MARK: snapshot

    static func snapshot(workouts: [Workout], options o: Options = Options()) -> Snapshot {
        let tz = o.tz, unit = o.unit
        let today = Day.local(o.now, tz: tz)
        let asc = workouts.filter { $0.startDate != nil }.sorted { ($0.startDate ?? .distantPast) < ($1.startDate ?? .distantPast) }
        let dateOf: (Workout) -> String = { Day.local($0.startDate!, tz: tz) }

        // daily values (kg volume; bodyweight-only workouts still count)
        var values: [String: Double] = [:]
        for w in asc { values[dateOf(w), default: 0] += max(volumeKg(w), 1) }
        let cells = levels(values)

        let start = Day.add(Day.weekStart(today), -52 * 7)
        var days: [Snapshot.Graph.Day] = []
        var x = start
        while x <= today {
            let c = cells[x]
            days.append(.init(date: x, level: c?.level ?? 0, value: c.map { fromKg($0.value, unit).rounded() } ?? 0))
            x = Day.add(x, 1)
        }

        // this week
        let trained = Set(values.keys)
        let wk = Day.weekStart(today)
        let dows = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        let weekDays: [Snapshot.Week.Day] = dows.enumerated().map { i, dow in
            let d = Day.add(wk, i)
            return .init(date: d, dow: dow, status: trained.contains(d) ? "done" : "rest")
        }

        // totals
        let y1 = Day.add(today, -364), y2 = Day.add(today, -729)
        var s52 = 0, sPrev = 0, vol7 = 0.0, volPrev7 = 0.0, mins = 0.0, minsN = 0
        for w in asc {
            let d = dateOf(w)
            if d >= y1 { s52 += 1; mins += durationMin(w); minsN += 1 } else if d >= y2 { sPrev += 1 }
            let v = fromKg(volumeKg(w), unit)
            if d > Day.add(today, -7) { vol7 += v } else if d > Day.add(today, -14) { volPrev7 += v }
        }

        // lifts: big four first, then the most-trained others, up to 8
        var seen = Set<String>()
        for w in asc { for e in w.exercises { if let k = matchLift(e.title) { seen.insert(k) } } }
        let ordered = LiftLibrary.bigFour.filter { seen.contains($0) }
            + LiftLibrary.all.map(\.key).filter { seen.contains($0) && !LiftLibrary.bigFour.contains($0) }
        let hist = Dictionary(uniqueKeysWithValues: ordered.map { ($0, liftHistory(asc, key: $0, unit: unit, tz: tz)) })
        let big = ordered.filter { LiftLibrary.bigFour.contains($0) }
        let others = ordered.filter { !LiftLibrary.bigFour.contains($0) }
            .enumerated().sorted { a, b in
                let ca = hist[a.element]?.count ?? 0, cb = hist[b.element]?.count ?? 0
                return ca != cb ? ca > cb : a.offset < b.offset // stable, like Array.sort in JS
            }.map(\.element)
        var lifts: [Snapshot.Lift] = []
        for k in (big + others).prefix(8) {
            let pts = hist[k] ?? []
            guard !pts.isEmpty else { continue }
            let recent = pts.filter { $0.date > Day.add(today, -28) }
            let now1 = recent.isEmpty ? pts.last!.e1rm : recent.map(\.e1rm).max()!
            guard now1 > 0 else { continue }
            let old = pts.filter { $0.date <= Day.add(today, -28) }
            var before: Double?
            if !old.isEmpty {
                let m = old.filter { $0.date > Day.add(today, -56) }.map(\.e1rm).max() ?? 0
                before = m > 0 ? m : old.last!.e1rm
            }
            var spark: [Double] = []
            for i in stride(from: 11, through: 0, by: -1) {
                let z = Day.add(wk, 7 - i * 7), a = Day.add(z, -28)
                let inWin = pts.filter { $0.date >= a && $0.date < z }.map(\.e1rm)
                spark.append(r1(inWin.max() ?? spark.last ?? 0))
            }
            let def = LiftLibrary.all.first { $0.key == k }
            lifts.append(.init(key: k, name: def?.name ?? k, short: def?.short ?? k.uppercased(), e1rm: r1(now1),
                               delta28: before.flatMap { $0 > 0 ? r1(now1 - $0) : nil }, spark: spark))
        }

        let last: Snapshot.LastWorkout? = asc.last.map { w in
            .init(title: w.title, date: dateOf(w), durationMin: durationMin(w).rounded(),
                  volume: fromKg(volumeKg(w), unit).rounded(), sets: workingSets(w), exercises: w.exercises.count)
        }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return Snapshot(
            v: 1, generatedAt: iso.string(from: o.now), today: today, unit: unit, tz: tz.identifier, demo: false,
            graph: .init(start: start, days: days),
            streak: weekStreak(trainingDays: trained, today: today, min: max(1, o.weekTarget)),
            week: .init(target: o.weekTarget, done: weekDays.filter { $0.status == "done" }.count, days: weekDays),
            totals: .init(sessions52: s52, sessionsPrev52: sPrev, vol7: vol7.rounded(), volPrev7: volPrev7.rounded(),
                          avgMin: minsN > 0 ? (mins / Double(minsN)).rounded() : 0, allTime: asc.count),
            last: last, program: nil, lifts: lifts, recovery: nil
        )
    }
}
