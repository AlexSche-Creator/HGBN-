import { store, episodeDuration, recordDuration } from './store.js';
import { calculateDay, dayKey, startOfDay, formatDuration } from './calculator.js';
import { STATUSES, STATUS_META, EPISODE_TYPES, DAY_LONG } from './defaults.js';
import { summary as statsSummary } from './stats.js';
import { lineChart, barChart, hourChart, donut } from './charts.js';
import { exportJSON, exportCSV } from './export.js';
import { icon } from './icons.js';

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
  tab: 'home',
  calMonth: startOfDay(new Date()),
  statsPeriod: 'week',
  settingsRoute: 'root',
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

// ---------- HOME ----------
function renderHome() {
  const active = store.activeEpisode();
  const activeAnx = store.activeAnxiety();
  const r = store.computeDay(new Date());
  const s = store.settings;

  let capture;
  if (active) {
    capture = `
      <div class="muted center">Идёт эпизод</div>
      <div class="timer" id="timer">00:00</div>
      <button class="btn-primary" data-action="finish-episode" data-id="${active.id}">${icon('stop')} Завершить эпизод</button>`;
  } else {
    capture = `
      <div class="muted">Зафиксируйте начало эпизода за пару касаний</div>
      <button class="btn-primary" data-action="start-episode">${icon('play')} Начался эпизод</button>`;
  }

  const anxietyCard = s.anxietyEnabled ? `
    <div class="card row between">
      <div><div style="font-weight:600">${activeAnx ? 'Идёт тревога' : 'Тревога'}</div>
      <div class="muted" style="font-size:13px">${activeAnx ? 'Открыть и завершить' : 'Зафиксировать тревожный эпизод'}</div></div>
      <button class="icon-btn round" data-action="open-anxiety">${icon(activeAnx ? 'stop' : 'wind')}</button>
    </div>` : '';

  view.innerHTML = `
    <h1 class="nav-title">Сегодня</h1>
    <div class="card stack">${capture}</div>
    ${anxietyCard}
    <div class="card stack">
      <div class="row between"><div class="section-header">Статус дня</div>${badge(r.status)}</div>
      <div class="muted">${esc(r.textualSummary)}</div>
    </div>
    <div class="section-header">Сегодня</div>
    <div class="grid2">
      ${metric(r.totalEpisodes, 'эпизодов', 'number')}
      ${metric(formatDuration(r.totalDurationMinutes), 'длительность', 'clock')}
      ${metric(r.maxIntensity > 0 ? r.maxIntensity + '/10' : '—', 'макс. интенсивность', 'gauge')}
      ${metric(r.anxietyCount, 'тревога', 'wind')}
    </div>
    <div style="height:8px"></div>
    <button class="btn-secondary" data-action="add-episode">${icon('plus')} Добавить эпизод задним числом</button>`;

  if (active) startTimer(active.startTime);
}

