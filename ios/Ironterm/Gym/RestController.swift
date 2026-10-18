import ActivityKit
import Foundation
import UIKit
import UserNotifications

/// Everything the rest timer does outside the GYM screen: the Live Activity (lock screen and
/// Dynamic Island), a local notification when rest ends, haptics, and keeping the screen awake
/// while a session runs.
@MainActor
final class RestController: ObservableObject {
    let prefs: GymPrefs
    private var activity: Activity<GymActivityAttributes>?
    private var scheduledEnd: Date?
    private var lastState: GymActivityAttributes.ContentState?
    private var tick: Timer?
    private var alarmedFor: Date?
    /// names for the activity text (set by the GYM screen, which knows the catalog)
    var nameFor: (LiveExercise) -> String = { GymStore.name($0, catalog: nil) }

    static let notificationId = "ironterm.rest"

    init(prefs: GymPrefs) {
        self.prefs = prefs
        // a previous run may have left an activity behind
        activity = Activity<GymActivityAttributes>.activities.first
    }

    func requestPermissionIfNeeded() {
        guard prefs.restAlerts else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    /// Bring everything in line with the session (nil = no session).
    func sync(_ s: LiveSession?) {
        UIApplication.shared.isIdleTimerDisabled = s != nil && prefs.keepAwake
        scheduleNotification(s?.restEnd)
        updateActivity(s)
        startTicking(s?.restEnd)
    }

    // MARK: notification

    private func scheduleNotification(_ end: Date?) {
        guard end != scheduledEnd else { return }
        scheduledEnd = end
        let c = UNUserNotificationCenter.current()
        c.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        guard let end, prefs.restAlerts, end > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        content.body = "Time for the next set."
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, end.timeIntervalSinceNow), repeats: false)
        c.add(UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: trigger))
    }

    // MARK: haptics while the app is open

    private func startTicking(_ end: Date?) {
        tick?.invalidate()
        tick = nil
        guard let end, end > Date() else { return }
        tick = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] t in
            Task { @MainActor in
                guard let self else { t.invalidate(); return }
                if Date() >= end {
                    t.invalidate()
                    self.restEnded(end)
                }
            }
        }
    }

    private func restEnded(_ end: Date) {
        guard alarmedFor != end else { return }
        alarmedFor = end
        if prefs.haptics {
            let g = UINotificationFeedbackGenerator()
            g.notificationOccurred(.success)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { g.notificationOccurred(.warning) }
        }
    }

    // MARK: Live Activity

    static func state(_ s: LiveSession, name: (LiveExercise) -> String) -> GymActivityAttributes.ContentState {
        let p = Live.progress(s)
        var exercise = "ALL SETS DONE"
        var line = "TAP TO FINISH"
        if let c = Live.current(s), let ex = s.exercises.first(where: { $0.id == c.exId }) {
            let set = ex.sets[c.set]
            exercise = name(ex).uppercased()
            let work = ex.sets.filter { !$0.isWarmup }
            let n = ex.sets[...c.set].filter { !$0.isWarmup }.count
            let label = set.isWarmup ? "WARMUP" : "SET \(n)/\(work.count)"
            let load: String
            if ex.isCardio { load = "\(Int((set.durationSec ?? 0) / 60)) MIN" }
            else { load = "\(set.weight.map { Fmt.weight($0) } ?? "BW") × \(set.reps ?? 0)\(set.type == "failure" ? "+" : "")" }
            line = "\(label) · \(load)"
        }
        let end = s.restEnd.flatMap { $0 > Date() ? $0 : nil }
        var start: Date?
        if let end, let ex = s.exercises.first(where: { $0.id == s.restFor }) {
            let doneAt = ex.sets.compactMap { $0.doneAt.flatMap(Live.parse) }.max()
            start = doneAt ?? end.addingTimeInterval(-ex.restSeconds)
        }
        return .init(restEnd: end, restStart: start, exercise: exercise, setLine: line, done: p.done, total: p.total)
    }

    private func updateActivity(_ s: LiveSession?) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, prefs.liveActivity, let s else {
            endActivity()
            return
        }
        let st = Self.state(s, name: nameFor)
        if let a = activity, a.activityState == .active || a.activityState == .stale {
            guard st != lastState else { return }
            lastState = st
            let stale = st.restEnd?.addingTimeInterval(5)
            Task { await a.update(ActivityContent(state: st, staleDate: stale)) }
            return
        }
        lastState = st
        let attrs = GymActivityAttributes(title: s.title, startedAt: s.startDate)
        activity = try? Activity.request(attributes: attrs, content: ActivityContent(state: st, staleDate: nil), pushType: nil)
    }

    private func endActivity() {
        lastState = nil
        let all = Activity<GymActivityAttributes>.activities
        activity = nil
        for a in all { Task { await a.end(nil, dismissalPolicy: .immediate) } }
    }
}
