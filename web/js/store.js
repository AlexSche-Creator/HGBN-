import { DEFAULT_SETTINGS, DEFAULT_THRESHOLDS, defaultReasons, reasonMatches } from './defaults.js';
import { calculateDay, dayKey, startOfDay, episodeDuration, recordDuration } from './calculator.js';

const KEY = 'hgbn.data.v1';

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function defaultData() {
  return {
    reasons: defaultReasons(uid),
    episodes: [],
    anxiety: [],
    overrides: {}, // dayKey -> { status, comment }
    bp: [],          // измерения давления
    medications: [], // лекарства
    intakes: [],     // приёмы/пропуски
    effects: [],     // ощущения от приёма
    documents: [],   // метаданные загруженных PDF/JPEG (блобы — в IndexedDB)
    daylio: null,    // импорт из Daylio (настроения, маркеры, цели)
    health: null,    // импорт Apple Health (дневные метрики)
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

class Store {
  constructor() {
    this.subs = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? JSON.parse(raw) : defaultData();
    } catch {
      this.data = defaultData();
    }
    // Миграции / целостность настроек.
    this.data.settings = { ...DEFAULT_SETTINGS, ...(this.data.settings || {}) };
    this.data.settings.thresholds = { ...DEFAULT_THRESHOLDS, ...(this.data.settings.thresholds || {}) };
    this.data.overrides = this.data.overrides || {};
    this.data.bp = this.data.bp || [];
    this.data.medications = this.data.medications || [];
    this.data.intakes = this.data.intakes || [];
    this.data.effects = this.data.effects || [];
    this.data.documents = this.data.documents || [];
    if (!('daylio' in this.data)) this.data.daylio = null;
    if (!('health' in this.data)) this.data.health = null;
    if (!this.data.reasons || !this.data.reasons.length) this.data.reasons = defaultReasons(uid);
    this.applyTheme();
  }

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  // Сохранить + уведомить подписчиков (мгновенно, синхронно).
  commit() {
    this.save();
    this.emit();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn()); }

  uid() { return uid(); }

  // --- Настройки ---
  get settings() { return this.data.settings; }
  get thresholds() { return this.data.settings.thresholds; }

  setSetting(key, value) { this.data.settings[key] = value; if (key === 'theme') this.applyTheme(); this.commit(); }
  setThreshold(key, value) { this.data.settings.thresholds[key] = value; this.commit(); }
  resetThresholds() { this.data.settings.thresholds = { ...DEFAULT_THRESHOLDS }; this.commit(); }

  applyTheme() {
    const t = this.data.settings.theme;
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  // --- Причины ---
  reasons(activeOnly = false) {
    const list = [...this.data.reasons].sort((a, b) => a.sortOrder - b.sortOrder);
    return activeOnly ? list.filter((r) => r.isActive) : list;
  }
  reasonsFor(episodeType) {
    return this.reasons(true).filter((r) => reasonMatches(r.type, episodeType));
  }
  reasonsByFilter(filter) {
    // filter: 'headache' | 'anxiety'
    return this.reasons().filter((r) =>
      filter === 'headache' ? r.type !== 'anxietyReason' : r.type !== 'headacheReason');
  }
  reasonTitle(id) { return this.data.reasons.find((r) => r.id === id)?.title; }

  addReason(title, type) {
    const maxOrder = this.data.reasons.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    this.data.reasons.push({
      id: uid(), title, type, iconName: 'dot',
      isDefault: false, isActive: true, sortOrder: maxOrder + 1, createdAt: new Date().toISOString(),
    });
    this.commit();
  }
  updateReason(id, patch) {
    const r = this.data.reasons.find((x) => x.id === id);
    if (r) { Object.assign(r, patch); this.commit(); }
  }
  deleteReason(id) {
    this.data.reasons = this.data.reasons.filter((r) => r.id !== id);
    this.commit();
  }
  swapReasonOrder(idA, idB) {
    const a = this.data.reasons.find((r) => r.id === idA);
    const b = this.data.reasons.find((r) => r.id === idB);
    if (!a || !b) return;
    const tmp = a.sortOrder; a.sortOrder = b.sortOrder; b.sortOrder = tmp;
    this.commit();
  }

  // --- Эпизоды ---
  get episodes() { return this.data.episodes; }
  activeEpisode() { return this.data.episodes.find((e) => !e.endTime); }
  episodesOn(date) {
    const k = dayKey(date);
    return this.data.episodes
      .filter((e) => dayKey(e.startTime) === k)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }

  startEpisode() {
    const now = new Date().toISOString();
    this.data.episodes.push({
      id: uid(), startTime: now, endTime: null, manualDurationMinutes: null,
      intensity: 3, type: 'headache', reasonIDs: [], customReasonText: null, notes: null,
      dayLongFlag: 'none', createdAt: now, updatedAt: now,
    });
    this.commit();
  }
  finishEpisodeNow(id) {
    const e = this.data.episodes.find((x) => x.id === id);
    if (e) { e.endTime = new Date().toISOString(); e.updatedAt = e.endTime; this.commit(); }
    return e;
  }
  upsertEpisode(ep) {
    const i = this.data.episodes.findIndex((x) => x.id === ep.id);
    ep.updatedAt = new Date().toISOString();
    if (i >= 0) this.data.episodes[i] = ep; else this.data.episodes.push(ep);
    this.commit();
  }
  deleteEpisode(id) {
    this.data.episodes = this.data.episodes.filter((e) => e.id !== id);
    this.commit();
  }

  // --- Тревога ---
  get anxiety() { return this.data.anxiety; }
  activeAnxiety() { return this.data.anxiety.find((a) => !a.endTime); }
  anxietyOn(date) {
    const k = dayKey(date);
    return this.data.anxiety
      .filter((a) => dayKey(a.startTime) === k)
      .sort((x, y) => new Date(x.startTime) - new Date(y.startTime));
  }
  // Старт тревоги «в моменте» — симметрично startEpisode().
  startAnxiety() {
    const now = new Date().toISOString();
    this.data.anxiety.push({
      id: uid(), startTime: now, endTime: null, manualDurationMinutes: null,
      intensity: 3, reasonIDs: [], customReasonText: null, notes: null,
      linkedEpisodeID: null, createdAt: now, updatedAt: now,
    });
    this.commit();
  }
  finishAnxietyNow(id) {
    const a = this.data.anxiety.find((x) => x.id === id);
    if (a) { a.endTime = new Date().toISOString(); a.updatedAt = a.endTime; this.commit(); }
    return a;
  }
  upsertAnxiety(rec) {
    const i = this.data.anxiety.findIndex((x) => x.id === rec.id);
    rec.updatedAt = new Date().toISOString();
    if (i >= 0) this.data.anxiety[i] = rec; else this.data.anxiety.push(rec);
    this.commit();
  }
  deleteAnxiety(id) {
    this.data.anxiety = this.data.anxiety.filter((a) => a.id !== id);
    this.commit();
  }

  // --- Расчёт дня ---
  computeDay(date) {
    const eps = this.episodesOn(date).filter((e) => e.endTime).map((e) => ({
      intensity: e.intensity,
      durationMinutes: episodeDuration(e),
      isDayLong: (e.dayLongFlag || 'none') !== 'none',
    }));
    const anx = this.anxietyOn(date).filter((a) => a.endTime).map((a) => ({ intensity: a.intensity }));
    const k = dayKey(date);
    const ov = this.data.overrides[k];
    const override = ov && ov.status ? ov.status : null;
    return calculateDay(eps, anx, override, this.thresholds);
  }
  isOverridden(date) { return !!this.data.overrides[dayKey(date)]?.status; }
  setOverride(date, status) {
    const k = dayKey(date);
    if (status) this.data.overrides[k] = { ...(this.data.overrides[k] || {}), status };
    else if (this.data.overrides[k]) delete this.data.overrides[k].status;
    this.commit();
  }

  // --- Давление ---
  get bp() { return this.data.bp; }
  bpSorted() { return [...this.data.bp].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); }
  bpOn(date) {
    const k = dayKey(date);
    return this.bpSorted().filter((r) => dayKey(r.dateTime) === k);
  }
  latestBP() { return this.bpSorted()[0] || null; }
  upsertBP(r) {
    const i = this.data.bp.findIndex((x) => x.id === r.id);
    if (i >= 0) this.data.bp[i] = r; else this.data.bp.push(r);
    this.commit();
  }
  deleteBP(id) { this.data.bp = this.data.bp.filter((r) => r.id !== id); this.commit(); }

  // --- Лекарства ---
  medications(activeOnly = false) {
    const list = [...this.data.medications].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return activeOnly ? list.filter((m) => m.isActive) : list;
  }
  medication(id) { return this.data.medications.find((m) => m.id === id); }
  medicationName(id) { return this.medication(id)?.name; }
  medicationByName(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    return this.data.medications.find((m) => (m.name || '').trim().toLowerCase() === key) || null;
  }
  upsertMedication(m) {
    const i = this.data.medications.findIndex((x) => x.id === m.id);
    if (i >= 0) {
      this.data.medications[i] = m;
    } else {
      m.sortOrder = (this.data.medications.reduce((mx, x) => Math.max(mx, x.sortOrder ?? 0), 0)) + 1;
      this.data.medications.push(m);
    }
    this.commit();
  }
  toggleMedActive(id) {
    const m = this.medication(id);
    if (m) { m.isActive = !m.isActive; this.commit(); }
  }
  deleteMedication(id) {
    this.data.medications = this.data.medications.filter((m) => m.id !== id);
    this.data.intakes = this.data.intakes.filter((x) => x.medicationId !== id);
    this.data.effects = this.data.effects.map((e) => e.medicationId === id ? { ...e, medicationId: null } : e);
    this.commit();
  }

  // --- Приёмы ---
  logIntake(medicationId, taken) {
    this.data.intakes.push({
      id: uid(), medicationId, dateTime: new Date().toISOString(), taken, note: null,
      createdAt: new Date().toISOString(),
    });
    this.commit();
  }
  intakesOn(date) {
    const k = dayKey(date);
    return this.data.intakes
      .filter((x) => dayKey(x.dateTime) === k)
      .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  }
  intakesFor(medicationId) { return this.data.intakes.filter((x) => x.medicationId === medicationId); }
  deleteIntake(id) { this.data.intakes = this.data.intakes.filter((x) => x.id !== id); this.commit(); }

  // --- Ощущения ---
  get effects() { return this.data.effects; }
  effectsSorted() { return [...this.data.effects].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); }
  effectsFor(medicationId) { return this.effectsSorted().filter((e) => e.medicationId === medicationId); }
  latestEffectFor(medicationId) { return this.effectsFor(medicationId)[0] || null; }
  upsertEffect(e) {
    const i = this.data.effects.findIndex((x) => x.id === e.id);
    if (i >= 0) this.data.effects[i] = e; else this.data.effects.push(e);
    this.commit();
  }
  deleteEffect(id) { this.data.effects = this.data.effects.filter((e) => e.id !== id); this.commit(); }

  // --- Daylio ---
  get daylio() { return this.data.daylio; }
  hasDaylio() { return !!this.data.daylio; }
  importDaylio(parsed) {
    this.data.daylio = {
      version: parsed.version,
      importedAt: new Date().toISOString(),
      groups: parsed.groups,
      markers: parsed.markers,
      entries: parsed.entries,
      goals: parsed.goals,
      goalEntries: parsed.goalEntries,
    };
    this.mergeTriggers(parsed.triggerTags || []);
    this.commit();
  }
  // Дополняем текущее разбиение триггеров маркерами из группы «Триггеры» бэкапа (без дублей).
  mergeTriggers(names) {
    const existing = new Set(this.data.reasons.map((r) => r.title.trim().toLowerCase()));
    let order = this.data.reasons.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    for (const name of names) {
      const key = (name || '').trim().toLowerCase();
      if (!key || existing.has(key)) continue;
      existing.add(key);
      this.data.reasons.push({
        id: uid(), title: name.trim(), type: 'both', iconName: 'bolt',
        isDefault: false, isActive: true, sortOrder: ++order,
        source: 'daylio', createdAt: new Date().toISOString(),
      });
    }
  }
  daylioMarkerName(id) { return this.data.daylio?.markers.find((m) => m.id === id)?.name; }
  // Настроение дня (1=лучшее … 5=худшее) — по последней записи за день.
  daylioMoodOn(date) {
    const d = this.data.daylio;
    if (!d) return null;
    const k = dayKey(date);
    const day = d.entries.filter((e) => dayKey(e.dateTime) === k);
    return day.length ? day[day.length - 1].mood : null;
  }
  daylioGoalName(goalId) { return this.data.daylio?.goals.find((g) => g.id === goalId)?.name; }

  // --- Документы (метаданные; блобы — в IndexedDB) ---
  documents() { return [...this.data.documents].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)); }
  document(id) { return this.data.documents.find((d) => d.id === id); }
  addDocument(meta) { this.data.documents.push(meta); this.commit(); }
  updateDocument(id, patch) {
    const d = this.data.documents.find((x) => x.id === id);
    if (d) { Object.assign(d, patch); this.commit(); }
  }
  deleteDocument(id) { this.data.documents = this.data.documents.filter((d) => d.id !== id); this.commit(); }

  // --- Apple Health ---
  get health() { return this.data.health; }
  hasHealth() { return !!this.data.health && !!this.data.health.days; }
  importHealth(parsed) {
    this.data.health = { ...parsed, importedAt: new Date().toISOString() };
    this.commit();
  }
  healthOn(date) {
    if (!this.hasHealth()) return null;
    const d = new Date(date);
    const p = (n) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return this.data.health.days[key] || null;
  }

  // --- Сброс ---
  resetEntries() {
    this.data.episodes = [];
    this.data.anxiety = [];
    this.data.overrides = {};
    this.data.bp = [];
    this.data.intakes = [];
    this.data.effects = [];
    this.commit();
  }
  resetAll() {
    this.data = defaultData();
    this.applyTheme();
    this.commit();
  }
}

export const store = new Store();
export { episodeDuration, recordDuration };
