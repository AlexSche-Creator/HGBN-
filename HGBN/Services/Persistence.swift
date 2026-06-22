import Foundation
import SwiftData

/// Фабрика контейнеров SwiftData. Один общий контейнер для приложения
/// и in-memory контейнер для превью/тестов.
enum AppModelContainer {

    static let schema = Schema([
        Episode.self,
        AnxietyRecord.self,
        Reason.self,
        DaySummary.self
    ])

    /// Основной персистентный контейнер с первичным наполнением причинами.
    static func makeShared() -> ModelContainer {
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            let container = try ModelContainer(for: schema, configurations: [config])
            seedIfNeeded(container.mainContext)
            return container
        } catch {
            fatalError("Не удалось создать ModelContainer: \(error)")
        }
    }

    /// In-memory контейнер для SwiftUI Preview и тестов.
    static func makePreview(seedDemo: Bool = true) -> ModelContainer {
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        do {
            let container = try ModelContainer(for: schema, configurations: [config])
            seedIfNeeded(container.mainContext)
            if seedDemo {
                MockData.populate(container.mainContext)
            }
            return container
        } catch {
            fatalError("Не удалось создать preview ModelContainer: \(error)")
        }
    }

    /// Наполняет хранилище причинами по умолчанию, если их ещё нет.
    static func seedIfNeeded(_ context: ModelContext) {
        let descriptor = FetchDescriptor<Reason>()
        let existing = (try? context.fetchCount(descriptor)) ?? 0
        guard existing == 0 else { return }
        for reason in DefaultReasons.makeAll() {
            context.insert(reason)
        }
        try? context.save()
    }
}
