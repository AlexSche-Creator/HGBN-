import Foundation

extension Int {
    /// Интенсивность всегда удерживается в диапазоне 1...10.
    var clampedIntensity: Int { Swift.min(10, Swift.max(1, self)) }
}

enum DayKey {
    /// Нормализованный ключ дня YYYYMMDD на основе календаря пользователя.
    static func make(from date: Date, calendar: Calendar = .current) -> Int {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return (c.year ?? 0) * 10000 + (c.month ?? 0) * 100 + (c.day ?? 0)
    }

    static func startOfDay(for date: Date, calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: date)
    }
}

enum DurationFormatter {
    /// Человекочитаемая длительность: «1 ч 20 мин», «45 мин».
    static func string(minutes: Int) -> String {
        guard minutes > 0 else { return "0 мин" }
        let hours = minutes / 60
        let mins = minutes % 60
        switch (hours, mins) {
        case (0, _): return "\(mins) мин"
        case (_, 0): return "\(hours) ч"
        default: return "\(hours) ч \(mins) мин"
        }
    }
}
