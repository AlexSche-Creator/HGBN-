// Перечисления, метаданные статусов и значения по умолчанию.

export const EPISODE_TYPES = {
  headache: { title: 'Напряжение', icon: 'waveform.path' },
  anxiety: { title: 'Тревога', icon: 'wind' },
  mixed: { title: 'Смешанный', icon: 'merge' },
};

export const DAY_LONG = {
  none: { title: 'Обычная длительность', minutes: 0 },
  almostAllDay: { title: 'Давит почти весь день', minutes: 10 * 60 },
  allDay: { title: 'Весь день', minutes: 14 * 60 },
};

// Порядок задаёт степень нагрузки (severity) от лучшего к худшему.
export const STATUSES = ['superDay', 'good', 'bad', 'terrible', 'nightmare'];

export const STATUS_META = {
  superDay: { title: 'Супер день', icon: 'sun.max', color: 'var(--accent)', severity: 0 },
  good: { title: 'Хороший день', icon: 'cloud.sun', color: 'var(--accent-soft)', severity: 1 },
  bad: { title: 'Так себе', icon: 'cloud', color: '#9E9E9E', severity: 2 },
  terrible: { title: 'Тяжёлый день', icon: 'cloud.rain', color: '#616161', severity: 3 },
  nightmare: { title: 'Очень тяжёлый день', icon: 'cloud.bolt', color: 'var(--text)', severity: 4 },
};

export const DEFAULT_THRESHOLDS = {
  shortEpisodeMinutes: 15,
  lowIntensity: 5,
  goodMaxEpisodes: 5,
  goodTotalDurationMinutes: 60,
  badIntensityLow: 6,
  badIntensityHigh: 7,
  badMaxEpisodes: 5,
  badTotalDurationMinutes: 60,
  terribleIntensityLow: 8,
  terribleIntensityHigh: 9,
  terribleSingleEpisodeMinutes: 120,
  terribleTotalDurationMinutes: 180,
  nightmareIntensity: 10,
  nightmareTotalDurationMinutes: 300,
};

export const DEFAULT_SETTINGS = {
  anxietyEnabled: true,
  manualOverrideEnabled: true,
  theme: 'system', // system | light | dark
  reminderEnabled: false,
  reminderHour: 21,
  aiConsent: false, // согласие на отправку мед-данных в AI
  aiModelExtract: 'claude-sonnet-5',
  aiModelReport: 'claude-opus-5',
  aiPeriod: 'month', // период среза для AI
  aiScope: null,     // какие источники отдавать (null = все; см. aicontext.js)
  thresholds: { ...DEFAULT_THRESHOLDS },
};

// Быстрые причины по умолчанию: 10 для напряжения + 10 для тревоги.
const HEADACHE = [
  ['Недосып', 'headacheReason', 'moon.zzz'],
  ['Долгая работа за компьютером', 'headacheReason', 'desktopcomputer'],
  ['Телефон / экран', 'headacheReason', 'iphone'],
  ['Стресс', 'both', 'bolt'],
  ['Голод', 'headacheReason', 'fork.knife'],
  ['После еды', 'headacheReason', 'takeoutbag.and.cup.and.straw'],
  ['Яркий свет', 'headacheReason', 'sun.max'],
  ['Долгое сидение', 'headacheReason', 'chair'],
  ['Перенапряжение / контроль', 'both', 'gauge.high'],
  ['Непонятно', 'headacheReason', 'question'],
];

const ANXIETY = [
  ['Работа', 'anxietyReason', 'briefcase'],
  ['Будущее', 'anxietyReason', 'calendar'],
  ['Здоровье', 'anxietyReason', 'heart'],
  ['Конфликт', 'anxietyReason', 'person.2'],
  ['Усталость', 'both', 'battery.25'],
  ['Финансы', 'anxietyReason', 'creditcard'],
  ['Перегруз задачами', 'anxietyReason', 'square.stack.3d.up'],
  ['Ожидание события', 'anxietyReason', 'hourglass'],
  ['Социальное напряжение', 'anxietyReason', 'bubble.left.and.bubble.right'],
  ['Непонятно', 'anxietyReason', 'question'],
];

