import Foundation
import SwiftData

/// Сохранённый итог дня. Рассчитывается из эпизодов и записей тревоги,
/// но статус может быть переопределён пользователем вручную.
@Model
final class DaySummary {
    /// Нормализованный ключ дня в формате YYYYMMDD — совпадает с day_key в DWH.
    @Attribute(.unique) var dayKey: Int
    var date: Date
    var totalEpisodes: Int
    var totalDurationMinutes: Int
    var maxIntensity: Int
    var averageIntensity: Double
    var anxietyEpisodes: Int
    var anxietyMaxIntensity: Int
    var dayStatusRaw: String
    var manuallyOverridden: Bool
    var comment: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        dayKey: Int,
        date: Date,
        totalEpisodes: Int = 0,
        totalDurationMinutes: Int = 0,
        maxIntensity: Int = 0,
        averageIntensity: Double = 0,
        anxietyEpisodes: Int = 0,
        anxietyMaxIntensity: Int = 0,
        dayStatus: DayStatus = .superDay,
        manuallyOverridden: Bool = false,
        comment: String? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.dayKey = dayKey
        self.date = date
        self.totalEpisodes = totalEpisodes
        self.totalDurationMinutes = totalDurationMinutes
        self.maxIntensity = maxIntensity
        self.averageIntensity = averageIntensity
        self.anxietyEpisodes = anxietyEpisodes
        self.anxietyMaxIntensity = anxietyMaxIntensity
        self.dayStatusRaw = dayStatus.rawValue
        self.manuallyOverridden = manuallyOverridden
        self.comment = comment
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension DaySummary {
    var dayStatus: DayStatus {
        get { DayStatus(rawValue: dayStatusRaw) ?? .superDay }
        set { dayStatusRaw = newValue.rawValue }
    }

    var iconName: String { dayStatus.iconName }
}
