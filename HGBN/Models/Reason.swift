import Foundation
import SwiftData

/// Причина эпизода или тревоги. Пользователь может создавать, редактировать,
/// скрывать причины и менять их порядок.
@Model
final class Reason {
    @Attribute(.unique) var id: UUID
    var title: String
    var typeRaw: String
    var iconName: String
    var isDefault: Bool
    var isActive: Bool
    var sortOrder: Int
    var createdAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        type: ReasonType,
        iconName: String = "circle",
        isDefault: Bool = false,
        isActive: Bool = true,
        sortOrder: Int = 0,
        createdAt: Date = .now
    ) {
        self.id = id
        self.title = title
        self.typeRaw = type.rawValue
        self.iconName = iconName
        self.isDefault = isDefault
        self.isActive = isActive
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

extension Reason {
    var type: ReasonType {
        get { ReasonType(rawValue: typeRaw) ?? .both }
        set { typeRaw = newValue.rawValue }
    }
}
