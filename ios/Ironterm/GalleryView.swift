import SwiftUI
import WidgetKit

/// Every widget kind × family, rendered with the same views the extension uses. Shared by the
/// in-app gallery and the ImageRenderer snapshot test.
enum WidgetCatalog {
    struct Item: Identifiable {
        var kind: String
        var family: WidgetFamily
        var variant: String = ""
        var id: String { "\(kind)-\(familyName)\(variant.isEmpty ? "" : "-\(variant)")" }
        var familyName: String { WidgetCatalog.name(family) }
    }

    static func name(_ f: WidgetFamily) -> String {
        switch f {
        case .systemSmall: return "small"
        case .systemMedium: return "medium"
        case .systemLarge: return "large"
        case .systemExtraLarge: return "extraLarge"
        case .accessoryCircular: return "circular"
        case .accessoryRectangular: return "rectangular"
        case .accessoryInline: return "inline"
        default: return "other"
        }
    }

    /// Point sizes of an iPhone 17/18 Pro class device (402 pt wide) and iPad for extra large.
    static func size(_ f: WidgetFamily) -> CGSize {
        switch f {
        case .systemSmall: return CGSize(width: 170, height: 170)
        case .systemMedium: return CGSize(width: 364, height: 170)
        case .systemLarge: return CGSize(width: 364, height: 382)
        case .systemExtraLarge: return CGSize(width: 715, height: 342)
        case .accessoryCircular: return CGSize(width: 72, height: 72)
        case .accessoryRectangular: return CGSize(width: 172, height: 76)
        default: return CGSize(width: 257, height: 26)
        }
    }

    static let kinds: [(kind: String, title: String, families: [WidgetFamily])] = [
        ("activity", "ACTIVITY GRAPH", [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge]),
        ("next", "NEXT WORKOUT", [.systemSmall, .systemMedium, .systemLarge]),
        ("week", "THIS WEEK", [.systemSmall, .systemMedium]),
        ("lifts", "LIFTS", [.systemSmall, .systemMedium, .systemLarge]),
        ("recovery", "RECOVERY", [.systemSmall, .systemMedium]),
        ("lock", "LOCK SCREEN", [.accessoryCircular, .accessoryRectangular, .accessoryInline]),
    ]

    static var all: [Item] {
        var out: [Item] = []
        for k in kinds {
            for f in k.families { out.append(Item(kind: k.kind, family: f)) }
        }
        out.append(Item(kind: "lock", family: .accessoryCircular, variant: "streak"))
        return out
    }

    @ViewBuilder static func content(_ item: Item, data: WidgetData, theme: ColorTheme, lift: String? = nil) -> some View {
        switch item.kind {
        case "activity": ActivityWidgetView(data: data, family: item.family, theme: theme)
        case "next": NextWorkoutWidgetView(data: data, family: item.family)
        case "week": WeekWidgetView(data: data, family: item.family)
        case "lifts": LiftsWidgetView(data: data, family: item.family, liftKey: lift)
        case "recovery": RecoveryWidgetView(data: data, family: item.family)
        default: LockWidgetView(data: data, family: item.family, circular: item.variant == "streak" ? .streak : .week)
        }
    }

    /// The widget as it appears on screen: padded content on the Terminal background, or for the
    /// lock screen, white-on-wallpaper.
    @ViewBuilder static func frame(_ item: Item, data: WidgetData, theme: ColorTheme, lift: String? = nil) -> some View {
        let size = size(item.family)
        if item.kind == "lock" {
            content(item, data: data, theme: theme, lift: lift)
                .foregroundStyle(.white)
                .frame(width: size.width, height: size.height, alignment: item.family == .accessoryInline ? .leading : .center)
                .environment(\.colorScheme, .dark)
        } else {
            content(item, data: data, theme: theme, lift: lift)
                .padding(WidgetPad.of(item.family))
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .background(T.bg)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(T.line, lineWidth: 1))
                .environment(\.colorScheme, .dark)
        }
    }
}

struct GalleryView: View {
    @EnvironmentObject var model: AppModel
    @State private var dataset = 0 // 0 = mine (or sample), 1 = sample server, 2 = sample direct

    var data: WidgetData {
        switch dataset {
        case 1: return .sample
        case 2: return .directSample
        default:
            if let s = model.snapshot { return WidgetData(snapshot: s, source: model.source, error: nil) }
            return .sample
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 0) {
                    ForEach([(0, model.snapshot == nil || model.demo ? "SAMPLE" : "MY DATA"), (1, "SERVER DEMO"), (2, "DIRECT DEMO")], id: \.0) { i, t in
                        Button { dataset = i } label: {
                            Text(t).font(T.mono(10, .bold)).foregroundStyle(dataset == i ? T.bg : T.dim)
                                .frame(maxWidth: .infinity).padding(.vertical, 7).background(dataset == i ? T.amber : Color.clear)
                        }.buttonStyle(.plain)
                    }
                }
                .overlay(Rectangle().stroke(T.line, lineWidth: 1))

                ForEach(WidgetCatalog.kinds, id: \.kind) { k in
                    VStack(alignment: .leading, spacing: 10) {
                        Cap(k.title, T.amber, size: 11, weight: .bold)
                        let items = WidgetCatalog.all.filter { $0.kind == k.kind }
                        if k.kind == "lock" {
                            LockPreview(items: items, data: data, theme: model.theme)
                        } else {
                            ForEach(items) { item in
                                VStack(alignment: .leading, spacing: 4) {
                                    Cap(item.familyName, T.faint, size: 9)
                                    if item.family == .systemExtraLarge {
                                        Scaled(size: WidgetCatalog.size(item.family)) { WidgetCatalog.frame(item, data: data, theme: model.theme) }
                                    } else {
                                        WidgetCatalog.frame(item, data: data, theme: model.theme)
                                    }
                                }
                            }
                        }
                    }
                    Divider1()
                }
            }
            .padding(14)
        }
        .background(T.bg)
        .navigationTitle("")
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) { Cap("WIDGET GALLERY", T.text, size: 12, weight: .bold) }
        }
    }
}

/// Lock screen widgets on a wallpaper-ish background.
struct LockPreview: View {
    var items: [WidgetCatalog.Item]
    var data: WidgetData
    var theme: ColorTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let inline = items.first(where: { $0.family == .accessoryInline }) {
                WidgetCatalog.frame(inline, data: data, theme: theme).font(.system(size: 15, weight: .semibold))
            }
            HStack(spacing: 12) {
                ForEach(items.filter { $0.family == .accessoryCircular }) { WidgetCatalog.frame($0, data: data, theme: theme) }
                if let r = items.first(where: { $0.family == .accessoryRectangular }) { WidgetCatalog.frame(r, data: data, theme: theme) }
            }
            Cap("INLINE · CIRCULAR (WEEK, STREAK) · RECTANGULAR", T.faint, size: 8)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: 0x1C2A44), Color(hex: 0x3B2340)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

/// Scales a fixed-size view down to the available width (for the iPad-only extra large widget).
struct Scaled<Content: View>: View {
    var size: CGSize
    @ViewBuilder var content: Content

    var body: some View {
        GeometryReader { geo in
            let k = min(1, geo.size.width / size.width)
            content
                .frame(width: size.width, height: size.height)
                .scaleEffect(k, anchor: .topLeading)
        }
        .aspectRatio(size.width / size.height, contentMode: .fit)
    }
}
