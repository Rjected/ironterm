import Foundation

/// Direct mode: the LIFTS and HISTORY documents built on the phone from the cached Hevy
/// workouts, in the same shapes the server sends (AppLiftList, AppLiftDetail, AppHistory,
/// AppWorkout), so the screens don't care where the data came from. Program, stall, projection
/// and recovery need the server and are left empty.
struct DirectScreens {
    var workouts: [Workout]
    var unit: String
    var tz: TimeZone = .current
    var today: String

    init(workouts: [Workout], unit: String, tz: TimeZone = .current, now: Date = Date()) {
        self.workouts = workouts.filter { $0.startDate != nil }.sorted { ($0.startDate ?? .distantPast) > ($1.startDate ?? .distantPast) }
        self.unit = unit
        self.tz = tz
        today = Day.local(now, tz: tz)
    }

    static func r1(_ x: Double) -> Double { (x * 10).rounded() / 10 }

    private func w(_ kg: Double?) -> Double? { kg.map { Self.r1(DirectAggregator.fromKg($0, unit)) } }

    private func date(_ x: Workout) -> String { Day.local(x.startDate!, tz: tz) }

    // MARK: lifts

    func points(_ key: String) -> [AppLiftDetail.Point] {
        workouts.reversed().compactMap { x in
            let sets = x.exercises.filter { DirectAggregator.matchLift($0.title) == key }
                .flatMap { $0.sets.filter { !$0.isWarmup && ($0.reps ?? 0) > 0 } }
            guard !sets.isEmpty else { return nil }
            let ps = sets.map { AppLiftDetail.Point.PSet(weight: w($0.weightKg) ?? 0, reps: $0.reps ?? 0, rpe: $0.rpe) }
            let top = ps.max { DirectAggregator.epley($0.weight, $0.reps) < DirectAggregator.epley($1.weight, $1.reps) }!
            let vol = ps.reduce(0) { $0 + $1.weight * Double($1.reps) }
            return .init(date: date(x), workoutId: x.id, e1rm: Self.r1(DirectAggregator.epley(top.weight, top.reps)),
                         topWeight: top.weight, topReps: top.reps, volume: vol.rounded(), sets: ps)
        }
    }

    func liftList() -> AppLiftList {
        var seen: [String] = []
        for x in workouts.reversed() { for e in x.exercises { if let k = DirectAggregator.matchLift(e.title), !seen.contains(k) { seen.append(k) } } }
        let ordered = LiftLibrary.bigFour.filter { seen.contains($0) } + seen.filter { !LiftLibrary.bigFour.contains($0) }
        return AppLiftList(lifts: ordered.compactMap { k in
            let pts = points(k)
            guard let last = pts.last else { return nil }
            let def = LiftLibrary.byKey[k]
            let recent = pts.filter { $0.date > Day.add(today, -28) }.map(\.e1rm)
            return .init(key: k, name: def?.name ?? k, short: def?.short ?? k.uppercased(), kind: def?.kind ?? "barbell",
                         e1rm: recent.max() ?? last.e1rm, best: pts.map(\.e1rm).max() ?? 0, sessions: pts.count, last: last.date,
                         status: last.date < Day.add(today, -42) ? "inactive" : nil, spark: pts.suffix(16).map(\.e1rm))
        }.sorted { a, b in
            // most-trained after the big four, like the server
            let ia = LiftLibrary.bigFour.firstIndex(of: a.key) ?? 99, ib = LiftLibrary.bigFour.firstIndex(of: b.key) ?? 99
            return ia != ib ? ia < ib : a.sessions > b.sessions
        })
    }

