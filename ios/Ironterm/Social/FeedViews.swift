import SwiftUI

/// One feed item: a session, a PR or an achievement, with reactions and the latest comments.
/// `friend` is the owner's friend id (needed to react / comment); nil = my own item (read-only).
struct FeedCard: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var item: FeedItem
    var friend: String?
    var author: Author?
    var stale = false
    var showAuthor = true

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            header
            switch item.kind {
            case "session": session
            case "pr": pr
            case "achievement": achievement
            default: Text(item.title ?? item.kind).font(T.mono(12)).foregroundStyle(T.dim)
            }
            ReactionBar(social: social, item: item, friend: friend)
            comments
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(T.panel)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    // MARK: header

    @ViewBuilder var header: some View {
        HStack(spacing: 8) {
            if showAuthor, let a = author {
                Button { model.socialPath.append(.profile(a.id)) } label: {
                    HStack(spacing: 8) {
                        Avatar(author: a, size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(a.display).font(T.mono(12, .heavy)).foregroundStyle(T.text).lineLimit(1)
                            Text(a.subtitle).font(T.mono(9)).foregroundStyle(T.faint).lineLimit(1)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(friend == nil)
            } else {
                Cap(kindLabel, T.amber, size: 9, weight: .bold)
            }
            Spacer(minLength: 4)
            if stale { StaleMark() }
            Cap(SocialFmt.ago(item.at), T.faint, size: 9)
        }
    }

    var kindLabel: String {
        switch item.kind {
        case "session": return "SESSION"
        case "pr": return "PR"
        case "achievement": return "ACHIEVEMENT"
        default: return item.kind
        }
    }

    // MARK: session

    var sessionStats: String {
        var parts: [String] = []
        let d = SocialFmt.duration(item.durationMin)
        if !d.isEmpty { parts.append(d) }
        if let s = item.sets { parts.append("\(s) SETS") }
        if let v = item.volume, v > 0 { parts.append("VOL " + Fmt.compact(v)) }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder var session: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "dumbbell.fill").font(.system(size: 10)).foregroundStyle(T.up)
                Text(item.title ?? "Workout").font(T.mono(13, .bold)).foregroundStyle(T.text).lineLimit(2)
            }
            if !sessionStats.isEmpty { Cap(sessionStats, T.dim, size: 9) }
            let ex: [FeedItem.Exercise] = item.exercises ?? []
            if !ex.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(ex.prefix(6).enumerated()), id: \.offset) { _, e in exerciseRow(e) }
                    if ex.count > 6 { Cap("+\(ex.count - 6) MORE", T.faint, size: 8) }
                }
                .padding(.leading, 16)
            }
            if let n = item.note, !n.isEmpty {
                Text("“\(n)”").font(T.mono(10)).foregroundStyle(T.dim).italic().fixedSize(horizontal: false, vertical: true).padding(.leading, 16)
            }
        }
    }

    func exerciseRow(_ e: FeedItem.Exercise) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                Text(e.name).font(T.mono(10)).foregroundStyle(T.text).lineLimit(1)
                Spacer(minLength: 4)
                if let t = e.top {
                    Text("\(Fmt.weight(t.weight)) × \(t.reps)").font(T.mono(10, .bold)).foregroundStyle(T.text)
                }
            }
            if let sets = e.sets, !sets.isEmpty {
                Text(sets.map(Self.setText).joined(separator: "  ")).font(T.mono(8)).foregroundStyle(T.faint).lineLimit(1)
            }
        }
    }

    static func setText(_ s: FeedItem.SetRow) -> String {
        let w: String = s.weight.map(Fmt.weight) ?? "BW"
        let r: String = s.reps.map(String.init) ?? "—"
        return "\(w)×\(r)"
    }

    // MARK: PR

    var prLabel: String {
        switch item.prKind ?? "" {
        case "e1rm": return "E1RM PR"
        case "rep": return "\(item.reps ?? 0)-REP PR"
        case "weight": return "WEIGHT PR"
        case "maxReps": return "MAX REPS PR"
        default: return (item.prKind ?? "").uppercased() + " PR"
        }
    }

    @ViewBuilder var pr: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "trophy.fill").font(.system(size: 18)).foregroundStyle(T.amber)
                .frame(width: 34, height: 34).overlay(Rectangle().stroke(T.amber.opacity(0.5), lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Cap(prLabel + " · " + (item.liftName ?? item.lift ?? ""), T.amber, size: 10, weight: .bold)
                if let w = item.weight {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(item.prKind == "e1rm" ? Fmt.weight(w) : "\(Fmt.weight(w)) × \(item.reps ?? 1)")
                            .font(T.mono(18, .heavy)).foregroundStyle(T.text)
                        if let p = item.prev, p > 0 {
                            Text("WAS \(Fmt.weight(p)) · \(Fmt.signed(w - p))").font(T.mono(9)).foregroundStyle(T.up)
                        }
                    }
                } else if item.prKind == "maxReps", let r = item.reps {
                    Text("\(r) REPS").font(T.mono(18, .heavy)).foregroundStyle(T.text)
                } else {
                    Text("New personal record").font(T.mono(11)).foregroundStyle(T.dim)
                }
            }
        }
    }

    // MARK: achievement

    @ViewBuilder var achievement: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "rosette").font(.system(size: 18)).foregroundStyle(StatusColor.of(item.tier))
                .frame(width: 34, height: 34).overlay(Rectangle().stroke(StatusColor.of(item.tier).opacity(0.5), lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.title ?? "Achievement").font(T.mono(13, .bold)).foregroundStyle(T.text)
                    if let t = item.tier, !t.isEmpty { Badge(text: t, color: StatusColor.of(t)) }
                }
                if let d = item.description, !d.isEmpty {
                    Text(d).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    // MARK: comments

    @ViewBuilder var comments: some View {
        let cs: [FeedComment] = item.comments
        if !cs.isEmpty || friend != nil {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(cs.suffix(2)) { c in CommentRow(c: c, me: social.myServer, compact: true) }
                if let f = friend {
                    Button { model.socialSheet = .comments(friend: f, item: item.id) } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "text.bubble").font(.system(size: 10))
                            Cap(cs.count > 2 ? "ALL \(cs.count) COMMENTS" : "COMMENT", T.dim, size: 9)
                        }
                        .foregroundStyle(T.dim)
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("comment-\(item.id)")
                }
            }
        }
    }
}

