# Архитектура

Приложение построено по принципу **MVVM + слой сервисов**, с жёстким
разделением UI, бизнес-логики и хранения. Бизнес-расчёты не зависят от UI и
покрыты unit-тестами.

```
┌─────────────────────────────────────────────┐
│  Views (SwiftUI)                             │
│  Home / Episode / Anxiety / Calendar /       │
│  Statistics / Settings                       │
└───────────────┬─────────────────────────────┘
                │ читает @Query, вызывает сервисы
┌───────────────▼─────────────────────────────┐
│  Services (чистая логика и доступ к данным)  │
│  • DayStatusCalculator  (pure, Foundation)   │
│  • DayService           (расчёт дня + CRUD)  │
│  • StatisticsService    (агрегации)          │
│  • ExportService        (JSON/CSV → DWH)     │
│  • NotificationService  (напоминания)        │
│  • AppSettings          (@Observable)        │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│  Storage (SwiftData)                         │
│  Episode / AnxietyRecord / Reason / DaySummary│
└─────────────────────────────────────────────┘
```

## Принципы

- **Чистое ядро.** `DayStatusCalculator` оперирует value-типами
  (`EpisodeInput`, `AnxietyInput`) и не знает ни о SwiftData, ни о SwiftUI —
  это делает его легко тестируемым без контейнера.
- **Настраиваемая логика.** Пороги вынесены в `DayThresholds` и хранятся в
  `AppSettings`; UI не содержит зашитых правил оценки дня.
- **Офлайн-first.** Всё хранится локально в SwiftData, без обязательной
  регистрации. `userID` заложен для будущей синхронизации.
- **Готовность к DWH.** `ExportService` сериализует данные в нормализованную
  структуру fact/dim/bridge (см. `docs/DWH.md`).
- **Превью и тесты.** `AppModelContainer.makePreview()` + `MockData` дают
  in-memory контейнер с демо-данными для всех SwiftUI Preview и тестов.

## Поток «фиксация эпизода»

1. `HomeView` → «Начался эпизод» создаёт активный `Episode` (`endTime == nil`).
2. «Завершить» проставляет `endTime`, открывает `EpisodeFormView` для уточнения.
3. После сохранения `DayService.recalculate(on:)` пересчитывает `DaySummary`.
4. `DayStatusCalculator` возвращает статус, метрики и текстовое резюме.

Ручное переопределение статуса (`DayService.overrideStatus`) сохраняется и
имеет приоритет над авторасчётом.
