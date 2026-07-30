// AI-аналитика через Claude API на ключе пользователя.
// Ключ хранится только на устройстве (localStorage, отдельно от экспортируемых данных).
// Прямой вызов из браузера разрешён заголовком anthropic-dangerous-direct-browser-access.
// Приложение не ставит диагноз и не назначает лечение (это зашито в системные подсказки).

import { INTERVENTION_TYPES } from './defaults.js';

const KEY_LS = 'hgbn.apikey';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export const DEFAULT_MODEL_EXTRACT = 'claude-sonnet-5';
export const DEFAULT_MODEL_REPORT = 'claude-opus-5';

export function getApiKey() { return localStorage.getItem(KEY_LS) || ''; }
export function setApiKey(v) { if (v && v.trim()) localStorage.setItem(KEY_LS, v.trim()); else localStorage.removeItem(KEY_LS); }
export function hasApiKey() { return !!getApiKey(); }

async function call(body) {
  const key = getApiKey();
  if (!key) throw new Error('Не задан API-ключ (Диагностика → AI-ключ).');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Ошибка API (HTTP ' + res.status + ')';
    try { const e = await res.json(); if (e?.error?.message) msg = e.error.message; } catch {}
    if (res.status === 401) msg = 'Неверный API-ключ.';
    throw new Error(msg);
  }
  return res.json();
}

function textOf(resp) {
  return (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

const SAFETY = 'Ты — ассистент дневника самонаблюдения при хронической головной боли напряжения. '
  + 'Ты НЕ ставишь диагноз и НЕ назначаешь лечение: никогда не советуй начинать, менять, отменять препарат или дозу. '
  + 'Формулируй как наблюдения и вопросы к врачу («наблюдение», «стоит обсудить с врачом»). Отвечай по-русски, кратко и по делу.';

// ---------- Распознавание документа → структура вмешательства ----------
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: INTERVENTION_TYPES.map(([k]) => k) },
    clinic: { type: 'string' },
    doctor: { type: 'string' },
    year: { type: 'string' },
    dose: { type: 'string' },
    schedule: { type: 'string' },
    purpose: { type: 'string' },
    sensations: { type: 'string' },
    hasStamp: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['name', 'type', 'clinic', 'doctor', 'year', 'dose', 'schedule', 'purpose', 'sensations', 'hasStamp', 'summary'],
  additionalProperties: false,
};

const EXTRACT_PROMPT = 'Это первичный медицинский документ (анамнез, заключение или назначение). '
  + 'Извлеки в структуру: наименование препарата/вмешательства; тип; клинику; врача; год; дозировку (например «10 мг»); '
  + 'частоту/схему приёма (например «на ночь», «2 раза в день»); цель назначения; ощущения/эффект, если описаны. '
  + 'hasStamp = есть ли на документе печать и/или подпись врача. summary — краткий вывод из документа. '
  + 'Если поле не указано — оставь пустую строку. Ничего не выдумывай.';

export async function extractDocument({ base64, mediaType, model }) {
  const isPdf = mediaType === 'application/pdf';
  const docBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } };
  const resp = await call({
    model: model || DEFAULT_MODEL_EXTRACT,
    max_tokens: 2000,
    system: SAFETY + ' Верни только JSON по схеме.',
    messages: [{ role: 'user', content: [docBlock, { type: 'text', text: EXTRACT_PROMPT }] }],
    output_config: { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
  });
  if (resp.stop_reason === 'refusal') throw new Error('Модель отклонила обработку документа.');
  return JSON.parse(textOf(resp));
}

// ---------- Распознавание показаний тонометра по фото ----------
const BP_SCHEMA = {
  type: 'object',
  properties: {
    sys: { type: 'integer' },
    dia: { type: 'integer' },
    pulse: { type: ['integer', 'null'] },
    confident: { type: 'boolean' },
  },
  required: ['sys', 'dia', 'pulse', 'confident'],
  additionalProperties: false,
};

export async function extractBloodPressure({ base64, mediaType, model }) {
  const resp = await call({
    model: model || DEFAULT_MODEL_EXTRACT,
    max_tokens: 300,
    system: SAFETY + ' Верни только JSON по схеме.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
        { type: 'text', text: 'На фото экран тонометра. Считай три показателя: sys — верхнее (систолическое) давление, '
          + 'dia — нижнее (диастолическое), pulse — пульс. Обычно они расположены сверху вниз именно в этом порядке; '
          + 'sys всегда больше dia. Если пульса на экране нет — верни null. '
          + 'confident = false, если цифры плохо видны или ты не уверен. Ничего не выдумывай.' },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: BP_SCHEMA } },
  });
  if (resp.stop_reason === 'refusal') throw new Error('Модель отклонила обработку фото.');
  return JSON.parse(textOf(resp));
}

// ---------- Наблюдения по срезу данных ----------
export async function analyze({ snapshot, model }) {
  const resp = await call({
    model: model || DEFAULT_MODEL_REPORT,
    max_tokens: 1500,
    system: SAFETY,
    messages: [{
      role: 'user',
      content: 'Вот срез моих данных самонаблюдения (JSON). Дай наблюдения и возможные корреляции '
        + '(тревога ↔ давление ↔ напряжение ↔ препараты ↔ настроение), что вынести в вопросы врачу. '
        + 'Не давай медицинских назначений.\n\n' + JSON.stringify(snapshot),
    }],
  });
  if (resp.stop_reason === 'refusal') throw new Error('Модель отклонила запрос.');
  return textOf(resp);
}

// ---------- Чат по истории ----------
export async function chat({ history, snapshot, model }) {
  const messages = [];
  if (snapshot) {
    messages.push({ role: 'user', content: 'Контекст моих данных (JSON), опирайся на него в ответах:\n' + JSON.stringify(snapshot) });
    messages.push({ role: 'assistant', content: 'Принял контекст. Задавайте вопрос.' });
  }
  history.forEach((m) => messages.push({ role: m.role, content: m.text }));
  const resp = await call({ model: model || DEFAULT_MODEL_REPORT, max_tokens: 1500, system: SAFETY, messages });
  if (resp.stop_reason === 'refusal') throw new Error('Модель отклонила запрос.');
  return textOf(resp);
}
