import Foundation
import SwiftData

/// Демо-данные для SwiftUI Preview и быстрого визуального теста.
enum MockData {

    static func populate(_ context: ModelContext) {
        let reasons = (try? context.fetch(FetchDescriptor<Reason>())) ?? []
        let headacheReasons = reasons.filter { $0.type != .anxietyReason }
        let anxietyReasons = reasons.filter { $0.type != .headacheReason }
        let calendar = Calendar.current

        func reasonID(_ list: [Reason], _ index: Int) -> [UUID] {
            guard !list.isEmpty else { return [] }
            return [list[index % list.count].id]
        }

        // Несколько последних дней с разной нагрузкой.
        for dayOffset in 0..<14 {
            guard let day = calendar.date(byAdding: .day, value: -dayOffset, to: .now) else { continue }
            let episodeCount = [0, 1, 2, 3, 1, 0, 4][dayOffset % 7]
            for i in 0..<episodeCount {
                let start = calendar.date(bySettingHour: 9 + i * 3, minute: 15, second: 0, of: day) ?? day
                let duration = [10, 25, 45, 90][(dayOffset + i) % 4]
                let end = calendar.date(byAdding: .minute, value: duration, to: start)
                let ep = Episode(
                    startTime: start,
                    endTime: end,
                    intensity: [3, 5, 6, 8][(dayOffset + i) % 4],
                    type: i.isMultiple(of: 2) ? .headache : .mixed,
                    reasonIDs: reasonID(headacheReasons, dayOffset + i),
                    notes: i == 0 ? "Заметка для примера" : nil
                )
                context.insert(ep)
            }

            if dayOffset % 3 == 0 {
                let start = calendar.date(bySettingHour: 14, minute: 0, second: 0, of: day) ?? day
                let end = calendar.date(byAdding: .minute, value: 30, to: start)
                let anx = AnxietyRecord(
                    startTime: start,
                    endTime: end,
                    intensity: [4, 6, 7][dayOffset % 3],
                    reasonIDs: reasonID(anxietyReasons, dayOffset)
                )
                context.insert(anx)
            }
        }
        try? context.save()

        // Пересчёт итогов дня.
        let service = DayService(context: context)
        for dayOffset in 0..<14 {
            if let day = calendar.date(byAdding: .day, value: -dayOffset, to: .now) {
                service.recalculate(on: day)
            }
        }
    }
}
