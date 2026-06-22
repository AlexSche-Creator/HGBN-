import Foundation
import SwiftUI

/// Пользовательские настройки приложения. Хранится в UserDefaults,
/// чтобы открываться мгновенно и работать офлайн.
@Observable
final class AppSettings {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.anxietyTrackingEnabled = defaults.object(forKey: Keys.anxietyEnabled) as? Bool ?? true
        self.manualDayOverrideEnabled = defaults.object(forKey: Keys.manualOverride) as? Bool ?? true
        self.eveningReminderEnabled = defaults.object(forKey: Keys.eveningReminder) as? Bool ?? false
        self.eveningReminderHour = defaults.object(forKey: Keys.reminderHour) as? Int ?? 21
        self.preferredColorSchemeRaw = defaults.string(forKey: Keys.colorScheme) ?? "system"
        if let data = defaults.data(forKey: Keys.thresholds),
           let decoded = try? JSONDecoder().decode(DayThresholds.self, from: data) {
            self.thresholds = decoded
        } else {
            self.thresholds = .default
        }
    }

    var anxietyTrackingEnabled: Bool {
        didSet { defaults.set(anxietyTrackingEnabled, forKey: Keys.anxietyEnabled) }
    }

    var manualDayOverrideEnabled: Bool {
        didSet { defaults.set(manualDayOverrideEnabled, forKey: Keys.manualOverride) }
    }

    var eveningReminderEnabled: Bool {
        didSet { defaults.set(eveningReminderEnabled, forKey: Keys.eveningReminder) }
    }

    var eveningReminderHour: Int {
        didSet { defaults.set(eveningReminderHour, forKey: Keys.reminderHour) }
    }

    var preferredColorSchemeRaw: String {
        didSet { defaults.set(preferredColorSchemeRaw, forKey: Keys.colorScheme) }
    }

    var thresholds: DayThresholds {
        didSet {
            if let data = try? JSONEncoder().encode(thresholds) {
                defaults.set(data, forKey: Keys.thresholds)
            }
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch preferredColorSchemeRaw {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    private enum Keys {
        static let anxietyEnabled = "settings.anxietyEnabled"
        static let manualOverride = "settings.manualOverride"
        static let eveningReminder = "settings.eveningReminder"
        static let reminderHour = "settings.reminderHour"
        static let colorScheme = "settings.colorScheme"
        static let thresholds = "settings.thresholds"
    }
}