    func liftDetail(_ key: String) -> AppLiftDetail {
        let pts = points(key)
        let def = LiftLibrary.byKey[key]
        let best = pts.max { $0.e1rm < $1.e1rm }
        let recent = pts.filter { $0.date > Day.add(today, -28) }.map(\.e1rm)
        let yearAgo = pts.filter { $0.date <= Day.add(today, -365) && $0.date > Day.add(today, -393) }.map(\.e1rm).max()
        // best weight for each rep count 1–12
        var reps: [Int: AppLiftDetail.RepPR] = [:]
        for p in pts { for s in p.sets where s.reps >= 1 && s.reps <= 12 && s.weight > 0 {
            if (reps[s.reps]?.weight ?? -1) < s.weight { reps[s.reps] = .init(reps: s.reps, weight: s.weight, date: p.date) }
        } }
        let repPRs = reps.values.sorted { $0.reps < $1.reps }
        let wall = repPRs.map { r in
            AppLiftDetail.WallItem(reps: r.reps, weight: r.weight, date: r.date,
                                   stoodDays: Int(((Day.date(today) ?? Date()).timeIntervalSince(Day.date(r.date) ?? Date()) / 86400).rounded()))
        }
        return AppLiftDetail(key: key, name: def?.name ?? key, short: def?.short ?? key.uppercased(), kind: def?.kind ?? "barbell", unit: unit,
                             e1rm: recent.max() ?? pts.last?.e1rm, best: best.map { .init(e1rm: $0.e1rm, date: $0.date) }, yearAgo: yearAgo,
                             points: pts, repPRs: repPRs, prWall: wall, stall: nil, projection: nil, rpe: [])
    }

    // MARK: history

    static func cleanNote(_ d: String?) -> String {
        (d ?? "").replacingOccurrences(of: #"\s*\[ht:[^\]]+\]\s*"#, with: "\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func dayTag(_ d: String?) -> String? {
        guard let d, let r = d.range(of: #"\[ht:([^\]]+)\]"#, options: .regularExpression) else { return nil }
        return String(d[r].dropFirst(4).dropLast())
    }

    func summary(_ x: Workout) -> AppWorkoutSummary {
        AppWorkoutSummary(id: x.id, date: date(x), start: x.startTime, title: x.title, durationMin: DirectAggregator.durationMin(x).rounded(),
                          volume: DirectAggregator.fromKg(DirectAggregator.volumeKg(x), unit).rounded(), sets: DirectAggregator.workingSets(x),
                          exercises: x.exercises.map(\.title), programDay: Self.dayTag(x.description),
                          hasNotes: !Self.cleanNote(x.description).isEmpty || x.exercises.contains { !($0.notes ?? "").isEmpty })
    }

    func history(cursor: String?, limit: Int = 30, q: String?) -> AppHistory {
        let t = q?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
        let all = t.isEmpty ? workouts : workouts.filter { $0.title.lowercased().contains(t) || $0.exercises.contains { $0.title.lowercased().contains(t) } }
        let start = cursor.flatMap { c in all.firstIndex { $0.id == c }.map { $0 + 1 } } ?? 0
        let page = Array(all.dropFirst(start).prefix(limit))
        return AppHistory(workouts: page.map(summary), next: start + limit < all.count ? page.last?.id : nil, total: all.count)
    }

    func workout(_ id: String) -> AppWorkout? {
        guard let x = workouts.first(where: { $0.id == id }) else { return nil }
        return AppWorkout(summary: summary(x), unit: unit, note: Self.cleanNote(x.description), exercises: x.exercises.map { e in
            .init(title: e.title, lift: DirectAggregator.matchLift(e.title), note: e.notes, sets: e.sets.map { s in
                let wt = w(s.weightKg)
                let e1: Double? = (wt ?? 0) > 0 && (s.reps ?? 0) > 0 && !s.isWarmup ? Self.r1(DirectAggregator.epley(wt!, s.reps!)) : nil
                return .init(type: s.type, weight: wt, reps: s.reps, rpe: s.rpe, distanceM: s.distanceMeters, durationSec: s.durationSeconds, e1rm: e1)
            })
        }, program: nil)
    }
}
