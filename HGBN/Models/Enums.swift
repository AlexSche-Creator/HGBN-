import Foundation

/// Тип эпизода самонаблюдения.
enum EpisodeType: String, Codable, CaseIterable, Identifiable {
    case headache
    case anxiety
    case mixed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .headache: return "Напряжение"
        case .anxiety: return "Тревога"
        case .mixed: return "Смешанный"
        }
    }

    var iconName: String {
        switch self {
        case .headache: return "waveform.path"
        case .anxiety: return "wind"
        case .mixed: return "circle.grid.cross"
        }
    }
}

/// Тип причины. Причина может относиться к эпизодам напряжения, тревоги или к обоим.
enum ReasonType: String, Codable, CaseIterable, Identifiable {
    case headacheReason
    case anxietyReason
    case both

    var id: String { rawValue }

    var title: String {
        switch self {
        case .headacheReason: return "Напряжение"
        case .anxietyReason: return "Тревога"
        case .both: return "Универсальная"
        }
    }

    /// Подходит ли причина для выбранного типа эпизода.
    func matches(episodeType: EpisodeType) -> Bool {
        switch self {
        case .both:
            return true
        case .headacheReason:
            return episodeType == .headache || episodeType == .mixed
        case .anxietyReason:
            return episodeType == .anxiety || episodeType == .mixed
        }
    }
}

/// Флаг продолжительного эпизода, когда длительность сложно измерить точно.
enum DayLongFlag: String, Codable, CaseIterable, Identifiable {
    case none
    case almostAllDay
    case allDay

    var id: String { rawValue }

    var title: String {
        switch self {
        case .none: return "Обычная длительность"
        case .almostAllDay: return "Давит почти весь день"
        case .allDay: return "Весь день"
        }
    }

    /// Условная длительность в минутах для расчётов статистики.
    var approximateMinutes: Int {
        switch self {
        case .none: return 0
        case .almostAllDay: return 10 * 60
        case .allDay: return 14 * 60
        }
    }
}

/// Итоговый статус дня. Порядок кейсов задаёт степень нагрузки (от лучшего к худшему).
enum DayStatus: String, Codable, CaseIterable, Identifiable, Comparable {
    case superDay
    case good
    case bad
    case terrible
    case nightmare

    var id: String { rawValue }

    /// Числовой ранг нагрузки: чем больше, тем тяжелее день.
    var severity: Int {
        switch self {
        case .superDay: return 0
        case .good: return 1
        case .bad: return 2
        case .terrible: return 3
        case .nightmare: return 4
        }
    }

    static func < (lhs: DayStatus, rhs: DayStatus) -> Bool {
        lhs.severity < rhs.severity
    }

    var title: String {
        switch self {
        case .superDay: return "Супер день"
        case .good: return "Хороший день"
        case .bad: return "Так себе"
        case .terrible: return "Тяжёлый день"
        case .nightmare: return "Очень тяжёлый день"
        }
    }

    /// Минималистичные линейные иконки без драматизации.
    var iconName: String {
        switch self {
        case .superDay: return "sun.max"
        case .good: return "cloud.sun"
        case .bad: return "cloud"
        case .terrible: return "cloud.rain"
        case .nightmare: return "cloud.bolt"
        }
    }
}
