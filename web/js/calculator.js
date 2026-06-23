import { DAY_LONG } from './defaults.js';

export const clampIntensity = (n) => Math.min(10, Math.max(1, Math.round(n)));

export function dayKey(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function episodeDuration(ep) {
  const flag = ep.dayLongFlag || 'none';
  if (flag !== 'none') return DAY_LONG[flag].minutes;
  if (ep.manualDurationMinutes != null) return ep.manualDurationMinutes;
  if (ep.endTime) return Math.max(0, Math.round((new Date(ep.endTime) - new Date(ep.startTime)) / 60000));
  return 0;
}

export function recordDuration(r) {
  if (r.manualDurationMinutes != null) return r.manualDurationMinutes;
  if (r.endTime) return Math.max(0, Math.round((new Date(r.endTime) - new Date(r.startTime)) / 60000));
  return 0;
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 мин';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function plural(count, one, few, many) {
  const m100 = count % 100;
  const m10 = count % 10;
  if (m100 >= 11 && m100 <= 14) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

// episodes: [{ intensity, durationMinutes, isDayLong }]
// anxiety: [{ intensity }]
export function calculateDay(episodes, anxiety, manualOverride, t) {
  const totalEpisodes = episodes.length;
  const totalDuration = episodes.reduce((s, e) => s + e.durationMinutes, 0);
  const maxIntensity = episodes.reduce((m, e) => Math.max(m, e.intensity), 0);
  const avgIntensity = totalEpisodes ? episodes.reduce((s, e) => s + e.intensity, 0) / totalEpisodes : 0;
  const anxietyCount = anxiety.length;
  const anxietyMax = anxiety.reduce((m, a) => Math.max(m, a.intensity), 0);

  const autoStatus = computeAuto(episodes, totalEpisodes, totalDuration, maxIntensity, t);
  const status = manualOverride || autoStatus;
  const summary = textualSummary(status, totalEpisodes, totalDuration, maxIntensity, anxietyCount);

  return {
    status,
    totalEpisodes,
    totalDurationMinutes: totalDuration,
    maxIntensity,
    averageIntensity: avgIntensity,
    anxietyCount,
    anxietyMaxIntensity: anxietyMax,
    manuallyOverridden: !!manualOverride,
    textualSummary: summary,
  };
}

function computeAuto(episodes, count, total, maxI, t) {
  const anyDayLong = episodes.some((e) => e.isDayLong);
  const longest = episodes.reduce((m, e) => Math.max(m, e.durationMinutes), 0);

  if (anyDayLong || maxI >= t.nightmareIntensity || total > t.nightmareTotalDurationMinutes) return 'nightmare';

  if ((maxI >= t.terribleIntensityLow && maxI <= t.terribleIntensityHigh) ||
      longest > t.terribleSingleEpisodeMinutes ||
      total > t.terribleTotalDurationMinutes) return 'terrible';

  if (count > t.badMaxEpisodes ||
      total > t.badTotalDurationMinutes ||
      (maxI >= t.badIntensityLow && maxI <= t.badIntensityHigh)) return 'bad';

  if (count === 0) return 'superDay';
  if (count === 1 && episodes[0].durationMinutes <= t.shortEpisodeMinutes && episodes[0].intensity <= t.lowIntensity) {
    return 'superDay';
  }

  const allShortMild = episodes.every((e) => e.durationMinutes <= t.shortEpisodeMinutes && e.intensity <= t.lowIntensity);
  if ((count >= 2 && count <= t.goodMaxEpisodes && allShortMild) ||
      (total <= t.goodTotalDurationMinutes && maxI <= t.lowIntensity)) return 'good';

  return 'good';
}

function textualSummary(status, count, total, maxI, anxietyCount) {
  if (count === 0 && anxietyCount === 0) {
    return 'Сегодня без эпизодов. Спокойный день для самонаблюдения.';
  }
  const epText = `${count} ${plural(count, 'эпизод', 'эпизода', 'эпизодов')}`;
  const durText = formatDuration(total);
  const intText = maxI > 0 ? `максимальная интенсивность ${maxI}/10` : '';

  let base;
  switch (status) {
    case 'superDay': base = `Сегодня был супер день: ${epText}, ${durText}`; break;
    case 'good': base = `Сегодня был хороший день: ${epText}, суммарно ${durText}`; break;
    case 'bad': base = `Сегодня был непростой день: ${epText}, суммарно ${durText}`; break;
    case 'terrible': base = `Сегодня был тяжёлый день: ${epText}, суммарно ${durText}`; break;
    default: base = `Сегодня был очень тяжёлый день: ${epText}, суммарно ${durText}`;
  }
  if (intText) base += `, ${intText}`;
  if (anxietyCount > 0) base += `. Тревога: ${anxietyCount} ${plural(anxietyCount, 'запись', 'записи', 'записей')}`;
  return base + '.';
}
