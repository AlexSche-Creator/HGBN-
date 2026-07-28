import { store, episodeDuration, recordDuration } from './store.js';
import { calculateDay, dayKey, startOfDay, formatDuration } from './calculator.js';
import { STATUSES, STATUS_META, EPISODE_TYPES, DAY_LONG,
  MED_CLASSES, medClassTitle, DOSE_UNITS, BP_CONTEXTS, bpContextTitle,
  EFFECT_GROUPS, SEVERITY, INTERVENTION_TYPES, interventionTypeTitle,
  SIGNED_AXES, signedSum } from './defaults.js';
import { summary as statsSummary, moodSummary } from './stats.js';
import { lineChart, barChart, hourChart, donut, bpChart } from './charts.js';
import { exportJSON, exportCSV } from './export.js';
import { icon } from './icons.js';
import { parseDaylio, MOOD_META } from './daylio.js';
import { putDoc, getDoc, deleteDoc, blobToBase64 } from './db.js';
import * as ai from './ai.js';
import { parseAppleHealth, HEALTH_METRICS } from './applehealth.js';
import { seedInterventions, SEED_COUNT } from './seed.js';
import { buildAIContext, sourceCounts, contextSize, SOURCES, PERIODS, DEFAULT_SCOPE } from './aicontext.js';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheetRoot = $('#sheet-root');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function toLocalInput(date) {
  const d = new Date(date);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ---------- app state ----------
const state = {
  tab: 'input',
  calMonth: startOfDay(new Date()),
  statsPeriod: 'week',
  diagRoute: 'root',
  aiRoute: 'root',
};
let timer = null;

// ---------- components ----------
function badge(status, compact = false) {
  const m = STATUS_META[status];
  return `<span class="badge" style="color:${m.color}">${icon(m.icon, 'sm')}${compact ? '' : esc(m.title)}</span>`;
}

function metric(value, caption, iconName) {
  return `<div class="metric">${iconName ? `<span class="micon">${icon(iconName, 'sm')}</span>` : ''}
    <div class="value">${esc(value)}</div><div class="caption">${esc(caption)}</div></div>`;
}

function intensityField(value) {
  const cells = Array.from({ length: 10 }, (_, i) => i + 1).map((i) =>
    `<div class="icell ${i <= value ? 'on' : ''}" data-action="intensity" data-val="${i}">${i}</div>`).join('');
  return `<div class="intensity">
    <div class="intensity-head"><span class="lbl">Интенсивность</span><span class="val">${value}/10</span></div>
    <div class="intensity-cells">${cells}</div></div>`;
}

function reasonChips(episodeType, selected) {
  const list = store.reasonsFor(episodeType);
  const chips = list.map((r) =>
    `<div class="chip ${selected.includes(r.id) ? 'on' : ''}" data-action="toggle-reason" data-id="${r.id}">${icon(r.iconName, 'sm')}${esc(r.title)}</div>`
  ).join('');
  return `<label class="field">Причина</label><div class="chips">${chips || '<span class="muted">Нет активных причин</span>'}</div>`;
}

function segmented(group, current, options) {
  return `<div class="segmented">${options.map(([val, label]) =>
    `<button data-action="seg" data-group="${group}" data-val="${val}" class="${current === val ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
}

// ---------- ВВОД ДАННЫХ (первая вкладка) ----------
function renderInput() {
  const active = store.activeEpisode();
  const activeAnx = store.activeAnxiety();
  const r = store.computeDay(new Date());

  const s = store.settings;
  const capture = `
    <div class="capture-grid">
      ${captureCard('headache', 'Напряжение', 'waveform.path', active)}
      ${s.anxietyEnabled ? captureCard('anxiety', 'Тревога', 'wind', activeAnx) : ''}
    </div>`;

  view.innerHTML = `
    <h1 class="nav-title">Ввод данных</h1>
    ${capture}
    <div class="card stack">
      <div class="row between"><div class="section-header">Статус дня</div>${badge(r.status)}</div>
      <div class="muted">${esc(r.textualSummary)}</div>
    </div>
    <div class="grid2">
      ${metric(r.totalEpisodes, 'эпизодов', 'number')}
      ${metric(formatDuration(r.totalDurationMinutes), 'длительность', 'clock')}
      ${metric(r.maxIntensity > 0 ? r.maxIntensity + '/10' : '—', 'макс. интенсивность', 'gauge')}
      ${metric(r.anxietyCount, 'тревога', 'wind')}
    </div>
    <div style="height:6px"></div>
    ${bpSection()}
    <div style="height:8px"></div>
    ${medsSection()}
    ${importSection()}
    <div class="card"><div class="muted" style="font-size:13px">Дневник самонаблюдения. Всё фиксируется для наблюдения и разговора с врачом — это не диагноз и не назначение. Данные хранятся только на устройстве.</div></div>`;

  startTimers();
}

// Одинаковая карточка запуска для напряжения и тревоги.
function captureCard(kind, title, iconName, activeRec) {
  const running = !!activeRec;
  return `<div class="capture-tile ${running ? 'on' : ''}">
    <div class="ct-head">${icon(iconName, 'sm')} <span>${title}</span></div>
    ${running
      ? `<div class="timer" data-timer-start="${activeRec.startTime}">00:00</div>
         <button class="btn-primary" data-action="${kind === 'headache' ? 'finish-episode' : 'finish-anxiety'}" data-id="${activeRec.id}">${icon('stop')} Завершить</button>`
      : `<div class="ct-sub">Не идёт</div>
         <button class="btn-primary" data-action="${kind === 'headache' ? 'cap-episode-now' : 'cap-anxiety-now'}">${icon('play')} Начать</button>`}
    <button class="btn-ghost ct-back" data-action="${kind === 'headache' ? 'cap-episode-back' : 'cap-anxiety-back'}">Задним числом</button>
  </div>`;
}

// Импорт данных: Daylio уже работает; Apple Health и документы — в следующих фазах.
function importSection() {
  const d = store.daylio;
  const daylioRow = d
    ? `<div class="list-item tappable" data-action="pick-daylio">${icon('check')}<span class="grow">Daylio импортирован · ${d.counts?.entries ?? d.entries.length} записей</span><span class="muted" style="font-size:12px">обновить</span></div>`
    : `<div class="list-item tappable" data-action="pick-daylio">${icon('upload')}<span class="grow">Импорт Daylio (.daylio)</span>${icon('chevron.right', 'sm')}</div>`;
  const h = store.health;
  const healthRow = store.hasHealth()
    ? `<div class="list-item tappable" data-action="pick-health">${icon('check')}<span class="grow">Apple Health · ${h.counts?.days ?? Object.keys(h.days).length} дней</span><span class="muted" style="font-size:12px">обновить</span></div>`
    : `<div class="list-item tappable" data-action="pick-health">${icon('heart')}<span class="grow">Импорт Apple Health (ZIP)</span>${icon('chevron.right', 'sm')}</div>`;
  return `
    ${documentsSection()}
    <div class="section-header">Импорт истории</div>
    <div class="list">
      ${daylioRow}
      ${healthRow}
    </div>
    <div class="muted" style="font-size:12px;margin:6px 4px 10px">Daylio и Apple Health переносятся из выгрузок.</div>`;
}

// Загрузка документов — заметный блок, а не строка в списке.
function documentsSection() {
  const docs = store.documents();
  return `
    <div class="section-header">Документы: анамнезы, заключения, назначения</div>
    <div class="card stack">
      <div class="muted" style="font-size:13px">Сфотографируйте или выберите <strong>JPEG / PDF</strong>. Нейросеть распознает наименование, дозу, частоту и клинику и дополнит отчёт. Первичный документ с печатью перекрывает данные в отчёте.</div>
      <button class="btn-primary" data-action="pick-doc">${icon('camera')} Загрузить JPEG / PDF</button>
      ${ai.hasApiKey() ? '' : '<div class="muted" style="font-size:12px">Для распознавания добавьте AI-ключ в «Диагностике». Загружать и хранить документы можно и без него.</div>'}
    </div>
    ${docs.length ? docsList(docs) : ''}`;
}

function docsList(docs) {
  const rows = docs.map((d) => {
    const kind = d.mediaType === 'application/pdf' ? 'PDF' : 'JPEG';
    const status = d.parsed ? `<span class="badge">${icon('check', 'sm')} распознан</span>` : '';
    return `<div class="card tight">
      <div class="row between">
        <div class="grow"><div style="font-weight:600">${icon('table', 'sm')} ${esc(d.name)}</div>
          <div class="muted" style="font-size:12px">${kind} · ${new Date(d.addedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}${d.clinic ? ` · ${esc(d.clinic)}` : ''}</div></div>
        ${status}
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn-secondary" style="padding:10px" data-action="parse-doc" data-id="${d.id}">${icon('spark', 'sm')} Распознать</button>
        <button class="icon-btn" data-action="view-doc" data-id="${d.id}" aria-label="Открыть">${icon('eye', 'sm')}</button>
        <button class="icon-btn" style="color:var(--danger)" data-action="del-doc" data-id="${d.id}" aria-label="Удалить">${icon('trash', 'sm')}</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="list-head">Загружено (${docs.length})</div>${rows}`;
}

// ---------- Импорт Daylio: разбор → предпросмотр → запись ----------
let daylioPreview = null;
async function handleDaylioFile(file) {
  if (!file) return;
  toast('Разбираю бэкап…');
  try {
    const buf = await file.arrayBuffer();
    const parsed = await parseDaylio(buf);
    parsed.counts = parsed.counts || {};
    daylioPreview = parsed;
    openSheet(renderDaylioPreview);
  } catch (err) {
    toast('Не удалось прочитать: ' + (err?.message || 'ошибка формата'));
  }
}
function renderDaylioPreview() {
  const p = daylioPreview;
  if (!p) return '';
  const c = p.counts;
  const range = p.entries.length
    ? `${new Date(p.entries[0].dateTime).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} → ${new Date(p.entries[p.entries.length - 1].dateTime).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}`
    : '—';
  return `
    <div class="sheet-head"><div class="title">Импорт Daylio</div>
      <button class="btn-ghost" data-action="close-sheet">Отмена</button></div>
    <div class="muted">Проверьте, что нашлось в бэкапе, и подтвердите перенос.</div>
    <div class="grid2" style="margin-top:12px">
      ${metric(c.entries, 'записей', 'calendar')}
      ${metric(c.markers, 'маркеров', 'stack')}
      ${metric(c.groups, 'групп', 'sliders')}
      ${metric(c.goals, 'целей', 'check')}
    </div>
    <div class="card" style="margin-top:10px"><div class="muted" style="font-size:13px">Период: ${range}. Триггеры из группы «Триггеры» дополнят ваш список причин без дублей.</div></div>
    <button class="btn-primary" data-action="confirm-daylio" style="margin-top:14px">${icon('check')} Импортировать</button>`;
}

// Тикают все элементы с data-timer-start (напряжение и тревога одновременно).
function startTimers() {
  const fmt = (startISO) => {
    const total = Math.max(0, Math.floor((Date.now() - new Date(startISO)) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };
  const tick = () => {
    const els = document.querySelectorAll('[data-timer-start]');
    if (!els.length) { clearInterval(timer); timer = null; return; }
    els.forEach((e) => { e.textContent = fmt(e.dataset.timerStart); });
  };
  tick();
  if (document.querySelector('[data-timer-start]')) timer = setInterval(tick, 1000);
}

// ---------- CALENDAR ----------
function renderCalendar() {
  const month = state.calMonth;
  const title = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayKey = dayKey(new Date());

  let cells = '';
  for (let i = 0; i < leading; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    const r = store.computeDay(date);
    const hasData = r.totalEpisodes > 0 || store.isOverridden(date);
    const m = STATUS_META[r.status];
    const ic = hasData ? `<span style="color:${m.color}">${icon(m.icon, 'sm')}</span>` : `<span class="muted">${icon('dot', 'sm')}</span>`;
    const mood = store.daylioMoodOn(date);
    const moodDot = mood ? `<span class="mood-dot" style="background:${MOOD_META[mood].color}"></span>` : '';
    cells += `<div class="cal-cell ${dayKey(date) === todayKey ? 'today' : ''}" data-action="open-day" data-date="${date.toISOString()}">
      <span class="dnum">${d}</span>${ic}${moodDot}</div>`;
  }

  const legend = STATUSES.map((st) =>
    `<div class="row" style="gap:10px"><span style="color:${STATUS_META[st].color}">${icon(STATUS_META[st].icon, 'sm')}</span>${STATUS_META[st].title}</div>`
  ).join('');

  view.innerHTML = `
    <h1 class="nav-title">Календарь</h1>
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-action="cal-prev">${icon('chevron.left', 'sm')}</button>
        <div style="font-weight:600;text-transform:capitalize">${esc(title)}</div>
        <button class="icon-btn" data-action="cal-next">${icon('chevron.right', 'sm')}</button>
      </div>
      <div class="cal-weekdays">${weekdays.map((w) => `<div>${w}</div>`).join('')}</div>
      <div style="height:6px"></div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="card stack"><div class="section-header">Обозначения</div>${legend}</div>`;
}

// ---------- DAY DETAIL (sheet) ----------
function openDay(date) {
  const render = () => {
    const r = store.computeDay(date);
    const eps = store.episodesOn(date).filter((e) => e.endTime);
    const anx = store.anxietyOn(date).filter((a) => a.endTime);
    const overridden = store.isOverridden(date);
    const s = store.settings;

    const overrideBtns = s.manualOverrideEnabled ? `
      <div class="list-head">Переопределить статус</div>
      <div class="chips">
        ${STATUSES.map((st) => `<div class="chip ${overridden && r.status === st ? 'on' : ''}" data-action="set-override" data-status="${st}">${STATUS_META[st].title}</div>`).join('')}
        ${overridden ? `<div class="chip" data-action="clear-override">Снять</div>` : ''}
      </div>` : '';

    const epList = eps.map((e) => `
      <div class="card tight episode-row">
        <div class="top"><span class="tag">${icon(EPISODE_TYPES[e.type].icon, 'sm')} ${EPISODE_TYPES[e.type].title}</span>
          <span style="color:var(--accent);font-weight:600">${e.intensity}/10</span></div>
        <div class="muted" style="font-size:13px">${fmtTime(e.startTime)} · ${formatDuration(episodeDuration(e))}</div>
        ${e.notes ? `<div class="muted" style="font-size:13px">${esc(e.notes)}</div>` : ''}
        <div class="row" style="justify-content:flex-end;gap:14px">
          <button class="btn-ghost" data-action="edit-episode" data-id="${e.id}">Изменить</button>
          <button class="btn-ghost" style="color:var(--danger)" data-action="del-episode" data-id="${e.id}">Удалить</button>
        </div>
      </div>`).join('');

    const anxList = anx.map((a) => `
      <div class="card tight row between">
        <span class="tag">${icon('wind', 'sm')} Тревога</span>
        <span class="muted" style="font-size:13px">${a.intensity}/10 · ${formatDuration(recordDuration(a))}
          <button class="btn-ghost" style="color:var(--danger)" data-action="del-anxiety" data-id="${a.id}">×</button></span>
      </div>`).join('');

    let healthBlock = '';
    const hm = store.healthOn(date);
    if (hm) {
      const cells = HEALTH_METRICS.filter(([k]) => hm[k] != null).map(([k, l, u]) =>
        `<div class="row between"><span class="muted">${l}</span><span style="font-weight:600">${hm[k]}${u ? ' ' + u : ''}</span></div>`).join('');
      if (cells) healthBlock = `<div class="list-head">Apple Health</div><div class="card tight stack">${cells}</div>`;
    }

    let daylioBlock = '';
    if (store.hasDaylio()) {
      const k = dayKey(date);
      const dayEntries = store.daylio.entries.filter((e) => dayKey(e.dateTime) === k);
      if (dayEntries.length) {
        const mood = dayEntries[dayEntries.length - 1].mood;
        const meta = MOOD_META[mood];
        const markerNames = [...new Set(dayEntries.flatMap((e) => e.tags))]
          .map((id) => store.daylioMarkerName(id)).filter(Boolean);
        const note = dayEntries.map((e) => e.note).filter(Boolean).join(' · ');
        daylioBlock = `<div class="list-head">Daylio</div>
          <div class="card tight stack">
            <div class="row" style="gap:8px;align-items:center"><span class="mood-dot" style="background:${meta.color}"></span><span style="font-weight:600">Настроение: ${meta.title}</span></div>
            ${markerNames.length ? `<div class="chips">${markerNames.map((n) => `<span class="chip on" style="pointer-events:none">${esc(n)}</span>`).join('')}</div>` : ''}
            ${note ? `<div class="muted" style="font-size:13px">${esc(note)}</div>` : ''}
          </div>`;
      }
    }

    return `
      <div class="sheet-head"><div class="title">${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
        <button class="btn-ghost" data-action="close-sheet">Готово</button></div>
      <div class="card stack">
        <div class="row between">${badge(r.status)}${overridden ? `<span class="muted" style="font-size:12px">${icon('hand', 'sm')} вручную</span>` : ''}</div>
        <div class="muted">${esc(r.textualSummary)}</div>
      </div>
      <div class="grid2">
        ${metric(r.totalEpisodes, 'эпизодов')}${metric(formatDuration(r.totalDurationMinutes), 'длительность')}
        ${metric(r.maxIntensity > 0 ? r.maxIntensity + '/10' : '—', 'макс.')}${metric(r.anxietyCount, 'тревога')}
      </div>
      ${overrideBtns}
      ${eps.length ? `<div class="list-head">Эпизоды</div>${epList}` : ''}
      ${anx.length ? `<div class="list-head">Тревога</div>${anxList}` : ''}
      ${healthBlock}
      ${daylioBlock}
      ${!eps.length && !anx.length && !daylioBlock && !healthBlock ? '<div class="empty-chart">В этот день записей нет</div>' : ''}`;
  };
  openSheet(render, { date });
}

// ---------- STATISTICS (тело для «Вечер дня») ----------
function statsBody() {
  const s = statsSummary(state.statsPeriod);
  const periods = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];

  return `
    <div class="section-header">Статистика</div>
    ${segmented('period', state.statsPeriod, periods)}
    <div style="height:12px"></div>
    <div class="grid2">
      ${metric(s.totalEpisodes, 'эпизодов', 'number')}
      ${metric(formatDuration(s.totalDuration), 'суммарно', 'clock')}
      ${metric(formatDuration(s.avgDuration), 'средняя длит.', 'timer')}
      ${metric(s.maxIntensity > 0 ? s.maxIntensity + '/10' : '—', 'макс. инт.', 'gauge')}
      ${metric(s.avgIntensity.toFixed(1), 'средняя инт.', 'gauge')}
      ${metric(s.anxietyEpisodes, 'тревога', 'wind')}
    </div>
    <div class="card row between">
      <div><div style="font-size:20px;font-weight:600;color:var(--accent)">${s.noEpisodeStreak}</div><div class="muted" style="font-size:12px">дней без эпизодов</div></div>
      <div><div style="font-size:20px;font-weight:600;color:var(--accent)">${s.superDayStreak}</div><div class="muted" style="font-size:12px">супер-дней подряд</div></div>
      <div><div style="font-size:20px;font-weight:600;color:var(--accent)">${Math.round(s.correlation * 100)}%</div><div class="muted" style="font-size:12px">тревога + напряжение</div></div>
    </div>
    <div class="card"><div class="section-header">Количество эпизодов</div>${lineChart(s.episodesPerDay)}</div>
    <div class="card"><div class="section-header">Длительность по дням</div>${barChart(s.durationPerDay)}</div>
    <div class="card"><div class="section-header">Топ причин напряжения</div>${donut(s.topHeadache)}</div>
    ${s.topAnxiety.length ? `<div class="card stack"><div class="section-header">Топ причин тревоги</div>
      ${s.topAnxiety.map((x) => `<div class="row between"><span>${esc(x.title)}</span><span style="color:var(--accent);font-weight:600">${x.count}</span></div>`).join('')}</div>` : ''}
    <div class="card"><div class="section-header">Распределение по времени суток</div>${hourChart(s.hourDist)}</div>
    <div class="card stack"><div class="section-header">Лучшие и тяжёлые дни</div>
      ${dayList('Лучшие дни', s.bestDays)}${dayList('Тяжёлые дни', s.worstDays)}</div>`;
}

function dayList(title, days) {
  const rows = days.slice(0, 3).map((x) =>
    `<div class="row between"><span class="row" style="gap:8px"><span style="color:${STATUS_META[x.res.status].color}">${icon(STATUS_META[x.res.status].icon, 'sm')}</span>${x.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
      <span class="muted" style="font-size:13px">${STATUS_META[x.res.status].title}</span></div>`).join('');
  return `<div class="list-head" style="margin-top:6px">${title}</div>${rows || '<div class="muted" style="font-size:13px">Нет данных</div>'}`;
}

// ---------- ДИАГНОСТИКА (отчёты + настройки) ----------
function renderDiag() {
  if (state.diagRoute === 'reasons-headache') return renderReasons('headache');
  if (state.diagRoute === 'reasons-anxiety') return renderReasons('anxiety');
  if (state.diagRoute === 'thresholds') return renderThresholds();
  if (state.diagRoute === 'table') return renderHealthTable();

  const s = store.settings;
  const toggle = (on, action) => `<div class="toggle ${on ? 'on' : ''}" data-action="${action}"><div class="knob"></div></div>`;

  view.innerHTML = `
    <h1 class="nav-title">Диагностика</h1>
    <div class="list-head">Отчёты</div>
    <div class="list">
      <div class="list-item tappable" data-action="goto" data-route="table">${icon('table')}<span class="grow">Сводная таблица вмешательств</span>${icon('chevron.right', 'sm')}</div>
    </div>
    ${daylioDiagSection()}
    ${healthDiagSection()}
    <div class="list-head">Причины</div>
    <div class="list">
      <div class="list-item tappable" data-action="goto" data-route="reasons-headache">${icon('waveform.path')}<span class="grow">Причины напряжения</span>${icon('chevron.right', 'sm')}</div>
      <div class="list-item tappable" data-action="goto" data-route="reasons-anxiety">${icon('wind')}<span class="grow">Причины тревоги</span>${icon('chevron.right', 'sm')}</div>
    </div>

    <div class="list-head">Оценка дня</div>
    <div class="list">
      <div class="list-item tappable" data-action="goto" data-route="thresholds">${icon('sliders')}<span class="grow">Пороги оценки дня</span>${icon('chevron.right', 'sm')}</div>
      <div class="list-item">${icon('hand')}<span class="grow">Ручное переопределение</span>${toggle(s.manualOverrideEnabled, 'toggle-override')}</div>
    </div>

    <div class="list-head">Отслеживание</div>
    <div class="list">
      <div class="list-item">${icon('wind')}<span class="grow">Отслеживать тревогу</span>${toggle(s.anxietyEnabled, 'toggle-anxiety')}</div>
      <div class="list-item">${icon('clock')}<span class="grow">Вечернее напоминание</span>${toggle(s.reminderEnabled, 'toggle-reminder')}</div>
      ${s.reminderEnabled ? `<div class="list-item">${icon('timer')}<span class="grow">Время напоминания</span>${stepperHtml('reminderHour', s.reminderHour, ':00')}</div>` : ''}
    </div>

    <div class="list-head">Оформление</div>
    <div class="list"><div class="list-item">${icon('settings')}<span class="grow">Тема</span>
      <div style="width:200px">${segmented('theme', s.theme, [['system', 'Системная'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div></div></div>

    ${aiDiagSection()}

    <div class="list-head">Данные</div>
    <div class="list">
      <div class="list-item tappable" data-action="export-json">${icon('export')}<span class="grow">Экспорт в JSON</span></div>
      <div class="list-item tappable" data-action="export-csv">${icon('export')}<span class="grow">Экспорт в CSV</span></div>
      <div class="list-item tappable" data-action="reset-entries"><span style="color:var(--danger)">${icon('trash')}</span><span class="grow" style="color:var(--danger)">Очистить записи</span></div>
      <div class="list-item tappable" data-action="reset-all"><span style="color:var(--danger)">${icon('reset')}</span><span class="grow" style="color:var(--danger)">Сбросить всё (вкл. причины)</span></div>
    </div>

    <div class="card"><div class="muted" style="font-size:13px">Дневник самонаблюдения: фиксация эпизодов, интенсивности, причин и длительности. Это не медицинский инструмент. Все данные хранятся только на вашем устройстве.</div></div>`;
}

// Обзор импортированного Daylio: цели и группы маркеров (пока только просмотр).
function daylioDiagSection() {
  const d = store.daylio;
  if (!d) return '';
  const goals = d.goals.filter((g) => (g.name || '').trim())
    .map((g) => `<div class="row between"><span>${icon('check', 'sm')} ${esc(g.name)}</span></div>`).join('');
  const groups = d.groups.map((g) => {
    const n = d.markers.filter((m) => m.groupId === g.id).length;
    return `<div class="row between"><span>${esc(g.name)}</span><span class="muted" style="font-size:13px">${n}</span></div>`;
  }).join('');
  const imported = new Date(d.importedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
  return `
    <div class="list-head">Daylio · импортировано ${imported}</div>
    <div class="card stack"><div class="section-header">Цели (${d.goals.filter((g) => (g.name || '').trim()).length})</div>${goals || '<div class="muted" style="font-size:13px">Нет целей</div>'}</div>
    <div class="card stack"><div class="section-header">Группы маркеров (${d.groups.length})</div>${groups}</div>`;
}

function stepperHtml(field, value, suffix = '') {
  return `<div class="stepper"><button data-action="step" data-field="${field}" data-d="-1">−</button>
    <span class="sval">${value}${suffix}</span>
    <button data-action="step" data-field="${field}" data-d="1">+</button></div>`;
}

// Обзор импорта Apple Health.
function healthDiagSection() {
  if (!store.hasHealth()) return '';
  const h = store.health;
  const days = Object.values(h.days);
  const avg = (k) => { const xs = days.map((d) => d[k]).filter((x) => x != null); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
  const sleep = () => { const xs = days.map((d) => d.sleepH).filter((x) => x != null); return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null; };
  const rows = [
    ['Средний пульс', avg('hr'), 'уд/мин'], ['Пульс покоя', avg('restHr'), 'уд/мин'],
    ['ВСР (SDNN)', avg('hrv'), 'мс'], ['Сон', sleep(), 'ч'],
  ].filter(([, v]) => v != null).map(([l, v, u]) => `<div class="row between"><span>${l}</span><span class="muted">${v} ${u}</span></div>`).join('');
  const range = h.range ? `${new Date(h.range.from).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })} — ${new Date(h.range.to).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}` : '';
  return `
    <div class="list-head">Apple Health · ${h.counts.days} дней</div>
    <div class="card stack">
      <div class="muted" style="font-size:13px">${range}. Средние по всему периоду:</div>
      ${rows || '<div class="muted" style="font-size:13px">Нет метрик</div>'}
    </div>`;
}

// Настройки AI: ключ, модели, согласие.
function aiDiagSection() {
  const s = store.settings;
  const has = ai.hasApiKey();
  const modelOpts = [['claude-sonnet-5', 'Sonnet 5'], ['claude-opus-5', 'Opus 5'], ['claude-haiku-4-5', 'Haiku 4.5']];
  return `
    <div class="list-head">AI-ключ и модели</div>
    <div class="card stack">
      <label class="field">Ключ Claude API (только на устройстве)</label>
      <div class="row" style="gap:8px">
        <input type="password" id="ai-key-input" placeholder="${has ? '•••• сохранён' : 'sk-ant-…'}" autocomplete="off"/>
        <button class="btn-secondary" style="width:auto;padding:12px 16px" data-action="save-ai-key">Сохранить</button>
      </div>
      ${has ? `<button class="btn-ghost" style="color:var(--danger);align-self:flex-start" data-action="clear-ai-key">Удалить ключ</button>` : ''}
      <div class="row between"><span>Модель распознавания документов</span><div style="width:150px">${selectField('aiModelExtract', s.aiModelExtract, modelOpts)}</div></div>
      <div class="row between"><span>Модель отчёта и чата</span><div style="width:150px">${selectField('aiModelReport', s.aiModelReport, modelOpts)}</div></div>
      <div class="row between"><span>Согласие на отправку данных в AI</span><div class="toggle ${s.aiConsent ? 'on' : ''}" data-action="toggle-consent"><div class="knob"></div></div></div>
      <div class="muted" style="font-size:12px">Ключ не входит в экспорт данных. Медицинские данные уходят в API только при включённом согласии.</div>
    </div>`;
}

async function aiAnalyze() {
  if (aiBusy || !store.settings.aiConsent) return;
  aiBusy = true; render();
  try { aiResult = await ai.analyze({ snapshot: aiSnapshot(), model: store.settings.aiModelReport }); }
  catch (e) { aiResult = 'Ошибка: ' + (e?.message || 'неизвестно'); }
  aiBusy = false; render();
}
async function aiSend() {
  const inp = $('#ai-input');
  const q = inp && inp.value.trim();
  if (!q || aiBusy || !store.settings.aiConsent) return;
  aiChat.push({ role: 'user', text: q }); aiBusy = true; render();
  try {
    const a = await ai.chat({ history: aiChat, snapshot: aiSnapshot(), model: store.settings.aiModelReport });
    aiChat.push({ role: 'assistant', text: a });
  } catch (e) { aiChat.push({ role: 'assistant', text: 'Ошибка: ' + (e?.message || 'неизвестно') }); }
  aiBusy = false; render();
}

function renderReasons(filter) {
  const list = store.reasonsByFilter(filter);
  const rows = list.map((r, i) => `
    <div class="list-item">
      <span style="color:${r.isActive ? 'var(--accent)' : 'var(--text-secondary)'}">${icon(r.iconName, 'sm')}</span>
      <input class="grow" type="text" value="${esc(r.title)}" data-action="rename-reason" data-id="${r.id}" style="background:transparent;border:none;padding:6px 0;${r.isActive ? '' : 'color:var(--text-secondary)'}"/>
      <button class="btn-ghost" data-action="swap-reason" data-id="${r.id}" data-other="${i > 0 ? list[i - 1].id : ''}" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>▲</button>
      <button class="btn-ghost" data-action="swap-reason" data-id="${r.id}" data-other="${i < list.length - 1 ? list[i + 1].id : ''}" ${i === list.length - 1 ? 'disabled style="opacity:.3"' : ''}>▼</button>
      <button class="icon-btn" data-action="toggle-reason-active" data-id="${r.id}">${icon(r.isActive ? 'eye' : 'eye.slash', 'sm')}</button>
      ${r.isDefault ? '' : `<button class="icon-btn" style="color:var(--danger)" data-action="delete-reason" data-id="${r.id}">${icon('trash', 'sm')}</button>`}
    </div>`).join('');

  view.innerHTML = `
    <div class="row" style="gap:8px;margin:8px 0 16px"><button class="btn-ghost" data-action="diag-back">${icon('chevron.left', 'sm')} Диагностика</button></div>
    <h1 class="nav-title" style="margin-top:0">${filter === 'headache' ? 'Причины напряжения' : 'Причины тревоги'}</h1>
    <div class="card row" style="gap:8px">
      <input type="text" id="new-reason" placeholder="Новая причина"/>
      <button class="btn-secondary" style="width:auto;padding:12px 16px" data-action="add-reason" data-filter="${filter}">Добавить</button>
    </div>
    <div class="list">${rows || '<div class="list-item muted">Список пуст</div>'}</div>
    <div class="muted" style="font-size:13px;margin-top:10px;padding:0 4px">Глазом можно скрыть причину, стрелками — изменить порядок. Свои причины можно удалить.</div>`;
}

function renderThresholds() {
  const t = store.thresholds;
  const item = (field, label, suffix = '') => `<div class="list-item">${label}<span class="spacer"></span>${stepperHtml('th-' + field, t[field], suffix)}</div>`;
  view.innerHTML = `
    <div class="row" style="gap:8px;margin:8px 0 16px"><button class="btn-ghost" data-action="diag-back">${icon('chevron.left', 'sm')} Диагностика</button></div>
    <h1 class="nav-title" style="margin-top:0">Пороги оценки</h1>
    <div class="list-head">Короткий и слабый эпизод</div>
    <div class="list">${item('shortEpisodeMinutes', 'Короткий эпизод, мин')}${item('lowIntensity', 'Низкая интенсивность')}</div>
    <div class="list-head">Хороший день</div>
    <div class="list">${item('goodMaxEpisodes', 'Макс. эпизодов')}${item('goodTotalDurationMinutes', 'Суммарно, мин')}</div>
    <div class="list-head">Тяжёлый день</div>
    <div class="list">${item('terribleSingleEpisodeMinutes', 'Один эпизод дольше, мин')}${item('terribleTotalDurationMinutes', 'Суммарно дольше, мин')}</div>
    <div class="list-head">Очень тяжёлый день</div>
    <div class="list">${item('nightmareTotalDurationMinutes', 'Суммарно дольше, мин')}</div>
    <div style="height:12px"></div>
    <button class="btn-secondary" data-action="reset-thresholds">Сбросить к значениям по умолчанию</button>`;
}

// ---------- EPISODE SHEET ----------
let epForm = null;
function openEpisodeSheet(episode) {
  if (episode) {
    epForm = {
      id: episode.id, type: episode.type, startTime: episode.startTime,
      endTime: episode.endTime || new Date().toISOString(),
      durMode: (episode.dayLongFlag && episode.dayLongFlag !== 'none') ? 'dayLong' : (episode.manualDurationMinutes != null ? 'manual' : 'byEnd'),
      manualMinutes: episode.manualDurationMinutes ?? 15,
      dayLongFlag: episode.dayLongFlag && episode.dayLongFlag !== 'none' ? episode.dayLongFlag : 'almostAllDay',
      intensity: episode.intensity, reasonIDs: [...(episode.reasonIDs || [])],
      customReason: episode.customReasonText || '', notes: episode.notes || '', isNew: false,
    };
  } else {
    const now = new Date().toISOString();
    epForm = { id: store.uid(), type: 'headache', startTime: now, endTime: now, durMode: 'byEnd',
      manualMinutes: 15, dayLongFlag: 'almostAllDay', intensity: 3, reasonIDs: [], customReason: '', notes: '', isNew: true };
  }
  openSheet(renderEpisodeSheet);
}

function renderEpisodeSheet() {
  const f = epForm;
  let durBlock = '';
  if (f.durMode === 'byEnd') {
    const mins = Math.max(1, Math.round((new Date(f.endTime) - new Date(f.startTime)) / 60000));
    durBlock = `<div class="field-row"><label class="field">Окончание</label>
      <input type="datetime-local" data-field="endTime" value="${toLocalInput(f.endTime)}"/></div>
      <div class="muted" style="font-size:13px">Длительность: ${formatDuration(mins)}</div>`;
  } else if (f.durMode === 'manual') {
    durBlock = `<div class="list-item" style="padding:0">Длительность<span class="spacer"></span>${stepperHtml('ep-manual', f.manualMinutes, ' мин')}</div>
      <div class="muted" style="font-size:13px">От 1 минуты до 5 часов</div>`;
  } else {
    durBlock = segmented('dayLong', f.dayLongFlag, [['almostAllDay', 'Почти весь день'], ['allDay', 'Весь день']]);
  }

  return `
    <div class="sheet-head"><div class="title">${f.isNew ? 'Новый эпизод' : 'Эпизод'}</div>
      <button class="btn-ghost" data-action="save-episode">Сохранить</button></div>
    <div class="field-row"><label class="field">Тип</label>${segmented('epType', f.type, [['headache', 'Напряжение'], ['mixed', 'Смешанный']])}</div>
    <div class="field-row"><label class="field">Начало</label><input type="datetime-local" data-field="startTime" value="${toLocalInput(f.startTime)}"/></div>
    <div class="field-row"><label class="field">Длительность</label>${segmented('durMode', f.durMode, [['byEnd', 'По времени'], ['manual', 'Вручную'], ['dayLong', 'Длинный']])}</div>
    <div class="card">${durBlock}</div>
    <div class="card">${intensityField(f.intensity)}</div>
    <div class="card">${reasonChips(f.type, f.reasonIDs)}
      <div style="height:10px"></div><input type="text" placeholder="Своя причина" data-field="customReason" value="${esc(f.customReason)}"/></div>
    <div class="field-row"><label class="field">Заметка</label><textarea data-field="notes" placeholder="Комментарий">${esc(f.notes)}</textarea></div>
    <button class="btn-primary" data-action="save-episode">${icon('check')} Сохранить</button>`;
}

function saveEpisode() {
  const f = epForm;
  const ep = {
    id: f.id, type: f.type, startTime: f.startTime,
    intensity: f.intensity, reasonIDs: f.reasonIDs,
    customReasonText: f.customReason || null, notes: f.notes || null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    manualDurationMinutes: null, endTime: null, dayLongFlag: 'none',
  };
  if (f.durMode === 'byEnd') {
    ep.endTime = f.endTime;
  } else if (f.durMode === 'manual') {
    ep.manualDurationMinutes = f.manualMinutes;
    ep.endTime = new Date(new Date(f.startTime).getTime() + f.manualMinutes * 60000).toISOString();
  } else {
    ep.dayLongFlag = f.dayLongFlag;
    ep.endTime = new Date(new Date(f.startTime).getTime() + DAY_LONG[f.dayLongFlag].minutes * 60000).toISOString();
  }
  // сохранить createdAt существующего
  const existing = store.episodes.find((x) => x.id === f.id);
  if (existing) ep.createdAt = existing.createdAt;
  store.upsertEpisode(ep);
  closeSheet();
  toast('Эпизод сохранён');
}

// ---------- ANXIETY SHEET ----------
let anxForm = null;
function openAnxietySheet(record, presetOngoing = false) {
  if (record) {
    anxForm = { id: record.id, startTime: record.startTime, ongoing: !record.endTime,
      manualMinutes: record.manualDurationMinutes ?? 20, intensity: record.intensity,
      reasonIDs: [...(record.reasonIDs || [])], customReason: record.customReasonText || '',
      notes: record.notes || '', linkedEpisodeID: record.linkedEpisodeID || '', isNew: false };
  } else {
    anxForm = { id: store.uid(), startTime: new Date().toISOString(), ongoing: presetOngoing, manualMinutes: 20,
      intensity: 3, reasonIDs: [], customReason: '', notes: '', linkedEpisodeID: '', isNew: true };
  }
  openSheet(renderAnxietySheet);
}

// ---------- ХАБ «+»: выбор эпизода ----------
function renderCaptureSheet() {
  const s = store.settings;
  return `
    <div class="sheet-head"><div class="title">Зафиксировать эпизод</div>
      <button class="btn-ghost" data-action="close-sheet">Отмена</button></div>
    <div class="capture-choice">
      <div class="capture-card">
        <h3>${icon('waveform.path', 'sm')} Напряжение</h3>
        <div class="sub">Головная боль напряжения — таймер сейчас или задним числом.</div>
        <div class="row">
          <button class="btn-primary" data-action="cap-episode-now">${icon('play')} Начать сейчас</button>
          <button class="btn-secondary" data-action="cap-episode-back">Задним числом</button>
        </div>
      </div>
      ${s.anxietyEnabled ? `<div class="capture-card">
        <h3>${icon('wind', 'sm')} Тревога</h3>
        <div class="sub">Тревожный эпизод — сейчас или задним числом.</div>
        <div class="row">
          <button class="btn-primary" data-action="cap-anxiety-now">${icon('play')} Начать сейчас</button>
          <button class="btn-secondary" data-action="cap-anxiety-back">Задним числом</button>
        </div>
      </div>` : ''}
    </div>`;
}

function renderAnxietySheet() {
  const f = anxForm;
  const todayEps = store.episodesOn(new Date());
  const linkOpts = todayEps.length ? `
    <div class="field-row"><label class="field">Связать с эпизодом</label>
      <select data-field="linkedEpisodeID">
        <option value="">Без связи</option>
        ${todayEps.map((e) => `<option value="${e.id}" ${f.linkedEpisodeID === e.id ? 'selected' : ''}>${EPISODE_TYPES[e.type].title} · ${fmtTime(e.startTime)}</option>`).join('')}
      </select></div>` : '';

  return `
    <div class="sheet-head"><div class="title">Тревога</div>
      <button class="btn-ghost" data-action="save-anxiety">Сохранить</button></div>
    <div class="field-row"><label class="field">Начало</label><input type="datetime-local" data-field="startTime" value="${toLocalInput(f.startTime)}"/></div>
    <div class="card row between"><span>Сейчас идёт</span><div class="toggle ${f.ongoing ? 'on' : ''}" data-action="toggle-ongoing"><div class="knob"></div></div></div>
    ${f.ongoing ? '' : `<div class="card"><div class="list-item" style="padding:0">Длительность<span class="spacer"></span>${stepperHtml('anx-manual', f.manualMinutes, ' мин')}</div></div>`}
    <div class="card">${intensityField(f.intensity)}</div>
    <div class="card">${reasonChips('anxiety', f.reasonIDs)}
      <div style="height:10px"></div><input type="text" placeholder="Своя причина" data-field="customReason" value="${esc(f.customReason)}"/></div>
    ${linkOpts}
    <div class="field-row"><label class="field">Заметка</label><textarea data-field="notes">${esc(f.notes)}</textarea></div>
    <button class="btn-primary" data-action="save-anxiety">${icon('check')} Сохранить</button>`;
}

function saveAnxiety() {
  const f = anxForm;
  const rec = {
    id: f.id, startTime: f.startTime, intensity: f.intensity, reasonIDs: f.reasonIDs,
    customReasonText: f.customReason || null, notes: f.notes || null,
    linkedEpisodeID: f.linkedEpisodeID || null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    manualDurationMinutes: null, endTime: null,
  };
  if (f.ongoing) {
    rec.endTime = null;
  } else {
    rec.manualDurationMinutes = f.manualMinutes;
    rec.endTime = new Date(new Date(f.startTime).getTime() + f.manualMinutes * 60000).toISOString();
  }
  const existing = store.anxiety.find((x) => x.id === f.id);
  if (existing) rec.createdAt = existing.createdAt;
  store.upsertAnxiety(rec);
  closeSheet();
  toast('Тревога сохранена');
}

// ---------- HEALTH (давление + лекарства) ----------
function selectField(field, current, options) {
  return `<select data-field="${field}">${options.map(([v, l]) =>
    `<option value="${v}" ${current === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

function medDoseText(m) {
  const parts = [];
  const dv = m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}`.trim() : '';
  if (dv) parts.push(dv);
  if (m.schedule) parts.push(m.schedule);
  return parts.join(' · ') || '—';
}

function periodText(m) {
  const f = (d) => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  if (!m.startDate && !m.endDate) return m.isActive ? 'принимаю' : '—';
  return `${f(m.startDate) || '…'} – ${m.endDate ? f(m.endDate) : 'сейчас'}`;
}

function bpSection() {
  const latest = store.latestBP();
  const bpPoints = store.bpSorted().slice(0, 14).reverse().map((r) => ({ date: r.dateTime, sys: r.sys, dia: r.dia }));
  return `
    <div class="section-header">Давление</div>
    <div class="card stack">
      ${latest ? `
        <div><span style="font-size:30px;font-weight:700;color:var(--accent)">${latest.sys}/${latest.dia}</span>
          <span class="muted"> мм рт.ст.${latest.pulse ? ` · пульс ${latest.pulse}` : ''}</span></div>
        <div class="muted" style="font-size:13px">${new Date(latest.dateTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${latest.context ? ` · ${esc(bpContextTitle(latest.context))}` : ''}</div>
      ` : '<div class="muted">Пока нет измерений давления.</div>'}
      <button class="btn-primary" data-action="open-bp">${icon('plus')} Записать давление</button>
    </div>
    ${bpPoints.length > 1 ? `<div class="card">
        <div class="row between"><div class="section-header">Динамика</div>
          <div class="legend" style="margin:0"><span class="li"><span class="dot" style="background:var(--accent)"></span>СИС</span><span class="li"><span class="dot" style="background:var(--accent-soft)"></span>ДИА</span></div></div>
        ${bpChart(bpPoints)}</div>` : ''}
    ${bpRecentList()}`;
}

function medsSection() {
  const meds = store.medications();
  const todayIntakes = store.intakesOn(new Date());
  const medRows = meds.length ? meds.map((m) => {
    const taken = todayIntakes.filter((x) => x.medicationId === m.id && x.taken).length;
    return `<div class="card tight ${m.isActive ? '' : 'dim'}">
      <div class="row between">
        <div class="grow" data-action="edit-med" data-id="${m.id}">
          <div style="font-weight:600">${icon('pill', 'sm')} ${esc(m.name)}</div>
          <div class="muted" style="font-size:12px">${esc(medClassTitle(m.medClass))} · ${esc(medDoseText(m))}</div>
        </div>
        <span class="badge">${taken ? `${icon('check', 'sm')} ${taken}×` : 'сегодня'}</span>
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn-secondary" style="padding:10px" data-action="took-med" data-id="${m.id}">${icon('check', 'sm')} Принял</button>
        <button class="btn-secondary" style="padding:10px" data-action="skip-med" data-id="${m.id}">Пропустил</button>
        <button class="icon-btn" data-action="open-effect" data-med="${m.id}" aria-label="Ощущения">${icon('activity', 'sm')}</button>
      </div>
    </div>`;
  }).join('') : '<div class="muted" style="padding:2px 4px 8px">Лекарства пока не добавлены.</div>';

  return `
    <div class="section-header">Лекарства — что выпил</div>
    ${medRows}
    <div class="stack" style="margin-top:10px">
      <button class="btn-secondary" data-action="open-med">${icon('plus')} Добавить лекарство</button>
    </div>`;
}

// ---------- ВЕЧЕР ДНЯ (ощущения + статистика) ----------
function renderEvening() {
  view.innerHTML = `
    <h1 class="nav-title">Вечер дня</h1>
    <div class="section-header">Ощущения и чувства</div>
    <div class="card stack">
      <div class="muted">Спокойно дозаполните вечером: ощущения от эпизодов и от препаратов — по шкалам психическое / физическое / неврологическое.</div>
      <button class="btn-primary" data-action="open-effect">${icon('activity')} Зафиксировать ощущения</button>
    </div>
    <div style="height:10px"></div>
    ${moodBody()}
    ${statsBody()}`;
}

// Настроения и маркеры из Daylio за выбранный период.
function moodBody() {
  const m = moodSummary(state.statsPeriod);
  if (!m) return '';
  const total = m.dist.reduce((s, v) => s + v, 0);
  const bars = [1, 2, 3, 4, 5].map((lvl) => {
    const meta = MOOD_META[lvl];
    const val = m.dist[lvl];
    const pct = total ? Math.round((val / total) * 100) : 0;
    return `<div class="mood-row">
      <span class="mood-name">${meta.title}</span>
      <div class="mood-track"><div class="mood-fill" style="width:${pct}%;background:${meta.color}"></div></div>
      <span class="mood-val">${val}</span></div>`;
  }).join('');
  const markers = m.topMarkers.length
    ? m.topMarkers.map((x) => `<div class="row between"><span>${esc(x.title)}</span><span style="color:var(--accent);font-weight:600">${x.count}</span></div>`).join('')
    : '<div class="muted" style="font-size:13px">Нет маркеров за период</div>';
  return `
    <div class="section-header">Настроение (Daylio)</div>
    <div class="card stack">
      ${total ? bars : '<div class="muted" style="font-size:13px">Нет записей настроения за период</div>'}
    </div>
    <div class="card stack"><div class="section-header">Частые маркеры</div>${markers}</div>`;
}

// ---------- AI-АНАЛИТИКА (наблюдения + чат на вашем ключе) ----------
let aiChat = [];
let aiResult = '';
let aiBusy = false;
function renderAI() {
  if (state.aiRoute === 'data') return renderAIData();
  const s = store.settings;
  const hasKey = ai.hasApiKey();
  const ready = hasKey && s.aiConsent;
  const counts = sourceCounts(store);
  const scope = s.aiScope || DEFAULT_SCOPE;
  const onCount = SOURCES.filter(([k]) => scope[k] && counts[k]).length;
  const size = contextSize(buildAIContext(store, { scope, period: s.aiPeriod || 'month' }));

  const keyCard = hasKey
    ? `<div class="card row between">
         <div><div style="font-weight:600">${icon('check', 'sm')} Ключ Claude API добавлен</div>
         <div class="muted" style="font-size:12px">Хранится только на устройстве</div></div>
         <button class="btn-ghost" data-action="clear-ai-key" style="color:var(--danger)">Удалить</button>
       </div>`
    : `<div class="card stack">
         <div style="font-weight:600">${icon('spark', 'sm')} Ключ Claude API</div>
         <div class="muted" style="font-size:13px">Нужен для наблюдений, чата и распознавания документов. Хранится только на устройстве и не входит в экспорт.</div>
         <div class="row" style="gap:8px">
           <input type="password" id="ai-key-input" placeholder="sk-ant-…" autocomplete="off"/>
           <button class="btn-secondary" style="width:auto;padding:12px 16px" data-action="save-ai-key">Сохранить</button>
         </div>
       </div>`;

  const consentCard = `
    <div class="card row between">
      <div><div style="font-weight:600">Согласие на отправку данных</div>
      <div class="muted" style="font-size:12px">Без него запросы в API не уходят</div></div>
      <div class="toggle ${s.aiConsent ? 'on' : ''}" data-action="toggle-consent"><div class="knob"></div></div>
    </div>`;

  const dataCard = `
    <div class="card stack tappable" data-action="ai-goto-data">
      <div class="row between">
        <div style="font-weight:600">${icon('table', 'sm')} Данные для анализа</div>
        ${icon('chevron.right', 'sm')}
      </div>
      <div class="muted" style="font-size:13px">Источников включено: <strong>${onCount}</strong> · период: <strong>${esc((PERIODS.find(([k]) => k === (s.aiPeriod || 'month')) || [])[1] || '')}</strong> · объём ≈ <strong>${size.kb} КБ</strong></div>
      <div class="chips">${SOURCES.filter(([k]) => scope[k] && counts[k]).map(([k, l]) => `<span class="chip on" style="pointer-events:none">${l} · ${counts[k]}</span>`).join('') || '<span class="muted" style="font-size:13px">Ничего не выбрано</span>'}</div>
    </div>`;

  const chatHtml = aiChat.map((m) => `
    <div class="chat-msg ${m.role}">${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('');
  const hint = !hasKey ? 'Добавьте ключ выше' : (!s.aiConsent ? 'Включите согласие выше' : 'Ваш вопрос по данным');

  view.innerHTML = `
    <h1 class="nav-title">AI-аналитика</h1>
    ${keyCard}
    ${consentCard}
    ${dataCard}
    <div class="card stack">
      <div class="section-header">Наблюдения</div>
      <div class="muted" style="font-size:13px">Корреляции по выбранным данным и вопросы к врачу. Не диагноз и не назначение.</div>
      <button class="btn-primary" data-action="ai-analyze" ${(!ready || aiBusy) ? 'disabled style="opacity:.5"' : ''}>${icon('spark')} ${aiBusy ? 'Думаю…' : 'Получить наблюдения'}</button>
      ${aiResult ? `<div class="ai-out">${esc(aiResult).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div class="card stack">
      <div class="section-header">${icon('chat', 'sm')} Чат по вашим данным</div>
      <div class="chat-log">${chatHtml || '<div class="muted" style="font-size:13px">Спросите что угодно по вашей истории: «когда чаще всего приступы?», «что помогало лучше всего?», «связаны ли сон и напряжение?»</div>'}</div>
      <div class="row" style="gap:8px">
        <input type="text" id="ai-input" placeholder="${hint}" ${(!ready || aiBusy) ? 'disabled' : ''}/>
        <button class="btn-secondary" style="width:auto;padding:12px 16px" data-action="ai-send" ${(!ready || aiBusy) ? 'disabled style="opacity:.5"' : ''}>${icon('chat', 'sm')}</button>
      </div>
      ${aiChat.length ? `<button class="btn-ghost" data-action="ai-clear-chat">Очистить чат</button>` : ''}
    </div>
    <div class="card"><div class="muted" style="font-size:12px">Модель распознавания: ${esc(s.aiModelExtract)} · модель отчёта и чата: ${esc(s.aiModelReport)} (меняются в «Диагностике»). ИИ не ставит диагноз и не назначает лечение.</div></div>`;
}

// Окно «Данные для анализа»: что именно доступно и что уйдёт в запрос.
function renderAIData() {
  const s = store.settings;
  const scope = s.aiScope || DEFAULT_SCOPE;
  const period = s.aiPeriod || 'month';
  const counts = sourceCounts(store);
  const ctx = buildAIContext(store, { scope, period });
  const size = contextSize(ctx);

  const rows = SOURCES.map(([k, label]) => {
    const n = counts[k];
    const empty = !n;
    return `<div class="list-item">
      <span class="grow" style="${empty ? 'color:var(--text-secondary)' : ''}">${label}
        <div class="muted" style="font-size:12px">${empty ? 'нет данных' : `доступно: ${n}`}</div></span>
      <div class="toggle ${scope[k] && !empty ? 'on' : ''} ${empty ? 'dim' : ''}" data-action="toggle-ai-source" data-src="${k}"><div class="knob"></div></div>
    </div>`;
  }).join('');

  view.innerHTML = `
    <div class="row" style="gap:8px;margin:8px 0 12px"><button class="btn-ghost" data-action="ai-back">${icon('chevron.left', 'sm')} AI-аналитика</button></div>
    <h1 class="nav-title" style="margin-top:0">Данные для анализа</h1>
    <div class="muted" style="font-size:13px;margin-bottom:12px">Всё, что приложение может отдать модели. Выключите то, что отправлять не хотите — выключенное не попадёт в запрос.</div>

    <div class="list-head">Период</div>
    ${segmented('aiperiod', period, PERIODS)}

    <div class="list-head" style="margin-top:14px">Источники</div>
    <div class="list">${rows}</div>

    <div class="card stack" style="margin-top:12px">
      <div class="row between"><span style="font-weight:600">Объём запроса</span>
        <span class="muted">${size.kb} КБ · ≈${size.approxTokens.toLocaleString('ru-RU')} токенов</span></div>
      <div class="muted" style="font-size:12px">Чем больше данных, тем дороже и медленнее запрос. Для узких вопросов достаточно месяца.</div>
      <button class="btn-secondary" data-action="ai-preview">${icon('eye')} Посмотреть, что уйдёт</button>
    </div>
    <div class="card"><div class="muted" style="font-size:12px">Данные уходят в Claude API только при нажатии «Получить наблюдения» или отправке вопроса в чат, и только при включённом согласии.</div></div>`;
}

function renderAIPreview() {
  const s = store.settings;
  const ctx = buildAIContext(store, { scope: s.aiScope || DEFAULT_SCOPE, period: s.aiPeriod || 'month' });
  return `
    <div class="sheet-head"><div class="title">Что уйдёт в запрос</div>
      <button class="btn-ghost" data-action="close-sheet">Готово</button></div>
    <div class="muted" style="font-size:13px">Точный срез, который получит модель. Ключ и заметки, не входящие в выбранные источники, не отправляются.</div>
    <pre class="json-preview">${esc(JSON.stringify(ctx, null, 2))}</pre>`;
}

// Срез для запросов — по выбранным источникам и периоду.
function aiSnapshot() {
  const s = store.settings;
  return buildAIContext(store, { scope: s.aiScope || DEFAULT_SCOPE, period: s.aiPeriod || 'month' });
}

function bpRecentList() {
  const list = store.bpSorted().slice(0, 5);
  if (!list.length) return '';
  return `<div class="list-head">Недавние измерения</div>` + list.map((r) => `
    <div class="card tight row between">
      <div><span style="font-weight:600">${r.sys}/${r.dia}</span>${r.pulse ? ` <span class="muted">· ${r.pulse}</span>` : ''}
        <div class="muted" style="font-size:12px">${new Date(r.dateTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.context ? ` · ${esc(bpContextTitle(r.context))}` : ''}</div></div>
      <button class="btn-ghost" style="color:var(--danger)" data-action="del-bp" data-id="${r.id}">×</button>
    </div>`).join('');
}

function topSymptoms(eff) {
  const items = EFFECT_GROUPS.flatMap((g) => g.items);
  return items.filter(([k]) => (eff.scales?.[k] || 0) > 0)
    .map(([k, label]) => `${label}: ${SEVERITY[eff.scales[k]]}`)
    .slice(0, 4).join(', ');
}

function prescriptionText(m) {
  const parts = [];
  const dv = m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}`.trim() : '';
  if (dv) parts.push(dv);
  if (m.schedule) parts.push(m.schedule);
  return parts.join(' · ') || '—';
}
function signedCell(v) {
  const n = Number(v) || 0;
  const cls = n > 0 ? 'pos' : (n < 0 ? 'neg' : '');
  return `<td class="num ${cls}">${n > 0 ? '+' + n : n}</td>`;
}
function renderHealthTable() {
  const meds = store.medications();
  const rows = meds.map((m, i) => {
    const prov = m.provenance ? `<span title="из первичного документа с печатью" style="color:var(--accent)">${icon('check', 'sm')}</span> ` : '';
    const sens = m.sensations || (store.latestEffectFor(m.id) ? topSymptoms(store.latestEffectFor(m.id)) : '');
    const sum = signedSum(m);
    return `<tr class="${m.highlighted ? 'hi' : ''}">
      <td class="num">${i + 1}</td>
      <td>${prov}${esc(m.name)}</td>
      <td>${esc(prescriptionText(m))}</td>
      <td>${esc(m.clinic || m.prescribedBy || '—')}</td>
      <td class="num">${esc(m.year || (m.startDate ? m.startDate.slice(0, 4) : '—'))}</td>
      ${signedCell(m.physScore)}${signedCell(m.psychScore)}${signedCell(m.neuroScore)}
      <td class="num ${sum > 0 ? 'pos' : (sum < 0 ? 'neg' : '')}">${sum > 0 ? '+' + sum : sum}</td>
      <td class="sens">${esc(sens) || '—'}</td>
    </tr>`;
  }).join('');

  view.innerHTML = `
    <div class="row" style="gap:8px;margin:8px 0 12px"><button class="btn-ghost" data-action="diag-back">${icon('chevron.left', 'sm')} Диагностика</button></div>
    <h1 class="nav-title" style="margin-top:0">Сводная таблица вмешательств</h1>
    <div class="muted" style="font-size:13px;margin-bottom:12px">Наименование · назначение врача (доза/частота) · клиника · год · знаковое действие (−10…+10) · ощущения. ${icon('check', 'sm')} — поле подтверждено первичным документом с печатью. Это не медицинский документ.</div>
    ${meds.length ? '' : `<div class="card stack">
      <div style="font-weight:600">Отчёт пуст</div>
      <div class="muted" style="font-size:13px">Можно перенести вашу бумажную таблицу вмешательств (${SEED_COUNT} строк: наименование, клиника, год, оценки, ощущения) одним нажатием, а затем править и дополнять распознаванием документов.</div>
      <button class="btn-primary" data-action="seed-report">${icon('table')} Заполнить из моей таблицы</button>
    </div>`}
    <div class="table-scroll"><table class="report">
      <thead><tr><th>№</th><th>Наименование</th><th>Назначение врача</th><th>Клиника</th><th>Год</th><th>Физ.</th><th>Псих.</th><th>Невр.</th><th>Сумма</th><th>Ощущения</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:16px">Нет данных</td></tr>'}</tbody>
    </table></div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn-secondary" data-action="open-med">${icon('plus')} Добавить строку</button>
      ${meds.length ? `<button class="btn-secondary" data-action="seed-report">${icon('table')} Дозаполнить из таблицы</button>` : ''}
    </div>
    <div class="muted" style="font-size:12px;margin-top:10px;padding:0 4px">Столбцы дополняются распознаванием PDF/фото заключений — на вкладке «Ввод данных» → «Документы». Тап по строке в списке лекарств («Ввод данных») открывает её для правки.</div>`;
}

// ---------- BP SHEET ----------
let bpForm = null;
function openBPSheet(r) {
  bpForm = r
    ? { id: r.id, dateTime: r.dateTime, sys: r.sys, dia: r.dia, pulse: r.pulse ?? '', context: r.context || 'rest', notes: r.notes || '', isNew: false }
    : { id: store.uid(), dateTime: new Date().toISOString(), sys: '', dia: '', pulse: '', context: 'rest', notes: '', isNew: true };
  openSheet(renderBPSheet);
}
function renderBPSheet() {
  const f = bpForm;
  return `
    <div class="sheet-head"><div class="title">Давление</div><button class="btn-ghost" data-action="save-bp">Сохранить</button></div>
    <div class="field-row"><label class="field">Время</label><input type="datetime-local" data-field="dateTime" value="${toLocalInput(f.dateTime)}"/></div>
    <div class="row" style="gap:10px">
      <div class="grow"><label class="field">САД (верх.)</label><input type="number" inputmode="numeric" data-field="sys" value="${esc(f.sys)}" placeholder="120"/></div>
      <div class="grow"><label class="field">ДАД (нижн.)</label><input type="number" inputmode="numeric" data-field="dia" value="${esc(f.dia)}" placeholder="80"/></div>
      <div class="grow"><label class="field">Пульс</label><input type="number" inputmode="numeric" data-field="pulse" value="${esc(f.pulse)}" placeholder="70"/></div>
    </div>
    <div class="field-row" style="margin-top:14px"><label class="field">Контекст</label>${selectField('context', f.context, BP_CONTEXTS)}</div>
    <div class="field-row"><label class="field">Заметка</label><textarea data-field="notes">${esc(f.notes)}</textarea></div>
    <button class="btn-primary" data-action="save-bp">${icon('check')} Сохранить</button>`;
}
function saveBP() {
  const f = bpForm;
  const sys = parseInt(f.sys, 10), dia = parseInt(f.dia, 10);
  const pulse = f.pulse !== '' && f.pulse != null ? parseInt(f.pulse, 10) : null;
  if (!sys || !dia) { toast('Укажите САД и ДАД'); return; }
  store.upsertBP({ id: f.id, dateTime: f.dateTime, sys, dia, pulse: pulse || null, context: f.context, notes: f.notes || null, createdAt: new Date().toISOString() });
  closeSheet();
  toast('Давление сохранено');
}

// ---------- MEDICATION SHEET ----------
let medForm = null;
function openMedSheet(m) {
  const base = {
    type: 'medication', clinic: '', year: '', physScore: 0, psychScore: 0, neuroScore: 0,
    sensations: '', highlighted: false,
  };
  medForm = m
    ? { ...base, ...m, isNew: false }
    : {
        ...base, id: store.uid(), name: '', medClass: 'other', doseValue: '', doseUnit: 'мг', schedule: '',
        prescribedBy: '', prescribedDate: '', purpose: '', startDate: new Date().toISOString().slice(0, 10),
        endDate: '', isActive: true, notes: '', isNew: true,
      };
  openSheet(renderMedSheet);
}
// Знаковый ползунок −10…+10 для оси действия.
function signedRow(field, label, value) {
  const v = Number(value) || 0;
  const cls = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'muted');
  return `<div class="signed-row">
    <span class="signed-label">${esc(label)}</span>
    <input type="range" min="-10" max="10" step="1" value="${v}" data-signed="${field}" class="signed-range"/>
    <span class="signed-val ${cls}">${v > 0 ? '+' + v : v}</span>
  </div>`;
}
function renderMedSheet() {
  const f = medForm;
  const sum = signedSum(f);
  const sumCls = sum > 0 ? 'pos' : (sum < 0 ? 'neg' : 'muted');
  return `
    <div class="sheet-head"><div class="title">${f.isNew ? 'Новое вмешательство' : 'Вмешательство'}</div><button class="btn-ghost" data-action="save-med">Сохранить</button></div>
    <div class="field-row"><label class="field">Наименование</label><input type="text" data-field="name" value="${esc(f.name)}" placeholder="напр. Амитриптилин"/></div>
    <div class="field-row"><label class="field">Тип</label>${selectField('type', f.type, INTERVENTION_TYPES)}</div>
    <div class="field-row"><label class="field">Класс</label>${selectField('medClass', f.medClass, MED_CLASSES)}</div>
    <div class="row" style="gap:10px">
      <div class="grow"><label class="field">Доза</label><input type="text" inputmode="decimal" data-field="doseValue" value="${esc(f.doseValue)}" placeholder="25"/></div>
      <div style="width:120px"><label class="field">Ед.</label>${selectField('doseUnit', f.doseUnit, DOSE_UNITS.map((u) => [u, u]))}</div>
    </div>
    <div class="field-row" style="margin-top:14px"><label class="field">Схема / частота приёма</label><input type="text" data-field="schedule" value="${esc(f.schedule)}" placeholder="1 раз в день, вечером"/></div>
    <div class="field-row"><label class="field">Цель назначения</label><input type="text" data-field="purpose" value="${esc(f.purpose)}" placeholder="профилактика напряжения"/></div>
    <div class="row" style="gap:10px">
      <div class="grow"><label class="field">Клиника</label><input type="text" data-field="clinic" value="${esc(f.clinic)}" placeholder="напр. Клиника Вейна"/></div>
      <div style="width:110px"><label class="field">Год</label><input type="text" inputmode="numeric" data-field="year" value="${esc(f.year)}" placeholder="2023"/></div>
    </div>
    <div class="row" style="gap:10px;margin-top:14px">
      <div class="grow"><label class="field">Назначил (врач)</label><input type="text" data-field="prescribedBy" value="${esc(f.prescribedBy)}" placeholder="невролог"/></div>
      <div style="width:150px"><label class="field">Дата назн.</label><input type="date" data-field="prescribedDate" value="${f.prescribedDate || ''}"/></div>
    </div>
    <div class="row" style="gap:10px;margin-top:14px">
      <div class="grow"><label class="field">Начало</label><input type="date" data-field="startDate" value="${f.startDate || ''}"/></div>
      <div class="grow"><label class="field">Окончание</label><input type="date" data-field="endDate" value="${f.endDate || ''}"/></div>
    </div>
    <div class="card stack" style="margin-top:14px">
      <div class="row between"><div class="section-header">Действие (−10…+10)</div><span class="signed-val ${sumCls}" id="signed-sum">сумма ${sum > 0 ? '+' + sum : sum}</span></div>
      ${SIGNED_AXES.map(([k, l]) => signedRow(k, l, f[k])).join('')}
      <div class="muted" style="font-size:12px">Минус — ухудшило, плюс — помогло. Сумма трёх = субъективная эффективность.</div>
    </div>
    <div class="field-row"><label class="field">Ощущения (свободно)</label><textarea data-field="sensations" placeholder="как переносится, побочные, эффект">${esc(f.sensations)}</textarea></div>
    <div class="card row between"><span>Активно (принимаю сейчас)</span><div class="toggle ${f.isActive ? 'on' : ''}" data-action="toggle-med-form"><div class="knob"></div></div></div>
    <div class="card row between"><span>Выделить в отчёте</span><div class="toggle ${f.highlighted ? 'on' : ''}" data-action="toggle-med-hi"><div class="knob"></div></div></div>
    <div class="field-row"><label class="field">Заметка</label><textarea data-field="notes">${esc(f.notes)}</textarea></div>
    ${f.isNew ? '' : `<button class="btn-secondary" style="color:var(--danger);margin-bottom:10px" data-action="del-med" data-id="${f.id}">${icon('trash', 'sm')} Удалить</button>`}
    <button class="btn-primary" data-action="save-med">${icon('check')} Сохранить</button>`;
}
function saveMed() {
  const f = medForm;
  if (!f.name || !f.name.trim()) { toast('Укажите наименование'); return; }
  const existing = store.medication(f.id);
  store.upsertMedication({
    ...(existing || {}),
    id: f.id, name: f.name.trim(), type: f.type || 'medication', medClass: f.medClass,
    doseValue: f.doseValue || '', doseUnit: f.doseUnit || '', schedule: f.schedule || '',
    prescribedBy: f.prescribedBy || '', prescribedDate: f.prescribedDate || '', purpose: f.purpose || '',
    clinic: f.clinic || '', year: f.year || '',
    physScore: Number(f.physScore) || 0, psychScore: Number(f.psychScore) || 0, neuroScore: Number(f.neuroScore) || 0,
    sensations: f.sensations || '', highlighted: !!f.highlighted,
    startDate: f.startDate || '', endDate: f.endDate || '', isActive: f.isActive,
    notes: f.notes || '', sortOrder: f.sortOrder, createdAt: existing?.createdAt || new Date().toISOString(),
  });
  closeSheet();
  toast('Сохранено');
}

// ---------- Документы: загрузка, распознавание, нормализация ----------
async function handleDocFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const mediaType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
  const id = store.uid();
  try {
    await putDoc(id, file);
    store.addDocument({ id, name: file.name || 'документ', mediaType, addedAt: new Date().toISOString(), parsed: false });
    toast('Документ добавлен');
  } catch (e) {
    toast('Не удалось сохранить: ' + (e?.message || 'ошибка'));
  }
}

let extractState = null;
async function parseDoc(id) {
  const meta = store.document(id);
  if (!meta) return;
  if (!ai.hasApiKey()) { toast('Сначала добавьте AI-ключ (Диагностика)'); return; }
  if (!store.settings.aiConsent) { toast('Включите согласие на AI (AI-аналитика)'); return; }
  toast('Распознаю документ…');
  try {
    const blob = await getDoc(id);
    if (!blob) throw new Error('файл не найден');
    const base64 = await blobToBase64(blob);
    const data = await ai.extractDocument({ base64, mediaType: meta.mediaType, model: store.settings.aiModelExtract });
    extractState = { docId: id, docName: meta.name, data };
    openSheet(renderExtractPreview);
  } catch (e) {
    toast('Ошибка распознавания: ' + (e?.message || 'неизвестно'));
  }
}

function renderExtractPreview() {
  const { data, docName } = extractState || {};
  if (!data) return '';
  const existing = store.medicationByName(data.name);
  const stamp = !!data.hasStamp;
  const row = (label, val, over) => val
    ? `<div class="row between"><span class="muted">${label}</span><span>${esc(val)}${over ? ` <span class="pos" style="font-size:12px">${icon('check', 'sm')}</span>` : ''}</span></div>`
    : '';
  return `
    <div class="sheet-head"><div class="title">Распознано</div><button class="btn-ghost" data-action="close-sheet">Отмена</button></div>
    <div class="muted">Из «${esc(docName)}». ${existing ? `Обновит вмешательство «${esc(existing.name)}».` : 'Создаст новое вмешательство.'}</div>
    ${stamp ? `<div class="callout"><b>Первичный документ с печатью/подписью.</b> Отмеченные ${icon('check', 'sm')} поля (клиника, доза, частота) перекроют текущие и получат провенанс.</div>` : '<div class="muted" style="font-size:13px;margin-top:8px">Без печати — заполнятся только пустые поля, ничего не перезаписывается.</div>'}
    <div class="card stack" style="margin-top:10px">
      ${row('Наименование', data.name)}
      ${row('Тип', interventionTypeTitle(data.type))}
      ${row('Клиника', data.clinic, stamp)}
      ${row('Врач', data.doctor)}
      ${row('Год', data.year, stamp)}
      ${row('Доза', data.dose, stamp)}
      ${row('Частота', data.schedule, stamp)}
      ${row('Цель', data.purpose)}
      ${data.sensations ? `<div class="stack"><span class="muted">Ощущения</span><span>${esc(data.sensations)}</span></div>` : ''}
      ${data.summary ? `<div class="stack"><span class="muted">Вывод</span><span>${esc(data.summary)}</span></div>` : ''}
    </div>
    <button class="btn-primary" data-action="apply-extract" style="margin-top:14px">${icon('check')} Применить в отчёт</button>`;
}

function applyExtraction() {
  const st = extractState;
  if (!st) return;
  const d = st.data;
  const stamp = !!d.hasStamp;
  const now = new Date().toISOString();
  const existing = store.medicationByName(d.name) || {};
  const id = existing.id || store.uid();
  const prov = { ...(existing.provenance || {}) };
  const src = { doc: st.docName, date: now, stamp: true };
  const merge = (cur, val, key) => {
    if (!val) return cur || '';
    if (stamp) { prov[key] = src; return val; }
    return cur || val;
  };
  store.upsertMedication({
    ...existing,
    id,
    name: (existing.name || d.name || 'Без названия').trim(),
    type: existing.type || d.type || 'medication',
    medClass: existing.medClass || 'other',
    clinic: merge(existing.clinic, d.clinic, 'clinic'),
    prescribedBy: existing.prescribedBy || d.doctor || '',
    year: merge(existing.year, d.year, 'year'),
    doseValue: merge(existing.doseValue, d.dose, 'dose'),
    doseUnit: existing.doseUnit || '',
    schedule: merge(existing.schedule, d.schedule, 'schedule'),
    purpose: existing.purpose || d.purpose || '',
    sensations: existing.sensations || d.sensations || '',
    physScore: existing.physScore || 0, psychScore: existing.psychScore || 0, neuroScore: existing.neuroScore || 0,
    highlighted: !!existing.highlighted,
    isActive: existing.isActive ?? true,
    startDate: existing.startDate || '', endDate: existing.endDate || '',
    notes: existing.notes || '',
    provenance: stamp ? prov : existing.provenance,
    createdAt: existing.createdAt || now,
  });
  store.updateDocument(st.docId, { parsed: true, clinic: d.clinic || '' });
  extractState = null;
  closeSheet();
  toast(stamp ? 'Отчёт нормализован по документу' : 'Данные добавлены в отчёт');
}

// ---------- Apple Health: импорт выгрузки ----------
let healthPreview = null;
async function handleHealthFile(file) {
  if (!file) return;
  toast('Разбираю Apple Health…');
  try {
    const parsed = await parseAppleHealth(file);
    if (!parsed.counts.days) { toast('Не нашёл метрик в файле'); return; }
    healthPreview = parsed;
    openSheet(renderHealthPreview);
  } catch (e) {
    toast('Не удалось прочитать: ' + (e?.message || 'ошибка формата'));
  }
}
function renderHealthPreview() {
  const p = healthPreview;
  if (!p) return '';
  const c = p.counts;
  const range = p.range ? `${new Date(p.range.from).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })} → ${new Date(p.range.to).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}` : '—';
  const found = {};
  Object.values(p.days).forEach((d) => Object.keys(d).forEach((k) => { found[k] = 1; }));
  const metrics = HEALTH_METRICS.filter(([k]) => found[k]).map(([, l]) => l).join(' · ') || '—';
  return `
    <div class="sheet-head"><div class="title">Импорт Apple Health</div>
      <button class="btn-ghost" data-action="close-sheet">Отмена</button></div>
    <div class="muted">Проверьте охват и подтвердите перенос.</div>
    <div class="grid2" style="margin-top:12px">
      ${metric(c.days, 'дней с данными', 'calendar')}
      ${metric(c.records.toLocaleString('ru-RU'), 'записей', 'activity')}
    </div>
    <div class="card" style="margin-top:10px"><div class="muted" style="font-size:13px">Период: ${range}. Метрики: ${esc(metrics)}. Встанут рядом с эпизодами и давлением — в календаре и AI-аналитике.</div></div>
    <button class="btn-primary" data-action="confirm-health" style="margin-top:14px">${icon('check')} Импортировать</button>`;
}

// ---------- EFFECT SHEET ----------
let effForm = null;
function openEffectSheet(existing, medId) {
  const scales = {};
  EFFECT_GROUPS.forEach((g) => g.items.forEach(([k]) => { scales[k] = 0; }));
  effForm = existing
    ? { id: existing.id, dateTime: existing.dateTime, medicationId: existing.medicationId || '', scales: { ...scales, ...(existing.scales || {}) }, effectiveness: existing.effectiveness || 0, tolerability: existing.tolerability || 0, sideEffects: existing.sideEffects || '', notes: existing.notes || '', isNew: false }
    : { id: store.uid(), dateTime: new Date().toISOString(), medicationId: medId || '', scales, effectiveness: 0, tolerability: 0, sideEffects: '', notes: '', isNew: true };
  openSheet(renderEffectSheet);
}
function severityRow(key, label, value) {
  const cells = SEVERITY.map((s, i) =>
    `<div class="sev-cell ${i === value ? 'on lvl' + i : ''}" data-action="sev" data-key="${key}" data-val="${i}">${s}</div>`).join('');
  return `<div class="sev-row"><span class="sev-label">${esc(label)}</span><div class="sev-cells">${cells}</div></div>`;
}
function scaleRow(label, value, action) {
  const cells = Array.from({ length: 10 }, (_, i) => i + 1).map((i) =>
    `<div class="icell ${i <= value ? 'on' : ''}" data-action="${action}" data-val="${i}">${i}</div>`).join('');
  return `<div class="intensity"><div class="intensity-head"><span class="lbl">${esc(label)}</span><span class="val">${value ? value + '/10' : '—'}</span></div><div class="intensity-cells">${cells}</div></div>`;
}
function renderEffectSheet() {
  const f = effForm;
  const meds = store.medications();
  const groups = EFFECT_GROUPS.map((g) => `
    <div class="card stack">
      <div class="section-header">${icon(g.icon, 'sm')} ${g.title}</div>
      ${g.items.map(([k, label]) => severityRow(k, label, f.scales[k] || 0)).join('')}
    </div>`).join('');
  return `
    <div class="sheet-head"><div class="title">Ощущения</div><button class="btn-ghost" data-action="save-effect">Сохранить</button></div>
    <div class="field-row"><label class="field">Время</label><input type="datetime-local" data-field="dateTime" value="${toLocalInput(f.dateTime)}"/></div>
    <div class="field-row"><label class="field">Лекарство (необязательно)</label>
      <select data-field="medicationId"><option value="">Общий фон</option>${meds.map((m) => `<option value="${m.id}" ${f.medicationId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    ${groups}
    <div class="card">${scaleRow('Субъективная эффективность', f.effectiveness, 'eff-effect')}</div>
    <div class="card">${scaleRow('Переносимость', f.tolerability, 'eff-tol')}</div>
    <div class="field-row"><label class="field">Побочные эффекты</label><input type="text" data-field="sideEffects" value="${esc(f.sideEffects)}"/></div>
    <div class="field-row"><label class="field">Заметка</label><textarea data-field="notes">${esc(f.notes)}</textarea></div>
    <button class="btn-primary" data-action="save-effect">${icon('check')} Сохранить</button>`;
}
function saveEffect() {
  const f = effForm;
  store.upsertEffect({
    id: f.id, dateTime: f.dateTime, medicationId: f.medicationId || null, scales: f.scales,
    effectiveness: f.effectiveness || 0, tolerability: f.tolerability || 0,
    sideEffects: f.sideEffects || null, notes: f.notes || null, createdAt: new Date().toISOString(),
  });
  closeSheet();
  toast('Ощущения сохранены');
}

// ---------- SHEET system ----------
let sheetRenderer = null;
let sheetCtx = null;
function openSheet(renderer, ctx = null) {
  sheetRenderer = renderer; sheetCtx = ctx;
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="backdrop">
    <div class="sheet">
      <div class="sheet-grab"><div class="sheet-handle"></div></div>
      <button class="sheet-close" data-action="close-sheet" aria-label="Закрыть">${icon('close', 'sm')}</button>
      <div id="sheet-body"></div>
    </div></div>`;
  renderSheet();
  attachSwipeToClose();
}

// Смахивание листа вниз для закрытия (без заполнения формы).
function attachSwipeToClose() {
  const sheet = sheetRoot.querySelector('.sheet');
  const grab = sheetRoot.querySelector('.sheet-grab');
  if (!sheet || !grab) return;
  let y0 = null, dy = 0;
  const start = (e) => { y0 = (e.touches ? e.touches[0] : e).clientY; dy = 0; sheet.style.transition = 'none'; };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, ((e.touches ? e.touches[0] : e).clientY) - y0);
    sheet.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault();
  };
  const end = () => {
    if (y0 == null) return;
    sheet.style.transition = '';
    if (dy > 90) { closeSheet(); } else { sheet.style.transform = ''; }
    y0 = null;
  };
  // Тянуть можно за «ручку» вверху — не мешает прокрутке содержимого.
  grab.addEventListener('touchstart', start, { passive: true });
  grab.addEventListener('touchmove', move, { passive: false });
  grab.addEventListener('touchend', end);
  grab.addEventListener('mousedown', (e) => {
    start(e);
    const mm = (ev) => move(ev);
    const mu = () => { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });
}
function renderSheet() {
  const body = $('#sheet-body');
  if (sheetRenderer && body) body.innerHTML = sheetRenderer();
}
function closeSheet() { sheetRenderer = null; sheetCtx = null; sheetRoot.innerHTML = ''; }

// ---------- render dispatch ----------
function render() {
  if (timer) { clearInterval(timer); timer = null; }
  if (state.tab === 'input') renderInput();
  else if (state.tab === 'evening') renderEvening();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'ai') renderAI();
  else renderDiag();
  syncTabs();
}
function syncTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === state.tab));
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], .tab');
  if (!t) return;
  if (t.classList.contains('tab')) { state.tab = t.dataset.tab; state.diagRoute = 'root'; state.aiRoute = 'root'; render(); return; }
  const a = t.dataset.action;
  const handlers = {
    // --- Хаб «+» ---
    'open-capture': () => openSheet(renderCaptureSheet),
    'cap-episode-now': () => { closeSheet(); state.tab = 'input'; store.startEpisode(); toast('Напряжение начато'); },
    'cap-episode-back': () => { closeSheet(); openEpisodeSheet(null); },
    'cap-anxiety-now': () => { closeSheet(); state.tab = 'input'; store.startAnxiety(); toast('Тревога начата'); },
    'cap-anxiety-back': () => { closeSheet(); openAnxietySheet(null, false); },
    'finish-episode': () => { store.finishEpisodeNow(t.dataset.id); openEpisodeSheet(store.episodes.find((x) => x.id === t.dataset.id)); },
    'finish-anxiety': () => { store.finishAnxietyNow(t.dataset.id); openAnxietySheet(store.anxiety.find((x) => x.id === t.dataset.id)); },
    'add-episode': () => openEpisodeSheet(null),
    'edit-episode': () => { const ep = store.episodes.find((x) => x.id === t.dataset.id); closeSheet(); openEpisodeSheet(ep); },
    'del-episode': () => { store.deleteEpisode(t.dataset.id); if (sheetCtx?.date) renderSheet(); },
    'open-anxiety': () => openAnxietySheet(store.activeAnxiety()),
    'import-soon': () => toast(`${t.dataset.what}: скоро, в ближайших фазах`),
    'pick-daylio': () => { const inp = $('#daylio-file'); if (inp) { inp.value = ''; inp.click(); } },
    // --- Документы ---
    'pick-doc': () => { const inp = $('#doc-file'); if (inp) { inp.value = ''; inp.click(); } },
    'parse-doc': () => parseDoc(t.dataset.id),
    'del-doc': () => { if (confirm('Удалить документ?')) { deleteDoc(t.dataset.id).catch(() => {}); store.deleteDocument(t.dataset.id); } },
    'view-doc': async () => {
      try { const blob = await getDoc(t.dataset.id); if (blob) window.open(URL.createObjectURL(blob), '_blank'); }
      catch { toast('Не удалось открыть'); }
    },
    'apply-extract': applyExtraction,
    'seed-report': () => {
      const r = seedInterventions(store);
      toast(r.added ? `Добавлено строк: ${r.added}${r.skipped ? `, пропущено дублей: ${r.skipped}` : ''}` : 'Все строки уже в отчёте');
    },
    // --- Apple Health ---
    'pick-health': () => { const inp = $('#health-file'); if (inp) { inp.value = ''; inp.click(); } },
    'confirm-health': () => { if (healthPreview) { store.importHealth(healthPreview); healthPreview = null; closeSheet(); toast('Apple Health импортирован'); } },
    // --- AI ---
    'goto-ai-key': () => { state.tab = 'ai'; state.aiRoute = 'root'; render(); },
    'ai-goto-data': () => { state.aiRoute = 'data'; render(); },
    'ai-back': () => { state.aiRoute = 'root'; render(); },
    'ai-preview': () => openSheet(renderAIPreview),
    'ai-clear-chat': () => { aiChat = []; render(); },
    'toggle-ai-source': () => {
      const k = t.dataset.src;
      const cur = { ...(store.settings.aiScope || DEFAULT_SCOPE) };
      cur[k] = !cur[k];
      store.setSetting('aiScope', cur);
    },
    'toggle-consent': () => store.setSetting('aiConsent', !store.settings.aiConsent),
    'save-ai-key': () => { const inp = $('#ai-key-input'); if (inp && inp.value.trim()) { ai.setApiKey(inp.value.trim()); toast('Ключ сохранён'); render(); } },
    'clear-ai-key': () => { ai.setApiKey(''); toast('Ключ удалён'); render(); },
    'ai-analyze': aiAnalyze,
    'ai-send': aiSend,
    'toggle-med-hi': () => { medForm.highlighted = !medForm.highlighted; renderSheet(); },
    'confirm-daylio': () => {
      if (!daylioPreview) return;
      store.importDaylio(daylioPreview);
      daylioPreview = null;
      closeSheet();
      toast('Daylio импортирован');
    },
    'del-anxiety': () => { store.deleteAnxiety(t.dataset.id); if (sheetCtx?.date) renderSheet(); },
    'save-episode': saveEpisode,
    'save-anxiety': saveAnxiety,
    'toggle-ongoing': () => { anxForm.ongoing = !anxForm.ongoing; renderSheet(); },
    'cal-prev': () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); render(); },
    'cal-next': () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); render(); },
    'open-day': () => openDay(new Date(t.dataset.date)),
    'set-override': () => { store.setOverride(sheetCtx.date, t.dataset.status); renderSheet(); render(); },
    'clear-override': () => { store.setOverride(sheetCtx.date, null); renderSheet(); render(); },
    'close-sheet': closeSheet,
    'backdrop': () => { if (e.target.classList.contains('sheet-backdrop')) closeSheet(); },
    'goto': () => { state.diagRoute = t.dataset.route; render(); },
    'diag-back': () => { state.diagRoute = 'root'; render(); },
    'toggle-anxiety': () => store.setSetting('anxietyEnabled', !store.settings.anxietyEnabled),
    'toggle-override': () => store.setSetting('manualOverrideEnabled', !store.settings.manualOverrideEnabled),
    'toggle-reminder': () => toggleReminder(),
    'export-json': () => { exportJSON(); toast('JSON выгружен'); },
    'export-csv': () => { exportCSV(); toast('CSV выгружен'); },
    'reset-entries': () => { if (confirm('Удалить все эпизоды и записи тревоги?')) { store.resetEntries(); toast('Записи очищены'); } },
    'reset-all': () => { if (confirm('Сбросить все данные, включая причины и настройки?')) { store.resetAll(); toast('Данные сброшены'); } },
    'reset-thresholds': () => { store.resetThresholds(); toast('Сброшено'); },
    'add-reason': () => { const inp = $('#new-reason'); const v = inp.value.trim(); if (v) { store.addReason(v, t.dataset.filter === 'headache' ? 'headacheReason' : 'anxietyReason'); } },
    'swap-reason': () => { if (t.dataset.other) store.swapReasonOrder(t.dataset.id, t.dataset.other); },
    'toggle-reason-active': () => { const r = store.reasons().find((x) => x.id === t.dataset.id); store.updateReason(t.dataset.id, { isActive: !r.isActive }); },
    'delete-reason': () => store.deleteReason(t.dataset.id),
    'intensity': () => { setActiveFormIntensity(Number(t.dataset.val)); },
    'toggle-reason': () => toggleFormReason(t.dataset.id),
    'seg': () => handleSeg(t.dataset.group, t.dataset.val),
    'step': () => handleStep(t.dataset.field, Number(t.dataset.d)),
    // --- Здоровье (давление / лекарства / ощущения) ---
    'open-bp': () => openBPSheet(null),
    'edit-bp': () => openBPSheet(store.bp.find((x) => x.id === t.dataset.id)),
    'del-bp': () => store.deleteBP(t.dataset.id),
    'save-bp': saveBP,
    'open-med': () => openMedSheet(null),
    'edit-med': () => openMedSheet(store.medication(t.dataset.id)),
    'save-med': saveMed,
    'del-med': () => { if (confirm('Удалить лекарство и связанные записи приёмов?')) { store.deleteMedication(t.dataset.id); closeSheet(); toast('Удалено'); } },
    'toggle-med-form': () => { medForm.isActive = !medForm.isActive; renderSheet(); },
    'took-med': () => { store.logIntake(t.dataset.id, true); toast('Отмечено: принял'); },
    'skip-med': () => { store.logIntake(t.dataset.id, false); toast('Отмечено: пропустил'); },
    'open-effect': () => openEffectSheet(null, t.dataset.med || ''),
    'save-effect': saveEffect,
    'sev': () => { effForm.scales[t.dataset.key] = Number(t.dataset.val); renderSheet(); },
    'eff-effect': () => { effForm.effectiveness = Number(t.dataset.val); renderSheet(); },
    'eff-tol': () => { effForm.tolerability = Number(t.dataset.val); renderSheet(); },
  };
  if (handlers[a]) handlers[a]();
});

