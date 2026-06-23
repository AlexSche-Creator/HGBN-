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
