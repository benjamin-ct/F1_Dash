// Graphique en ligne SVG minimal : une série, axe unique, grille discrète,
// ligne de zéro, réticule + infobulle au survol.
import { esc } from '../util.js';

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function lineChart(el, points, opts = {}) {
  const {
    height = 130, color = '#3ea6ff', yFmt = (v) => v.toFixed(1), xFmt = (v) => String(v),
    tipFmt = (p) => `${xFmt(p.x)} : ${yFmt(p.y)}`, zero = true, markers = [], yMinSpan = 1,
    extra = [], // séries supplémentaires : [{points, color, label}]
  } = opts;
  el._chart = { points, opts };
  const width = Math.max(200, el.clientWidth || 300);
  if (!points.length) {
    el.innerHTML = `<div class="note">${esc(opts.empty || 'Pas encore de données.')}</div>`;
    return;
  }
  const padL = 40, padR = 10, padT = 10, padB = 20;
  const all = [points, ...extra.map((e) => e.points)].flat();
  let yMin = Math.min(...all.map((p) => p.y)), yMax = Math.max(...all.map((p) => p.y));
  if (zero) { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
  if (yMax - yMin < yMinSpan) { const c = (yMax + yMin) / 2; yMin = c - yMinSpan / 2; yMax = c + yMinSpan / 2; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;
  const xs = all.map((p) => p.x);
  const xMin = Math.min(...xs), xMax0 = Math.max(...xs), xMax = xMax0 === xMin ? xMin + 1 : xMax0;
  const X = (x) => padL + ((x - xMin) / (xMax - xMin)) * (width - padL - padR);
  const Y = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * (height - padT - padB);

  const yt = niceTicks(yMin, yMax, 4);
  const xt = niceTicks(xMin, xMax, Math.min(6, points.length));
  const grid = yt.map((v) => `<line x1="${padL}" x2="${width - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 && zero ? '#566079' : '#222938'}" stroke-width="1"/>` +
    `<text x="${padL - 6}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="#7d879a">${esc(yFmt(v))}</text>`).join('');
  const xl = xt.map((v) => `<text x="${X(v)}" y="${height - 5}" text-anchor="middle" font-size="10" fill="#7d879a">${esc(xFmt(v))}</text>`).join('');
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const mk = markers.map((m) => `<circle cx="${X(m.x)}" cy="${Y(m.y)}" r="4" fill="#0a0c11" stroke="${m.color || '#b7c0d0'}" stroke-width="2"><title>${esc(m.label || '')}</title></circle>`).join('');
  const last = points[points.length - 1];

  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
    ${grid}${xl}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${extra.filter((e) => e.points.length).map((e) => `<path d="${e.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('')}" fill="none" stroke="${e.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${mk}
    <circle cx="${X(last.x)}" cy="${Y(last.y)}" r="4" fill="${color}" stroke="#12161f" stroke-width="2"/>
    <line class="xhair" y1="${padT}" y2="${height - padB}" stroke="#7d879a" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
    <circle class="xdot" r="4" fill="${color}" stroke="#12161f" stroke-width="2" visibility="hidden"/>
    <rect x="${padL}" y="0" width="${width - padL - padR}" height="${height}" fill="transparent"/>
  </svg><div class="chart-tip" hidden></div>`;
  el.style.position = 'relative';

  const svg = el.querySelector('svg');
  const tip = el.querySelector('.chart-tip');
  const xh = svg.querySelector('.xhair'), xd = svg.querySelector('.xdot');
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * width;
    let best = points[0], bd = Infinity;
    for (const p of points) { const dd = Math.abs(X(p.x) - mx); if (dd < bd) { bd = dd; best = p; } }
    const px = X(best.x), py = Y(best.y);
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    xd.setAttribute('cx', px); xd.setAttribute('cy', py); xd.setAttribute('visibility', 'visible');
    tip.hidden = false;
    const others = extra.map((e) => e.points.find((p) => p.x === best.x)).filter(Boolean);
    tip.textContent = opts.tipAll ? opts.tipAll(best.x, [best, ...others]) : tipFmt(best);
    const left = (px / width) * r.width;
    tip.style.left = `${Math.min(r.width - 150, Math.max(0, left + 10))}px`;
    tip.style.top = `${(py / height) * r.height - 30}px`;
  });
  svg.addEventListener('mouseleave', () => {
    tip.hidden = true;
    xh.setAttribute('visibility', 'hidden');
    xd.setAttribute('visibility', 'hidden');
  });
}
