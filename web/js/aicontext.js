// Сбор среза данных для AI-аналитики: эпизоды, тревога, давление, приёмы,
// вмешательства (отчёт), Daylio (настроения/маркеры/цели), Apple Health, документы.
// Пользователь видит и выбирает, что именно уходит в запрос (вкладка AI → «Данные для анализа»).

import { dayKey, episodeDuration, recordDuration } from './calculator.js';
import { signedSum } from './defaults.js';

export const SOURCES = [
  ['episodes', 'Эпизоды напряжения'],
  ['anxiety', 'Тревога'],
  ['bp', 'Давление'],
  ['intakes', 'Приёмы препаратов'],
  ['interventions', 'Отчёт по вмешательствам'],
  ['daylio', 'Daylio: настроение, маркеры, цели'],
  ['health', 'Apple Health'],
  ['documents', 'Документы'],
];

export const PERIODS = [
  ['month', 'Месяц'],
  ['quarter', '3 месяца'],
  ['year', 'Год'],
  ['all', 'Всё время'],
];

export const DEFAULT_SCOPE = SOURCES.reduce((a, [k]) => { a[k] = true; return a; }, {});

function rangeFor(period) {
  const end = new Date();
  if (period === 'all') return { start: new Date(0), end };
  const start = new Date(end);
  if (period === 'month') start.setMonth(start.getMonth() - 1);
  else if (period === 'quarter') start.setMonth(start.getMonth() - 3);
  else start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

const avg = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const isoDay = (d) => {
  const x = new Date(d); const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

// Сколько записей каждого источника доступно (для окна выбора).
export function sourceCounts(store) {
  const d = store.daylio;
  return {
    episodes: store.episodes.filter((e) => e.endTime).length,
    anxiety: store.anxiety.filter((a) => a.endTime).length,
    bp: store.bp.length,
    intakes: store.intakesAll ? store.intakesAll().length : (store.data?.intakes?.length ?? 0),
    interventions: store.medications().length,
    daylio: d ? d.entries.length : 0,
    health: store.hasHealth() ? Object.keys(store.health.days).length : 0,
    documents: store.documents().length,
  };
}

export function buildAIContext(store, { scope = DEFAULT_SCOPE, period = 'month' } = {}) {
  const { start, end } = rangeFor(period);
  const inRange = (iso) => { const t = new Date(iso); return t >= start && t <= end; };
  const out = {
    период: PERIODS.find(([k]) => k === period)?.[1] || period,
    от: isoDay(start), до: isoDay(end),
  };

  if (scope.episodes) {
    const eps = store.episodes.filter((e) => e.endTime && inRange(e.startTime));
    const byDay = {};
    eps.forEach((e) => { const k = isoDay(e.startTime); byDay[k] = (byDay[k] || 0) + 1; });
    const reasons = {};
    eps.forEach((e) => (e.reasonIDs || []).forEach((id) => {
      const t = store.reasonTitle(id); if (t) reasons[t] = (reasons[t] || 0) + 1;
    }));
    const hours = Array(24).fill(0);
    eps.forEach((e) => { hours[new Date(e.startTime).getHours()]++; });
    out.эпизоды = {
      всего: eps.length,
      средняя_интенсивность: avg(eps.map((e) => e.intensity)),
      макс_интенсивность: eps.reduce((m, e) => Math.max(m, e.intensity), 0) || null,
      суммарно_минут: eps.reduce((s, e) => s + episodeDuration(e), 0),
      средняя_длительность_мин: avg(eps.map((e) => episodeDuration(e))),
      по_дням: byDay,
      частые_причины: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([t, c]) => `${t}: ${c}`),
      по_часам: hours.map((c, h) => (c ? `${h}ч:${c}` : null)).filter(Boolean),
    };
  }

  if (scope.anxiety) {
    const anx = store.anxiety.filter((a) => a.endTime && inRange(a.startTime));
    const reasons = {};
    anx.forEach((a) => (a.reasonIDs || []).forEach((id) => {
      const t = store.reasonTitle(id); if (t) reasons[t] = (reasons[t] || 0) + 1;
    }));
    const epDays = new Set(store.episodes.filter((e) => e.endTime && inRange(e.startTime)).map((e) => isoDay(e.startTime)));
    const anxDays = new Set(anx.map((a) => isoDay(a.startTime)));
    let both = 0; anxDays.forEach((d) => { if (epDays.has(d)) both++; });
    const union = new Set([...epDays, ...anxDays]).size;
    out.тревога = {
      всего: anx.length,
      средняя_интенсивность: avg(anx.map((a) => a.intensity)),
      суммарно_минут: anx.reduce((s, a) => s + recordDuration(a), 0),
      частые_причины: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `${t}: ${c}`),
      доля_дней_вместе_с_напряжением: union ? +(both / union).toFixed(2) : null,
    };
  }

  if (scope.bp) {
    const bp = store.bpSorted().filter((r) => inRange(r.dateTime));
    out.давление = {
      измерений: bp.length,
      средн_САД: avg(bp.map((r) => r.sys)),
      средн_ДАД: avg(bp.map((r) => r.dia)),
      средн_пульс: avg(bp.map((r) => r.pulse).filter(Boolean)),
      последние: bp.slice(0, 40).map((r) => ({
        дата: r.dateTime.slice(0, 16).replace('T', ' '), сад: r.sys, дад: r.dia, пульс: r.pulse || null, контекст: r.context || '',
      })),
    };
  }

  if (scope.intakes) {
    const all = (store.data?.intakes) || [];
    const taken = {}, skipped = {};
    all.filter((x) => inRange(x.dateTime)).forEach((x) => {
      const name = store.medicationName(x.medicationId) || '—';
      (x.taken ? taken : skipped)[name] = ((x.taken ? taken : skipped)[name] || 0) + 1;
    });
    out.приёмы = { принято: taken, пропущено: skipped };
  }

  if (scope.interventions) {
    out.вмешательства = store.medications().map((m) => ({
      n: m.seedNo || null, наименование: m.name, тип: m.type || 'medication',
      назначение: [m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}`.trim() : '', m.schedule].filter(Boolean).join(' · ') || null,
      клиника: m.clinic || m.prescribedBy || null, год: m.year || null,
      физ: m.physScore || 0, псих: m.psychScore || 0, невр: m.neuroScore || 0, сумма: signedSum(m),
      ощущения: m.sensations || null,
      подтверждено_документом: m.provenance ? Object.keys(m.provenance) : null,
    }));
  }

  if (scope.daylio && store.hasDaylio()) {
    const d = store.daylio;
    const entries = d.entries.filter((e) => inRange(e.dateTime));
    const dist = [0, 0, 0, 0, 0, 0];
    entries.forEach((e) => { if (e.mood >= 1 && e.mood <= 5) dist[e.mood]++; });
    const nameById = {}; d.markers.forEach((m) => { nameById[m.id] = m.name; });
    const groupById = {}; d.groups.forEach((g) => { groupById[g.id] = g.name; });
    const markerGroup = {}; d.markers.forEach((m) => { markerGroup[m.id] = groupById[m.groupId] || ''; });
    const counts = {};
    entries.forEach((e) => (e.tags || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([id, c]) => ({ маркер: nameById[id] || '—', группа: markerGroup[id] || '', раз: c }))
      .filter((x) => x.маркер !== '—');
    const byDay = {};
    entries.forEach((e) => { byDay[isoDay(e.dateTime)] = e.mood; });
    out.daylio = {
      записей: entries.length,
      настроение_шкала: '1 = супер … 5 = ужасно',
      распределение: { супер: dist[1], хорошо: dist[2], так_себе: dist[3], плохо: dist[4], ужасно: dist[5] },
      среднее_настроение: avg(entries.map((e) => e.mood)),
      настроение_по_дням: byDay,
      частые_маркеры: top,
      группы_маркеров: d.groups.map((g) => g.name),
      цели: d.goals.filter((g) => (g.name || '').trim()).map((g) => g.name),
    };
  }

  if (scope.health && store.hasHealth()) {
    const days = store.health.days;
    const keys = Object.keys(days).filter((k) => {
      const t = new Date(k + 'T12:00:00'); return t >= start && t <= end;
    }).sort();
    const pick = (f) => keys.map((k) => days[k][f]).filter((v) => v != null);
    out.apple_health = {
      дней: keys.length,
      средн_пульс: avg(pick('hr')), средн_пульс_покоя: avg(pick('restHr')),
      средн_ВСР: avg(pick('hrv')), средн_сон_ч: avg(pick('sleepH')),
      средн_шаги: avg(pick('steps')),
      по_дням: keys.slice(-90).reduce((a, k) => { a[k] = days[k]; return a; }, {}),
    };
  }

  if (scope.documents) {
    out.документы = store.documents().map((d) => ({
      имя: d.name, тип: d.mediaType === 'application/pdf' ? 'PDF' : 'изображение',
      загружен: d.addedAt.slice(0, 10), распознан: !!d.parsed, клиника: d.clinic || null,
    }));
  }

  return out;
}

export function contextSize(ctx) {
  const s = JSON.stringify(ctx);
  return { chars: s.length, kb: +(s.length / 1024).toFixed(1), approxTokens: Math.round(s.length / 3) };
}
