import Foundation
import SwiftData

/// Эпизод напряжения (ХГБН) или смешанный эпизод.
/// Эпизод считается активным, пока `endTime == nil`.
@Model
final class Episode {
    @Attribute(.unique) var id: UUID
    var startTime: Date
    var endTime: Date?
    /// Ручная или рассчитанная длительность в минутах.
    var manualDurationMinutes: Int?
    var intensityRaw: Int
    var typeRaw: String
    /// Идентификаторы выбранных причин (нормализуется в bridge-таблицу при экспорте).
    var reasonIDs: [UUID]
    var customReasonText: String?
    var notes: String?
    var dayLongFlagRaw: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        startTime: Date = .now,
        endTime: Date? = nil,
        manualDurationMinutes: Int? = nil,
        intensity: Int = 3,
        type: EpisodeType = .headache,
        reasonIDs: [UUID] = [],
        customReasonText: String? = nil,
        notes: String? = nil,
        dayLongFlag: DayLongFlag = .none,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.startTime = startTime
        self.endTime = endTime
        self.manualDurationMinutes = manualDurationMinutes
        self.intensityRaw = intensity.clampedIntensity
        self.typeRaw = type.rawValue
        self.reasonIDs = reasonIDs
        self.customReasonText = customReasonText
        self.notes = notes
        self.dayLongFlagRaw = dayLongFlag.rawValue
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension Episode {
    var intensity: Int {
        get { intensityRaw }
        set { intensityRaw = newValue.clampedIntensity }
    }

    var type: EpisodeType {
        get { EpisodeType(rawValue: typeRaw) ?? .headache }
        set { typeRaw = newValue.rawValue }
    }

    var dayLongFlag: DayLongFlag {
        get { DayLongFlag(rawValue: dayLongFlagRaw) ?? .none }
        set { dayLongFlagRaw = newValue.rawValue }
    }

    var isActive: Bool { endTime == nil }

    /// Эффективная длительность эпизода в минутах.
    /// Приоритет: флаг продолжительности → ручная длительность → расчёт по времени.
    var durationMinutes: Int {
        if dayLongFlag != .none {
            return dayLongFlag.approximateMinutes
        }
        if let manual = manualDurationMinutes {
            return manual
        }
        guard let end = endTime else { return 0 }
        return max(0, Int(end.timeIntervalSince(startTime) / 60))
    }
}
