import { store } from './store.js';
import { dayKey, episodeDuration, recordDuration } from './calculator.js';

const USER = 'local-user';

export function buildExport() {
  const factEpisode = store.episodes.map((e) => ({
    episode_id: e.id,
    user_id: USER,
    start_datetime: e.startTime,
    end_datetime: e.endTime,
    duration_minutes: episodeDuration(e),
    intensity: e.intensity,
    type: e.type,
    day_key: dayKey(e.startTime),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }));

  const factAnxiety = store.anxiety.map((a) => ({
    anxiety_id: a.id,
    user_id: USER,
    start_datetime: a.startTime,
    end_datetime: a.endTime,
    duration_minutes: recordDuration(a),
    intensity: a.intensity,
    day_key: dayKey(a.startTime),
    linked_episode_id: a.linkedEpisodeID || null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  }));

  // Итоги дней из имеющихся дат + ручных переопределений.
  const dayKeys = new Set([
    ...store.episodes.map((e) => e.startTime),
    ...store.anxiety.map((a) => a.startTime),
  ]);
  const factDaySummary = [...dayKeys].map((iso) => {
    const d = new Date(iso);
    const r = store.computeDay(d);
    return {
      day_key: dayKey(d),
      user_id: USER,
      total_episodes: r.totalEpisodes,
      total_duration_minutes: r.totalDurationMinutes,
      max_intensity: r.maxIntensity,
      avg_intensity: Number(r.averageIntensity.toFixed(2)),
      anxiety_count: r.anxietyCount,
      anxiety_max_intensity: r.anxietyMaxIntensity,
      day_status: r.status,
      manually_overridden: r.manuallyOverridden,
    };
  });

  const dimReason = store.reasons().map((r) => ({
    reason_id: r.id, user_id: USER, title: r.title, type: r.type,
    is_default: r.isDefault, is_active: r.isActive,
  }));

  const bridgeEpisodeReason = store.episodes.flatMap((e) =>
    (e.reasonIDs || []).map((rid) => ({ episode_id: e.id, reason_id: rid })));
  const bridgeAnxietyReason = store.anxiety.flatMap((a) =>
    (a.reasonIDs || []).map((rid) => ({ anxiety_id: a.id, reason_id: rid })));

  return {
    exported_at: new Date().toISOString(),
    user_id: USER,
    fact_episode: factEpisode,
    fact_anxiety: factAnxiety,
    fact_day_summary: factDaySummary,
    dim_reason: dimReason,
    bridge_episode_reason: bridgeEpisodeReason,
    bridge_anxiety_reason: bridgeAnxietyReason,
  };
}

export function exportJSON() {
  download('hgbn-export.json', JSON.stringify(buildExport(), null, 2), 'application/json');
}

export function exportCSV() {
  const rows = ['episode_id,user_id,start_datetime,end_datetime,duration_minutes,intensity,type,day_key'];
  for (const e of buildExport().fact_episode) {
    rows.push([
      e.episode_id, e.user_id, e.start_datetime, e.end_datetime || '',
      e.duration_minutes, e.intensity, e.type, e.day_key,
    ].join(','));
  }
  download('hgbn-episodes.csv', rows.join('\n'), 'text/csv');
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
