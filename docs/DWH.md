# Аналитическая модель (DWH)

Локальное хранилище (SwiftData) спроектировано так, чтобы данные легко
выгружались в нормализованную модель «звезда» для последующей аналитики.
Экспорт реализован в `ExportService` (JSON/CSV) и повторяет структуру ниже.

## Факты

### fact_episode
| поле | тип | описание |
|------|-----|----------|
| episode_id | string (uuid) | идентификатор эпизода |
| user_id | string | пользователь (локально `local-user`) |
| start_datetime | timestamp | начало |
| end_datetime | timestamp? | окончание |
| duration_minutes | int | длительность |
| intensity | int (1–10) | интенсивность |
| type | string | headache / mixed |
| day_key | int (YYYYMMDD) | ссылка на dim_date |
| created_at / updated_at | timestamp | служебные |

### fact_anxiety
| поле | тип |
|------|-----|
| anxiety_id | string (uuid) |
| user_id | string |
| start_datetime | timestamp |
| end_datetime | timestamp? |
| duration_minutes | int |
| intensity | int (1–10) |
| day_key | int |
| linked_episode_id | string? |
| created_at / updated_at | timestamp |

### fact_day_summary
| поле | тип |
|------|-----|
| day_key | int |
| user_id | string |
| total_episodes | int |
| total_duration_minutes | int |
| max_intensity | int |
| avg_intensity | double |
| anxiety_count | int |
| anxiety_max_intensity | int |
| day_status | string |
| manually_overridden | bool |
| created_at / updated_at | timestamp |

## Измерения

### dim_reason
| поле | тип |
|------|-----|
| reason_id | string (uuid) |
| user_id | string |
| title | string |
| type | string (headacheReason / anxietyReason / both) |
| is_default | bool |
| is_active | bool |

### dim_date
| поле | тип |
|------|-----|
| day_key | int (YYYYMMDD) |
| date | date |
| day_of_week | int |
| week | int |
| month | int |
| quarter | int |
| year | int |

> `dim_date` генерируется на стороне DWH из `day_key` — на клиенте достаточно
> хранить ключ дня. Все факты ссылаются на `day_key`.

## Мосты (many-to-many)

### bridge_episode_reason
`episode_id` × `reason_id`

### bridge_anxiety_reason
`anxiety_id` × `reason_id`

## Соответствие клиент → DWH

| Клиентская модель (SwiftData) | DWH |
|-------------------------------|-----|
| `Episode` | `fact_episode` + `bridge_episode_reason` |
| `AnxietyRecord` | `fact_anxiety` + `bridge_anxiety_reason` |
| `DaySummary` | `fact_day_summary` |
| `Reason` | `dim_reason` |
| `DayKey.make(from:)` | `day_key` |

Экспорт сериализуется одним документом `DWHExport` (см. `ExportService`),
готовым к загрузке в стейджинг-слой и нормализации.
