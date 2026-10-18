import SwiftUI

// MARK: - FRIENDS tab

struct FriendsRoot: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        NavigationStack(path: $model.socialPath) {
            FriendsHome(social: model.social)
                .navigationDestination(for: SocialRoute.self) { r in
                    switch r {
                    case .profile(let id): FriendProfileScreen(social: model.social, id: id)
                    case .compare(let id): CompareScreen(social: model.social, id: id)
                    case .notifications: NotificationsScreen(social: model.social)
                    }
                }
                .withRoutes()
        }
        .sheet(item: $model.socialSheet) { s in sheet(s).termSheet() }
        .task(id: LoadKey(source: model.source, server: model.serverURL?.absoluteString ?? "")) {
            await model.social.refresh()
        }
        // back on the tab after a while: refresh (the server keeps its own 5-minute cache)
        .onChange(of: model.tab) { _, t in
            guard t == .friends, !model.social.loading else { return }
            if model.social.fetchedAt.map({ Date().timeIntervalSince($0) > 60 }) ?? true {
                Task { await model.social.refresh() }
            }
        }
    }

    struct LoadKey: Hashable { var source: DataSource; var server: String }

    @ViewBuilder func sheet(_ s: SocialSheet) -> some View {
        switch s {
        case .setup: SocialSetupSheet(social: model.social)
        case .add: AddFriendSheet(social: model.social)
        case .accept(let id): AcceptSheet(social: model.social, id: id).presentationDetents([.large])
        case .share(let id): FriendSettingsSheet(social: model.social, id: id)
        case .comments(let f, let i): CommentsSheet(social: model.social, friend: f, itemId: i).presentationDetents([.medium, .large])
        }
    }
}

struct FriendsHome: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore

    var body: some View {
        Group {
            if model.socialService == nil {
                SocialNeedsServer()
            } else if let me = social.me {
                if me.enabled { content } else { setup }
            } else if let e = social.error {
                EmptyState(title: "COULDN'T LOAD FRIENDS", message: e, button: "RETRY") { Task { await social.refresh(fresh: true) } }
            } else {
                VStack(spacing: 10) {
                    ProgressView().tint(T.amber)
                    Cap("FETCHING FRIENDS…", T.dim, size: 11)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .screen()
        .toolbar(.hidden, for: .navigationBar)
    }

    var setup: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ScreenHeader(title: "FRIENDS", detail: "NOT SET UP")
                SocialSetupCard(social: social, editing: false)
            }
            .padding(14)
        }
        .refreshable { await social.refresh() }
    }

    var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                header
                if let e = social.error {
                    if social.fromCache { OfflineStrip(date: social.fetchedAt) } else { OfflineErrorStrip(text: e) }
                }
                Seg(options: sections, value: $model.socialSection, size: 10)
                ActionErrorStrip(social: social)
                switch model.socialSection {
                case .feed: FeedSection(social: social)
                case .friends: FriendsListSection(social: social)
                case .mine: MineSection(social: social)
                }
            }
            .padding(14)
        }
        .refreshable {
            await social.refresh(fresh: true)
            if model.socialSection == .mine { await social.loadMine() }
        }
    }

    var sections: [(SocialSection, String)] {
        let n: Int = social.incoming.count
        return [(.feed, "FEED"), (.friends, n > 0 ? "FRIENDS ●\(n)" : "FRIENDS"), (.mine, "MINE")]
    }

    var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("> FRIENDS").font(T.mono(15, .heavy)).foregroundStyle(T.amber)
            if let h = social.me?.handle { Cap("@" + h, T.dim, size: 10) }
            Spacer()
            if social.loading { ProgressView().controlSize(.mini).tint(T.amber) }
            Button { model.socialSheet = .setup } label: {
                Image(systemName: "person.crop.circle").font(.system(size: 17)).foregroundStyle(T.dim).frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Social profile")
            Bell(social: social) { model.socialPath.append(.notifications) }
        }
    }
}

/// Bell with the unread count.
struct Bell: View {
    @ObservedObject var social: SocialStore
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: social.unread > 0 ? "bell.fill" : "bell")
                    .font(.system(size: 16)).foregroundStyle(social.unread > 0 ? T.amber : T.dim)
                    .frame(width: 30, height: 30)
                if social.unread > 0 {
                    Text(social.unread > 9 ? "9+" : "\(social.unread)")
                        .font(T.mono(8, .heavy)).foregroundStyle(T.bg)
                        .padding(.horizontal, 3).frame(minWidth: 13, minHeight: 13)
                        .background(T.down)
                        .offset(x: 2, y: -1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(social.unread > 0 ? "Notifications, \(social.unread) unread" : "Notifications")
        .accessibilityIdentifier("bell")
    }
}

