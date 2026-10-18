import Charts
import SwiftUI

// MARK: - friend profile

struct FriendProfileScreen: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var id: String
    @State private var error: String?
    @State private var loading = false

    var friend: Friend? { social.friend(id) }
    var title: String { friend?.author.display.uppercased() ?? social.profiles[id]?.profile.name?.uppercased() ?? "FRIEND" }

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: title, trailing: AnyView(
                Button { model.socialSheet = .share(id) } label: {
                    Image(systemName: "slider.horizontal.3").font(.system(size: 14)).foregroundStyle(T.amber).frame(width: 34, height: 34)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Sharing settings")
            ))
            content
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
        .task { await load(fresh: false) }
    }

    @ViewBuilder var content: some View {
        if let p = social.profiles[id] {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ActionErrorStrip(social: social)
                    if let e = error { OfflineErrorStrip(text: e) }
                    ProfileHeader(profile: p.profile, friend: friend, stale: p.stale == true) {
                        model.socialPath.append(.compare(id))
                    } onShare: { model.socialSheet = .share(id) }
                    ProfileBody(profile: p.profile, theme: model.theme)
                    feed
                }
                .padding(14)
            }
            .refreshable { await load(fresh: true) }
        } else if let e = error {
            EmptyState(title: "COULDN'T LOAD", message: e, button: "RETRY") { Task { await load(fresh: true) } }
        } else {
            VStack(spacing: 10) {
                ProgressView().tint(T.amber)
                Cap("ASKING THEIR SERVER…", T.dim, size: 11)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder var feed: some View {
        Cap("ACTIVITY", T.amber, size: 10, weight: .bold).padding(.top, 4)
        let page: FeedPage? = social.friendFeeds[id]
        let items: [FeedItem] = page?.items ?? []
        if items.isEmpty {
            Text(page == nil ? "Couldn't load their activity." : "No activity yet.").font(T.mono(11)).foregroundStyle(T.faint)
        }
        ForEach(items) { it in
            FeedCard(social: social, item: it, friend: id, author: friend?.author, stale: page.map { $0.staleAll || $0.staleIds.contains(id) } ?? false, showAuthor: false)
        }
        if page?.next != nil {
            LoadMoreRow(loading: social.loadingMore) { await social.loadMoreFriendFeed(id) }
        }
    }

    func load(fresh: Bool) async {
        loading = true
        defer { loading = false }
        do {
            try await social.loadProfile(id, fresh: fresh)
            error = nil
        } catch {
            self.error = SocialStore.message(error)
        }
    }
}

struct OfflineErrorStrip: View {
    var text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash").font(.system(size: 10, weight: .bold))
            Text(text).font(T.mono(9, .bold)).lineLimit(2)
            Spacer()
        }
        .foregroundStyle(T.amber)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .overlay(Rectangle().stroke(T.amber.opacity(0.5), lineWidth: 1))
    }
}

struct ProfileHeader: View {
    var profile: SocialProfile
    var friend: Friend?
    var stale: Bool
    var onCompare: () -> Void
    var onShare: () -> Void

    var author: Author {
        friend?.author ?? Author(id: "", server: profile.server, handle: profile.handle, name: profile.name)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Avatar(author: author, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(author.display).font(T.mono(17, .heavy)).foregroundStyle(T.text).lineLimit(1)
                    Text(author.subtitle).font(T.mono(10)).foregroundStyle(T.dim).lineLimit(1)
                    HStack(spacing: 6) {
                        Badge(text: "THEY SHARE " + profile.share.title, color: T.up)
                        if let f = friend { Badge(text: "YOU SHARE " + f.share.title, color: T.amber) }
                        if stale { StaleMark() }
                    }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                TermButton(title: "COMPARE", style: .primary, action: onCompare).accessibilityIdentifier("compare")
                TermButton(title: "SHARING", style: .secondary, action: onShare)
            }
        }
    }
}

struct ProfileBody: View {
    var profile: SocialProfile
    var theme: ColorTheme

