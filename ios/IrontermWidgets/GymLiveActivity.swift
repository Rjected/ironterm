import ActivityKit
import SwiftUI
import WidgetKit

/// The GYM session on the lock screen and in the Dynamic Island: the rest countdown while
/// resting, otherwise the session clock, plus the set to do next.
struct GymLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GymActivityAttributes.self) { ctx in
            GymActivityLockView(attrs: ctx.attributes, state: ctx.state)
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(T.amber)
                .widgetURL(URL(string: "ironterm://tab/gym"))
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.state.restEnd != nil ? "REST" : "SESSION").font(T.mono(10, .heavy)).foregroundStyle(T.amber)
                        GymClock(state: ctx.state, start: ctx.attributes.startedAt, size: 24, align: .leading)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(ctx.state.done)/\(ctx.state.total)").font(T.mono(18, .bold)).foregroundStyle(T.text)
                        Text("SETS").font(T.mono(9)).foregroundStyle(T.dim)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("NEXT · \(ctx.state.exercise)").font(T.mono(12, .bold)).foregroundStyle(T.text).lineLimit(1)
                        Text(ctx.state.setLine).font(T.mono(11)).foregroundStyle(T.dim).lineLimit(1)
                        if let end = ctx.state.restEnd, let start = ctx.state.restStart, end > start {
                            ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(T.amber)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: ctx.state.restEnd != nil ? "timer" : "dumbbell.fill").foregroundStyle(T.amber)
            } compactTrailing: {
                GymClock(state: ctx.state, start: ctx.attributes.startedAt, size: 14)
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: ctx.state.restEnd != nil ? "timer" : "dumbbell.fill").foregroundStyle(T.amber)
            }
            .widgetURL(URL(string: "ironterm://tab/gym"))
            .keylineTint(T.amber)
        }
    }
}

/// Counts down to the end of rest, or up from the session start.
struct GymClock: View {
    var state: GymActivityAttributes.ContentState
    var start: Date
    var size: CGFloat
    var align: TextAlignment = .trailing

    var body: some View {
        Group {
            if let end = state.restEnd, end > Date() {
                Text(timerInterval: Date()...end, countsDown: true)
            } else {
                Text(start, style: .timer)
            }
        }
        .font(T.mono(size, .bold))
        .monospacedDigit()
        .foregroundStyle(state.restEnd != nil ? T.amber : T.text)
        .multilineTextAlignment(align)
    }
}

struct GymActivityLockView: View {
    var attrs: GymActivityAttributes
    var state: GymActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(Brand.upper).font(T.mono(10, .heavy)).foregroundStyle(Color.black)
                    .padding(.horizontal, 5).padding(.vertical, 1).background(T.amber)
                Text(attrs.title).font(T.mono(11, .bold)).foregroundStyle(T.dim).lineLimit(1)
                Spacer()
                Text("\(state.done)/\(state.total) SETS").font(T.mono(11, .bold)).foregroundStyle(T.text)
            }
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(state.restEnd != nil ? "REST" : "ELAPSED").font(T.mono(10, .heavy)).foregroundStyle(state.restEnd != nil ? T.amber : T.dim)
                    GymClock(state: state, start: attrs.startedAt, size: 34, align: .leading)
                }
                .frame(width: 130, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    Text(state.exercise).font(T.mono(13, .heavy)).foregroundStyle(T.text).lineLimit(1)
                    Text(state.setLine).font(T.mono(12)).foregroundStyle(T.dim).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if let end = state.restEnd, let start = state.restStart, end > start {
                ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .tint(T.amber)
            } else {
                ProgressView(value: Double(state.done), total: Double(max(1, state.total))).tint(T.up)
            }
        }
        .padding(14)
    }
}