struct SocialNeedsServer: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ScreenHeader(title: "FRIENDS", detail: "NEEDS A SERVER")
                Panel(title: "FRIENDS", detail: "NEEDS A SERVER") {
                    Text(model.source == .direct ? "Friends aren't available in Direct mode." : "Not connected.")
                        .font(T.mono(13, .bold)).foregroundStyle(T.text)
                    Text("Each \(Brand.name) server is one person: friends are other people's servers, and your server is what talks to theirs (signed, server to server). Direct mode only has a Hevy API key on this phone, so there's nothing for friends to connect to.\n\nRun your own server and connect it in SETUP. Your training stays on your server; there's no central store of anyone's workouts.")
                        .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                    TermButton(title: "OPEN SETUP", style: .secondary) { model.showSetup() }.frame(width: 160)
                }
            }
            .padding(14)
        }
    }
}

// MARK: - setup

/// Handle, display name and directory listing, with what is (and isn't) shared.
struct SocialSetupCard: View {
    @ObservedObject var social: SocialStore
    var editing: Bool
    var onDone: () -> Void = {}

    @State private var handle = ""
    @State private var name = ""
    @State private var listed = true
    @State private var error: String?
    @State private var confirmUnlist = false
    @State private var loaded = false

    var handleOK: Bool { SocialFmt.validHandle(handle) }
    var canSave: Bool { handleOK && !name.trimmingCharacters(in: .whitespaces).isEmpty && !social.busy }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Panel(title: editing ? "YOUR SOCIAL PROFILE" : "SET UP FRIENDS", detail: editing ? "EDIT" : "OPT-IN") {
                if !editing {
                    Text("Follow friends' training on their own \(Brand.name) servers: sessions, PRs, streaks. React and comment.")
                        .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
                field("HANDLE", hint: handle.isEmpty || handleOK ? "a–z, 0–9, _ and -, 2–30 characters" : "Use a–z, 0–9, _ and -, start with a letter or digit, 2–30 characters") {
                    TermField(placeholder: "handle", text: $handle)
                        .onChange(of: handle) { _, v in let l = v.lowercased(); if l != v { handle = l } }
                        .accessibilityIdentifier("social-handle")
                }
                field("NAME", hint: "Shown to friends") {
                    TermField(placeholder: "Display name", text: $name, lowercase: false).accessibilityIdentifier("social-name")
                }
                Toggle(isOn: $listed) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("LIST ME IN THE DIRECTORY").font(T.mono(11, .bold)).foregroundStyle(T.text)
                        Text(listed ? "People can find you by searching your handle or name." : "Unlisted: people can still add you by exact handle or your server URL.")
                            .font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .tint(T.amber)
                if let e = error { Text(e).font(T.mono(10)).foregroundStyle(T.down).fixedSize(horizontal: false, vertical: true) }
                TermButton(title: social.busy ? "SAVING…" : (editing ? "SAVE" : "TURN ON FRIENDS"), style: .primary, disabled: !canSave) { save() }
                    .accessibilityIdentifier("social-save")
            }
            privacy
            if editing, let me = social.me { identity(me) }
        }
        .onAppear(perform: load)
        .onChange(of: social.me) { _, _ in load() }
    }

    func field<C: View>(_ label: String, hint: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Cap(label, T.dim, size: 9)
            c()
            Text(hint).font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
        }
    }

    var privacy: some View {
        Panel(title: "PRIVACY", detail: "WHAT'S SHARED") {
            VStack(alignment: .leading, spacing: 7) {
                bullet("Nothing is shared until you accept a friend. Each friend gets a share level you pick (BASIC by default) and can change any time.")
                bullet("Your training stays on your server. A friend's server fetches what you allow, directly from yours, with signed requests.")
                bullet("The directory only stores your handle, name, server URL and public key. No workouts, no friend lists.")
                bullet("Unfriending or lowering a level stops future fetches. Copies a friend already fetched can't be recalled.")
            }
        }
    }

    func bullet(_ s: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("·").font(T.mono(11, .bold)).foregroundStyle(T.amber)
            Text(s).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
        }
    }

    func identity(_ me: SocialMe) -> some View {
        Panel(title: "IDENTITY", detail: "THIS SERVER") {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                row("SERVER", me.server.map(SocialFmt.host) ?? "—")
                row("DIRECTORY", me.directory.map(SocialFmt.host) ?? "NONE (ADD BY URL ONLY)")
                row("KEY", me.fingerprint ?? "—")
            }
            Text("Friends see this key fingerprint when you connect. Compare it in person if you want to be sure.")
                .font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
            if me.listed == true {
                TermButton(title: "REMOVE FROM DIRECTORY", style: .danger) { confirmUnlist = true }
                    .confirmationDialog("Remove your handle from the directory? Existing friends keep working.", isPresented: $confirmUnlist, titleVisibility: .visible) {
                        Button("Remove from directory", role: .destructive) {
                            Task { error = await social.unregister(); if error == nil { listed = false } }
                        }
                    }
            }
        }
    }

    func row(_ k: String, _ v: String) -> some View {
        GridRow {
            Cap(k, T.faint, size: 9)
            Text(v).font(T.mono(10)).foregroundStyle(T.text).lineLimit(1).truncationMode(.middle)
        }
    }

    func load() {
        guard !loaded, social.me != nil else { return }
        loaded = true
        handle = social.me?.handle ?? ""
        name = social.me?.name ?? ""
        // first setup: listed by default (the server reports false until set up)
        listed = editing ? (social.me?.listed ?? true) : true
    }

    func save() {
        error = nil
        let n: String = name.trimmingCharacters(in: .whitespaces)
        Task {
            error = await social.setup(handle: handle, name: n, listed: listed)
            if error == nil { onDone() }
        }
    }
}

