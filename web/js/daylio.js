// Разбор бэкапа Daylio (.daylio) полностью на устройстве, без зависимостей и сборки.
// Формат: ZIP → запись backup.daylio (deflate) → base64-текст → UTF-8 JSON.
// Инфляция через встроенный DecompressionStream (Safari 16.4+, Chrome, Firefox) — офлайн.

const u16 = (v, o) => v[o] | (v[o + 1] << 8);
const u32 = (v, o) => (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Браузер не поддерживает распаковку. Обновите Safari до 16.4+.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// Достаём одну запись из ZIP по имени через центральный каталог (надёжнее локальных заголовков).
async function readZipEntry(u8, targetName) {
  let eocd = -1;
  const from = Math.max(0, u8.length - 22 - 65536);
  for (let i = u8.length - 22; i >= from; i--) {
    if (u32(u8, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файл не похож на .daylio (нет ZIP).');
  const cdOff = u32(u8, eocd + 16);
  const count = u16(u8, eocd + 10);
  let p = cdOff;
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(u8, p) !== 0x02014b50) throw new Error('Повреждён каталог архива.');
    const method = u16(u8, p + 10);
    const compSize = u32(u8, p + 20);
    const nameLen = u16(u8, p + 28);
    const extraLen = u16(u8, p + 30);
    const cmtLen = u16(u8, p + 32);
    const lho = u32(u8, p + 42);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === targetName) {
      if (u32(u8, lho) !== 0x04034b50) throw new Error('Повреждён заголовок записи.');
      const lNameLen = u16(u8, lho + 26);
      const lExtraLen = u16(u8, lho + 28);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      const comp = u8.subarray(dataStart, dataStart + compSize);
      return method === 0 ? comp : await inflateRaw(comp);
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('В архиве нет ' + targetName + '.');
}

function b64ToJsonText(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes); // JSON в UTF-8
}

// Нормализуем во внутреннюю структуру приложения.
function normalize(d) {
  const moodGroupById = {};
  (d.customMoods || []).forEach((m) => { moodGroupById[m.id] = m.mood_group_id; });

  const groups = (d.tag_groups || [])
    .map((g) => ({ id: g.id, name: g.name, order: g.order }))
    .sort((a, b) => a.order - b.order);

  const markers = (d.tags || [])
    .map((t) => ({ id: t.id, name: t.name, groupId: t.id_tag_group, order: t.order }))
    .sort((a, b) => a.order - b.order);

  // mood: 1 = лучшее (супер) … 5 = худшее (ужасно)
  const entries = (d.dayEntries || []).map((e) => ({
    dateTime: new Date(e.datetime).toISOString(),
    mood: moodGroupById[e.mood] || e.mood,
    tags: e.tags || [],
    note: [e.note_title, e.note].filter(Boolean).join(' — '),
  })).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const goals = (d.goals || [])
    .map((g) => ({ id: g.goal_id, name: g.name, order: g.order }))
    .sort((a, b) => a.order - b.order);

  const goalEntries = (d.goalEntries || []).map((g) => ({
    goalId: g.goalId,
    dateTime: new Date(g.createdAt).toISOString(),
  }));

  const triggerGroup = groups.find((g) => /тригг/i.test(g.name));
  const triggerTags = triggerGroup
    ? markers.filter((m) => m.groupId === triggerGroup.id).map((m) => m.name)
    : [];

  return {
    version: d.version, groups, markers, entries, goals, goalEntries, triggerTags,
    counts: { groups: groups.length, markers: markers.length, entries: entries.length, goals: goals.length },
  };
}

export async function parseDaylio(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const inner = await readZipEntry(u8, 'backup.daylio');
  const b64 = new TextDecoder().decode(inner);
  const d = JSON.parse(b64ToJsonText(b64));
  return normalize(d);
}

// 5 уровней настроения Daylio → метаданные в палитре приложения.
export const MOOD_META = [
  null,
  { key: 'super', title: 'супер', color: 'var(--accent)' },
  { key: 'good', title: 'хорошо', color: 'var(--accent-soft)' },
  { key: 'meh', title: 'так себе', color: '#C9922E' },
  { key: 'bad', title: 'плохо', color: '#D98324' },
  { key: 'awful', title: 'ужасно', color: 'var(--danger)' },
];
