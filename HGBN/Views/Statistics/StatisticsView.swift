import SwiftUI
import SwiftData
import Charts

struct StatisticsView: View {
    @Environment(\.modelContext) private var context
    @State private var period: StatsPeriod = .week

    private var summary: StatisticsSummary {
        StatisticsService(context: context).summary(for: period)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                let s = summary
                VStack(spacing: Theme.Metrics.largeSpacing) {
                    periodPicker
                    metricsGrid(s)
                    streaksCard(s)
                    episodesChart(s)
                    durationChart(s)
                    reasonsCard(s)
                    hourDistributionChart(s)
                    bestWorstCard(s)
                }
                .padding()
            }
            .background(Theme.Palette.secondaryBackground.ignoresSafeArea())
            .navigationTitle("Статистика")
        }
    }

    private var periodPicker: some View {
        Picker("Период", selection: $period) {
            ForEach(StatsPeriod.allCases) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
    }

    private func metricsGrid(_ s: StatisticsSummary) -> some View {
        VStack(spacing: Theme.Metrics.spacing) {
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: "\(s.totalEpisodes)", caption: "эпизодов", systemImage: "number")
                MetricTile(value: DurationFormatter.string(minutes: s.totalDurationMinutes), caption: "суммарно", systemImage: "clock")
            }
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: DurationFormatter.string(minutes: s.averageDurationMinutes), caption: "средняя длит.", systemImage: "timer")
                MetricTile(value: s.maxIntensity > 0 ? "\(s.maxIntensity)/10" : "—", caption: "макс. инт.", systemImage: "gauge.high")
            }
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: String(format: "%.1f", s.averageIntensity), caption: "средняя инт.", systemImage: "gauge.medium")
                MetricTile(value: "\(s.anxietyEpisodes)", caption: "тревога", systemImage: "wind")
            }
            HStack(spacing: Theme.Metrics.spacing) {
                MetricTile(value: String(format: "%.0f%%", s.anxietyHeadacheCorrelation * 100), caption: "тревога + напряжение", systemImage: "arrow.triangle.merge")
                Color.clear.frame(maxWidth: .infinity)
            }
        }
    }

    private func streaksCard(_ s: StatisticsSummary) -> some View {
        AppCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(s.noEpisodeStreak)")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Theme.Palette.accent)
                    Text("дней без эпизодов")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
                Spacer()
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(s.superDayStreak)")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Theme.Palette.accent)
                    Text("супер-дней подряд")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }
        }
    }

    @ViewBuilder
    private func episodesChart(_ s: StatisticsSummary) -> some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                SectionHeader(title: "Количество эпизодов")
                if s.episodesPerDay.isEmpty {
                    emptyChart
                } else {
                    Chart(s.episodesPerDay) { point in
                        LineMark(x: .value("День", point.date, unit: .day),
                                 y: .value("Эпизоды", point.value))
                        .foregroundStyle(Theme.Palette.accent)
                        PointMark(x: .value("День", point.date, unit: .day),
                                  y: .value("Эпизоды", point.value))
                        .foregroundStyle(Theme.Palette.accent)
                    }
                    .frame(height: 180)
                }
            }
        }
    }

    @ViewBuilder
    private func durationChart(_ s: StatisticsSummary) -> some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                SectionHeader(title: "Длительность по дням")
                if s.durationPerDay.isEmpty {
                    emptyChart
                } else {
                    Chart(s.durationPerDay) { point in
                        BarMark(x: .value("День", point.date, unit: .day),
                                y: .value("Минуты", point.value))
                        .foregroundStyle(Theme.Palette.accentSoft)
                        .cornerRadius(4)
                    }
                    .frame(height: 180)
                }
            }
        }
    }

    @ViewBuilder
    private func reasonsCard(_ s: StatisticsSummary) -> some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                SectionHeader(title: "Топ причин напряжения")
                if s.topHeadacheReasons.isEmpty {
                    emptyChart
                } else {
                    Chart(s.topHeadacheReasons) { share in
                        SectorMark(angle: .value("Доля", share.count), innerRadius: .ratio(0.6), angularInset: 1.5)
                            .foregroundStyle(by: .value("Причина", share.title))
                    }
                    .chartLegend(position: .bottom, alignment: .leading)
                    .frame(height: 200)
                }

                if !s.topAnxietyReasons.isEmpty {
                    Divider()
                    SectionHeader(title: "Топ причин тревоги")
                    ForEach(s.topAnxietyReasons) { share in
                        HStack {
                            Text(share.title).font(.subheadline)
                            Spacer()
                            Text("\(share.count)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.Palette.accent)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func hourDistributionChart(_ s: StatisticsSummary) -> some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                SectionHeader(title: "Распределение по времени суток")
                Chart(s.hourDistribution) { bucket in
                    BarMark(x: .value("Час", bucket.hour),
                            y: .value("Эпизоды", bucket.count))
                    .foregroundStyle(Theme.Palette.accent)
                }
                .chartXScale(domain: 0...23)
                .frame(height: 160)
            }
        }
    }

    private func bestWorstCard(_ s: StatisticsSummary) -> some View {
        AppCard {
            VStack(alignment: .leading, spacing: Theme.Metrics.spacing) {
                SectionHeader(title: "Лучшие и тяжёлые дни")
                statusRow(title: "Лучшие дни", days: s.bestDays)
                Divider()
                statusRow(title: "Тяжёлые дни", days: s.worstDays)
            }
        }
    }

    private func statusRow(title: String, days: [DaySummary]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.Palette.textSecondary)
            if days.isEmpty {
                Text("Нет данных").font(.caption).foregroundStyle(Theme.Palette.textSecondary)
            } else {
                ForEach(days.prefix(3)) { day in
                    HStack {
                        Image(systemName: day.dayStatus.iconName)
                            .foregroundStyle(Theme.statusColor(day.dayStatus))
                        Text(day.date.formatted(.dateTime.day().month()))
                            .font(.subheadline)
                        Spacer()
                        Text(day.dayStatus.title)
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                }
            }
        }
    }

    private var emptyChart: some View {
        Text("Недостаточно данных за период")
            .font(.subheadline)
            .foregroundStyle(Theme.Palette.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 120)
    }
}

#Preview {
    StatisticsView()
        .modelContainer(AppModelContainer.makePreview())
}
