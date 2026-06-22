import SwiftUI
import SwiftData

struct ReasonsManagementView: View {
    enum Filter {
        case headache, anxiety
        var title: String { self == .headache ? "Причины напряжения" : "Причины тревоги" }
        func matches(_ reason: Reason) -> Bool {
            switch self {
            case .headache: return reason.type != .anxietyReason
            case .anxiety: return reason.type != .headacheReason
            }
        }
        var newReasonType: ReasonType { self == .headache ? .headacheReason : .anxietyReason }
    }

    @Environment(\.modelContext) private var context
    @Query(sort: \Reason.sortOrder) private var allReasons: [Reason]

    let filter: Filter
    @State private var newTitle = ""

    private var reasons: [Reason] { allReasons.filter(filter.matches) }

    var body: some View {
        List {
            Section("Добавить причину") {
                HStack {
                    TextField("Название", text: $newTitle)
                    Button("Добавить") { add() }
                        .disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                        .tint(Theme.Palette.accent)
                }
            }

            Section("Список") {
                ForEach(reasons) { reason in
                    HStack {
                        Image(systemName: reason.iconName)
                            .foregroundStyle(reason.isActive ? Theme.Palette.accent : Theme.Palette.textSecondary)
                            .frame(width: 28)
                        TextField("Название", text: Binding(
                            get: { reason.title },
                            set: { reason.title = $0; try? context.save() }
                        ))
                        .foregroundStyle(reason.isActive ? Theme.Palette.textPrimary : Theme.Palette.textSecondary)
                        Spacer()
                        Button {
                            reason.isActive.toggle()
                            try? context.save()
                        } label: {
                            Image(systemName: reason.isActive ? "eye" : "eye.slash")
                                .foregroundStyle(Theme.Palette.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .swipeActions {
                        if !reason.isDefault {
                            Button(role: .destructive) {
                                context.delete(reason)
                                try? context.save()
                            } label: {
                                Label("Удалить", systemImage: "trash")
                            }
                        }
                    }
                }
                .onMove(perform: move)
            }
        }
        .navigationTitle(filter.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton().tint(Theme.Palette.accent) }
    }

    private func add() {
        let trimmed = newTitle.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let maxOrder = allReasons.map(\.sortOrder).max() ?? 0
        let reason = Reason(
            title: trimmed,
            type: filter.newReasonType,
            iconName: "circle",
            isDefault: false,
            sortOrder: maxOrder + 1
        )
        context.insert(reason)
        try? context.save()
        newTitle = ""
    }

    private func move(from offsets: IndexSet, to destination: Int) {
        var ordered = reasons
        ordered.move(fromOffsets: offsets, toOffset: destination)
        for (index, reason) in ordered.enumerated() {
            reason.sortOrder = index
        }
        try? context.save()
    }
}

#Preview {
    NavigationStack {
        ReasonsManagementView(filter: .headache)
    }
    .modelContainer(AppModelContainer.makePreview())
}