struct CommentRow: View {
    var c: FeedComment
    var me: String
    var compact = false

    var who: String {
        if !me.isEmpty, SocialFmt.origin(c.from.server) == SocialFmt.origin(me) { return "YOU" }
        return (c.from.name ?? SocialFmt.host(c.from.server)).uppercased()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(who).font(T.mono(compact ? 9 : 10, .bold)).foregroundStyle(who == "YOU" ? T.amber : T.up).lineLimit(1)
            Text(c.text).font(T.mono(compact ? 10 : 12)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                .lineLimit(compact ? 2 : nil)
            Spacer(minLength: 2)
            if !compact { Cap(SocialFmt.ago(c.at), T.faint, size: 8) }
        }
    }
}

/// The fixed reaction set as chips; mine is highlighted. Read-only (my own items) shows only
/// the reactions friends left.
struct ReactionBar: View {
    @ObservedObject var social: SocialStore
    var item: FeedItem
    var friend: String?

    var body: some View {
        let mine: String? = Reactions.mine(item.reactions, me: social.myServer)
        HStack(spacing: 6) {
            if let f = friend {
                ForEach(Reactions.set, id: \.self) { e in chip(e, mine: mine == e) { Task { await social.react(friend: f, item: item.id, emoji: e) } } }
            } else if !item.reactions.isEmpty {
                ForEach(item.reactions, id: \.emoji) { r in readOnly(r) }
            }
            Spacer(minLength: 0)
        }
    }

