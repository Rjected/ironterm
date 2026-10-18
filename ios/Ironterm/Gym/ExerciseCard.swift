import SwiftUI

/// What the number pad edits.
struct NumberTarget: Identifiable, Equatable {
    enum Field: String { case weight, reps, rpe, minutes, distance }
    var exId: String
    var set: Int
    var field: Field
    var title: String
    var value: Double?
    var step: Double
    var unit: String
    var id: String { "\(exId)-\(set)-\(field.rawValue)" }
}

struct ExerciseCard: View {
    @ObservedObject var gym: GymStore
    @ObservedObject var prefs: GymPrefs
    var ex: LiveExercise
    var unit: String
    var open: Bool
    var currentSet: Int
    var onToggle: () -> Void
    var onEdit: (NumberTarget) -> Void
    @State private var confirmRemove = false

    var name: String { gym.name(ex) }
    var kind: String { gym.kind(ex.lift) }
    var step: Double { Live.loadStep(kind: kind, unit: unit) }
    var done: Int { ex.sets.filter(\.done).count }
    var complete: Bool { !ex.sets.isEmpty && done == ex.sets.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggle) { headerRow }.buttonStyle(.plain)
            if open {
                VStack(alignment: .leading, spacing: 8) {
                    notes
                    ForEach(Array(ex.sets.enumerated()), id: \.offset) { i, set in
                        SetRow(ex: ex, i: i, set: set, unit: unit, kind: kind, step: step, current: i == currentSet,
                               number: workNumber(i), gym: gym, onEdit: onEdit)
                            .id("\(ex.id)-\(i)")
                        if i == currentSet, kind == "barbell", !ex.isCardio, let w = set.weight, w > prefs.bar(unit) {
                            PlateBar(plates: Live.plates(w, unit: unit, bar: prefs.bar(unit)), unit: unit, compact: false)
                                .padding(.leading, 4)
                        }
                    }
                    NoteField(text: Binding(get: { ex.userNote ?? "" }, set: { v in gym.update { Live.mapEx($0, ex.id) { var e = $0; e.userNote = v.isEmpty ? nil : v; return e } } }),
                              placeholder: "note for this exercise (saved with the workout)", minHeight: 38)
                    HStack(spacing: 10) {
                        TermButton(title: "+ SET") { gym.update { Live.addSet($0, exId: ex.id) } }
                        if ex.slotId == nil { TermButton(title: "REMOVE", style: .danger) { confirmRemove = true } }
                    }
                }
                .padding(.horizontal, 10).padding(.bottom, 12)
            }
        }
        .background(complete ? T.panel.opacity(0.5) : T.panel)
        .overlay(Rectangle().stroke(currentSet >= 0 ? T.amber.opacity(0.7) : T.line, lineWidth: 1))
        .confirmationDialog("Remove \(name)?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove exercise", role: .destructive) { gym.update { Live.removeExercise($0, exId: ex.id) } }
        }
    }

    var headerRow: some View {
        HStack(spacing: 8) {
            if let t = ex.tier { TierTag(tier: t) }
            VStack(alignment: .leading, spacing: 1) {
                Text(name.uppercased()).font(T.mono(13, .heavy)).foregroundStyle(complete ? T.dim : T.text).lineLimit(1)
                if let sc = ex.scheme { Text(sc).font(T.mono(9)).foregroundStyle(T.dim) }
            }
            Spacer(minLength: 4)
            if ex.userNote != nil && !open { Image(systemName: "note.text").font(.system(size: 10)).foregroundStyle(T.amber) }
            if complete { Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(T.up) }
            Text("\(done)/\(ex.sets.count)").font(T.mono(12, .bold)).foregroundStyle(complete ? T.up : currentSet >= 0 ? T.amber : T.dim)
            Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(T.faint)
        }
        .padding(.horizontal, 10).padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    @ViewBuilder var notes: some View {
        if let n = ex.note, !n.isEmpty {
            Text(n).font(T.mono(10, .bold)).foregroundStyle(T.amber).fixedSize(horizontal: false, vertical: true)
        }
        if ex.ifSuccess != nil || ex.ifFail != nil {
            VStack(alignment: .leading, spacing: 2) {
                if let s = ex.ifSuccess { Text("▲ " + s).font(T.mono(10)).foregroundStyle(T.up) }
                if let f = ex.ifFail { Text("▼ " + f).font(T.mono(10)).foregroundStyle(T.down) }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// 1-based number among work sets (warmups show W)
    func workNumber(_ i: Int) -> Int { ex.sets[...i].filter { !$0.isWarmup }.count }
}

struct SetRow: View {
    var ex: LiveExercise
    var i: Int
    var set: LiveSet
    var unit: String
    var kind: String
    var step: Double
    var current: Bool
    var number: Int
    @ObservedObject var gym: GymStore
    var onEdit: (NumberTarget) -> Void

    var h: CGFloat { current ? 52 : 40 }

    var body: some View {
        HStack(spacing: 6) {
            typeMenu
            if ex.isCardio {
                Stepper2(value: set.durationSec.map { $0 / 60 }, placeholder: "MIN", step: 5, h: h, big: current, dim: set.done,
                         onChange: { v in patch { $0.durationSec = v.map { max(0, $0) * 60 } } },
                         onTap: { onEdit(target(.minutes, set.durationSec.map { $0 / 60 }, 5, "MIN")) })
                Stepper2(value: set.distanceM.map { $0 / (unit == "lb" ? 1609.344 : 1000) }, placeholder: unit == "lb" ? "MI" : "KM", step: 0.5, h: h, big: current, dim: set.done,
                         onChange: { v in patch { $0.distanceM = v.map { max(0, $0) * (unit == "lb" ? 1609.344 : 1000) } } },
                         onTap: { onEdit(target(.distance, set.distanceM.map { $0 / (unit == "lb" ? 1609.344 : 1000) }, 0.5, unit == "lb" ? "MI" : "KM")) })
            } else {
                Stepper2(value: set.weight, placeholder: kind == "bodyweight" ? "BW" : unit.uppercased(), step: step, h: h, big: current, dim: set.done,
                         onChange: { v in patch { $0.weight = v.map { max(0, $0) } } },
                         onTap: { onEdit(target(.weight, set.weight, step, unit.uppercased())) })
                    .accessibilityLabel("weight")
                Stepper2(value: set.reps.map(Double.init), placeholder: "REPS", step: 1, h: h, big: current, dim: set.done,
                         onChange: { v in patch { $0.reps = v.map { max(0, Int($0.rounded())) } } },
                         onTap: { onEdit(target(.reps, set.reps.map(Double.init), 1, "REPS")) })
                    .frame(maxWidth: 118)
                    .accessibilityLabel("reps")
            }
            doneButton
        }
        .padding(.horizontal, current ? 6 : 0).padding(.vertical, current ? 6 : 0)
        .background(current ? T.amber.opacity(0.08) : Color.clear)
        .overlay(Rectangle().stroke(current ? T.amber : Color.clear, lineWidth: 1.5))
        .opacity(set.done ? 0.72 : 1)
    }

    func patch(_ f: @escaping (inout LiveSet) -> Void) {
        gym.update { Live.updateSet($0, exId: ex.id, i, f) }
    }

    func target(_ f: NumberTarget.Field, _ v: Double?, _ step: Double, _ unitLabel: String) -> NumberTarget {
        let what = f == .weight ? "WEIGHT" : f == .reps ? "REPS" : f == .minutes ? "MINUTES" : f == .distance ? "DISTANCE" : "RPE"
        return NumberTarget(exId: ex.id, set: i, field: f, title: "\(gym.name(ex).uppercased()) · \(set.isWarmup ? "WARMUP" : "SET \(number)") · \(what)",
                            value: v, step: step, unit: unitLabel)
    }

    var label: String {
        switch set.type {
        case "warmup": return "W"
        case "dropset": return "D\(number)"
        case "failure": return "\(number)F"
        default: return "\(number)"
        }
    }

    var targetText: String {
        guard let t = set.target else { return set.isWarmup ? "warm" : "" }
        var s = ""
        if let of = t.ofTop { s = "\(Int((of * 100).rounded()))%top" } else if t.weight > 0 { s = Fmt.weight(t.weight) } else if let r = t.rpe { s = "@\(Fmt.weight(r))" }
        s += "×\(t.reps)"
        if let m = t.repsMax { s += "–\(m)" }
        if t.amrap { s += "+" }
        return s
    }

    var typeMenu: some View {
        Menu {
            Picker("Set type", selection: Binding(get: { set.type }, set: { v in patch { $0.type = v } })) {
                Text("Normal").tag("normal")
                Text("Warmup").tag("warmup")
                Text("Failure / AMRAP").tag("failure")
                Text("Drop set").tag("dropset")
            }
            Menu("RPE") {
                ForEach([6.0, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10], id: \.self) { r in
                    Button(Fmt.weight(r)) { patch { $0.rpe = r } }
                }
                Button("Clear") { patch { $0.rpe = nil } }
            }
            if set.done { Button("Undo set") { patch { $0.done = false; $0.doneAt = nil } } }
            if set.target == nil && !set.done {
                Button("Remove set", role: .destructive) { gym.update { Live.removeSet($0, exId: ex.id, i) } }
            }
        } label: {
            VStack(spacing: 1) {
                Text(label).font(T.mono(current ? 15 : 12, .heavy))
                    .foregroundStyle(set.isWarmup ? T.faint : set.type == "failure" ? T.down : current ? T.amber : T.text)
                Text(targetText).font(T.mono(7)).foregroundStyle(T.faint).lineLimit(1).minimumScaleFactor(0.6)
                if let r = set.rpe { Text("@\(Fmt.weight(r))").font(T.mono(7, .bold)).foregroundStyle(T.amber) }
            }
            .frame(width: 46, height: h)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Set \(label), type \(set.type)")
    }

    var doneButton: some View {
        Button {
            if set.done { patch { $0.done = false; $0.doneAt = nil } } else { gym.complete(exId: ex.id, set: i) }
        } label: {
            ZStack {
                Rectangle().fill(set.done ? T.up : current ? T.amber : Color.clear)
                Rectangle().stroke(set.done ? T.up : current ? T.amber : T.line, lineWidth: 1.5)
                Image(systemName: set.done ? "checkmark" : current ? "checkmark" : "circle")
                    .font(.system(size: current ? 20 : 13, weight: .heavy))
                    .foregroundStyle(set.done || current ? T.bg : T.faint)
            }
            .frame(width: current ? 56 : 42, height: h)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(set.done ? "Undo set" : "Complete set")
        .accessibilityIdentifier("done-\(ex.id)-\(i)")
    }
}

/// − value + with tap-to-type on the value.
struct Stepper2: View {
    var value: Double?
    var placeholder: String
    var step: Double
    var h: CGFloat
    var big: Bool
    var dim: Bool
    var onChange: (Double?) -> Void
    var onTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            btn("minus") { onChange(max(0, (value ?? 0) - step)) }
            Button(action: onTap) {
                Text(value.map { Fmt.weight(DirectScreens.r1($0)) } ?? placeholder)
                    .font(T.mono(big ? 20 : 15, .bold))
                    .foregroundStyle(value == nil ? T.faint : dim ? T.dim : T.text)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity, minHeight: h)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            btn("plus") { onChange((value ?? 0) + step) }
        }
        .frame(height: h)
        .background(Color(hex: 0x0B0C0E))
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }

    func btn(_ icon: String, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Image(systemName: icon).font(.system(size: big ? 14 : 11, weight: .heavy)).foregroundStyle(T.amber)
                .frame(width: big ? 36 : 28, height: h)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Plates per side drawn on a bar sleeve: bigger plates taller, colours by size.
struct PlateBar: View {
    var plates: [Double]
    var unit: String
    var compact: Bool

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 1.5) {
                Rectangle().fill(T.dim).frame(width: compact ? 14 : 22, height: 4)
                Rectangle().fill(T.dim).frame(width: 3, height: compact ? 12 : 18)
                ForEach(Array(plates.enumerated()), id: \.offset) { _, p in
                    Rectangle().fill(color(p))
                        .frame(width: compact ? 5 : 8, height: height(p))
                        .overlay(Rectangle().stroke(Color.black.opacity(0.5), lineWidth: 0.5))
                }
                Rectangle().fill(T.dim).frame(width: compact ? 8 : 12, height: 4)
            }
            .frame(height: compact ? 26 : 40)
            Text("PER SIDE " + (plates.isEmpty ? "—" : plates.map { Fmt.weight($0) }.joined(separator: " · ")))
                .font(T.mono(compact ? 8 : 10, .bold)).foregroundStyle(T.dim).lineLimit(1).minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Plates per side: " + plates.map { Fmt.weight($0) }.joined(separator: ", "))
    }

    func height(_ p: Double) -> CGFloat {
        let biggest: Double = unit == "lb" ? 45 : 25
        let f: CGFloat = CGFloat(0.35 + 0.65 * min(1, p / biggest))
        return (compact ? 26 : 40) * f
    }

    func color(_ p: Double) -> Color {
        // IPF-ish colours (kg) mapped onto lb sizes too
        let kg: Double = unit == "lb" ? p / 2.20462262185 : p
        switch kg {
        case 24...: return Color(hex: 0xD94A3D)
        case 19...: return Color(hex: 0x3E6FD8)
        case 14...: return Color(hex: 0xE3B341)
        case 9...: return Color(hex: 0x3FA45B)
        case 4...: return Color(hex: 0xDCDCDC)
        default: return Color(hex: 0x8A8D93)
        }
    }
}

/// Big terminal keypad for weights and reps.
struct NumberPad: View {
    @Environment(\.dismiss) private var dismiss
    var target: NumberTarget
    var onDone: (Double?) -> Void
    @State private var text = ""
    @State private var fresh = true

    var value: Double? { Double(text) }

    var body: some View {
        VStack(spacing: 12) {
            Cap(target.title, T.dim, size: 9)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(text.isEmpty ? "—" : text).font(T.mono(44, .heavy)).foregroundStyle(fresh ? T.dim : T.amber).monospacedDigit()
                Cap(target.unit, T.faint, size: 12)
            }
            .frame(maxWidth: .infinity)
            HStack(spacing: 8) {
                quick("−\(Fmt.weight(target.step))") { bump(-target.step) }
                quick("+\(Fmt.weight(target.step))") { bump(target.step) }
                if target.field == .weight { quick("+\(Fmt.weight(target.step * 2))") { bump(target.step * 2) } }
                quick("CLEAR") { text = ""; fresh = false }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(["1", "2", "3", "4", "5", "6", "7", "8", "9", target.field == .reps ? "" : ".", "0", "⌫"], id: \.self) { k in
                    if k.isEmpty { Color.clear.frame(height: 50) } else {
                        Button { key(k) } label: {
                            Text(k).font(T.mono(22, .bold)).foregroundStyle(T.text)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(Color(hex: 0x0B0C0E))
                                .overlay(Rectangle().stroke(T.line, lineWidth: 1))
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(k == "⌫" ? "Delete" : k)
                    }
                }
            }
            HStack(spacing: 10) {
                TermButton(title: "CANCEL") { dismiss() }
                TermButton(title: "SET", style: .primary) { onDone(value); dismiss() }
            }
        }
        .padding(16)
        .background(T.panel.ignoresSafeArea())
        .onAppear { text = target.value.map { Fmt.weight(DirectScreens.r1($0)) } ?? "" }
    }

    func key(_ k: String) {
        if fresh { text = ""; fresh = false }
        if k == "⌫" { if !text.isEmpty { text.removeLast() }; return }
        if k == "." && text.contains(".") { return }
        if text.count >= 6 { return }
        text += k
    }

    func bump(_ d: Double) {
        fresh = false
        text = Fmt.weight(DirectScreens.r1(max(0, (value ?? 0) + d)))
    }

    func quick(_ t: String, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Text(t).font(T.mono(12, .bold)).foregroundStyle(T.amber)
                .frame(maxWidth: .infinity).padding(.vertical, 9)
                .overlay(Rectangle().stroke(T.amber.opacity(0.5), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
