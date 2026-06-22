import Foundation
import SwiftData

/// Период агрегации статистики.
enum StatsPeriod: String, CaseIterable, Identifiable {
    case day, week, month, year
    var id: String { rawValue }
    var title: String {
        switch self {
        case .day: return "День"
        case .week: return "Неделя"
        case .month: return "Месяц"
        case .year: return "Год"
        }
    }
}

/// Точка временного ряда для графиков.
struct TimePoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

/// Доля причины для pie/donut chart.
struct ReasonShare: Identifiable {
    let id: UUID
    let title: String
    let count: Int
}

/// Распределение по времени суток.
struct HourBucket: Identifiable {
    let id = UUID()
    let hour: Int
    let count: Int
}

/// Сводка статистики за период.
struct StatisticsSummary {
    var totalEpisodes = 0
    var totalDurationMinutes = 0
    var averageDurationMinutes = 0
    var maxIntensity = 0
    var averageIntensity = 0.0
    var anxietyEpisodes = 0
    var anxietyHeadacheCorrelation = 0.0
    var episodesPerDay: [TimePoint] = []
    var durationPerDay: [TimePoint] = []
    var topHeadacheReasons: [ReasonShare] = []
    var topAnxietyReasons: [ReasonShare] = []
    var hourDistribution: [HourBucket] = []
    var bestDays: [DaySummary] = []
    var worstDays: [DaySummary] = []
    var noEpisodeStreak = 0
    var superDayStreak = 0
}

/// Считает агрегированную статистику из хранилища.
struct StatisticsService {
    let context: ModelContext
    var calendar: Calendar = .current

    func interval(for period: StatsPeriod, anchor: Date = .now) -> DateInterval {
        let comp: Calendar.Component
        switch period {
        case .day: comp = .day
        case .week: comp = .weekOfYear
        case .month: comp = .month
        case .year: comp = .year
        }
        return calendar.dateInterval(of: comp, for: anchor)
            ?? DateInterval(start: anchor, duration: 86400)
    }

    func summary(for period: StatsPeriod, anchor: Date = .now) -> StatisticsSummary {
        let range = interval(for: period, anchor: anchor)
        let episodes = fetchEpisodes(in: range)
        let anxiety = fetchAnxiety(in: range)
        let reasons = allReasons()

        var s = StatisticsSummary()
        s.totalEpisodes = episodes.count
        s.totalDurationMinutes = episodes.reduce(0) { $0 + $1.durationMinutes }
        s.averageDurationMinutes = episodes.isEmpty ? 0 : s.totalDurationMinutes / episodes.count
        s.maxIntensity = episodes.map(\.intensity).max() ?? 0
        s.averageIntensity = episodes.isEmpty ? 0 : Double(episodes.map(\.intensity).reduce(0, +)) / Double(episodes.count)
        s.anxietyEpisodes = anxiety.count

        s.episodesPerDay = groupByDay(episodes) { _ in 1 }
        s.durationPerDay = groupByDay(episodes) { Double($0.durationMinutes) }
        s.topHeadacheReasons = topReasons(from: episodes.flatMap(\.reasonIDs), reasons: reasons)
        s.topAnxietyReasons = topReasons(from: anxiety.flatMap(\.reasonIDs), reasons: reasons)
        s.hourDistribution = hourDistribution(episodes)
        s.anxietyHeadacheCorrelation = correlation(episodes: episodes, anxiety: anxiety, range: range)

        let summaries = fetchSummaries(in: range)
        s.bestDays = summaries.filter { $0.dayStatus <= .good }.sorted { $0.dayStatus < $1.dayStatus }
        s.worstDays = summaries.filter { $0.dayStatus >= .bad }.sorted { $0.dayStatus > $1.dayStatus }
        s.noEpisodeStreak = currentStreak(predicate: { $0.totalEpisodes == 0 })
        s.superDayStreak = currentStreak(predicate: { $0.dayStatus == .superDay })
        return s
    }

