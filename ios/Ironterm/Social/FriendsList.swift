import SwiftUI

// MARK: - friends list

struct FriendsListSection: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    @State private var cancel: Friend?

    var body: some View {
        Group {
            TermButton(title: "+ ADD FRIEND", style: .primary) { model.socialSheet = .add }
                .accessibilityIdentifier("add-friend")
            if !social.incoming.isEmpty {
                Panel(title: "REQUESTS", detail: "\(social.incoming.count) WAITING") {
                    ForEach(social.incoming) { f in incomingRow(f) }
                }
            }
            Panel(title: "FRIENDS", detail: "\(social.accepted.count)") {
                if social.accepted.isEmpty {
                    Text("No friends yet.").font(T.mono(11)).foregroundStyle(T.faint)
                }
                ForEach(social.accepted) { f in friendRow(f) }
            }
            if !social.outgoing.isEmpty {
                Panel(title: "SENT", detail: "WAITING FOR THEM") {
                    ForEach(social.outgoing) { f in outgoingRow(f) }
                }
            }
        }
        .confirmationDialog("Cancel the friend request?", isPresented: Binding(get: { cancel != nil }, set: { if !$0 { cancel = nil } }), titleVisibility: .visible, presenting: cancel) { f in
            Button("Cancel request to \(f.author.display)", role: .destructive) { Task { await social.remove(f.id) } }
        }
    }

    func incomingRow(_ f: Friend) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            who(f)
            if let n = f.note, !n.isEmpty {
                Text("“\(n)”").font(T.mono(10)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                TermButton(title: "ACCEPT…", style: .primary) { model.socialSheet = .accept(f.id) }
                    .accessibilityIdentifier("accept-\(f.id)")
                TermButton(title: "REJECT", style: .danger, disabled: social.busy) { Task { await social.reject(f.id) } }
            }
        }
        .padding(.vertical, 4)
    }

    func friendRow(_ f: Friend) -> some View {
        NavRow(action: { model.socialPath.append(.profile(f.id)) }) {
            VStack(alignment: .leading, spacing: 4) {
                who(f)
                HStack(spacing: 8) {
                    Cap("YOU SHARE: " + f.share.title, T.amber, size: 8)
                    Cap(ShareLevel.theirLabel(f.theirShare), T.dim, size: 8)
                    Spacer(minLength: 0)
                    if let l = f.lastSeen { Cap("SEEN " + SocialFmt.ago(l), T.faint, size: 8) }
                }
            }
        }
        .padding(.vertical, 3)
        .accessibilityIdentifier("friend-\(f.id)")
    }

    func outgoingRow(_ f: Friend) -> some View {
        HStack(spacing: 8) {
            who(f)
            Spacer(minLength: 4)
            Badge(text: "PENDING", color: T.faint)
            Button { cancel = f } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(T.dim).frame(width: 26, height: 26) }
                .buttonStyle(.plain)
                .accessibilityLabel("Cancel request")
        }
    }

    func who(_ f: Friend) -> some View {
        HStack(spacing: 8) {
            Avatar(author: f.author, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(f.author.display).font(T.mono(12, .heavy)).foregroundStyle(T.text).lineLimit(1)
                Text(f.author.subtitle).font(T.mono(9)).foregroundStyle(T.faint).lineLimit(1)
            }
        }
    }
}

// MARK: - add friend

