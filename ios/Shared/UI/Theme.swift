import SwiftUI

/// Terminal palette, matching the web app (docs/api/README.md "Look").
enum T {
    static let bg = Color(hex: 0x000000)
    static let panel = Color(hex: 0x050506)
    static let line = Color(hex: 0x222428)
    static let text = Color(hex: 0xDCDCDC)
    static let dim = Color(hex: 0x8A8D93)
    static let faint = Color(hex: 0x55585E)
    static let amber = Color(hex: 0xFFB000)
    static let up = Color(hex: 0x8CB4FF)
    static let down = Color(hex: 0xFF6B5E)

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func deltaColor(_ d: Double?) -> Color {
        guard let d else { return faint }
        return d > 0 ? up : d < 0 ? down : dim
    }

    /// Readiness 0–1 → colour (red → amber → blue)
    static func readiness(_ r: Double) -> Color {
        r < 0.5 ? down : r < 0.8 ? amber : up
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Contribution graph ramps. Index = level 0–4; 1 is the lightest, 4 the darkest (same as the
/// original widgets). Blue is the Terminal ramp from the web app.
enum ColorTheme: String, CaseIterable, Identifiable, Codable {
    case blue, green, purple, orange

    var id: String { rawValue }
    var displayName: String { rawValue.uppercased() }

    var colors: [Color] {
        let empty = Color(hex: 0x16181D)
        switch self {
        case .blue: return [empty, Color(hex: 0x8CB4FF), Color(hex: 0x5082DC), Color(hex: 0x285AB4), Color(hex: 0x0F3278)]
        case .green: return [empty, Color(hex: 0x8CE6A0), Color(hex: 0x50B464), Color(hex: 0x28823C), Color(hex: 0x0F501E)]
        case .purple: return [empty, Color(hex: 0xC8A0FF), Color(hex: 0xA06EDC), Color(hex: 0x7846B4), Color(hex: 0x461E78)]
        case .orange: return [empty, Color(hex: 0xFFC88C), Color(hex: 0xE69650), Color(hex: 0xC86428), Color(hex: 0x8C3C0F)]
        }
    }

    func color(for level: Int) -> Color { colors[max(0, min(level, colors.count - 1))] }
}
