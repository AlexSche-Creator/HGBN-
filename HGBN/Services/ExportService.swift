import Foundation
import SwiftData

/// Экспорт данных в JSON/CSV в структуре, пригодной для загрузки в DWH.
/// Структура повторяет fact_*/dim_*/bridge_* таблицы (см. docs/DWH.md).
struct ExportService {
    let context: ModelContext
    var calendar: Calendar = .current
    /// Идентификатор пользователя для будущей синхронизации (локально — anonymous).
    var userID: String = "local-user"

    // MARK: - DWH DTO

    struct DWHExport: Codable {
        let exportedAt: Date
        let userID: String
        let factEpisode: [FactEpisode]
        let factAnxiety: [FactAnxiety]
        let factDaySummary: [FactDaySummary]
        let dimReason: [DimReason]
        let bridgeEpisodeReason: [BridgeEpisodeReason]
        let bridgeAnxietyReason: [BridgeAnxietyReason]
    }

    struct FactEpisode: Codable {
        let episodeID: String
        let userID: String
        let startDatetime: Date
        let endDatetime: Date?
        let durationMinutes: Int
        let intensity: Int
        let type: String
        let dayKey: Int
        let createdAt: Date
        let updatedAt: Date
    }

    struct FactAnxiety: Codable {
        let anxietyID: String
        let userID: String
        let startDatetime: Date
        let endDatetime: Date?
        let durationMinutes: Int
        let intensity: Int
        let dayKey: Int
        let linkedEpisodeID: String?
        let createdAt: Date
        let updatedAt: Date
    }

    struct FactDaySummary: Codable {
        let dayKey: Int
        let userID: String
        let totalEpisodes: Int
        let totalDurationMinutes: Int
        let maxIntensity: Int
        let avgIntensity: Double
        let anxietyCount: Int
        let anxietyMaxIntensity: Int
        let dayStatus: String
        let manuallyOverridden: Bool
        let createdAt: Date
        let updatedAt: Date
    }

    struct DimReason: Codable {
        let reasonID: String
        let userID: String
        let title: String
        let type: String
        let isDefault: Bool
        let isActive: Bool
    }

    struct BridgeEpisodeReason: Codable {
        let episodeID: String
        let reasonID: String
    }

    struct BridgeAnxietyReason: Codable {
        let anxietyID: String
        let reasonID: String
    }

    // MARK: - Сборка

    func buildExport() -> DWHExport {
        let episodes = (try? context.fetch(FetchDescriptor<Episode>())) ?? []
        let anxiety = (try? context.fetch(FetchDescriptor<AnxietyRecord>())) ?? []
        let summaries = (try? context.fetch(FetchDescriptor<DaySummary>())) ?? []
        let reasons = (try? context.fetch(FetchDescriptor<Reason>())) ?? []

        let factEpisodes = episodes.map { ep in
            FactEpisode(
                episodeID: ep.id.uuidString,
                userID: userID,
                startDatetime: ep.startTime,
                endDatetime: ep.endTime,
                durationMinutes: ep.durationMinutes,
                intensity: ep.intensity,
                type: ep.type.rawValue,
                dayKey: DayKey.make(from: ep.startTime, calendar: calendar),
                createdAt: ep.createdAt,
                updatedAt: ep.updatedAt
            )
        }

        let factAnxiety = anxiety.map { a in
            FactAnxiety(
                anxietyID: a.id.uuidString,
                userID: userID,
                startDatetime: a.startTime,
                endDatetime: a.endTime,
                durationMinutes: a.durationMinutes,
                intensity: a.intensity,
                dayKey: DayKey.make(from: a.startTime, calendar: calendar),
                linkedEpisodeID: a.linkedEpisodeID?.uuidString,
                createdAt: a.createdAt,
                updatedAt: a.updatedAt
            )
        }

        let factDays = summaries.map { d in
            FactDaySummary(
                dayKey: d.dayKey,
                userID: userID,
                totalEpisodes: d.totalEpisodes,
                totalDurationMinutes: d.totalDurationMinutes,
                maxIntensity: d.maxIntensity,
                avgIntensity: d.averageIntensity,
                anxietyCount: d.anxietyEpisodes,
                anxietyMaxIntensity: d.anxietyMaxIntensity,
                dayStatus: d.dayStatus.rawValue,
                manuallyOverridden: d.manuallyOverridden,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt
            )
        }

        let dimReasons = reasons.map {
            DimReason(reasonID: $0.id.uuidString, userID: userID, title: $0.title,
                      type: $0.type.rawValue, isDefault: $0.isDefault, isActive: $0.isActive)
        }

        let bridgeEpisode = episodes.flatMap { ep in
            ep.reasonIDs.map { BridgeEpisodeReason(episodeID: ep.id.uuidString, reasonID: $0.uuidString) }
        }
        let bridgeAnxiety = anxiety.flatMap { a in
            a.reasonIDs.map { BridgeAnxietyReason(anxietyID: a.id.uuidString, reasonID: $0.uuidString) }
        }

        return DWHExport(
            exportedAt: .now,
            userID: userID,
            factEpisode: factEpisodes,
            factAnxiety: factAnxiety,
            factDaySummary: factDays,
            dimReason: dimReasons,
            bridgeEpisodeReason: bridgeEpisode,
            bridgeAnxietyReason: bridgeAnxiety
        )
    }

    // MARK: - JSON

    func exportJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(buildExport())
    }

    /// Записывает JSON во временный файл и возвращает URL для share sheet.
    func writeJSONFile() throws -> URL {
        let data = try exportJSON()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("hgbn-export-\(Int(Date.now.timeIntervalSince1970)).json")
        try data.write(to: url)
        return url
    }

    // MARK: - CSV

    /// CSV эпизодов (одна из таблиц fact_episode).
    func episodesCSV() -> String {
        let export = buildExport()
        var rows = ["episode_id,user_id,start_datetime,end_datetime,duration_minutes,intensity,type,day_key"]
        let iso = ISO8601DateFormatter()
        for e in export.factEpisode {
            let end = e.endDatetime.map { iso.string(from: $0) } ?? ""
            rows.append("\(e.episodeID),\(e.userID),\(iso.string(from: e.startDatetime)),\(end),\(e.durationMinutes),\(e.intensity),\(e.type),\(e.dayKey)")
        }
        return rows.joined(separator: "\n")
    }

    func writeCSVFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("hgbn-episodes-\(Int(Date.now.timeIntervalSince1970)).csv")
        try episodesCSV().write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
