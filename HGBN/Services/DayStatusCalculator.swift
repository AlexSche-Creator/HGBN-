import Foundation

/// Настраиваемые пороги оценки дня. Значения по умолчанию соответствуют
/// продуктовой логике, но могут переопределяться в настройках.
struct DayThresholds: Codable, Equatable {
    var shortEpisodeMinutes: Int = 15
    var lowIntensity: Int = 5
    var goodMaxEpisodes: Int = 5
    var goodTotalDurationMinutes: Int = 60

    var badIntensityRange: ClosedRange<Int> = 6...7
    var badMaxEpisodes: Int = 5
    var badTotalDurationMinutes: Int = 60

    var terribleIntensityRange: ClosedRange<Int> = 8...9
    var terribleSingleEpisodeMinutes: Int = 120
    var terribleTotalDurationMinutes: Int = 180

    var nightmareIntensity: Int = 10
    var nightmareTotalDurationMinutes: Int = 300

    static let `default` = DayThresholds()

    // ClosedRange не Codable «из коробки» — кодируем границами.
    enum CodingKeys: String, CodingKey {
        case shortEpisodeMinutes, lowIntensity, goodMaxEpisodes, goodTotalDurationMinutes
        case badIntensityLower, badIntensityUpper, badMaxEpisodes, badTotalDurationMinutes
        case terribleIntensityLower, terribleIntensityUpper
        case terribleSingleEpisodeMinutes, terribleTotalDurationMinutes
        case nightmareIntensity, nightmareTotalDurationMinutes
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        shortEpisodeMinutes = try c.decode(Int.self, forKey: .shortEpisodeMinutes)
        lowIntensity = try c.decode(Int.self, forKey: .lowIntensity)
        goodMaxEpisodes = try c.decode(Int.self, forKey: .goodMaxEpisodes)
        goodTotalDurationMinutes = try c.decode(Int.self, forKey: .goodTotalDurationMinutes)
        badIntensityRange = (try c.decode(Int.self, forKey: .badIntensityLower))...(try c.decode(Int.self, forKey: .badIntensityUpper))
        badMaxEpisodes = try c.decode(Int.self, forKey: .badMaxEpisodes)
        badTotalDurationMinutes = try c.decode(Int.self, forKey: .badTotalDurationMinutes)
        terribleIntensityRange = (try c.decode(Int.self, forKey: .terribleIntensityLower))...(try c.decode(Int.self, forKey: .terribleIntensityUpper))
        terribleSingleEpisodeMinutes = try c.decode(Int.self, forKey: .terribleSingleEpisodeMinutes)
        terribleTotalDurationMinutes = try c.decode(Int.self, forKey: .terribleTotalDurationMinutes)
        nightmareIntensity = try c.decode(Int.self, forKey: .nightmareIntensity)
        nightmareTotalDurationMinutes = try c.decode(Int.self, forKey: .nightmareTotalDurationMinutes)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(shortEpisodeMinutes, forKey: .shortEpisodeMinutes)
        try c.encode(lowIntensity, forKey: .lowIntensity)
        try c.encode(goodMaxEpisodes, forKey: .goodMaxEpisodes)
        try c.encode(goodTotalDurationMinutes, forKey: .goodTotalDurationMinutes)
        try c.encode(badIntensityRange.lowerBound, forKey: .badIntensityLower)
        try c.encode(badIntensityRange.upperBound, forKey: .badIntensityUpper)
        try c.encode(badMaxEpisodes, forKey: .badMaxEpisodes)
        try c.encode(badTotalDurationMinutes, forKey: .badTotalDurationMinutes)
        try c.encode(terribleIntensityRange.lowerBound, forKey: .terribleIntensityLower)
        try c.encode(terribleIntensityRange.upperBound, forKey: .terribleIntensityUpper)
        try c.encode(terribleSingleEpisodeMinutes, forKey: .terribleSingleEpisodeMinutes)
        try c.encode(terribleTotalDurationMinutes, forKey: .terribleTotalDurationMinutes)
        try c.encode(nightmareIntensity, forKey: .nightmareIntensity)
        try c.encode(nightmareTotalDurationMinutes, forKey: .nightmareTotalDurationMinutes)
    }
}

/// Лёгкий ввод для расчёта — не зависит от SwiftData, что упрощает тестирование.
struct EpisodeInput: Equatable {
    var intensity: Int
    var durationMinutes: Int
    /// Эпизод отмечен как «почти весь день» / «весь день».
    var isDayLong: Bool = false
}

struct AnxietyInput: Equatable {
    var intensity: Int
    var durationMinutes: Int
}

/// Результат расчёта дня для UI и сохранения в DaySummary.
struct DayStatusResult: Equatable {
    var dayStatus: DayStatus
    var totalEpisodes: Int
    var totalDurationMinutes: Int
    var maxIntensity: Int
    var averageIntensity: Double
    var anxietyCount: Int
    var anxietyMaxIntensity: Int
    var manuallyOverridden: Bool
    var textualSummary: String

    var iconName: String { dayStatus.iconName }
}

/// Чистый сервис расчёта статуса дня. Не зависит от UI и хранилища.
enum DayStatusCalculator {