// инпуты (text / datetime / textarea / select) синхронизируем в form-state
document.addEventListener('input', (e) => {
  // Знаковые ползунки действия вмешательства.
  const sg = e.target.closest('[data-signed]');
  if (sg && medForm) {
    medForm[sg.dataset.signed] = Number(sg.value) || 0;
    const valEl = sg.parentElement.querySelector('.signed-val');
    if (valEl) { const v = medForm[sg.dataset.signed]; valEl.textContent = v > 0 ? '+' + v : v; valEl.className = 'signed-val ' + (v > 0 ? 'pos' : (v < 0 ? 'neg' : 'muted')); }
    const sumEl = $('#signed-sum');
    if (sumEl) { const s = signedSum(medForm); sumEl.textContent = 'сумма ' + (s > 0 ? '+' + s : s); sumEl.className = 'signed-val ' + (s > 0 ? 'pos' : (s < 0 ? 'neg' : 'muted')); }
    return;
  }
  const f = e.target.closest('[data-field]');
  if (!f) return;
  const field = f.dataset.field;
  const val = f.value;
  if (sheetIsEpisode() && epForm && ['startTime', 'endTime', 'customReason', 'notes'].includes(field)) { epForm[field] = val; }
  if (sheetIsAnxiety() && anxForm && ['startTime', 'customReason', 'notes', 'linkedEpisodeID'].includes(field)) { anxForm[field] = val; }
  const hform = activeHealthForm();
  if (hform) { hform[field] = val; }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'daylio-file') { handleDaylioFile(e.target.files[0]); return; }
  if (e.target.id === 'doc-file') { handleDocFile(e.target.files[0]); return; }
  if (e.target.id === 'health-file') { handleHealthFile(e.target.files[0]); return; }
  const r = e.target.closest('[data-action="rename-reason"]');
  if (r) { store.updateReason(r.dataset.id, { title: e.target.value.trim() || 'Без названия' }); return; }
  const sel = e.target.closest('select[data-field]');
  if (!sel) return;
  const field = sel.dataset.field;
  if (field === 'aiModelExtract' || field === 'aiModelReport') { store.setSetting(field, sel.value); return; }
  if (field === 'linkedEpisodeID' && anxForm) { anxForm.linkedEpisodeID = sel.value; return; }
  const hform = activeHealthForm();
  if (hform) hform[field] = sel.value;
});
// Enter в поле чата AI отправляет вопрос.
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'ai-input' && e.key === 'Enter') { e.preventDefault(); aiSend(); }
});

