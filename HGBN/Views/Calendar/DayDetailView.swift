import SwiftUI
import SwiftData

struct DayDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings

    let date: Date
    @State private var showOverride = false

    private var service: DayService {
        DayService(context: context, thresholds: settings.thresholds)
    }

    private var episodes: [Episode] { service.episodes(on: date).filter { !$0.isActive } }
    private var anxieties: [AnxietyRecord] { service.anxietyRecords(on: date).filter { !$0.isActive } }

    private var summary: DaySummary? {
        service.fetchSummary(dayKey: DayKey.make(from: date))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Metrics.largeSpacing) {
                summaryCard
                timelineCard
                if !episodes.isEmpty { episodesSection }
                if !anxieties.isEmpty { anxietySection }
            }
            .padding()
        }
        .background(Theme.Palette.secondaryBackground.ignoresSafeArea())
        .navigationTitle(date.formatted(.dateTime.day().month(.wide)))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var result: DayStatusResult {
        let override = (summary?.manuallyOverridden ?? false) ? summary?.dayStatus : nil
        return service.computeResult(on: date, manualOverride: override)
    }

    private var summaryCard: some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                HStack {
                    DayStatusBadge(status: result.dayStatus)
                    Spacer()
                    if settings.manualDayOverrideEnabled {
                        Menu {
                            ForEach(DayStatus.allCases) { status in
                                Button(status.title) { service.overrideStatus(status, on: date) }
                            }
                            if summary?.manuallyOverridden == true {
                                Divider()
                                Button("Снять переопределение", role: .destructive) {
                                    service.overrideStatus(nil, on: date)
                                }
                            }
                        } label: {
                            Image(systemName: "slider.horizontal.3")
                                .foregroundStyle(Theme.Palette.accent)
                        }
                    }
                }
                Text(result.textualSummary)
                    .font(.subheadline)
                    .foregroundStyle(Theme.Palette.textSecondary)
                if summary?.manuallyOverridden == true {
                    Label("Статус задан вручную", systemImage: "hand.tap")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.accent)
                }
            }
        }
    }

    private var timelineCard: some View {
        VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
            SectionHeader(title: "Итоги дня")
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: "\(result.totalEpisodes)", caption: "эпизодов")
                MetricTile(value: DurationFormatter.string(minutes: result.totalDurationMinutes), caption: "длительность")
            }
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: result.maxIntensity > 0 ? "\(result.maxIntensity)/10" : "—", caption: "макс.")
                MetricTile(value: "\(result.anxietyCount)", caption: "тревога")
            }
        }
    }

    private var episodesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
            SectionHeader(title: "Эпизоды")
            ForEach(episodes) { episode in
                AppCard {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Label(episode.type.title, systemImage: episode.type.iconName)
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            Text("\(episode.intensity)/10")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.Palette.accent)
                        }
                        Text("\(episode.startTime.formatted(date: .omitted, time: .shortened)) · \(DurationFormatter.string(minutes: episode.durationMinutes))")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.textSecondary)
                        if let notes = episode.notes, !notes.isEmpty {
                            Text(notes)
                                .font(.caption)
                                .foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private var anxietySection: some View {
        VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
            SectionHeader(title: "Тревога")
            ForEach(anxieties) { record in
                AppCard {
                    HStack {
                        Label("Тревога", systemImage: "wind")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Text("\(record.intensity)/10 · \(DurationFormatter.string(minutes: record.durationMinutes))")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        DayDetailView(date: .now)
    }
    .environment(AppSettings())
    .modelContainer(AppModelContainer.makePreview())
}