    var unit: String { (profile.unit ?? "").uppercased() }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            stats
            graph
            lifts
            if profile.program != nil || profile.bodyweight != nil { programPanel }
        }
    }

    var stats: some View {
        Panel(title: "TRAINING", detail: profile.updatedAt.map { "UPDATED " + SocialFmt.ago($0) } ?? "") {
            HStack(alignment: .bottom) {
                Stat(value: "\(profile.streak.current)W", label: "STREAK", color: T.amber, size: 20)
                Spacer()
                Stat(value: "\(profile.streak.best)W", label: "BEST", size: 20)
                Spacer()
                Stat(value: "\(profile.week.done)/\(profile.week.target)", label: "THIS WEEK", color: profile.week.done >= profile.week.target ? T.up : T.text, size: 20)
                Spacer()
                Stat(value: "\(profile.sessions52)", label: "SESSIONS 52W", size: 20)
            }
        }
    }

    var graph: some View {
        let days: [Snapshot.Graph.Day] = profile.graphDays
        let active: Int = days.filter { $0.level > 0 }.count
        return Panel(title: "53 WEEKS", detail: "\(active) TRAINING DAYS") {
            GraphGrid(days: days, weeks: 53, theme: theme, gap: 1.5, months: true)
                .frame(height: 64)
            HStack(spacing: 4) {
                Cap("LESS", T.faint, size: 8)
                ForEach(0..<5) { l in Rectangle().fill(theme.color(for: l)).frame(width: 9, height: 9) }
                Cap("MORE", T.faint, size: 8)
                Spacer()
                Cap("LEVELS ONLY, NO VALUES", T.faint, size: 8)
            }
        }
    }

    @ViewBuilder var lifts: some View {
        if !profile.lifts.isEmpty {
            Panel(title: "LIFTS", detail: unit.isEmpty ? "E1RM" : "E1RM \(unit)") {
                HStack {
                    Cap("LIFT", T.faint, size: 8).frame(maxWidth: .infinity, alignment: .leading)
                    Cap("E1RM", T.faint, size: 8).frame(width: 60, alignment: .trailing)
                    Cap("BEST", T.faint, size: 8).frame(width: 60, alignment: .trailing)
                }
                ForEach(profile.lifts) { l in
                    HStack {
                        Text(l.name).font(T.mono(12, .bold)).foregroundStyle(T.text).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        Text(l.e1rm.map(Fmt.weight) ?? "—").font(T.mono(13, .bold)).foregroundStyle(T.text).frame(width: 60, alignment: .trailing)
                        Text(l.best.map(Fmt.weight) ?? "—").font(T.mono(11)).foregroundStyle(T.dim).frame(width: 60, alignment: .trailing)
                    }
                }
                if profile.share == .basic {
                    Text("Weights are shared from the LIFTS level up.").font(T.mono(9)).foregroundStyle(T.faint)
                }
            }
        }
    }

    var programPanel: some View {
        Panel(title: "PROGRAM", detail: "") {
            if let p = profile.program { Text(p).font(T.mono(13, .bold)).foregroundStyle(T.text) }
            if let bw = profile.bodyweight { Cap("BODYWEIGHT \(Fmt.weight(bw)) \(unit)", T.dim, size: 9) }
        }
    }
}

// MARK: - compare

struct CompareScreen: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var id: String
    @State private var error: String?
    @State private var perBw = false

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: "COMPARE", trailing: social.compares[id]?.stale == true ? AnyView(StaleMark()) : nil)
            if let c = social.compares[id] {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if let e = error { OfflineErrorStrip(text: e) }
                        CompareContent(c: c, perBw: $perBw)
                    }
                    .padding(14)
                }
                .refreshable { await load() }
            } else if let e = error {
                EmptyState(title: "COULDN'T LOAD", message: e, button: "RETRY") { Task { await load() } }
            } else {
                VStack(spacing: 10) {
                    ProgressView().tint(T.amber)
                    Cap("COMPARING…", T.dim, size: 11)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
    }

    func load() async {
        do { try await social.loadCompare(id); error = nil } catch { self.error = SocialStore.message(error) }
    }
}

