import SwiftUI

/// Палитра и метрики приложения. Только Tiffany + White + Black и их мягкие оттенки.
enum Theme {

    enum Palette {
        /// Основной акцент — Tiffany / бирюзовый.
        static let accent = Color(red: 0.04, green: 0.73, blue: 0.71)
        /// Мягкий бирюзовый для фоновых карточек.
        static let accentSoft = Color(red: 0.51, green: 0.85, blue: 0.82)
        /// Очень светлый бирюзовый фон.
        static let accentTint = Color(red: 0.90, green: 0.97, blue: 0.96)

        static let background = Color(white: 1.0)
        static let secondaryBackground = Color(white: 0.97)
        static let card = Color(white: 1.0)

        static let textPrimary = Color(white: 0.07)
        static let textSecondary = Color(white: 0.45)
        static let separator = Color(white: 0.90)
    }

    enum Metrics {
        static let cornerRadius: CGFloat = 20
        static let smallCornerRadius: CGFloat = 12
        static let cardPadding: CGFloat = 16
        static let spacing: CGFloat = 12
        static let largeSpacing: CGFloat = 20
    }

    /// Цветовой акцент статуса дня в рамках палитры (оттенки бирюзового/серого/чёрного).
    static func statusColor(_ status: DayStatus) -> Color {
        switch status {
        case .superDay: return Palette.accent
        case .good: return Palette.accentSoft
        case .bad: return Color(white: 0.62)
        case .terrible: return Color(white: 0.38)
        case .nightmare: return Palette.textPrimary
        }
    }
}

extension Color {
    static let appAccent = Theme.Palette.accent
    static let appTextPrimary = Theme.Palette.textPrimary
    static let appTextSecondary = Theme.Palette.textSecondary
}