struct AddFriendSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore

    @State private var query = ""
    @State private var results: [DirectoryUser] = []
    @State private var searching = false
    @State private var searchError: String?
    @State private var target = ""
    @State private var note = ""
    @State private var share: ShareLevel = .basic
    @State private var error: String?
    @State private var sent: String?

    var hasDirectory: Bool { social.me?.hasDirectory ?? false }
    var parsed: SocialFmt.Target { SocialFmt.target(target) }

    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: "ADD FRIEND", done: "CLOSE") { model.socialSheet = nil }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    searchPanel
                    targetPanel
                    if let s = sent {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
                            Text(s).font(T.mono(11)).fixedSize(horizontal: false, vertical: true)
                        }
                        .foregroundStyle(T.up)
                    }
                }
                .padding(14)
            }
        }
        .background(T.panel.ignoresSafeArea())
        .task(id: query) { await search() }
    }

    var searchPanel: some View {
        Panel(title: "SEARCH THE DIRECTORY", detail: hasDirectory ? "LISTED PEOPLE" : "NO DIRECTORY") {
            if hasDirectory {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 11)).foregroundStyle(T.faint)
                    TextField("handle or name", text: $query)
                        .font(T.mono(13)).foregroundStyle(T.text).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("directory-search")
                    if searching { ProgressView().controlSize(.mini).tint(T.amber) }
                }
                .padding(.horizontal, 10).padding(.vertical, 9)
                .background(Color(hex: 0x0B0C0E)).overlay(Rectangle().stroke(T.line, lineWidth: 1))
                if let e = searchError { Text(e).font(T.mono(10)).foregroundStyle(T.down) }
                ForEach(results) { u in resultRow(u) }
                if query.count >= 2 && results.isEmpty && !searching && searchError == nil {
                    Text("Nobody listed matches. Unlisted people can still be added by exact handle.").font(T.mono(10)).foregroundStyle(T.faint)
                }
            } else {
                Text("Your server has no directory configured (SOCIAL_DIRECTORY). Add friends by their server URL.")
                    .font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    func resultRow(_ u: DirectoryUser) -> some View {
        let a = Author(id: u.id, server: u.server, handle: u.handle, name: u.name)
        let known: Bool = social.friends.contains { SocialFmt.origin($0.server) == SocialFmt.origin(u.server) }
        return Button { target = u.handle } label: {
            HStack(spacing: 8) {
                Avatar(author: a, size: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(a.display).font(T.mono(12, .bold)).foregroundStyle(T.text)
                    Text(a.subtitle).font(T.mono(9)).foregroundStyle(T.faint).lineLimit(1)
                }
                Spacer()
                if known { Cap("ADDED", T.faint, size: 8) } else {
                    Image(systemName: target == u.handle ? "checkmark.square.fill" : "plus.square").foregroundStyle(T.amber)
                }
            }
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(known)
    }

    var targetPanel: some View {
        Panel(title: "SEND A REQUEST", detail: "") {
            VStack(alignment: .leading, spacing: 4) {
                Cap("HANDLE OR SERVER URL", T.dim, size: 9)
                TermField(placeholder: hasDirectory ? "maya  or  gym.example.com" : "https://gym.example.com", text: $target, keyboard: .URL)
                    .accessibilityIdentifier("friend-target")
                Text(targetHint).font(T.mono(9)).foregroundStyle(parsed == .invalid && !target.isEmpty ? T.down : T.faint)
            }
            VStack(alignment: .leading, spacing: 4) {
                Cap("NOTE (OPTIONAL)", T.dim, size: 9)
                TermField(placeholder: "Hi, it's me from the gym", text: $note, lowercase: false)
                    .onChange(of: note) { _, v in if v.count > 140 { note = String(v.prefix(140)) } }
                Cap("\(note.count)/140", T.faint, size: 8)
            }
            VStack(alignment: .leading, spacing: 4) {
                Cap("WHAT THEY'LL SEE ONCE THEY ACCEPT", T.dim, size: 9)
                SharePicker(value: $share, compact: true)
            }
            if let e = error { Text(e).font(T.mono(10)).foregroundStyle(T.down).fixedSize(horizontal: false, vertical: true) }
            TermButton(title: social.busy ? "SENDING…" : "SEND REQUEST", style: .primary, disabled: !canSend) { send() }
                .accessibilityIdentifier("send-request")
        }
    }

    var targetHint: String {
        switch parsed {
        case .handle(let h): return hasDirectory ? "Looks up @\(h) in the directory." : "No directory: enter a server URL instead."
        case .server(let s): return "Sends the request straight to \(SocialFmt.host(s))."
        case .invalid: return target.isEmpty ? "A handle needs the directory; a server URL always works." : "That isn't a handle or a server URL."
        }
    }

    var canSend: Bool {
        if social.busy { return false }
        switch parsed {
        case .handle: return hasDirectory
        case .server: return true
        case .invalid: return false
        }
    }

    func search() async {
        let q: String = query.trimmingCharacters(in: .whitespaces)
        searchError = nil
        guard q.count >= 2 else { results = []; return }
        try? await Task.sleep(nanoseconds: 300_000_000) // debounce typing
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        do {
            let r = try await social.search(q)
            if !Task.isCancelled { results = r }
        } catch {
            if !Task.isCancelled { searchError = SocialStore.message(error) }
        }
    }

    func send() {
        error = nil
        sent = nil
        let t = parsed
        let n: String = note.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            if let e = await social.add(t, note: n.isEmpty ? nil : n, share: share) {
                error = e
            } else {
                sent = "Request sent. They'll show up under FRIENDS once they accept."
                target = ""; note = ""
            }
        }
    }
}

