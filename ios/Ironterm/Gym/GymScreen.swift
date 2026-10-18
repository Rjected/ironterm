import SwiftUI

/// GYM: the screen you keep open while training. Start the next program day (or another, or an
/// empty workout), log sets with big steppers, rest between them, then FINISH to write the
/// workout to Hevy through the server. Works offline: see GymStore.
struct GymScreen: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        Group {
            if model.source != .server && model.gym.session == nil {
                NeedsServer(title: "GYM", what: "Logging a workout (program targets, saving to Hevy)")
            } else {
                NavigationStack {
                    GymBody(gym: model.gym, prefs: model.prefs, queue: model.gym.queue)
                        .toolbar(.hidden, for: .navigationBar)
                        .toolbar {
                            ToolbarItemGroup(placement: .keyboard) {
                                Spacer()
                                Button("DONE") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                                    .font(T.mono(13, .bold)).foregroundStyle(T.amber)
                            }
                        }
                }
            }
        }
        .screen()
    }
}

struct GymBody: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore
    @ObservedObject var prefs: GymPrefs
    @ObservedObject var queue: OfflineQueue

    var body: some View {
        VStack(spacing: 0) {
            if queue.pendingFinishes > 0 || !queue.failures.isEmpty { OutboxStrip(queue: queue) }
            if let f = gym.finished {
                FinishSummaryView(info: f, gym: gym)
            } else if let s = gym.session {
                ActiveSessionView(gym: gym, prefs: prefs, s: s)
            } else {
                StartView(gym: gym)
            }
        }
        .alert("GYM", isPresented: Binding(get: { gym.error != nil }, set: { if !$0 { gym.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(gym.error ?? "") }
        .task(id: model.dataVersion) { if gym.session == nil { await gym.load() } }
        .onAppear { let g = gym; gym.rest.nameFor = { [weak g] ex in g?.name(ex) ?? ex.lift } }
    }
}

/// Workouts finished offline waiting to upload, and anything the server refused.
struct OutboxStrip: View {
    @ObservedObject var queue: OfflineQueue

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if queue.pendingFinishes > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "icloud.and.arrow.up").font(.system(size: 11, weight: .bold))
                    Cap("\(queue.pendingFinishes) WORKOUT\(queue.pendingFinishes == 1 ? "" : "S") WAITING TO UPLOAD", T.bg, size: 10, weight: .bold)
                    Spacer()
                    Button(queue.flushing ? "SENDING…" : "RETRY") { Task { await queue.flush() } }
                        .font(T.mono(10, .heavy)).foregroundStyle(T.bg).disabled(queue.flushing)
                }
                .foregroundStyle(T.bg)
            }
            ForEach(Array(queue.failures.enumerated()), id: \.offset) { _, f in
                HStack(alignment: .top) {
                    Text("Not saved: \(f.message)").font(T.mono(10, .bold)).foregroundStyle(T.bg).fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button("OK") { queue.clearFailures() }.font(T.mono(10, .heavy)).foregroundStyle(T.bg)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(queue.failures.isEmpty ? T.amber : T.down)
    }
}

// MARK: - start

