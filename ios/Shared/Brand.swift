/// The product name, in one place. Renaming the app = change `name` here and APP_DISPLAY_NAME in
/// the project build settings (used by both Info.plists for CFBundleDisplayName).
/// Mentions of Hevy as the data source ("Hevy API key") are factual and stay as they are.
enum Brand {
    static let name = "Ironterm"

    static var upper: String { name.uppercased() }
}