function startTimer(startISO) {
  const elapsed = () => {
    const total = Math.max(0, Math.floor((Date.now() - new Date(startISO)) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };
  const elm = $('#timer');
  if (elm) elm.textContent = elapsed();
  timer = setInterval(() => {
    const e = $('#timer');
    if (!e) { clearInterval(timer); return; }
    e.textContent = elapsed();
  }, 1000);
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
    cells += `<div class="cal-cell ${dayKey(date) === todayKey ? 'today' : ''}" data-action="open-day" data-date="${date.toISOString()}">
      <span class="dnum">${d}</span>${ic}</div>`;
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
      ${!eps.length && !anx.length ? '<div class="empty-chart">В этот день записей нет</div>' : ''}`;
  };
  openSheet(render, { date });
}

// ---------- STATISTICS ----------
function renderStats() {
  const s = statsSummary(state.statsPeriod);
  const periods = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];

  view.innerHTML = `
    <h1 class="nav-title">Статистика</h1>
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

// ---------- SETTINGS ----------
function renderSettings() {
  if (state.settingsRoute === 'reasons-headache') return renderReasons('headache');
  if (state.settingsRoute === 'reasons-anxiety') return renderReasons('anxiety');
  if (state.settingsRoute === 'thresholds') return renderThresholds();

  const s = store.settings;
  const toggle = (on, action) => `<div class="toggle ${on ? 'on' : ''}" data-action="${action}"><div class="knob"></div></div>`;

  view.innerHTML = `
    <h1 class="nav-title">Настройки</h1>
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

    <div class="list-head">Данные</div>
    <div class="list">
      <div class="list-item tappable" data-action="export-json">${icon('export')}<span class="grow">Экспорт в JSON</span></div>
      <div class="list-item tappable" data-action="export-csv">${icon('export')}<span class="grow">Экспорт в CSV</span></div>
      <div class="list-item tappable" data-action="reset-entries"><span style="color:var(--danger)">${icon('trash')}</span><span class="grow" style="color:var(--danger)">Очистить записи</span></div>
      <div class="list-item tappable" data-action="reset-all"><span style="color:var(--danger)">${icon('reset')}</span><span class="grow" style="color:var(--danger)">Сбросить всё (вкл. причины)</span></div>
    </div>

    <div class="card"><div class="muted" style="font-size:13px">Дневник самонаблюдения: фиксация эпизодов, интенсивности, причин и длительности. Это не медицинский инструмент. Все данные хранятся только на вашем устройстве.</div></div>`;
}

function stepperHtml(field, value, suffix = '') {
  return `<div class="stepper"><button data-action="step" data-field="${field}" data-d="-1">−</button>
    <span class="sval">${value}${suffix}</span>
    <button data-action="step" data-field="${field}" data-d="1">+</button></div>`;
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
    <div class="row" style="gap:8px;margin:8px 0 16px"><button class="btn-ghost" data-action="back-settings">${icon('chevron.left', 'sm')} Настройки</button></div>
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
    <div class="row" style="gap:8px;margin:8px 0 16px"><button class="btn-ghost" data-action="back-settings">${icon('chevron.left', 'sm')} Настройки</button></div>
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
function openAnxietySheet(record) {
  if (record) {
    anxForm = { id: record.id, startTime: record.startTime, ongoing: !record.endTime,
      manualMinutes: record.manualDurationMinutes ?? 20, intensity: record.intensity,
      reasonIDs: [...(record.reasonIDs || [])], customReason: record.customReasonText || '',
      notes: record.notes || '', linkedEpisodeID: record.linkedEpisodeID || '', isNew: false };
  } else {
    anxForm = { id: store.uid(), startTime: new Date().toISOString(), ongoing: false, manualMinutes: 20,
      intensity: 3, reasonIDs: [], customReason: '', notes: '', linkedEpisodeID: '', isNew: true };
  }
  openSheet(renderAnxietySheet);
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

// ---------- SHEET system ----------
let sheetRenderer = null;
let sheetCtx = null;
function openSheet(renderer, ctx = null) {
  sheetRenderer = renderer; sheetCtx = ctx;
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="backdrop"><div class="sheet"><div class="sheet-handle"></div><div id="sheet-body"></div></div></div>`;
  renderSheet();
}
function renderSheet() {
  const body = $('#sheet-body');
  if (sheetRenderer && body) body.innerHTML = sheetRenderer();
}
function closeSheet() { sheetRenderer = null; sheetCtx = null; sheetRoot.innerHTML = ''; }

// ---------- render dispatch ----------
function render() {
  if (timer) { clearInterval(timer); timer = null; }
  if (state.tab === 'home') renderHome();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'stats') renderStats();
  else renderSettings();
  syncTabs();
}
function syncTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === state.tab));
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], .tab');
  if (!t) return;
  if (t.classList.contains('tab')) { state.tab = t.dataset.tab; state.settingsRoute = 'root'; render(); return; }
  const a = t.dataset.action;
  const handlers = {
    'start-episode': () => { store.startEpisode(); },
    'finish-episode': () => { store.finishEpisodeNow(t.dataset.id); openEpisodeSheet(store.episodes.find((x) => x.id === t.dataset.id)); },
    'add-episode': () => openEpisodeSheet(null),
    'edit-episode': () => { const ep = store.episodes.find((x) => x.id === t.dataset.id); closeSheet(); openEpisodeSheet(ep); },
    'del-episode': () => { store.deleteEpisode(t.dataset.id); if (sheetCtx?.date) renderSheet(); },
    'open-anxiety': () => openAnxietySheet(store.activeAnxiety()),
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
    'goto': () => { state.settingsRoute = t.dataset.route; render(); },
    'back-settings': () => { state.settingsRoute = 'root'; render(); },
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
  };
  if (handlers[a]) handlers[a]();
});

// инпуты (text / datetime / textarea / select) синхронизируем в form-state
document.addEventListener('input', (e) => {
  const f = e.target.closest('[data-field]');
  if (!f) return;
  const field = f.dataset.field;
  const val = f.value;
  if (sheetIsEpisode() && epForm && ['startTime', 'endTime', 'customReason', 'notes'].includes(field)) { epForm[field] = val; }
  if (sheetIsAnxiety() && anxForm && ['startTime', 'customReason', 'notes', 'linkedEpisodeID'].includes(field)) { anxForm[field] = val; }
});
document.addEventListener('change', (e) => {
  const r = e.target.closest('[data-action="rename-reason"]');
  if (r) { store.updateReason(r.dataset.id, { title: e.target.value.trim() || 'Без названия' }); return; }
  const sel = e.target.closest('select[data-field="linkedEpisodeID"]');
  if (sel && anxForm) anxForm.linkedEpisodeID = sel.value;
});

function sheetIsEpisode() { return sheetRenderer === renderEpisodeSheet; }
function sheetIsAnxiety() { return sheetRenderer === renderAnxietySheet; }

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
store.subscribe(() => { render(); if (sheetCtx?.date) renderSheet(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.applyTheme());
render();
scheduleReminderNote();