export function defaultReasons(uid) {
  let order = 0;
  return [...HEADACHE, ...ANXIETY].map(([title, type, icon]) => ({
    id: uid(),
    title,
    type,
    iconName: icon,
    isDefault: true,
    isActive: true,
    sortOrder: order++,
    createdAt: new Date().toISOString(),
  }));
}

export function reasonMatches(reasonType, episodeType) {
  if (reasonType === 'both') return true;
  if (reasonType === 'headacheReason') return episodeType === 'headache' || episodeType === 'mixed';
  if (reasonType === 'anxietyReason') return episodeType === 'anxiety' || episodeType === 'mixed';
  return false;
}

// ---------- Здоровье v2: давление, лекарства, ощущения ----------

// Классы препаратов (для группировки, без медицинских рекомендаций).
export const MED_CLASSES = [
  ['antidepressant_ssri', 'Антидепрессант (СИОЗС)'],
  ['antidepressant_snri', 'Антидепрессант (СИОЗСН)'],
  ['anxiolytic', 'Анксиолитик'],
  ['muscle_relaxant', 'Миорелаксант'],
  ['nsaid', 'НПВС / анальгетик'],
  ['nootropic', 'Ноотроп'],
  ['betablocker', 'Бета-блокатор'],
  ['antihypertensive', 'Гипотензивное'],
  ['sleep', 'Для сна'],
  ['magnesium_b', 'Магний / витамины B'],
  ['supplement', 'БАД / добавка'],
  ['other', 'Другое'],
];

export function medClassTitle(key) {
  return (MED_CLASSES.find(([k]) => k === key) || [null, 'Другое'])[1];
}

export const DOSE_UNITS = ['мг', 'мкг', 'мл', 'таб', 'капли', 'ЕД', 'г'];

export const BP_CONTEXTS = [
  ['rest', 'Покой'],
  ['morning', 'Утро'],
  ['evening', 'Вечер'],
  ['beforeMed', 'До приёма'],
  ['afterMed', 'После приёма'],
  ['load', 'Нагрузка'],
  ['other', 'Другое'],
];

export function bpContextTitle(key) {
  return (BP_CONTEXTS.find(([k]) => k === key) || [null, ''])[1];
}

// Ощущения от приёма: три группы шкал (психические / физические / неврологические).
export const EFFECT_GROUPS = [
  {
    key: 'psych', title: 'Психические', icon: 'wind',
    items: [
      ['anxiety', 'Тревога'],
      ['mood', 'Сниж. настроение'],
      ['irritability', 'Раздражительность'],
      ['sleep', 'Плохой сон'],
    ],
  },
  {
    key: 'physical', title: 'Физические', icon: 'heart',
    items: [
      ['nausea', 'Тошнота'],
      ['weakness', 'Слабость'],
      ['palpitations', 'Сердцебиение'],
      ['dizziness', 'Головокружение'],
      ['appetite', 'Аппетит ↓'],
    ],
  },
  {
    key: 'neuro', title: 'Неврологические', icon: 'waveform.path',
    items: [
      ['tension', 'Напряжение / ГБ'],
      ['fog', 'Туман в голове'],
      ['focus', 'Труд. концентрации'],
      ['tremor', 'Тремор'],
      ['paresthesia', 'Онемение / покал.'],
    ],
  },
];

// 0–3 severity для симптомов.
export const SEVERITY = ['нет', 'лёгк', 'умер', 'выраж'];

// ---------- v3 фаза C: обобщённое «вмешательство» ----------
// Тип вмешательства (препарат — частный случай).
export const INTERVENTION_TYPES = [
  ['medication', 'Препарат'],
  ['procedure', 'Процедура'],
  ['therapy', 'Терапия'],
  ['diagnostic', 'Диагностика'],
  ['massage', 'Массаж'],
  ['surgery', 'Операция'],
  ['supplement', 'БАД'],
];
export function interventionTypeTitle(key) {
  return (INTERVENTION_TYPES.find(([k]) => k === key) || [null, 'Препарат'])[1];
}

// Знаковая шкала действия −10…+10 по трём измерениям; сумма = эффективность.
export const SIGNED_AXES = [
  ['physScore', 'Физич.'],
  ['psychScore', 'Психич.'],
  ['neuroScore', 'Невр.'],
];
export function signedSum(m) {
  return SIGNED_AXES.reduce((s, [k]) => s + (Number(m?.[k]) || 0), 0);
}
