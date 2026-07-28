import { store } from './store.js';
import { dayKey, startOfDay, episodeDuration } from './calculator.js';
import { STATUS_META } from './defaults.js';

function intervalFor(period, anchor = new Date()) {
  const start = startOfDay(anchor);
  const end = new Date(start);
  if (period === 'day') {
    end.setDate(end.getDate() + 1);
  } else if (period === 'week') {
    const dow = (start.getDay() + 6) % 7; // понедельник = 0
    start.setDate(start.getDate() - dow);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (period === 'month') {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  }
  return { start, end };
}

function eachDay({ start, end }) {
  const days = [];
  const d = new Date(start);
  while (d < end) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}

export function summary(period) {
  const range = intervalFor(period);
  const inRange = (iso) => { const t = new Date(iso); return t >= range.start && t < range.end; };

  const episodes = store.episodes.filter((e) => e.endTime && inRange(e.startTime));
  const anxiety = store.anxiety.filter((a) => a.endTime && inRange(a.startTime));

  const totalDuration = episodes.reduce((s, e) => s + episodeDuration(e), 0);
  const maxIntensity = episodes.reduce((m, e) => Math.max(m, e.intensity), 0);
  const avgIntensity = episodes.length ? episodes.reduce((s, e) => s + e.intensity, 0) / episodes.length : 0;

  // По дням
  const byDayCount = {}, byDayDur = {};
  for (const e of episodes) {
    const k = dayKey(e.startTime);
    byDayCount[k] = (byDayCount[k] || 0) + 1;
    byDayDur[k] = (byDayDur[k] || 0) + episodeDuration(e);
  }
  const days = eachDay(range);
  const episodesPerDay = days.map((d) => ({ date: d, value: byDayCount[dayKey(d)] || 0 }));
  const durationPerDay = days.map((d) => ({ date: d, value: byDayDur[dayKey(d)] || 0 }));

  // Топ причин
  const topHeadache = topReasons(episodes.flatMap((e) => e.reasonIDs || []));
  const topAnxiety = topReasons(anxiety.flatMap((a) => a.reasonIDs || []));

  // По времени суток
  const hourDist = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const e of episodes) hourDist[new Date(e.startTime).getHours()].count++;

  // Корреляция тревога + напряжение по дням
  const epDays = new Set(episodes.map((e) => dayKey(e.startTime)));
  const anxDays = new Set(anxiety.map((a) => dayKey(a.startTime)));
  const union = new Set([...epDays, ...anxDays]);
  let both = 0; epDays.forEach((d) => { if (anxDays.has(d)) both++; });
  const correlation = union.size ? both / union.size : 0;

  // Лучшие/тяжёлые дни
  const dayResults = days
    .map((d) => ({ date: d, res: store.computeDay(d) }))
    .filter((x) => x.res.totalEpisodes > 0 || store.isOverridden(x.date));
  const bestDays = dayResults
    .filter((x) => STATUS_META[x.res.status].severity <= 1)
    .sort((a, b) => STATUS_META[a.res.status].severity - STATUS_META[b.res.status].severity);
  const worstDays = dayResults
    .filter((x) => STATUS_META[x.res.status].severity >= 2)
    .sort((a, b) => STATUS_META[b.res.status].severity - STATUS_META[a.res.status].severity);

  return {
    totalEpisodes: episodes.length,
    totalDuration,
    avgDuration: episodes.length ? Math.round(totalDuration / episodes.length) : 0,
    maxIntensity,
    avgIntensity,
    anxietyEpisodes: anxiety.length,
    correlation,
    episodesPerDay,
    durationPerDay,
    topHeadache,
    topAnxiety,
    hourDist,
    bestDays,
    worstDays,
    noEpisodeStreak: streak((res) => res.totalEpisodes === 0),
    superDayStreak: streak((res) => res.status === 'superDay'),
  };
}

// Статистика настроений и маркеров из импорта Daylio за период.
export function moodSummary(period) {
  const d = store.daylio;
  if (!d) return null;
  const range = intervalFor(period);
  const inRange = (iso) => { const t = new Date(iso); return t >= range.start && t < range.end; };
  const entries = d.entries.filter((e) => inRange(e.dateTime));

  const dist = [0, 0, 0, 0, 0, 0]; // индексы 1..5
  entries.forEach((e) => { if (e.mood >= 1 && e.mood <= 5) dist[e.mood]++; });

  const counts = {};
  entries.forEach((e) => (e.tags || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  const nameById = {};
  d.markers.forEach((m) => { nameById[m.id] = m.name; });
  const topMarkers = Object.entries(counts)
    .map(([id, count]) => ({ title: nameById[id] || '—', count }))
    .filter((x) => x.title !== '—')
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const avgMood = entries.length ? entries.reduce((s, e) => s + e.mood, 0) / entries.length : 0;
  return { count: entries.length, dist, topMarkers, avgMood };
}

function topReasons(ids, limit = 5) {
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts)
    .map(([id, count]) => ({ title: store.reasonTitle(id) || '—', count }))
    .filter((x) => x.title !== '—')
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function streak(predicate) {
  let n = 0;
  const d = startOfDay(new Date());
  for (;;) {
    const res = store.computeDay(d);
    // День без записей: для «без эпизодов» считаем, для супер-дней — прерываем.
    if (!predicate(res)) break;
    n++;
    d.setDate(d.getDate() - 1);
    if (n > 366) break;
  }
  return n;
}
