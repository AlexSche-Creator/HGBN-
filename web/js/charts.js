// Лёгкие SVG-графики без внешних зависимостей.
const PALETTE = ['var(--accent)', '#4FC3BD', 'var(--accent-soft)', '#A7E0DC', '#6E7A7A'];

const W = 320, H = 160, PAD = 24;

function scaleX(i, n) { return n <= 1 ? PAD : PAD + (i * (W - PAD * 2)) / (n - 1); }
function scaleY(v, max) { return max <= 0 ? H - PAD : H - PAD - (v * (H - PAD * 2)) / max; }

export function lineChart(points) {
  if (!points.length) return empty();
  const max = Math.max(1, ...points.map((p) => p.value));
  const coords = points.map((p, i) => [scaleX(i, points.length), scaleY(p.value, max)]);
  const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const dots = coords.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="var(--accent)"/>`).join('');
  return svg(`
    ${grid(max)}
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xLabels(points)}
  `);
}

export function barChart(points) {
  if (!points.length) return empty();
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const bw = Math.max(3, (W - PAD * 2) / n - 4);
  const bars = points.map((p, i) => {
    const x = PAD + (i * (W - PAD * 2)) / n + 2;
    const y = scaleY(p.value, max);
    const h = Math.max(0, H - PAD - y);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--accent-soft)"/>`;
  }).join('');
  return svg(`${grid(max)}${bars}${xLabels(points)}`);
}

export function hourChart(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const bw = (W - PAD * 2) / 24 - 1;
  const bars = buckets.map((b, i) => {
    const x = PAD + (i * (W - PAD * 2)) / 24;
    const y = scaleY(b.count, max);
    const h = Math.max(0, H - PAD - y);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--accent)"/>`;
  }).join('');
  const labels = [0, 6, 12, 18, 23].map((h) => {
    const x = PAD + (h * (W - PAD * 2)) / 24;
    return `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="9" fill="var(--text-secondary)" text-anchor="middle">${h}</text>`;
  }).join('');
  return svg(`${bars}${labels}`);
}

// points: [{ date, sys, dia }] — две линии на общей шкале.
export function bpChart(points) {
  if (!points.length) return empty();
  const vals = points.flatMap((p) => [p.sys, p.dia]).filter((v) => v > 0);
  const max = Math.max(160, ...vals) + 5;
  const min = Math.min(50, ...vals) - 5;
  const span = Math.max(1, max - min);
  const sx = (i) => (points.length <= 1 ? PAD : PAD + (i * (W - PAD * 2)) / (points.length - 1));
  const sy = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = (key, color) => {
    const coords = points.map((p, i) => [sx(i), sy(p[key])]);
    const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const dots = coords.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.5" fill="${color}"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
  };
  return svg(`${line('sys', 'var(--accent)')}${line('dia', 'var(--accent-soft)')}${xLabels(points)}`);
}

export function donut(shares) {
  if (!shares.length) return empty();
  const total = shares.reduce((s, x) => s + x.count, 0);
  const cx = 80, cy = 80, r = 60, rin = 36;
  let angle = -Math.PI / 2;
  const segs = shares.map((s, i) => {
    const frac = s.count / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = arc(cx, cy, r, rin, angle, a2, large);
    angle = a2;
    return `<path d="${p}" fill="${PALETTE[i % PALETTE.length]}"/>`;
  }).join('');
  const legend = shares.map((s, i) =>
    `<div class="li"><span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(s.title)} · ${s.count}</div>`
  ).join('');
  return `<div class="chart"><svg viewBox="0 0 160 160" style="max-width:200px;margin:0 auto;">${segs}</svg></div>
          <div class="legend">${legend}</div>`;
}

function arc(cx, cy, r, rin, a1, a2, large) {
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  const x3 = cx + rin * Math.cos(a2), y3 = cy + rin * Math.sin(a2);
  const x4 = cx + rin * Math.cos(a1), y4 = cy + rin * Math.sin(a1);
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${rin} ${rin} 0 ${large} 0 ${x4} ${y4} Z`;
}

function grid(max) {
  const lines = [0, 0.5, 1].map((f) => {
    const y = H - PAD - f * (H - PAD * 2);
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--separator)" stroke-width="1"/>
            <text x="2" y="${y + 3}" font-size="9" fill="var(--text-secondary)">${Math.round(f * max)}</text>`;
  }).join('');
  return lines;
}

function xLabels(points) {
  if (points.length < 2) return '';
  const fmt = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const first = points[0], last = points[points.length - 1];
  return `<text x="${PAD}" y="${H - 6}" font-size="9" fill="var(--text-secondary)">${fmt(first.date)}</text>
          <text x="${W - PAD}" y="${H - 6}" font-size="9" fill="var(--text-secondary)" text-anchor="end">${fmt(last.date)}</text>`;
}

function svg(inner) {
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${inner}</svg></div>`;
}

function empty() {
  return '<div class="empty-chart">Недостаточно данных за период</div>';
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
