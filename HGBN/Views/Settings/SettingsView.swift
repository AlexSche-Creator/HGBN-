import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings

    @State private var shareURL: URL?
    @State private var showResetConfirm = false
    @State private var exportError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Причины") {
                    NavigationLink {
                        ReasonsManagementView(filter: .headache)
                    } label: {
                        Label("Причины напряжения", systemImage: "list.bullet")
                    }
                    NavigationLink {
                        ReasonsManagementView(filter: .anxiety)
                    } label: {
                        Label("Причины тревоги", systemImage: "list.bullet")
                    }
                }

                Section("Оценка дня") {
                    NavigationLink {
                        ThresholdsView()
                    } label: {
                        Label("Пороги оценки дня", systemImage: "slider.horizontal.3")
                    }
                    overrideToggle
                }

                Section("Отслеживание") {
                    anxietyToggle
                    reminderToggle
                    if settings.eveningReminderEnabled {
                        Stepper(value: reminderHourBinding, in: 6...23) {
                            Text("Время напоминания: \(settings.eveningReminderHour):00")
                        }
                    }
                }

                Section("Оформление") {
                    Picker("Тема", selection: colorSchemeBinding) {
                        Text("Системная").tag("system")
                        Text("Светлая").tag("light")
                        Text("Тёмная").tag("dark")
                    }
                }

                Section("Данные") {
                    Button {
                        export(.json)
                    } label: {
                        Label("Экспорт в JSON", systemImage: "square.and.arrow.up")
                    }
                    Button {
                        export(.csv)
                    } label: {
                        Label("Экспорт в CSV", systemImage: "tablecells")
                    }
                    Button(role: .destructive) {
                        showResetConfirm = true
                    } label: {
                        Label("Сбросить все данные", systemImage: "trash")
                    }
                }

                Section {
                    Text("Дневник самонаблюдения. Приложение помогает фиксировать эпизоды, интенсивность, причины и длительность. Это не медицинский инструмент.")
                        .font(.caption)
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }
            .navigationTitle("Настройки")
            .tint(Theme.Palette.accent)
            .sheet(item: $shareURL) { url in
                ShareSheet(items: [url])
            }
            .alert("Сбросить данные?", isPresented: $showResetConfirm) {
                Button("Отмена", role: .cancel) {}
                Button("Сбросить", role: .destructive) { resetAll() }
            } message: {
                Text("Все эпизоды, записи тревоги и итоги дней будут удалены без возможности восстановления.")
            }
            .alert("Ошибка экспорта", isPresented: .constant(exportError != nil)) {
                Button("OK") { exportError = nil }
            } message: {
                Text(exportError ?? "")
            }
        }
    }

    // MARK: - Bindings

    private var anxietyToggle: some View {
        Toggle("Отслеживать тревогу", isOn: Binding(
            get: { settings.anxietyTrackingEnabled },
            set: { settings.anxietyTrackingEnabled = $0 }
        ))
    }

    private var overrideToggle: some View {
        Toggle("Ручное переопределение статуса", isOn: Binding(
            get: { settings.manualDayOverrideEnabled },
            set: { settings.manualDayOverrideEnabled = $0 }
        ))
    }

    private var reminderToggle: some View {
        Toggle("Вечернее напоминание", isOn: Binding(
            get: { settings.eveningReminderEnabled },
            set: { enabled in
                settings.eveningReminderEnabled = enabled
                Task { await updateReminder(enabled: enabled) }
            }
        ))
    }

    private var reminderHourBinding: Binding<Int> {
        Binding(
            get: { settings.eveningReminderHour },
            set: {
                settings.eveningReminderHour = $0
                if settings.eveningReminderEnabled {
                    NotificationService.scheduleEveningReminder(hour: $0)
                }
            }
        )
    }

    private var colorSchemeBinding: Binding<String> {
        Binding(
            get: { settings.preferredColorSchemeRaw },
            set: { settings.preferredColorSchemeRaw = $0 }
        )
    }

    // MARK: - Действия

    private enum ExportFormat { case json, csv }

    private func export(_ format: ExportFormat) {
        let service = ExportService(context: context)
        do {
            shareURL = format == .json ? try service.writeJSONFile() : try service.writeCSVFile()
        } catch {
            exportError = error.localizedDescription
        }
    }

    private func updateReminder(enabled: Bool) async {
        if enabled {
            _ = await NotificationService.requestAuthorization()
            NotificationService.scheduleEveningReminder(hour: settings.eveningReminderHour)
        } else {
            NotificationService.cancelEveningReminder()
        }
    }

    private func resetAll() {
        try? context.delete(model: Episode.self)
        try? context.delete(model: AnxietyRecord.self)
        try? context.delete(model: DaySummary.self)
        try? context.save()
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

#Preview {
    SettingsView()
        .environment(AppSettings())
        .modelContainer(AppModelContainer.makePreview())
}