struct StartView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore
    @State private var day: Int?

    var nextIndex: Int? { gym.gym?.days.first { $0.dayName == gym.gym?.next?.dayName }?.dayIndex }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ScreenHeader(title: "GYM", detail: gym.gym?.programName?.uppercased() ?? "")
                if let g = gym.gym, let n = g.next { programHero(g, n) } else if gym.loading && gym.gym == nil {
                    HStack { Spacer(); ProgressView().tint(T.amber); Spacer() }.padding(30)
                } else {
                    Panel(title: "NO PROGRAM") {
                        Text("No active program. Pick one in SETUP → Advanced setup (web), or just start logging.")
                            .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Panel(title: "FREE SESSION") {
                    TermButton(title: gym.busy ? "STARTING…" : "START EMPTY WORKOUT", disabled: gym.busy) { Task { await gym.start(dayIndex: nil, empty: true) } }
                        .accessibilityIdentifier("start-empty")
                    Text("Sets are saved on the phone as you go and synced to the server, so losing signal, closing the app or switching to the web app won't lose anything. Logging in Hevy instead works too.")
                        .font(T.mono(10)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
        }
        .refreshable { await gym.load() }
    }

    func programHero(_ g: AppGym, _ n: Snapshot.NextSession) -> some View {
        let chosen = day ?? nextIndex
        let chosenDay = g.days.first { $0.dayIndex == chosen }
        let isNext = chosen == nil || chosen == nextIndex
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Cap(isNext ? "NEXT · \(n.when)" : "PICKED · OUT OF ORDER", T.dim, size: 10)
                Text(isNext ? n.dayName : (chosenDay?.dayName ?? "")).font(T.mono(22, .heavy)).foregroundStyle(T.text)
                if n.reentry && isNext { Badge(text: "RE-ENTRY · EASED IN") }
                Button { Task { await gym.start(dayIndex: chosen, empty: false) } } label: {
                    HStack {
                        Image(systemName: "play.fill")
                        Text(gym.busy ? "STARTING…" : "START \(chosenDay?.dayId ?? "SESSION")").font(T.mono(18, .heavy))
                    }
                    .foregroundStyle(T.bg)
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(T.amber)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(gym.busy)
                .accessibilityIdentifier("start-next")
                if g.days.count > 1 {
                    Cap("OR PICK ANOTHER DAY", T.faint, size: 8)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(g.days) { d in
                                let on = d.dayIndex == chosen
                                Button { day = d.dayIndex } label: {
                                    Text(d.dayId + (d.dayIndex == nextIndex ? "•" : ""))
                                        .font(T.mono(12, .bold)).foregroundStyle(on ? T.bg : T.dim)
                                        .padding(.horizontal, 14).padding(.vertical, 8)
                                        .background(on ? T.amber : Color.clear)
                                        .overlay(Rectangle().stroke(on ? T.amber : T.line, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .background(T.panel)
            .overlay(Rectangle().stroke(T.amber.opacity(0.6), lineWidth: 1))
            if isNext {
                Panel(title: "PREVIEW", detail: "\(n.exercises.count) EXERCISES") {
                    ForEach(Array(n.exercises.enumerated()), id: \.offset) { i, e in
                        PreviewRow(e: e, unit: g.unit, bar: model.prefs.bar(g.unit))
                        if i < n.exercises.count - 1 { Divider1() }
                    }
                }
            } else {
                Panel(title: "PREVIEW") {
                    Text("\(chosenDay?.dayName ?? "This day") gets its weights from the program when you start.").font(T.mono(11)).foregroundStyle(T.dim)
                }
            }
        }
    }
}

struct PreviewRow: View {
    var e: Snapshot.NextSession.Exercise
    var unit: String
    var bar: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                TierTag(tier: e.tier)
                Text(e.name.uppercased()).font(T.mono(12, .bold)).foregroundStyle(T.text)
                Spacer()
                Text(e.top > 0 ? "\(Fmt.weight(e.top)) \(unit)" : "BW").font(T.mono(13, .bold)).foregroundStyle(T.text)
            }
            Text(e.summary).font(T.mono(10)).foregroundStyle(T.dim)
            if LiftLibrary.kind(e.lift) == "barbell", e.top > bar {
                PlateBar(plates: Live.plates(e.top, unit: unit, bar: bar), unit: unit, compact: true)
            }
        }
    }
}

// MARK: - active session

struct ActiveSessionView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var gym: GymStore
    @ObservedObject var prefs: GymPrefs
    var s: LiveSession
    @State private var openIds: Set<String> = []
    @State private var closedIds: Set<String> = []
    @State private var picker = false
    @State private var finishing = false
    @State private var renaming = false
    @State private var newTitle = ""
    @State private var edit: NumberTarget?

    var cur: Live.Cursor? { Live.current(s) }

    var body: some View {
        VStack(spacing: 0) {
            header
            if s.restEndsAt != nil { RestBanner(gym: gym, s: s) }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(s.exercises) { ex in
                            ExerciseCard(gym: gym, prefs: prefs, ex: ex, unit: s.unit, open: isOpen(ex),
                                         currentSet: cur?.exId == ex.id ? cur!.set : -1,
                                         onToggle: { toggle(ex) }, onEdit: { edit = $0 })
                                .id(ex.id)
                        }
                        Button { picker = true } label: {
                            Label("ADD EXERCISE", systemImage: "plus").font(T.mono(12, .bold)).foregroundStyle(T.amber)
                                .frame(maxWidth: .infinity).padding(.vertical, 14)
                                .overlay(Rectangle().stroke(T.amber.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("add-exercise")
                        Cap("WORKOUT NOTES", T.faint, size: 9).padding(.top, 6)
                        NoteField(text: Binding(get: { s.notes ?? "" }, set: { v in gym.update { var x = $0; x.notes = v; return x } }),
                                  placeholder: "saved with the workout", minHeight: 70)
                        Color.clear.frame(height: 40)
                    }
                    .padding(14)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: cur) { old, new in
                    guard prefs.autoAdvance, let new, let old, old != new else { return }
                    closedIds.remove(new.exId)
                    // keep the set to do next in view: the next exercise from its top, the next set centred
                    withAnimation(.easeInOut(duration: 0.3)) {
                        if old.exId != new.exId { proxy.scrollTo(new.exId, anchor: .top) } else { proxy.scrollTo("\(new.exId)-\(new.set)", anchor: .center) }
                    }
                }
            }
        }
        .sheet(isPresented: $picker) {
            ExercisePicker(catalog: gym.gym?.catalog) { pick in
                gym.update { Live.addExercise($0, lift: pick.lift, cardio: pick.cardio, title: pick.title, templateId: pick.templateId) }
            }
            .termSheet()
        }
        .sheet(isPresented: $finishing) { FinishSheet(gym: gym, s: s).presentationDetents([.large]).termSheet() }
        .sheet(item: $edit) { t in NumberPad(target: t) { v in apply(t, v) }.presentationDetents([.height(470)]).termSheet() }
        .alert("Rename workout", isPresented: $renaming) {
            TextField("title", text: $newTitle)
            Button("Save") { let t = newTitle.trimmingCharacters(in: .whitespaces); if !t.isEmpty { gym.update { var x = $0; x.title = t; return x } } }
            Button("Cancel", role: .cancel) {}
        }
    }

    func isOpen(_ ex: LiveExercise) -> Bool {
        if openIds.contains(ex.id) { return true }
        if closedIds.contains(ex.id) { return false }
        return ex.id == (cur?.exId ?? s.exercises.first?.id)
    }

    func toggle(_ ex: LiveExercise) {
        if isOpen(ex) { openIds.remove(ex.id); closedIds.insert(ex.id) } else { closedIds.remove(ex.id); openIds.insert(ex.id) }
    }

    func apply(_ t: NumberTarget, _ v: Double?) {
        gym.update { s in
            Live.updateSet(s, exId: t.exId, t.set) { x in
                switch t.field {
                case .weight: x.weight = v
                case .reps: x.reps = v.map { Int($0.rounded()) }
                case .rpe: x.rpe = v
                case .minutes: x.durationSec = v.map { $0 * 60 }
                case .distance: x.distanceM = v.map { $0 * (s.unit == "lb" ? 1609.344 : 1000) }
                }
            }
        }
    }

    var header: some View {
        let p = Live.progress(s)
        return VStack(spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                Button { newTitle = s.title; renaming = true } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(s.title).font(T.mono(15, .heavy)).foregroundStyle(T.text).lineLimit(1)
                            Image(systemName: "pencil").font(.system(size: 9)).foregroundStyle(T.faint)
                        }
                        Text(subtitle).font(T.mono(9)).foregroundStyle(T.dim).lineLimit(1)
                    }
                }
                .buttonStyle(.plain)
                Spacer(minLength: 4)
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text(Live.clock(ctx.date.timeIntervalSince(s.startDate)))
                        .font(T.mono(20, .bold)).foregroundStyle(T.amber).monospacedDigit()
                }
                .accessibilityLabel("Elapsed time")
                Button { finishing = true } label: {
                    Text("FINISH").font(T.mono(12, .heavy)).foregroundStyle(T.bg)
                        .padding(.horizontal, 12).padding(.vertical, 9).background(T.amber)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("finish")
            }
            HStack(spacing: 8) {
                Bar(value: p.total > 0 ? Double(p.done) / Double(p.total) : 0, color: T.up, height: 5)
                Cap("\(p.done)/\(p.total) SETS", T.dim, size: 9)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(T.panel)
        .overlay(alignment: .bottom) { Divider1() }
    }

    var subtitle: String {
        if let p = s.programName {
            let day = s.dayName?.split(separator: "·").last.map { $0.trimmingCharacters(in: .whitespaces) }
            return p.uppercased() + (day.map { " · \($0.uppercased())" } ?? "")
        }
        return "FREE SESSION"
    }
}

