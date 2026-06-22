import SwiftUI

/// Корневая навигация — четыре основных раздела.
struct RootView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Сегодня", systemImage: "house") }

            CalendarView()
                .tabItem { Label("Календарь", systemImage: "calendar") }

            StatisticsView()
                .tabItem { Label("Статистика", systemImage: "chart.bar") }

            SettingsView()
                .tabItem { Label("Настройки", systemImage: "gearshape") }
        }
        .tint(Theme.Palette.accent)
        .preferredColorScheme(settings.preferredColorScheme)
    }
}

#Preview {
    RootView()
        .environment(AppSettings())
        .modelContainer(AppModelContainer.makePreview())
}