    static func calculate(
        episodes: [EpisodeInput],
        anxiety: [AnxietyInput] = [],
        manualOverride: DayStatus? = nil,
        thresholds: DayThresholds = .default
    ) -> DayStatusResult {

        let totalEpisodes = episodes.count
        let totalDuration = episodes.reduce(0) { $0 + $1.durationMinutes }
        let maxIntensity = episodes.map(\.intensity).max() ?? 0
        let avgIntensity = totalEpisodes > 0
            ? Double(episodes.map(\.intensity).reduce(0, +)) / Double(totalEpisodes)
            : 0

        let anxietyCount = anxiety.count
        let anxietyMax = anxiety.map(\.intensity).max() ?? 0

        let autoStatus = autoStatus(
            episodes: episodes,
            totalEpisodes: totalEpisodes,
            totalDuration: totalDuration,
            maxIntensity: maxIntensity,
            thresholds: thresholds
        )

        let finalStatus = manualOverride ?? autoStatus

        let summary = textualSummary(
            status: finalStatus,
            totalEpisodes: totalEpisodes,
            totalDuration: totalDuration,
            maxIntensity: maxIntensity,
            anxietyCount: anxietyCount
        )

        return DayStatusResult(
            dayStatus: finalStatus,
            totalEpisodes: totalEpisodes,
            totalDurationMinutes: totalDuration,
            maxIntensity: maxIntensity,
            averageIntensity: avgIntensity,
            anxietyCount: anxietyCount,
            anxietyMaxIntensity: anxietyMax,
            manuallyOverridden: manualOverride != nil,
            textualSummary: summary
        )
    }

    // MARK: - Авторасчёт статуса

    private static func autoStatus(
        episodes: [EpisodeInput],
        totalEpisodes: Int,
        totalDuration: Int,
        maxIntensity: Int,
        thresholds t: DayThresholds
    ) -> DayStatus {
        let anyDayLong = episodes.contains { $0.isDayLong }
        let longestEpisode = episodes.map(\.durationMinutes).max() ?? 0

        // Очень тяжёлый день.
        if anyDayLong
            || maxIntensity >= t.nightmareIntensity
            || totalDuration > t.nightmareTotalDurationMinutes {
            return .nightmare
        }

        // Тяжёлый день.
        if t.terribleIntensityRange.contains(maxIntensity)
            || longestEpisode > t.terribleSingleEpisodeMinutes
            || totalDuration > t.terribleTotalDurationMinutes {
            return .terrible
        }

        // Так себе день.
        if totalEpisodes > t.badMaxEpisodes
            || totalDuration > t.badTotalDurationMinutes
            || t.badIntensityRange.contains(maxIntensity) {
            return .bad
        }

        // Супер день: ноль эпизодов или один короткий и слабый.
        if totalEpisodes == 0 {
            return .superDay
        }
        if totalEpisodes == 1,
           let single = episodes.first,
           single.durationMinutes <= t.shortEpisodeMinutes,
           single.intensity <= t.lowIntensity {
            return .superDay
        }

        // Хороший день.
        let allShortAndMild = episodes.allSatisfy {
            $0.durationMinutes <= t.shortEpisodeMinutes && $0.intensity <= t.lowIntensity
        }
        if (totalEpisodes >= 2 && totalEpisodes <= t.goodMaxEpisodes && allShortAndMild)
            || (totalDuration <= t.goodTotalDurationMinutes && maxIntensity <= t.lowIntensity) {
            return .good
        }

        return .good
    }

    // MARK: - Текстовое резюме

    private static func textualSummary(
        status: DayStatus,
        totalEpisodes: Int,
        totalDuration: Int,
        maxIntensity: Int,
        anxietyCount: Int
    ) -> String {
        if totalEpisodes == 0 && anxietyCount == 0 {
            return "Сегодня без эпизодов. Спокойный день для самонаблюдения."
        }

        let episodesText = pluralEpisodes(totalEpisodes)
        let durationText = DurationFormatter.string(minutes: totalDuration)
        let intensityText = maxIntensity > 0 ? "максимальная интенсивность \(maxIntensity)/10" : ""

        var base: String
        switch status {
        case .superDay:
            base = "Сегодня был супер день: \(episodesText), \(durationText)"
        case .good:
            base = "Сегодня был хороший день: \(episodesText), суммарно \(durationText)"
        case .bad:
            base = "Сегодня был непростой день: \(episodesText), суммарно \(durationText)"
        case .terrible:
            base = "Сегодня был тяжёлый день: \(episodesText), суммарно \(durationText)"
        case .nightmare:
            base = "Сегодня был очень тяжёлый день: \(episodesText), суммарно \(durationText)"
        }

        if !intensityText.isEmpty {
            base += ", \(intensityText)"
        }
        if anxietyCount > 0 {
            base += ". Тревога: \(anxietyCount) \(pluralRecords(anxietyCount))"
        }
        return base + "."
    }

    private static func pluralEpisodes(_ count: Int) -> String {
        "\(count) \(plural(count, "эпизод", "эпизода", "эпизодов"))"
    }

    private static func pluralRecords(_ count: Int) -> String {
        plural(count, "запись", "записи", "записей")
    }

    private static func plural(_ count: Int, _ one: String, _ few: String, _ many: String) -> String {
        let mod100 = count % 100
        let mod10 = count % 10
        if mod100 >= 11 && mod100 <= 14 { return many }
        switch mod10 {
        case 1: return one
        case 2, 3, 4: return few
        default: return many
        }
    }
}
