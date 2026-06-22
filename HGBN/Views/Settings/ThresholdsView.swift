import SwiftUI

/// Редактор порогов оценки дня. Меняет значения в AppSettings.thresholds.
struct ThresholdsView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Form {
            Section("Короткий и слабый эпизод") {
                stepper("Короткий эпизод, мин", value: \.shortEpisodeMinutes, range: 5...60, step: 5)
                stepper("Низкая интенсивность", value: \.lowIntensity, range: 1...9)
            }

            Section("Хороший день") {
                stepper("Макс. эпизодов", value: \.goodMaxEpisodes, range: 1...10)
                stepper("Суммарно, мин", value: \.goodTotalDurationMinutes, range: 15...180, step: 15)
            }

            Section("Тяжёлый день") {
                stepper("Один эпизод дольше, мин", value: \.terribleSingleEpisodeMinutes, range: 30...300, step: 15)
                stepper("Суммарно дольше, мин", value: \.terribleTotalDurationMinutes, range: 60...360, step: 15)
            }

            Section("Очень тяжёлый день") {
                stepper("Суммарно дольше, мин", value: \.nightmareTotalDurationMinutes, range: 180...600, step: 30)
            }

            Section {
                Button("Сбросить к значениям по умолчанию") {
                    settings.thresholds = .default
                }
                .tint(Theme.Palette.accent)
            }
        }
        .navigationTitle("Пороги оценки")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func stepper(_ title: String, value keyPath: WritableKeyPath<DayThresholds, Int>, range: ClosedRange<Int>, step: Int = 1) -> some View {
        Stepper(value: Binding(
            get: { settings.thresholds[keyPath: keyPath] },
            set: { settings.thresholds[keyPath: keyPath] = $0 }
        ), in: range, step: step) {
            HStack {
                Text(title)
                Spacer()
                Text("\(settings.thresholds[keyPath: keyPath])")
                    .foregroundStyle(Theme.Palette.accent)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ThresholdsView()
    }
    .environment(AppSettings())
}