struct CompareContent: View {
    var c: Compare
    @Binding var perBw: Bool

    var them: String { c.friend.display.uppercased() }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            streak
            lifts
            weeks
        }
    }

    var header: some View {
        HStack(spacing: 8) {
            legendDot(T.amber); Cap("YOU", T.amber, size: 11, weight: .bold)
            Cap("VS", T.faint, size: 10)
            legendDot(T.up); Cap(them, T.up, size: 11, weight: .bold)
            Spacer()
            Cap("IN \(c.unit.uppercased())", T.faint, size: 9)
        }
    }

    func legendDot(_ color: Color) -> some View { Rectangle().fill(color).frame(width: 9, height: 9) }

    var streak: some View {
        Panel(title: "STREAK", detail: "WEEKS IN A ROW") {
            HStack(alignment: .bottom) {
                Stat(value: "\(c.streak.me)W", label: "YOU", color: T.amber, size: 24)
                Spacer()
                Text(c.streak.me == c.streak.them ? "=" : (c.streak.me > c.streak.them ? ">" : "<"))
                    .font(T.mono(20, .heavy)).foregroundStyle(T.faint)
                Spacer()
                Stat(value: "\(c.streak.them)W", label: them, color: T.up, size: 24)
            }
        }
    }

    var lifts: some View {
        Panel(title: "E1RM", detail: perBw ? "× BODYWEIGHT" : c.unit.uppercased()) {
            if c.hasBodyweight {
                Seg(options: [(false, c.unit.uppercased()), (true, "× BODYWEIGHT")], value: $perBw, size: 10)
            }
            if c.lifts.isEmpty {
                Text("No lifts in common yet, or they share at BASIC (no weights).").font(T.mono(10)).foregroundStyle(T.faint)
            }
            ForEach(c.lifts) { l in CompareLiftRow(lift: l, perBw: perBw) }
            if !c.hasBodyweight {
                Text("× bodyweight needs both of you to share bodyweight (FULL).").font(T.mono(9)).foregroundStyle(T.faint)
            }
        }
    }

    struct WeekPoint: Identifiable {
        var id: String { week + who }
        var week: String
        var date: Date
        var who: String
        var n: Int
    }

    var points: [WeekPoint] {
        var out: [WeekPoint] = []
        for w in c.weeks {
            let d: Date = Day.date(w.week) ?? Date()
            out.append(WeekPoint(week: w.week, date: d, who: "YOU", n: w.me))
            out.append(WeekPoint(week: w.week, date: d, who: them, n: w.them))
        }
        return out
    }

    var weeks: some View {
        let meTotal: Int = c.weeks.reduce(0) { $0 + $1.me }
        let themTotal: Int = c.weeks.reduce(0) { $0 + $1.them }
        return Panel(title: "TRAINING DAYS PER WEEK", detail: "LAST \(c.weeks.count) WEEKS") {
            Chart(points) { p in
                BarMark(x: .value("Week", p.date, unit: .weekOfYear), y: .value("Sessions", p.n))
                    .foregroundStyle(by: .value("Who", p.who))
                    .position(by: .value("Who", p.who))
            }
            .chartForegroundStyleScale(domain: ["YOU", them], range: [T.amber, T.up])
            .chartLegend(.hidden)
            .chartXAxis { AxisMarks(values: .stride(by: .month)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated)).font(T.mono(7)).foregroundStyle(T.faint) } }
            .chartYAxis { AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(T.line); AxisValueLabel().font(T.mono(7)).foregroundStyle(T.faint) } }
            .frame(height: 130)
            HStack {
                Cap("YOU \(meTotal)", T.amber, size: 9, weight: .bold)
                Spacer()
                Cap("\(them) \(themTotal)", T.up, size: 9, weight: .bold)
            }
        }
    }
}