struct SocialSetupSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: social.enabled ? "SOCIAL PROFILE" : "SET UP FRIENDS") { model.socialSheet = nil }
            ScrollView {
                SocialSetupCard(social: social, editing: social.enabled) { model.socialSheet = nil }.padding(14)
            }
        }
        .background(T.panel.ignoresSafeArea())
    }
}

/// Title + DONE for sheets.
struct SheetBar: View {
    var title: String
    var done: String = "DONE"
    var action: () -> Void
    var body: some View {
        HStack {
            Cap(title, T.amber, size: 12, weight: .bold)
            Spacer()
            Button(done, action: action).font(T.mono(11, .bold)).foregroundStyle(T.amber)
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 6)
    }
}

// MARK: - feed

struct FeedSection: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore

    var body: some View {
        if social.feed.isEmpty {
            emptyFeed
        } else {
            if !social.staleIds.isEmpty {
                let n: Int = social.staleIds.count
                Cap("\(n) FRIEND\(n == 1 ? "" : "S") SHOWN FROM CACHE · PULL TO RETRY", T.faint, size: 8)
            }
            if !social.unreachable.isEmpty { unreachableNote }
            ForEach(social.feed, id: \.self.cardKey) { it in
                FeedCard(social: social, item: it, friend: it.author?.id, author: it.author,
                         stale: it.author.map { social.staleIds.contains($0.id) } ?? false)
            }
            if social.feedNext != nil {
                LoadMoreRow(loading: social.loadingMore) { await social.loadMoreFeed() }
            } else {
                Cap("— END OF FEED —", T.faint, size: 8).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
        }
    }

    var unreachableNote: some View {
        let names: [String] = social.unreachable.map { id in social.friend(id)?.author.display ?? id }
        return HStack(spacing: 4) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 9))
            Text("CAN'T REACH " + names.joined(separator: ", ").uppercased()).font(T.mono(8)).lineLimit(2)
        }
        .foregroundStyle(T.faint)
    }

    @ViewBuilder var emptyFeed: some View {
        if !social.unreachable.isEmpty { unreachableNote }
        Panel(title: "FEED", detail: "EMPTY") {
            if social.accepted.isEmpty {
                Text("No friends yet. Add someone by handle, by their server URL, or search the directory.")
                    .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                TermButton(title: "+ ADD A FRIEND", style: .primary) { model.socialSheet = .add }.frame(width: 180)
            } else {
                Text("Nothing from your friends yet. Sessions, PRs and achievements show up here.")
                    .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

extension FeedItem {
    var cardKey: String { SocialStore.key(self) }
}

// MARK: - my activity

struct MineSection: View {
    @ObservedObject var social: SocialStore

    var body: some View {
        Group {
            Cap("YOUR SESSIONS, PRS AND ACHIEVEMENTS · WHAT FRIENDS LEFT ON THEM", T.faint, size: 8)
            if social.mine.isEmpty {
                Panel(title: "MY ACTIVITY", detail: "EMPTY") {
                    Text("Your sessions, PRs and achievements appear here with the reactions and comments friends leave.")
                        .font(T.mono(11)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
            }
            ForEach(social.mine) { it in
                FeedCard(social: social, item: it, friend: nil, author: nil, showAuthor: false)
            }
            if social.mineNext != nil {
                LoadMoreRow(loading: social.loadingMore) { await social.loadMine(more: true) }
            }
        }
        .task { await social.loadMine() }
    }
}