    // MARK: - Выборки

    private func fetchEpisodes(in range: DateInterval) -> [Episode] {
        let start = range.start, end = range.end
        let predicate = #Predicate<Episode> { $0.startTime >= start && $0.startTime < end && $0.endTime != nil }
        return (try? context.fetch(FetchDescriptor<Episode>(predicate: predicate))) ?? []
    }

    private func fetchAnxiety(in range: DateInterval) -> [AnxietyRecord] {
        let start = range.start, end = range.end
        let predicate = #Predicate<AnxietyRecord> { $0.startTime >= start && $0.startTime < end && $0.endTime != nil }
        return (try? context.fetch(FetchDescriptor<AnxietyRecord>(predicate: predicate))) ?? []
    }

    private func fetchSummaries(in range: DateInterval) -> [DaySummary] {
        let start = range.start, end = range.end
        let predicate = #Predicate<DaySummary> { $0.date >= start && $0.date < end }
        return (try? context.fetch(FetchDescriptor<DaySummary>(predicate: predicate))) ?? []
    }

    private func allReasons() -> [Reason] {
        (try? context.fetch(FetchDescriptor<Reason>())) ?? []
    }

    // MARK: - Агрегации

    private func groupByDay(_ episodes: [Episode], value: (Episode) -> Double) -> [TimePoint] {
        var buckets: [Date: Double] = [:]
        for ep in episodes {
            let day = calendar.startOfDay(for: ep.startTime)
            buckets[day, default: 0] += value(ep)
        }
        return buckets.map { TimePoint(date: $0.key, value: $0.value) }
            .sorted { $0.date < $1.date }
    }

    private func topReasons(from ids: [UUID], reasons: [Reason], limit: Int = 5) -> [ReasonShare] {
        var counts: [UUID: Int] = [:]
        for id in ids { counts[id, default: 0] += 1 }
        let byId = Dictionary(uniqueKeysWithValues: reasons.map { ($0.id, $0) })
        return counts.compactMap { (id, count) -> ReasonShare? in
            guard let reason = byId[id] else { return nil }
            return ReasonShare(id: id, title: reason.title, count: count)
        }
        .sorted { $0.count > $1.count }
        .prefix(limit)
        .map { $0 }
    }

    private func hourDistribution(_ episodes: [Episode]) -> [HourBucket] {
        var counts: [Int: Int] = [:]
        for ep in episodes {
            let hour = calendar.component(.hour, from: ep.startTime)
            counts[hour, default: 0] += 1
        }
        return (0..<24).map { HourBucket(hour: $0, count: counts[$0] ?? 0) }
    }

    /// Доля дней, где тревога и напряжение встречались вместе.
    private func correlation(episodes: [Episode], anxiety: [AnxietyRecord], range: DateInterval) -> Double {
        let episodeDays = Set(episodes.map { calendar.startOfDay(for: $0.startTime) })
        let anxietyDays = Set(anxiety.map { calendar.startOfDay(for: $0.startTime) })
        let union = episodeDays.union(anxietyDays)
        guard !union.isEmpty else { return 0 }
        let both = episodeDays.intersection(anxietyDays)
        return Double(both.count) / Double(union.count)
    }

    /// Текущая серия дней подряд (от сегодня назад), удовлетворяющих условию.
    private func currentStreak(predicate: (DaySummary) -> Bool) -> Int {
        let all = (try? context.fetch(FetchDescriptor<DaySummary>(sortBy: [SortDescriptor(\.dayKey, order: .reverse)]))) ?? []
        let byKey = Dictionary(uniqueKeysWithValues: all.map { ($0.dayKey, $0) })
        var streak = 0
        var cursor = calendar.startOfDay(for: .now)
        while true {
            let key = DayKey.make(from: cursor, calendar: calendar)
            guard let summary = byKey[key], predicate(summary) else { break }
            streak += 1
            guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return streak
    }
}