// MARK: - accept

struct AcceptSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var id: String
    @State private var share: ShareLevel = .basic

    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: "FRIEND REQUEST", done: "CLOSE") { model.socialSheet = nil }
            ScrollView {
                if let f = social.friend(id) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            Avatar(author: f.author, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.author.display).font(T.mono(15, .heavy)).foregroundStyle(T.text)
                                Text(f.author.subtitle).font(T.mono(10)).foregroundStyle(T.dim)
                            }
                        }
                        if let n = f.note, !n.isEmpty {
                            Text("“\(n)”").font(T.mono(11)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                        }
                        if let fp = f.fingerprint { Cap("KEY " + fp, T.faint, size: 9) }
                        Cap("WHAT \(f.author.display.uppercased()) CAN SEE", T.amber, size: 10, weight: .bold)
                        SharePicker(value: $share)
                        Text("You can change this any time. Accepting also lets you see what they share with you.")
                            .font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 10) {
                            TermButton(title: "REJECT", style: .danger, disabled: social.busy) {
                                Task { await social.reject(id); model.socialSheet = nil }
                            }
                            TermButton(title: social.busy ? "ACCEPTING…" : "ACCEPT AS \(share.title)", style: .primary, disabled: social.busy) {
                                Task { await social.accept(id, share: share); model.socialSheet = nil }
                            }
                            .accessibilityIdentifier("accept-confirm")
                        }
                    }
                    .padding(14)
                } else {
                    Text("This request is gone.").font(T.mono(11)).foregroundStyle(T.faint).padding(14)
                }
            }
        }
        .background(T.panel.ignoresSafeArea())
    }
}

// MARK: - per-friend settings

struct FriendSettingsSheet: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var social: SocialStore
    var id: String
    @State private var share: ShareLevel = .basic
    @State private var confirmUnfriend = false
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 0) {
            SheetBar(title: "SHARING", done: "CLOSE") { model.socialSheet = nil }
            ScrollView {
                if let f = social.friend(id) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            Avatar(author: f.author, size: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.author.display).font(T.mono(14, .heavy)).foregroundStyle(T.text)
                                Text(f.author.subtitle).font(T.mono(9)).foregroundStyle(T.dim)
                            }
                            Spacer()
                            Cap(ShareLevel.theirLabel(f.theirShare), T.dim, size: 8)
                        }
                        Cap("WHAT \(f.author.display.uppercased()) CAN SEE", T.amber, size: 10, weight: .bold)
                        SharePicker(value: $share)
                        Text("Lowering the level stops future fetches. Anything their server already fetched can't be recalled.")
                            .font(T.mono(9)).foregroundStyle(T.faint).fixedSize(horizontal: false, vertical: true)
                        TermButton(title: share == f.share ? "SAVED" : "SAVE AS \(share.title)", style: .primary, disabled: share == f.share) {
                            Task { await social.setShare(id, share: share) }
                        }
                        Divider1().padding(.vertical, 6)
                        if let fp = f.fingerprint {
                            Cap("THEIR KEY " + fp, T.faint, size: 9)
                        }
                        Cap("FRIENDS SINCE " + Fmt.dayLabel(String(f.since.prefix(10))), T.faint, size: 9)
                        TermButton(title: "UNFRIEND", style: .danger) { confirmUnfriend = true }
                            .accessibilityIdentifier("unfriend")
                    }
                    .padding(14)
                    .onAppear { if !loaded { loaded = true; share = f.share } }
                } else {
                    Text("Not a friend any more.").font(T.mono(11)).foregroundStyle(T.faint).padding(14)
                }
            }
        }
        .background(T.panel.ignoresSafeArea())
        .confirmationDialog("Unfriend \(social.friend(id)?.author.display ?? "")? They're told, both sides stop seeing each other, and their reactions and comments on your items are removed.",
                            isPresented: $confirmUnfriend, titleVisibility: .visible) {
            Button("Unfriend", role: .destructive) {
                Task {
                    await social.remove(id)
                    model.socialSheet = nil
                    model.socialPath = []
                }
            }
        }
    }
}
