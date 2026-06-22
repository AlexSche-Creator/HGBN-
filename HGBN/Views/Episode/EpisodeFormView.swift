import SwiftUI
import SwiftData

struct EpisodeFormView: View {
    enum Mode {
        case create
        case finish(Episode)

        var title: String {
            switch self {
            case .create: return "Новый эпизод"
            case .finish: return "Уточнить эпизод"
            }
        }
    }

    enum DurationMode: String, CaseIterable, Identifiable {
        case byEndTime = "По времени"
        case manual = "Вручную"
        case dayLong = "Длинный"
        var id: String { rawValue }
    }

    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss

    let mode: Mode

    @State private var type: EpisodeType = .headache
    @State private var startTime: Date = .now
    @State private var endTime: Date = .now
    @State private var durationMode: DurationMode = .byEndTime
    @State private var manualMinutes: Int = 15
    @State private var dayLongFlag: DayLongFlag = .almostAllDay
    @State private var intensity: Int = 3
    @State private var reasonIDs: [UUID] = []
    @State private var customReason: String = ""
    @State private var notes: String = ""

    private var editingEpisode: Episode? {
        if case let .finish(episode) = mode { return episode }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Тип") {
                    Picker("Тип", selection: $type) {
                        Text(EpisodeType.headache.title).tag(EpisodeType.headache)
                        Text(EpisodeType.mixed.title).tag(EpisodeType.mixed)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Время") {
                    DatePicker("Начало", selection: $startTime)
                    Picker("Длительность", selection: $durationMode) {
                        ForEach(DurationMode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    switch durationMode {
                    case .byEndTime:
                        DatePicker("Окончание", selection: $endTime, in: startTime...)
                        LabeledContent("Длительность", value: DurationFormatter.string(minutes: computedEndMinutes))
                    case .manual:
                        Stepper(value: $manualMinutes, in: 1...300, step: 1) {
                            Text("Длительность: \(DurationFormatter.string(minutes: manualMinutes))")
                        }
                        Text("От 1 минуты до 5 часов")
                            .font(.caption)
                            .foregroundStyle(Theme.Palette.textSecondary)
                    case .dayLong:
                        Picker("Длительность", selection: $dayLongFlag) {
                            Text(DayLongFlag.almostAllDay.title).tag(DayLongFlag.almostAllDay)
                            Text(DayLongFlag.allDay.title).tag(DayLongFlag.allDay)
                        }
                        .pickerStyle(.inline)
                    }
                }

                Section {
                    IntensitySelector(value: $intensity)
                }

                Section {
                    ReasonPicker(episodeType: type, selectedIDs: $reasonIDs, customText: $customReason)
                }

                Section("Заметка") {
                    TextField("Комментарий", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(mode.title)
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

    private var computedEndMinutes: Int {
        max(1, Int(endTime.timeIntervalSince(startTime) / 60))
    }

    private func loadInitial() {
        guard let episode = editingEpisode else {
            startTime = .now
            endTime = .now
            return
        }
        type = episode.type
        startTime = episode.startTime
        endTime = episode.endTime ?? .now
        intensity = episode.intensity
        reasonIDs = episode.reasonIDs
        customReason = episode.customReasonText ?? ""
        notes = episode.notes ?? ""
        if episode.dayLongFlag != .none {
            durationMode = .dayLong
            dayLongFlag = episode.dayLongFlag
        } else {
            durationMode = .byEndTime
        }
    }

    private func save() {
        let episode = editingEpisode ?? Episode(startTime: startTime)
        episode.type = type
        episode.startTime = startTime
        episode.intensity = intensity
        episode.reasonIDs = reasonIDs
        episode.customReasonText = customReason.isEmpty ? nil : customReason
        episode.notes = notes.isEmpty ? nil : notes
        episode.updatedAt = .now

        switch durationMode {
        case .byEndTime:
            episode.endTime = endTime
            episode.manualDurationMinutes = nil
            episode.dayLongFlag = .none
        case .manual:
            episode.manualDurationMinutes = manualMinutes
            episode.endTime = Calendar.current.date(byAdding: .minute, value: manualMinutes, to: startTime)
            episode.dayLongFlag = .none
        case .dayLong:
            episode.dayLongFlag = dayLongFlag
            episode.manualDurationMinutes = nil
            episode.endTime = Calendar.current.date(byAdding: .minute, value: dayLongFlag.approximateMinutes, to: startTime)
        }

        if editingEpisode == nil {
            context.insert(episode)
        }
        try? context.save()

        DayService(context: context, thresholds: settings.thresholds).recalculate(on: startTime)
        dismiss()
    }
}

#Preview {
    EpisodeFormView(mode: .create)
        .environment(AppSettings())
        .modelContainer(AppModelContainer.makePreview())
}