function sheetIsEpisode() { return sheetRenderer === renderEpisodeSheet; }
function sheetIsAnxiety() { return sheetRenderer === renderAnxietySheet; }
function activeHealthForm() {
  if (sheetRenderer === renderBPSheet) return bpForm;
  if (sheetRenderer === renderMedSheet) return medForm;
  if (sheetRenderer === renderEffectSheet) return effForm;
  return null;
}

function setActiveFormIntensity(v) {
  if (sheetIsEpisode()) { epForm.intensity = v; renderSheet(); }
  else if (sheetIsAnxiety()) { anxForm.intensity = v; renderSheet(); }
}
function toggleFormReason(id) {
  const form = sheetIsEpisode() ? epForm : anxForm;
  if (!form) return;
  const i = form.reasonIDs.indexOf(id);
  if (i >= 0) form.reasonIDs.splice(i, 1); else form.reasonIDs.push(id);
  renderSheet();
}
function handleSeg(group, val) {
  if (group === 'period') { state.statsPeriod = val; render(); return; }
  if (group === 'aiperiod') { store.setSetting('aiPeriod', val); return; }
  if (group === 'theme') { store.setSetting('theme', val); return; }
  if (sheetIsEpisode()) {
    if (group === 'epType') epForm.type = val;
    else if (group === 'durMode') epForm.durMode = val;
    else if (group === 'dayLong') epForm.dayLongFlag = val;
    renderSheet();
  }
}
function handleStep(field, d) {
  if (field === 'reminderHour') {
    const v = Math.min(23, Math.max(6, store.settings.reminderHour + d));
    store.setSetting('reminderHour', v);
    if (store.settings.reminderEnabled) scheduleReminderNote();
    return;
  }
  if (field === 'ep-manual') { epForm.manualMinutes = clamp(epForm.manualMinutes + d, 1, 300); renderSheet(); return; }
  if (field === 'anx-manual') { anxForm.manualMinutes = clamp(anxForm.manualMinutes + d, 1, 300); renderSheet(); return; }
  if (field.startsWith('th-')) {
    const key = field.slice(3);
    const bounds = thresholdBounds(key);
    store.setThreshold(key, clamp(store.thresholds[key] + d * bounds.step, bounds.min, bounds.max));
  }
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function thresholdBounds(key) {
  const map = {
    shortEpisodeMinutes: { min: 5, max: 60, step: 5 },
    lowIntensity: { min: 1, max: 9, step: 1 },
    goodMaxEpisodes: { min: 1, max: 10, step: 1 },
    goodTotalDurationMinutes: { min: 15, max: 180, step: 15 },
    terribleSingleEpisodeMinutes: { min: 30, max: 300, step: 15 },
    terribleTotalDurationMinutes: { min: 60, max: 360, step: 15 },
    nightmareTotalDurationMinutes: { min: 180, max: 600, step: 30 },
  };
  return map[key] || { min: 1, max: 100, step: 1 };
}

// ---------- reminders (best-effort) ----------
async function toggleReminder() {
  const on = !store.settings.reminderEnabled;
  if (on && 'Notification' in window && Notification.permission !== 'granted') {
    try { await Notification.requestPermission(); } catch {}
  }
  store.setSetting('reminderEnabled', on);
  if (on) scheduleReminderNote();
}
function scheduleReminderNote() {
  // iOS PWA ограничивает фоновые уведомления; показываем напоминание, когда
  // приложение открыто после заданного часа и ещё не показывали сегодня.
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const key = 'hgbn.reminded.' + dayKey(now);
  if (now.getHours() >= store.settings.reminderHour && !localStorage.getItem(key)) {
    new Notification('Самонаблюдение', { body: 'Загляните в дневник и отметьте, как прошёл день.' });
    localStorage.setItem(key, '1');
  }
}

// ---------- boot ----------
function paintTabIcons() {
  const map = { input: 'edit', evening: 'moon2', calendar: 'calendar', ai: 'spark', diag: 'report' };
  document.querySelectorAll('.tab-icon[data-icon]').forEach((el) => {
    el.innerHTML = icon(map[el.dataset.icon] || 'dot');
  });
}

store.subscribe(() => { render(); if (sheetCtx?.date) renderSheet(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.applyTheme());
paintTabIcons();
render();
scheduleReminderNote();