/// The rest timer: big countdown, −15 / +30 / SKIP. Turns into GO when it runs out.
struct RestBanner: View {
    @ObservedObject var gym: GymStore
    var s: LiveSession

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
            let end = s.restEnd ?? ctx.date
            let left = end.timeIntervalSince(ctx.date)
            let total = restTotal
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Cap(left > 0 ? "REST" : "GO", left > 0 ? T.bg : T.bg, size: 10, weight: .heavy)
                    Text(left > 0 ? Live.clock(left) : "+" + Live.clock(-left))
                        .font(T.mono(30, .heavy)).foregroundStyle(T.bg).monospacedDigit()
                }
                .frame(width: 112, alignment: .leading)
                Spacer(minLength: 0)
                restButton("−15") { gym.update { Live.adjustRest($0, by: -15) } }
                restButton("+30") { gym.update { Live.adjustRest($0, by: 30) } }
                restButton("SKIP") { gym.update { Live.skipRest($0) } }
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(left > 0 ? T.amber : T.up)
            .overlay(alignment: .bottom) {
                if left > 0, total > 0 {
                    GeometryReader { g in
                        Rectangle().fill(T.bg.opacity(0.35)).frame(width: g.size.width * CGFloat(max(0, min(1, 1 - left / total))), height: 3)
                    }
                    .frame(height: 3)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(left > 0 ? "Rest, \(Int(left)) seconds left" : "Rest over")
        }
    }

    var restTotal: Double {
        guard let end = s.restEnd, let ex = s.exercises.first(where: { $0.id == s.restFor }),
              let last = ex.sets.compactMap({ $0.doneAt.flatMap(Live.parse) }).max() else { return 0 }
        return end.timeIntervalSince(last)
    }

    func restButton(_ t: String, _ a: @escaping () -> Void) -> some View {
        Button(action: a) {
            Text(t).font(T.mono(13, .heavy)).foregroundStyle(T.bg)
                .frame(minWidth: 50).padding(.vertical, 10)
                .overlay(Rectangle().stroke(T.bg.opacity(0.6), lineWidth: 1.5))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
