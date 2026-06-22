import SwiftUI

/// Мягкая округлая карточка-контейнер.
struct AppCard<Content: View>: View {
    var padding: CGFloat = Theme.Metrics.cardPadding
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Metrics.cornerRadius, style: .continuous)
                    .stroke(Theme.Palette.separator, lineWidth: 1)
            )
    }
}

/// Крупная основная кнопка.
struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var tint: Color = Theme.Palette.accent
    var foreground: Color = .white
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.headline)
                }
                Text(title)
                    .font(.headline)
            }
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.cornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Вторичная кнопка с контуром.
struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(.headline)
            .foregroundStyle(Theme.Palette.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Theme.Palette.accentTint)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.cornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Селектор интенсивности 1–10.
struct IntensitySelector: View {
    @Binding var value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Интенсивность")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.Palette.textSecondary)
                Spacer()
                Text("\(value)/10")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.Palette.accent)
            }
            HStack(spacing: 6) {
                ForEach(1...10, id: \.self) { i in
                    Button {
                        value = i
                    } label: {
                        Text("\(i)")
                            .font(.callout.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(i <= value ? Theme.Palette.accent : Theme.Palette.accentTint)
                            .foregroundStyle(i <= value ? .white : Theme.Palette.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.smallCornerRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// Бейдж статуса дня.
struct DayStatusBadge: View {
    let status: DayStatus
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: status.iconName)
                .font(compact ? .subheadline : .title3)
            if !compact {
                Text(status.title)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .foregroundStyle(Theme.statusColor(status))
        .padding(.horizontal, compact ? 8 : 12)
        .padding(.vertical, compact ? 6 : 8)
        .background(Theme.Palette.accentTint)
        .clipShape(Capsule())
    }
}

/// Компактная метрика «значение + подпись».
struct MetricTile: View {
    let value: String
    let caption: String
    var systemImage: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .foregroundStyle(Theme.Palette.accent)
                    .font(.subheadline)
            }
            Text(value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.Palette.textPrimary)
            Text(caption)
                .font(.caption)
                .foregroundStyle(Theme.Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.Palette.secondaryBackground)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.smallCornerRadius, style: .continuous))
    }
}

/// Выбираемый чип причины.
struct ReasonChip: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
            }
            .font(.callout)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(isSelected ? Theme.Palette.accent : Theme.Palette.accentTint)
            .foregroundStyle(isSelected ? .white : Theme.Palette.textPrimary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(Theme.Palette.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
