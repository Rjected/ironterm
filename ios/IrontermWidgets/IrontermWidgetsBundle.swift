import SwiftUI
import WidgetKit

@main
struct IrontermWidgets: WidgetBundle {
    var body: some Widget {
        ActivityWidget()
        NextWorkoutWidget()
        WeekWidget()
        LiftsWidget()
        RecoveryWidget()
        LockScreenWidget()
    }
}

/// Reads the family from the environment and applies the Terminal chrome every widget shares.
struct WidgetChrome<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    var tab: String
    @ViewBuilder var content: (WidgetFamily) -> Content

    var body: some View {
        content(family)
            .padding(WidgetPad.of(family))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(for: .widget) { T.bg }
            .widgetURL(URL(string: "ironterm://tab/\(tab)"))
    }
}

struct ActivityWidget: Widget {
    let kind = "IrontermActivity"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ActivityIntent.self, provider: IntentProvider<ActivityIntent>()) { e in
            WidgetChrome(tab: "graph") { f in ActivityWidgetView(data: e.data, family: f, theme: e.config.theme.colorTheme) }
        }
        .configurationDisplayName("Activity")
        .description("Your training year as a contribution graph, with streak and this week.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
        .contentMarginsDisabled()
    }
}

struct NextWorkoutWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "IrontermNextWorkout", provider: StaticProvider()) { e in
            WidgetChrome(tab: "today") { f in NextWorkoutWidgetView(data: e.data, family: f) }
        }
        .configurationDisplayName("Next workout")
        .description("The next planned session with exact weights (Server mode).")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "IrontermThisWeek", provider: StaticProvider()) { e in
            WidgetChrome(tab: "today") { f in WeekWidgetView(data: e.data, family: f) }
        }
        .configurationDisplayName("This week")
        .description("Sessions done against your weekly target, and the streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

struct LiftsWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "IrontermLifts", intent: LiftIntent.self, provider: IntentProvider<LiftIntent>()) { e in
            WidgetChrome(tab: "lifts") { f in LiftsWidgetView(data: e.data, family: f, liftKey: e.config.lift?.id) }
        }
        .configurationDisplayName("Lifts")
        .description("Estimated 1RMs with 12-week trends. Small shows the lift you pick.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct RecoveryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "IrontermRecovery", provider: StaticProvider()) { e in
            WidgetChrome(tab: "body") { f in RecoveryWidgetView(data: e.data, family: f) }
        }
        .configurationDisplayName("Recovery")
        .description("Overall readiness and the least recovered muscles (Server mode).")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

struct LockScreenWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "IrontermLockScreen", intent: LockIntent.self, provider: IntentProvider<LockIntent>()) { e in
            LockChrome { f in
                LockWidgetView(data: e.data, family: f, circular: LockCircular(rawValue: e.config.circular.rawValue) ?? .week)
            }
        }
        .configurationDisplayName("Lock screen")
        .description("Week ring or streak, next workout, or a one-line summary.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct LockChrome<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    @ViewBuilder var content: (WidgetFamily) -> Content

    var body: some View {
        content(family)
            .containerBackground(for: .widget) { Color.clear }
            .widgetURL(URL(string: "ironterm://tab/today"))
    }
}