    func chip(_ e: String, mine: Bool, action: @escaping () -> Void) -> some View {
        let n: Int = Reactions.count(item.reactions, e)
        return Button(action: action) {
            HStack(spacing: 3) {
                Text(e).font(.system(size: 13))
                if n > 0 { Text("\(n)").font(T.mono(10, .bold)).foregroundStyle(mine ? T.amber : T.dim) }
            }
            .padding(.horizontal, 7).padding(.vertical, 4)
            .background(mine ? T.amber.opacity(0.14) : Color.clear)
            .overlay(Rectangle().stroke(mine ? T.amber : T.line, lineWidth: 1))
            .opacity(n > 0 || mine ? 1 : 0.55)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(e) \(n)")
        .accessibilityAddTraits(mine ? .isSelected : [])
        .accessibilityIdentifier("react-\(item.id)-\(e)")
    }

    func readOnly(_ r: Reaction) -> some View {
        let names: String = r.from.map { $0.name ?? SocialFmt.host($0.server) }.joined(separator: ", ")
        return HStack(spacing: 4) {
            Text(r.emoji).font(.system(size: 12))
            Text(names).font(T.mono(9)).foregroundStyle(T.dim).lineLimit(1)
        }
        .padding(.horizontal, 6).padding(.vertical, 3)
        .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

/// All comments on an item, and a field to add one (≤280 characters).
struct CommentsSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var friend: String
    var itemId: String
    @State private var text = ""
    @State private var sending = false
    @FocusState private var focused: Bool

    var item: FeedItem? {
        social.feed.first { $0.id == itemId && ($0.author?.id ?? friend) == friend }
            ?? social.friendFeeds[friend]?.items.first { $0.id == itemId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Cap("COMMENTS", T.amber, size: 12, weight: .bold)
                Spacer()
                Button("DONE") { model.socialSheet = nil }.font(T.mono(11, .bold)).foregroundStyle(T.amber)
            }
            if let i = item {
                Text(i.title ?? i.liftName ?? i.kind.uppercased()).font(T.mono(11)).foregroundStyle(T.dim).lineLimit(1)
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        if i.comments.isEmpty {
                            Text("No comments yet. Say something nice.").font(T.mono(11)).foregroundStyle(T.faint)
                        }
                        ForEach(i.comments) { c in CommentRow(c: c, me: social.myServer) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                Text("This item is no longer in the feed.").font(T.mono(11)).foregroundStyle(T.faint)
                Spacer()
            }
            ActionErrorStrip(social: social)
            HStack(spacing: 8) {
                TextField("Write a comment", text: $text, axis: .vertical)
                    .font(T.mono(12)).foregroundStyle(T.text).lineLimit(1...4)
                    .focused($focused)
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .background(Color(hex: 0x0B0C0E)).overlay(Rectangle().stroke(T.line, lineWidth: 1))
                    .onChange(of: text) { _, t in if t.count > 280 { text = String(t.prefix(280)) } }
                    .accessibilityIdentifier("comment-field")
                Button {
                    sending = true
                    Task {
                        if await social.comment(friend: friend, item: itemId, text: text) { text = "" }
                        sending = false
                    }
                } label: {
                    Text("SEND").font(T.mono(11, .bold)).foregroundStyle(T.bg)
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(canSend ? T.amber : T.faint)
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
            Cap("\(text.count)/280", T.faint, size: 8)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(T.panel.ignoresSafeArea())
    }

    var canSend: Bool { !sending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && item != nil }
}

/// Loads the next page when it scrolls into view.
struct LoadMoreRow: View {
    var loading: Bool
    var action: () async -> Void

    var body: some View {
        HStack {
            Spacer()
            if loading { ProgressView().controlSize(.small).tint(T.amber) } else {
                Button("LOAD MORE") { Task { await action() } }.font(T.mono(10, .bold)).foregroundStyle(T.amber)
            }
            Spacer()
        }
        .padding(.vertical, 8)
        .task { await action() }
    }
}
