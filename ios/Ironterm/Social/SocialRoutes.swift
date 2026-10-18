import SwiftUI

/// Pushed screens of the FRIENDS tab.
enum SocialRoute: Hashable {
    case profile(String)
    case compare(String)
    case notifications
}

enum SocialSection: String, CaseIterable, Hashable {
    case feed, friends, mine
}

/// Sheets of the FRIENDS tab (one at a time, presented by FriendsRoot).
enum SocialSheet: Identifiable, Equatable {
    case setup
    case add
    case accept(String)
    case share(String)
    case comments(friend: String, item: String)

    var id: String {
        switch self {
        case .setup: return "setup"
        case .add: return "add"
        case .accept(let f): return "accept-" + f
        case .share(let f): return "share-" + f
        case .comments(let f, let i): return "comments-" + f + "-" + i
        }
    }
}

extension AppModel {
    /// Open a FRIENDS screen by name (launch argument `-socialScreen`, notification link).
    func openSocial(_ name: String) {
        tab = .friends
        let friendId: String = demo ? DemoSocial.maya.id : (social.accepted.first?.id ?? "")
        switch name.lowercased() {
        case "feed": socialPath = []; socialSection = .feed
        case "friends": socialPath = []; socialSection = .friends
        case "mine": socialPath = []; socialSection = .mine
        case "add": socialPath = []; socialSection = .friends; socialSheet = .add
        case "accept": socialPath = []; socialSection = .friends; socialSheet = .accept(demo ? DemoSocial.priya.id : (social.incoming.first?.id ?? ""))
        case "notifications": socialPath = [.notifications]
        case "setup": socialPath = []; socialSheet = .setup
        case "profile": if !friendId.isEmpty { socialPath = [.profile(friendId)] }
        case "compare": if !friendId.isEmpty { socialPath = [.profile(friendId), .compare(friendId)] }
        case "share": if !friendId.isEmpty { socialPath = [.profile(friendId)]; socialSheet = .share(friendId) }
        case "comments": socialPath = []; socialSection = .feed; socialSheet = .comments(friend: DemoSocial.maya.id, item: "w:m-1042")
        default: break
        }
    }
}

/// Square initial in the terminal style; the colour is stable per person.
struct Avatar: View {
    var author: Author
    var size: CGFloat = 30

    static let palette: [Color] = [T.up, T.amber, Color(hex: 0xC8A0FF), Color(hex: 0x8CE6A0), Color(hex: 0xFFC88C)]

    var color: Color {
        var h: Int = 0
        for u in author.server.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0xFFFF }
        return Self.palette[h % Self.palette.count]
    }

    var letter: String {
        let s: String = author.name ?? author.handle ?? SocialFmt.host(author.server)
        return String(s.prefix(1)).uppercased()
    }

    var body: some View {
        Text(letter)
            .font(T.mono(size * 0.5, .heavy))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.12))
            .overlay(Rectangle().stroke(color.opacity(0.7), lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/// Small "from cache" marker for friends the server couldn't reach just now.
struct StaleMark: View {
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "clock.arrow.circlepath").font(.system(size: 8, weight: .bold))
            Cap("CACHED", T.faint, size: 8)
        }
        .foregroundStyle(T.faint)
        .accessibilityLabel("Shown from cache")
    }
}

/// Picker for a share level with what each level shows.
struct SharePicker: View {
    @Binding var value: ShareLevel
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if compact {
                Seg(options: ShareLevel.allCases.map { ($0, $0.title) }, value: $value, size: 10)
                Text(value.summary).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(ShareLevel.allCases) { l in row(l) }
            }
        }
    }

    func row(_ l: ShareLevel) -> some View {
        let on: Bool = value == l
        return Button { value = l } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 14)).foregroundStyle(on ? T.amber : T.faint)
                VStack(alignment: .leading, spacing: 3) {
                    Text(l.title).font(T.mono(12, .heavy)).foregroundStyle(on ? T.amber : T.text)
                    Text(l.detail).font(T.mono(10)).foregroundStyle(T.dim).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .background(on ? T.amber.opacity(0.07) : Color.clear)
            .overlay(Rectangle().stroke(on ? T.amber.opacity(0.6) : T.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("share-\(l.rawValue)")
    }
}

/// Text field in the terminal style.
struct TermField: View {
    var placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var lowercase = true

    var body: some View {
        TextField(placeholder, text: $text)
            .font(T.mono(13)).foregroundStyle(T.text)
            .keyboardType(keyboard)
            .textInputAutocapitalization(lowercase ? .never : .words)
            .autocorrectionDisabled()
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(Color(hex: 0x0B0C0E))
            .overlay(Rectangle().stroke(T.line, lineWidth: 1))
    }
}

/// Dismissible strip for a failed action.
struct ActionErrorStrip: View {
    @ObservedObject var social: SocialStore
    var body: some View {
        if let e = social.actionError {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 10)).foregroundStyle(T.down)
                Text(e).font(T.mono(10)).foregroundStyle(T.text).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Button { social.actionError = nil } label: { Image(systemName: "xmark").font(.system(size: 10, weight: .bold)) }
                    .foregroundStyle(T.dim)
                    .accessibilityLabel("Dismiss")
            }
            .padding(8)
            .background(T.down.opacity(0.1))
            .overlay(Rectangle().stroke(T.down.opacity(0.5), lineWidth: 1))
        }
    }
}
