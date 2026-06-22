import SwiftUI
import SwiftData

@main
struct HGBNApp: App {
    @State private var settings = AppSettings()
    private let container = AppModelContainer.makeShared()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .tint(Theme.Palette.accent)
        }
        .modelContainer(container)
    }
}