/// One lift: my bar from the left, theirs from the right, the bigger number bright.
struct CompareLiftRow: View {
    var lift: Compare.Lift
    var perBw: Bool

    var me: Double? { perBw ? lift.meBw : lift.me }
    var them: Double? { perBw ? lift.themBw : lift.them }

    func text(_ v: Double?) -> String {
        guard let v else { return "—" }
        return perBw ? String(format: "%.2f×", v) : Fmt.weight(v)
    }

    var body: some View {
        let a: Double = me ?? 0
        let b: Double = them ?? 0
        let top: Double = max(a, b, 0.0001)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(text(me)).font(T.mono(13, .bold)).foregroundStyle(a >= b && me != nil ? T.amber : T.dim).frame(width: 64, alignment: .leading)
                Spacer()
                Text(lift.name.uppercased()).font(T.mono(10, .bold)).foregroundStyle(T.text).lineLimit(1)
                Spacer()
                Text(text(them)).font(T.mono(13, .bold)).foregroundStyle(b >= a && them != nil ? T.up : T.dim).frame(width: 64, alignment: .trailing)
            }
            GeometryReader { g in
                let half: CGFloat = (g.size.width - 4) / 2
                let wa: CGFloat = half * CGFloat(a / top)
                let wb: CGFloat = half * CGFloat(b / top)
                HStack(spacing: 4) {
                    ZStack(alignment: .trailing) {
                        Rectangle().fill(T.line)
                        Rectangle().fill(T.amber).frame(width: wa)
                    }
                    ZStack(alignment: .leading) {
                        Rectangle().fill(T.line)
                        Rectangle().fill(T.up).frame(width: wb)
                    }
                }
            }
            .frame(height: 6)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(lift.name): you \(text(me)), them \(text(them))")
    }
}

// MARK: - notifications

struct NotificationsScreen: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore

    var body: some View {
        VStack(spacing: 0) {
            BackBar(title: "NOTIFICATIONS", trailing: social.unread > 0 ? AnyView(
                Button("MARK ALL READ") { Task { await social.markRead() } }.font(T.mono(10, .bold)).foregroundStyle(T.amber)
            ) : nil)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if social.notifications.isEmpty && (social.loading || social.me == nil) {
                        ProgressView().tint(T.amber).frame(maxWidth: .infinity).padding(.top, 60)
                    } else if social.notifications.isEmpty {
                        EmptyState(title: "ALL QUIET", message: "Friend requests, reactions and comments on your activity show up here.", button: "REFRESH") {
                            Task { await social.refreshNotifications() }
                        }
                    }
                    ForEach(social.notifications) { n in row(n) }
                }
                .padding(14)
            }
            .refreshable { await social.refreshNotifications() }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
        // opening the list counts as reading it, once you leave
        .onDisappear { Task { await social.markRead() } }
    }

    func row(_ n: SocialNotification) -> some View {
        Button { open(n) } label: {
            HStack(alignment: .top, spacing: 10) {
                Avatar(author: n.from, size: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(Text(n.from.display).font(T.mono(12, .heavy)).foregroundStyle(T.text)) \(Text(n.line).font(T.mono(11)).foregroundStyle(T.dim))")
                    Cap(SocialFmt.ago(n.at) + " · " + n.kind, T.faint, size: 8)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                if !n.read { Circle().fill(T.amber).frame(width: 7, height: 7).padding(.top, 4).accessibilityLabel("Unread") }
            }
            .padding(10)
            .background(n.read ? T.panel : T.amber.opacity(0.05))
            .overlay(Rectangle().stroke(n.read ? T.line : T.amber.opacity(0.4), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    func open(_ n: SocialNotification) {
        switch n.kind {
        case "request":
            model.socialPath = []
            model.socialSection = .friends
            if social.friend(n.from.id)?.status == .incoming { model.socialSheet = .accept(n.from.id) }
        case "accepted":
            model.socialPath = [.profile(n.from.id)]
        default:
            model.socialPath = []
            model.socialSection = .mine
        }
    }
}
