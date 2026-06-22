import Foundation

/// Набор быстрых причин по умолчанию для напряжения и тревоги.
enum DefaultReasons {

    struct Seed {
        let title: String
        let type: ReasonType
        let icon: String
    }

    static let headache: [Seed] = [
        Seed(title: "Недосып", type: .headacheReason, icon: "moon.zzz"),
        Seed(title: "Долгая работа за компьютером", type: .headacheReason, icon: "desktopcomputer"),
        Seed(title: "Телефон / экран", type: .headacheReason, icon: "iphone"),
        Seed(title: "Стресс", type: .both, icon: "bolt"),
        Seed(title: "Голод", type: .headacheReason, icon: "fork.knife"),
        Seed(title: "После еды", type: .headacheReason, icon: "takeoutbag.and.cup.and.straw"),
        Seed(title: "Яркий свет", type: .headacheReason, icon: "sun.max"),
        Seed(title: "Долгое сидение", type: .headacheReason, icon: "chair"),
        Seed(title: "Перенапряжение / контроль", type: .both, icon: "gauge.high"),
        Seed(title: "Непонятно", type: .headacheReason, icon: "questionmark")
    ]

    static let anxiety: [Seed] = [
        Seed(title: "Работа", type: .anxietyReason, icon: "briefcase"),
        Seed(title: "Будущее", type: .anxietyReason, icon: "calendar"),
        Seed(title: "Здоровье", type: .anxietyReason, icon: "heart"),
        Seed(title: "Конфликт", type: .anxietyReason, icon: "person.2"),
        Seed(title: "Усталость", type: .both, icon: "battery.25"),
        Seed(title: "Финансы", type: .anxietyReason, icon: "creditcard"),
        Seed(title: "Перегруз задачами", type: .anxietyReason, icon: "square.stack.3d.up"),
        Seed(title: "Ожидание события", type: .anxietyReason, icon: "hourglass"),
        Seed(title: "Социальное напряжение", type: .anxietyReason, icon: "bubble.left.and.bubble.right"),
        Seed(title: "Непонятно", type: .anxietyReason, icon: "questionmark")
    ]

    /// Строит модели причин с корректным sortOrder.
    static func makeAll() -> [Reason] {
        var result: [Reason] = []
        var order = 0
        for seed in headache + anxiety {
            result.append(
                Reason(
                    title: seed.title,
                    type: seed.type,
                    iconName: seed.icon,
                    isDefault: true,
                    isActive: true,
                    sortOrder: order
                )
            )
            order += 1
        }
        return result
    }
}
