import SwiftUI
import SwiftData

struct HomeView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings

    @Query(filter: #Predicate<Episode> { $0.endTime == nil }, sort: \Episode.startTime, order: .reverse)
    private var activeEpisodes: [Episode]

    @Query(filter: #Predicate<AnxietyRecord> { $0.endTime == nil }, sort: \AnxietyRecord.startTime, order: .reverse)
    private var activeAnxieties: [AnxietyRecord]

    @State private var episodeToFinish: Episode?
    @State private var showManualEpisode = false
    @State private var showAnxiety = false

    private var activeEpisode: Episode? { activeEpisodes.first }
    private var activeAnxiety: AnxietyRecord? { activeAnxieties.first }

    private var service: DayService {
        DayService(context: context, thresholds: settings.thresholds)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Metrics.largeSpacing) {
                    captureCard
                    if settings.anxietyTrackingEnabled {
                        anxietyCard
                    }
                    todayStatusCard
                    todayStatsCard
                }
                .padding()
            }
            .background(Theme.Palette.secondaryBackground.ignoresSafeArea())
            .navigationTitle("Сегодня")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showManualEpisode = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .tint(Theme.Palette.accent)
                }
            }
            .sheet(item: $episodeToFinish) { episode in
                EpisodeFormView(mode: .finish(episode))
            }
            .sheet(isPresented: $showManualEpisode) {
                EpisodeFormView(mode: .create)
            }
            .sheet(isPresented: $showAnxiety) {
                AnxietyFormView(active: activeAnxiety)
            }
        }
    }

    // MARK: - Карточка фиксации

    @ViewBuilder
    private var captureCard: some View {
        AppCard {
            VStack(spacing: Theme.Metrics.spacing) {
                if let episode = activeEpisode {
                    VStack(spacing: 8) {
                        Text("Идёт эпизод")
                            .font(.subheadline)
                            .foregroundStyle(Theme.Palette.textSecondary)
                        TimelineView(.periodic(from: .now, by: 1)) { _ in
                            Text(elapsedString(since: episode.startTime))
                                .font(.system(size: 44, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Theme.Palette.accent)
                        }
                    }
                    PrimaryButton(title: "Завершить эпизод", systemImage: "stop.circle") {
                        finish(episode)
                    }
                } else {
                    Text("Зафиксируйте начало эпизода за пару касаний")
                        .font(.subheadline)
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    PrimaryButton(title: "Начался эпизод", systemImage: "play.circle") {
                        start()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var anxietyCard: some View {
        AppCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(activeAnxiety == nil ? "Тревога" : "Идёт тревога")
                        .font(.headline)
                    Text(activeAnxiety == nil ? "Зафиксировать тревожный эпизод" : "Открыть и завершить")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                Button {
                    showAnxiety = true
                } label: {
                    Image(systemName: activeAnxiety == nil ? "wind" : "stop.circle")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .frame(width: 52, height: 52)
                        .background(Theme.Palette.accentSoft)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var todayStatusCard: some View {
        let result = service.computeResult(on: .now, manualOverride: storedOverride)
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                HStack {
                    SectionHeader(title: "Статус дня")
                    Spacer()
                    DayStatusBadge(status: result.dayStatus)
                }
                Text(result.textualSummary)
                    .font(.subheadline)
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var todayStatsCard: some View {
        let result = service.computeResult(on: .now, manualOverride: storedOverride)
        VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
            SectionHeader(title: "Сегодня")
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: "\(result.totalEpisodes)", caption: "эпизодов", systemImage: "number")
                MetricTile(value: DurationFormatter.string(minutes: result.totalDurationMinutes), caption: "длительность", systemImage: "clock")
            }
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: result.maxIntensity > 0 ? "\(result.maxIntensity)/10" : "—", caption: "макс. интенсивность", systemImage: "gauge.high")
                MetricTile(value: "\(result.anxietyCount)", caption: "тревога", systemImage: "wind")
            }
        }
    }

    // MARK: - Действия

    private var storedOverride: DayStatus? {
        let key = DayKey.make(from: .now)
        guard let summary = service.fetchSummary(dayKey: key), summary.manuallyOverridden else { return nil }
        return summary.dayStatus
    }

    private func start() {
        let episode = Episode(startTime: .now, endTime: nil)
        context.insert(episode)
        try? context.save()
    }

    private func finish(_ episode: Episode) {
        episode.endTime = .now
        episode.updatedAt = .now
        try? context.save()
        episodeToFinish = episode
    }

    private func elapsedString(since start: Date) -> String {
        let total = max(0, Int(Date.now.timeIntervalSince(start)))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }
}

#Preview {
    HomeView()
        .environment(AppSettings())
        .modelContainer(AppModelContainer.makePreview())
}
