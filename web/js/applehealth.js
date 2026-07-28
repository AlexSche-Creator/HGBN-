// Импорт выгрузки Apple Health («Экспортировать все данные о здоровье»).
// Веб-PWA не читает HealthKit вживую — берём экспортный файл: ZIP с export.xml
// (или сам export.xml). Файл огромный, поэтому парсим ПОТОКОВО, не держа его в памяти:
// считаем дневные агрегаты пульса, ВСР, сна, шагов, веса. Без зависимостей, офлайн.

const u16 = (v, o) => v[o] | (v[o + 1] << 8);
const u32 = (v, o) => (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0;

// Найти в ZIP байтовый диапазон export.xml через центральный каталог (без чтения всего файла).
async function findXmlInZip(file) {
  const tailLen = Math.min(file.size, 66000);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) { if (u32(tail, i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Файл не похож на ZIP.');
  const cdSize = u32(tail, eocd + 12);
  const cdOff = u32(tail, eocd + 16);
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  let p = 0;
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const cmtLen = u16(cd, p + 32);
    const lho = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    if (/export\.xml$/i.test(name)) {
      const lh = new Uint8Array(await file.slice(lho, lho + 30).arrayBuffer());
      const dataStart = lho + 30 + u16(lh, 26) + u16(lh, 28);
      return { blob: file.slice(dataStart, dataStart + compSize), method };
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error('В архиве нет export.xml.');
}

function textStream(blob, method) {
  let stream = blob.stream();
  if (method === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Обновите Safari до 16.4+.');
    stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  }
  return stream.pipeThrough(new TextDecoderStream());
}

const RECORD_RE = /<Record\b[^>]*>/g;
const ATTR = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : ''; };

// Ключи HealthKit → внутренние поля дневного агрегата.
function classify(type) {
  if (type === 'HKQuantityTypeIdentifierHeartRate') return 'hr';
  if (type === 'HKQuantityTypeIdentifierRestingHeartRate') return 'rest';
  if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') return 'hrv';
  if (type === 'HKQuantityTypeIdentifierStepCount') return 'steps';
  if (type === 'HKQuantityTypeIdentifierBodyMass') return 'weight';
  if (type === 'HKCategoryTypeIdentifierSleepAnalysis') return 'sleep';
  return null;
}

export async function parseAppleHealth(file) {
  const sig = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const zip = sig[0] === 0x50 && sig[1] === 0x4b;
  let stream;
  if (zip) { const { blob, method } = await findXmlInZip(file); stream = textStream(blob, method); }
  else { stream = file.stream().pipeThrough(new TextDecoderStream()); }

  const days = Object.create(null);
  const bump = (key) => (days[key] || (days[key] = { hrSum: 0, hrN: 0, rest: 0, hrvSum: 0, hrvN: 0, steps: 0, sleepMs: 0, weight: 0 }));
  let records = 0;

  function handle(tag) {
    const field = classify(ATTR(tag, 'type'));
    if (!field) return;
    const start = ATTR(tag, 'startDate');
    if (!start) return;
    const key = start.slice(0, 10);
    const d = bump(key);
    records++;
    if (field === 'hr') { const v = +ATTR(tag, 'value'); if (v) { d.hrSum += v; d.hrN++; } }
    else if (field === 'rest') { const v = +ATTR(tag, 'value'); if (v) d.rest = v; }
    else if (field === 'hrv') { const v = +ATTR(tag, 'value'); if (v) { d.hrvSum += v; d.hrvN++; } }
    else if (field === 'steps') { d.steps += +ATTR(tag, 'value') || 0; }
    else if (field === 'weight') { const v = +ATTR(tag, 'value'); if (v) d.weight = v; }
    else if (field === 'sleep') {
      if (/Asleep/i.test(ATTR(tag, 'value'))) {
        // Обе даты в одном часовом поясе — берём локальную часть, разница корректна.
        const local = (s) => new Date(s.slice(0, 19).replace(' ', 'T'));
        const ms = local(ATTR(tag, 'endDate')) - local(start);
        if (ms > 0) d.sleepMs += ms;
      }
    }
  }

  let carry = '';
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = carry + value;
    const lastGt = buf.lastIndexOf('>');
    const chunk = lastGt >= 0 ? buf.slice(0, lastGt + 1) : '';
    carry = lastGt >= 0 ? buf.slice(lastGt + 1) : buf;
    if (carry.length > 200000) carry = carry.slice(-2000); // защита от разрастания
    RECORD_RE.lastIndex = 0;
    let m;
    while ((m = RECORD_RE.exec(chunk))) handle(m[0]);
  }

  // Финализируем дневные значения.
  const out = {};
  const keys = Object.keys(days).sort();
  for (const k of keys) {
    const d = days[k];
    const day = {};
    if (d.hrN) day.hr = Math.round(d.hrSum / d.hrN);
    if (d.rest) day.restHr = Math.round(d.rest);
    if (d.hrvN) day.hrv = Math.round(d.hrvSum / d.hrvN);
    if (d.steps) day.steps = Math.round(d.steps);
    if (d.sleepMs) day.sleepH = +(d.sleepMs / 3600000).toFixed(1);
    if (d.weight) day.weight = +d.weight.toFixed(1);
    if (Object.keys(day).length) out[k] = day;
  }
  const outKeys = Object.keys(out);
  return {
    source: 'apple', days: out,
    counts: { days: outKeys.length, records },
    range: outKeys.length ? { from: outKeys[0], to: outKeys[outKeys.length - 1] } : null,
  };
}

export const HEALTH_METRICS = [
  ['hr', 'Пульс', 'уд/мин'],
  ['restHr', 'Пульс покоя', 'уд/мин'],
  ['hrv', 'ВСР (SDNN)', 'мс'],
  ['sleepH', 'Сон', 'ч'],
  ['steps', 'Шаги', ''],
  ['weight', 'Вес', 'кг'],
];
