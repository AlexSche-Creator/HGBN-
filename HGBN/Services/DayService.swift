import Foundation
import SwiftData

/// Связывает хранилище и чистый расчёт дня: собирает эпизоды/тревогу за день,
/// пересчитывает статус и обновляет DaySummary.
struct DayService {
    let context: ModelContext
    var thresholds: DayThresholds = .default
    var calendar: Calendar = .current

    // MARK: - Выборка за день

    func episodes(on date: Date) -> [Episode] {
        let start = calendar.startOfDay(for: date)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return [] }
        let predicate = #Predicate<Episode> { $0.startTime >= start && $0.startTime < end }
        let descriptor = FetchDescriptor<Episode>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.startTime)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func anxietyRecords(on date: Date) -> [AnxietyRecord] {
        let start = calendar.startOfDay(for: date)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return [] }
        let predicate = #Predicate<AnxietyRecord> { $0.startTime >= start && $0.startTime < end }
        let descriptor = FetchDescriptor<AnxietyRecord>(
            predicate: predicate,
            sortBy: [SortDescriptor(\.startTime)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    // MARK: - Активные записи

    func activeEpisode() -> Episode? {
        let predicate = #Predicate<Episode> { $0.endTime == nil }
        var descriptor = FetchDescriptor<Episode>(predicate: predicate, sortBy: [SortDescriptor(\.startTime, order: .reverse)])
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    func activeAnxiety() -> AnxietyRecord? {
        let predicate = #Predicate<AnxietyRecord> { $0.endTime == nil }
        var descriptor = FetchDescriptor<AnxietyRecord>(predicate: predicate, sortBy: [SortDescriptor(\.startTime, order: .reverse)])
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    // MARK: - Пересчёт дня

    /// Готовит данные дня для расчёта (учитывает только завершённые записи).
    func computeResult(on date: Date, manualOverride: DayStatus? = nil) -> DayStatusResult {
        let dayEpisodes = episodes(on: date).filter { !$0.isActive }
        let dayAnxiety = anxietyRecords(on: date).filter { !$0.isActive }

        let episodeInputs = dayEpisodes.map {
            EpisodeInput(
                intensity: $0.intensity,
                durationMinutes: $0.durationMinutes,
                isDayLong: $0.dayLongFlag != .none
            )
        }
        let anxietyInputs = dayAnxiety.map {
            AnxietyInput(intensity: $0.intensity, durationMinutes: $0.durationMinutes)
        }

        return DayStatusCalculator.calculate(
            episodes: episodeInputs,
            anxiety: anxietyInputs,
            manualOverride: manualOverride,
            thresholds: thresholds
        )
    }

    /// Создаёт или обновляет DaySummary для дня, сохраняя ручное переопределение.
    @discardableResult
    func recalculate(on date: Date) -> DaySummary {
        let dayKey = DayKey.make(from: date, calendar: calendar)
        let summary = fetchSummary(dayKey: dayKey) ?? {
            let new = DaySummary(dayKey: dayKey, date: calendar.startOfDay(for: date))
            context.insert(new)
            return new
        }()

        let override = summary.manuallyOverridden ? summary.dayStatus : nil
        let result = computeResult(on: date, manualOverride: override)

        summary.totalEpisodes = result.totalEpisodes
        summary.totalDurationMinutes = result.totalDurationMinutes
        summary.maxIntensity = result.maxIntensity
        summary.averageIntensity = result.averageIntensity
        summary.anxietyEpisodes = result.anxietyCount
        summary.anxietyMaxIntensity = result.anxietyMaxIntensity
        summary.dayStatus = result.dayStatus
        summary.updatedAt = .now

        try? context.save()
        return summary
    }

    /// Явное ручное переопределение статуса дня пользователем.
    func overrideStatus(_ status: DayStatus?, on date: Date) {
        let dayKey = DayKey.make(from: date, calendar: calendar)
        let summary = fetchSummary(dayKey: dayKey) ?? {
            let new = DaySummary(dayKey: dayKey, date: calendar.startOfDay(for: date))
            context.insert(new)
            return new
        }()

        if let status {
            summary.manuallyOverridden = true
            summary.dayStatus = status
        } else {
            summary.manuallyOverridden = false
        }
        summary.updatedAt = .now
        try? context.save()
        recalculate(on: date)
    }

    func fetchSummary(dayKey: Int) -> DaySummary? {
        let predicate = #Predicate<DaySummary> { $0.dayKey == dayKey }
        var descriptor = FetchDescriptor<DaySummary>(predicate: predicate)
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }
}
