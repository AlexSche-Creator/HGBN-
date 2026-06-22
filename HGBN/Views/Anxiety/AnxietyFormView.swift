import SwiftUI
import SwiftData

struct AnxietyFormView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    /// Активная запись тревоги, если её нужно завершить.
    let active: AnxietyRecord?

    @State private var startTime: Date = .now
    @State private var isOngoing: Bool = false
    @State private var manualMinutes: Int = 20
    @State private var intensity: Int = 3
    @State private var reasonIDs: [UUID] = []
    @State private var customReason: String = ""
    @State private var notes: String = ""
    @State private var linkedEpisodeID: UUID?

    @Query(sort: \Episode.startTime, order: .reverse) private var recentEpisodes: [Episode]

    private var todayEpisodes: [Episode] {
        let start = Calendar.current.startOfDay(for: .now)
        return recentEpisodes.filter { $0.startTime >= start }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Время") {
                    DatePicker("Начало", selection: $startTime)
                    Toggle("Сейчас идёт", isOn: $isOngoing)
                    if !isOngoing {
                        Stepper(value: $manualMinutes, in: 1...300) {
                            Text("Длительность: \(DurationFormatter.string(minutes: manualMinutes))")
                        }
                    }
                }

                Section {
                    IntensitySelector(value: $intensity)
                }

                Section {
                    ReasonPicker(episodeType: .anxiety, selectedIDs: $reasonIDs, customText: $customReason)
                }

                if !todayEpisodes.isEmpty {
                    Section("Связать с эпизодом") {
                        Picker("Эпизод", selection: $linkedEpisodeID) {
                            Text("Без связи").tag(UUID?.none)
                            ForEach(todayEpisodes) { ep in
                                Text("\(ep.type.title) · \(ep.startTime.formatted(date: .omitted, time: .shortened))")
                                    .tag(Optional(ep.id))
                            }
                        }
                    }
                }

                Section("Заметка") {
                    TextField("Комментарий", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(active == nil ? "Тревога" : "Завершить тревогу")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { save() }
                        .fontWeight(.semibold)
                }
            }
            .onAppear(perform: loadInitial)
        }
    }

    private func loadInitial() {
        guard let active else { return }
        startTime = active.startTime
        intensity = active.intensity
        reasonIDs = active.reasonIDs
        customReason = active.customReasonText ?? ""
        notes = active.notes ?? ""
        linkedEpisodeID = active.linkedEpisodeID
        isOngoing = active.isActive
    }

    private func save() {
        let record = active ?? AnxietyRecord(startTime: startTime)
        record.startTime = startTime
        record.intensity = intensity
        record.reasonIDs = reasonIDs
        record.customReasonText = customReason.isEmpty ? nil : customReason
        record.notes = notes.isEmpty ? nil : notes
        record.linkedEpisodeID = linkedEpisodeID
        record.updatedAt = .now

        if isOngoing {
            record.endTime = nil
            record.manualDurationMinutes = nil
        } else {
            record.manualDurationMinutes = manualMinutes
            record.endTime = Calendar.current.date(byAdding: .minute, value: manualMinutes, to: startTime)
        }

        if active == nil {
            context.insert(record)
        }
        try? context.save()

        DayService(context: context, thresholds: settings.thresholds).recalculate(on: startTime)
        dismiss()
    }
}

#Preview {
    AnxietyFormView(active: nil)
        .environment(AppSettings())
        .modelContainer(AppModelContainer.makePreview())
}
