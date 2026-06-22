import SwiftUI
import SwiftData

/// Выбор причин быстрыми чипами + ручной ввод.
struct ReasonPicker: View {
    let episodeType: EpisodeType
    @Binding var selectedIDs: [UUID]
    @Binding var customText: String

    @Query private var reasons: [Reason]

    init(episodeType: EpisodeType, selectedIDs: Binding<[UUID]>, customText: Binding<String>) {
        self.episodeType = episodeType
        self._selectedIDs = selectedIDs
        self._customText = customText
        _reasons = Query(
            filter: #Predicate<Reason> { $0.isActive },
            sort: [SortDescriptor(\.sortOrder)]
        )
    }

    private var available: [Reason] {
        reasons.filter { $0.type.matches(episodeType: episodeType) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Причина")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Theme.Palette.textSecondary)

            FlowLayout(spacing: 8) {
                ForEach(available) { reason in
                    ReasonChip(
                        title: reason.title,
                        icon: reason.iconName,
                        isSelected: selectedIDs.contains(reason.id)
                    ) {
                        toggle(reason.id)
                    }
                }
            }

            TextField("Своя причина (необязательно)", text: $customText)
                .textFieldStyle(.plain)
                .padding(12)
                .background(Theme.Palette.secondaryBackground)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.smallCornerRadius, style: .continuous))
        }
    }

    private func toggle(_ id: UUID) {
        if let index = selectedIDs.firstIndex(of: id) {
            selectedIDs.remove(at: index)
        } else {
            selectedIDs.append(id)
        }
    }
}

/// Простой переносящийся по строкам layout для чипов.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rows: [[CGSize]] = [[]]
        var x: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, !(rows.last?.isEmpty ?? true) {
                rows.append([])
                x = 0
            }
            rows[rows.count - 1].append(size)
            x += size.width + spacing
        }
        let height = rows.reduce(0) { partial, row in
            partial + (row.map(\.height).max() ?? 0) + spacing
        }
        return CGSize(width: maxWidth, height: max(0, height - spacing))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
