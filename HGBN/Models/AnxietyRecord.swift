import Foundation
import SwiftData

/// Запись тревоги. Может фиксироваться отдельно или быть связана с эпизодом напряжения.
/// Активна, пока `endTime == nil`.
@Model
final class AnxietyRecord {
    @Attribute(.unique) var id: UUID
    var startTime: Date
    var endTime: Date?
    var manualDurationMinutes: Int?
    var intensityRaw: Int
    var reasonIDs: [UUID]
    var customReasonText: String?
    var notes: String?
    /// Опциональная связь с эпизодом напряжения (если тревога и напряжение идут вместе).
    var linkedEpisodeID: UUID?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        startTime: Date = .now,
        endTime: Date? = nil,
        manualDurationMinutes: Int? = nil,
        intensity: Int = 3,
        reasonIDs: [UUID] = [],
        customReasonText: String? = nil,
        notes: String? = nil,
        linkedEpisodeID: UUID? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.startTime = startTime
        self.endTime = endTime
        self.manualDurationMinutes = manualDurationMinutes
        self.intensityRaw = intensity.clampedIntensity
        self.reasonIDs = reasonIDs
        self.customReasonText = customReasonText
        self.notes = notes
        self.linkedEpisodeID = linkedEpisodeID
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

extension AnxietyRecord {
    var intensity: Int {
        get { intensityRaw }
        set { intensityRaw = newValue.clampedIntensity }
    }

    var isActive: Bool { endTime == nil }

    var durationMinutes: Int {
        if let manual = manualDurationMinutes {
            return manual
        }
        guard let end = endTime else { return 0 }
        return max(0, Int(end.timeIntervalSince(startTime) / 60))
    }
}
