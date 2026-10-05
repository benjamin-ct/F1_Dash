// Panneau « Analyse » (inspiré de MultiViewer) : Race Trace, positions tour par tour, temps au
// tour, historique des pneus, secteurs et vitesses de pointe. Calculé à partir de l'historique
// tour par tour (données dérivées) et des statistiques du chronométrage.
import { store, versionOf, on, setFocus } from '../store.js';
import { $, esc, drivers, orderedNumbers, teamColor, compoundInfo, fmtLap, lapSeconds, storageGet, storageSet } from '../util.js';
import { prefs, isFav } from '../prefs.js';

const OPTS_KEY = 'f1dash.analysis';
const opts = { trace: 'leader', ref: null, scope: 'top10', clamp: 60, lapsSlow: true, sort: 'ideal', ...storageGet(OPTS_KEY, {}) };
const saveOpts = () => storageSet(OPTS_KEY, opts);
let lastKey = '';
let hoverX = null;
let highlight = null;

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function activeTab() {
  return document.querySelector('.p-analysis [data-pane].active')?.dataset.pane || null;
}

// Pilotes affichés dans les graphiques
function shownDrivers() {
  const nums = orderedNumbers(store.state);
  if (opts.scope === 'all') return nums;
  if (opts.scope === 'favs') { const f = nums.filter((n) => isFav(n)); return f.length ? f : nums.slice(0, 10); }
  if (opts.scope === 'duel') { const d = nums.filter((n) => n === store.duel.a || n === store.duel.b || n === store.focus); return d.length ? d : nums.slice(0, 5); }
  return nums.slice(0, 10);
}

// Pointillés pour le second pilote de chaque équipe (même couleur)
function dashFor(nums, dl) {
  const seen = new Map();
  const out = {};
  for (const n of orderedNumbers(store.state)) {
    const team = dl[n]?.TeamName || n;
    out[n] = seen.has(team);
    seen.set(team, true);
  }
  return (n) => out[n] || false;
}

// ---------------- Graphique multi-séries (canvas) ----------------
function multiChart(canvas, series, o) {
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(240, wrap.clientWidth), H = Math.max(160, wrap.clientHeight);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) {
    ctx.fillStyle = '#8b95a8'; ctx.font = '13px "Titillium Web", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(o.empty || 'Pas encore de données (il faut quelques tours).', W / 2, H / 2);
    canvas._map = null;
    return;
  }
  const padL = 46, padR = 54, padT = 10, padB = 22;
  let xMin = Math.min(...pts.map((p) => p.x)), xMax = Math.max(...pts.map((p) => p.x));
  if (xMax === xMin) xMax = xMin + 1;
  let yMin = o.yMin ?? Math.min(...pts.map((p) => p.y)), yMax = o.yMax ?? Math.max(...pts.map((p) => p.y));
  if (yMax === yMin) { yMax += 1; yMin -= 1; }
  const X = (x) => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  // invert : valeurs croissantes vers le bas (écarts, positions)
  const Y = (y) => (o.invert ? padT + ((y - yMin) / (yMax - yMin)) * (H - padT - padB) : padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB));

  // Grille
  ctx.strokeStyle = '#1f2533'; ctx.lineWidth = 1; ctx.fillStyle = '#7a8396'; ctx.font = '11px "Titillium Web", sans-serif';
  const yTicks = o.yTicks || ticks(yMin, yMax, 5);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yTicks) { const y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(o.yFmt ? o.yFmt(v) : String(v), padL - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of ticks(xMin, xMax, 8).filter((v) => Number.isInteger(v))) ctx.fillText(String(v), X(v), H - padB + 5);

  // Séries (la série mise en avant est dessinée en dernier, plus épaisse)
  const order = [...series].sort((a, b) => (a.num === highlight) - (b.num === highlight));
  for (const s of order) {
    if (s.points.length < 1) continue;
    const dim = highlight && s.num !== highlight;
    ctx.globalAlpha = dim ? 0.25 : 1;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.num === highlight ? 3 : 1.8;
    ctx.setLineDash(s.dashed ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const y = Math.max(padT, Math.min(H - padB, Y(p.y)));
      if (i === 0 || p.x - s.points[i - 1].x > 1) ctx.moveTo(X(p.x), y); else ctx.lineTo(X(p.x), y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // Marque d'arrêt aux stands
    ctx.fillStyle = s.color;
    for (const p of s.points) if (p.pit) { ctx.beginPath(); ctx.arc(X(p.x), Math.max(padT, Math.min(H - padB, Y(p.y))), 3, 0, Math.PI * 2); ctx.fill(); }
    // Étiquette en bout de courbe
    const last = s.points[s.points.length - 1];
    ctx.font = '700 10.5px "Titillium Web", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.label, X(last.x) + 4, Math.max(padT + 5, Math.min(H - padB - 5, Y(last.y))));
  }
  ctx.globalAlpha = 1;

  // Réticule
  if (hoverX !== null && hoverX >= xMin && hoverX <= xMax) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.moveTo(X(hoverX), padT); ctx.lineTo(X(hoverX), H - padB); ctx.stroke();
  }
  canvas._map = { X, xMin, xMax, padL, padR, W, series, o };
}

function ticks(min, max, count) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// Infobulle : valeurs de tous les pilotes affichés pour le tour survolé
function bindHover(canvas, tipEl) {
  canvas.addEventListener('mousemove', (e) => {
    const m = canvas._map;
    if (!m) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.round(m.xMin + ((e.clientX - r.left - m.padL) / (m.W - m.padL - m.padR)) * (m.xMax - m.xMin));
    hoverX = Math.max(m.xMin, Math.min(m.xMax, x));
    const rows = m.series.map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) })).filter((r2) => r2.p)
      .sort((a, b) => (m.o.invert ? a.p.y - b.p.y : b.p.y - a.p.y));
    tipEl.innerHTML = `<b>Tour ${hoverX}</b>${rows.slice(0, 22).map(({ s, p }) => `<div><i style="background:${s.color}"></i>${esc(s.label)} <span>${m.o.tipFmt ? m.o.tipFmt(p.y) : p.y}</span>${p.pit ? ' <em>stand</em>' : ''}</div>`).join('')}`;
    tipEl.hidden = !rows.length;
    const left = e.clientX - r.left + 14;
    tipEl.style.left = `${left + 170 > r.width ? left - 190 : left}px`;
    tipEl.style.top = `${Math.max(4, e.clientY - r.top - 20)}px`;
    lastKey = '';
  });
  canvas.addEventListener('mouseleave', () => { hoverX = null; tipEl.hidden = true; lastKey = ''; });
}

// ---------------- Données ----------------
const fmtGap = (v) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} s`);

// Heure de passage sur la ligne à la fin de chaque tour (ms), par pilote
function crossTimes() {
  const out = {};
  for (const [num, arr] of Object.entries(store.derived.laps || {})) {
    const m = new Map();
    for (const l of arr) if (l.lap > 0 && l.t) m.set(Number(l.lap), { t: l.t, pit: l.pit, pos: l.pos });
    out[num] = m;
  }
  return out;
}

function traceSeries() {
  const dl = drivers(store.state);
  const ct = crossTimes();
  const dashed = dashFor(null, dl);
  // Tour par tour : heure de passage du premier (leader) ou du pilote de référence
  const maxLap = Math.max(0, ...Object.values(ct).map((m) => Math.max(0, ...m.keys())));
  const leader = new Map();
  for (let lap = 1; lap <= maxLap; lap++) {
    let best = Infinity;
    for (const m of Object.values(ct)) { const v = m.get(lap); if (v && v.t < best) best = v.t; }
    if (best < Infinity) leader.set(lap, best);
  }
  let ref = leader;
  if (opts.trace === 'driver' && opts.ref && ct[opts.ref]) ref = new Map([...ct[opts.ref]].map(([k, v]) => [k, v.t]));
  if (opts.trace === 'average') {
    // Rythme moyen du leader sur la course : ligne de référence régulière
    const laps = [...leader.keys()];
    const l0 = laps[0], l1 = laps[laps.length - 1];
    const avg = l1 > l0 ? (leader.get(l1) - leader.get(l0)) / (l1 - l0) : 0;
    ref = new Map(laps.map((l) => [l, leader.get(l0) + (l - l0) * avg]));
  }
  return shownDrivers().filter((n) => ct[n]).map((n) => ({
    num: n,
    label: dl[n]?.Tla || n,
    color: teamColor(dl[n]),
    dashed: dashed(n),
    points: [...ct[n]].filter(([lap]) => ref.has(lap)).map(([lap, v]) => ({ x: lap, y: (v.t - ref.get(lap)) / 1000, pit: v.pit })),
  }));
}

function positionSeries() {
  const dl = drivers(store.state);
  const dashed = dashFor(null, dl);
  return shownDrivers().map((n) => ({
    num: n, label: dl[n]?.Tla || n, color: teamColor(dl[n]), dashed: dashed(n),
    points: (store.derived.laps?.[n] || []).filter((l) => l.lap > 0 && l.pos).map((l) => ({ x: Number(l.lap), y: l.pos, pit: l.pit })),
  }));
}

function lapTimeSeries() {
  const dl = drivers(store.state);
  const dashed = dashFor(null, dl);
  const all = [];
  const series = shownDrivers().map((n) => {
    const pts = (store.derived.laps?.[n] || []).map((l) => ({ x: Number(l.lap), y: lapSeconds(l.time), pit: l.pit })).filter((p) => p.x > 1 && p.y > 0);
    all.push(...pts.map((p) => p.y));
    return { num: n, label: dl[n]?.Tla || n, color: teamColor(dl[n]), dashed: dashed(n), points: pts };
  });
  if (opts.lapsSlow && all.length) {
    // Tours lents écartés (stands, safety car, drapeaux) : au-delà de 107 % du meilleur
    const best = Math.min(...all);
    for (const s of series) s.points = s.points.filter((p) => !p.pit && p.y <= best * 1.07);
  }
  return series;
}

// ---------------- Rendus ----------------
function renderTrace() {
  const series = traceSeries();
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const clamp = Number(opts.clamp) || 0;
  const yMin = Math.min(0, ...ys);
  const yMax = clamp ? Math.min(Math.max(...ys, 1), clamp) : undefined;
  multiChart($('#anaTraceCanvas'), series, { invert: true, yMin: opts.trace === 'leader' ? 0 : yMin, yMax, yFmt: (v) => `${v > 0 ? '+' : ''}${v}`, tipFmt: fmtGap });
}

function renderPositions() {
  const series = positionSeries();
  const n = orderedNumbers(store.state).length || 20;
  multiChart($('#anaPosCanvas'), series, { invert: true, yMin: 1, yMax: n, yTicks: [1, 5, 10, 15, 20].filter((v) => v <= n), yFmt: (v) => `P${v}`, tipFmt: (v) => `P${v}` });
}

function renderLapTimes() {
  multiChart($('#anaLapCanvas'), lapTimeSeries(), { yFmt: (v) => fmtLap(v), tipFmt: (v) => fmtLap(v), empty: 'Pas encore de tours chronométrés.' });
}

function renderTyres() {
  const dl = drivers(store.state);
  const nums = orderedNumbers(store.state);
  const maxLap = Math.max(0, ...nums.map((n) => Math.max(0, ...(store.derived.laps?.[n] || []).map((l) => Number(l.lap) || 0))));
  const el = $('#anaTyres');
  if (!maxLap) { el.innerHTML = '<div class="note">Pas encore de tours.</div>'; return; }
  const best = Math.min(...nums.flatMap((n) => (store.derived.laps?.[n] || []).map((l) => lapSeconds(l.time)).filter((v) => v > 0)));
  const head = Array.from({ length: maxLap }, (_, i) => `<th>${i + 1}</th>`).join('');
  const rows = nums.map((n) => {
    const by = new Map((store.derived.laps?.[n] || []).map((l) => [Number(l.lap), l]));
    const cells = Array.from({ length: maxLap }, (_, i) => {
      const l = by.get(i + 1);
      if (!l) return '<td></td>';
      const ci = compoundInfo(l.compound);
      const v = lapSeconds(l.time);
      const cls = l.pit ? 'pit' : v && v <= best + 0.001 ? 'best' : '';
      return `<td class="${cls}" style="--tc:${ci.color}" title="Tour ${i + 1} · ${esc(ci.name)}${l.pit ? ' · stand' : ''}">${v ? fmtLap(v) : '—'}</td>`;
    }).join('');
    return `<tr><th class="sticky"><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[n])}"></span>${esc(dl[n]?.Tla || n)}</span></th>${cells}</tr>`;
  }).join('');
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 30;
  el.innerHTML = `<table class="tyre-hist"><tr><th class="sticky">Tour</th>${head}</tr>${rows}</table>
    <div class="small muted tyre-legend">${['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map((c) => `<span style="--tc:${compoundInfo(c).color}">${esc(compoundInfo(c).name)}</span>`).join('')} · cadre blanc = arrêt aux stands · violet = meilleur tour</div>`;
  if (atEnd) el.scrollLeft = el.scrollWidth;
}

function renderSectors() {
  const dl = drivers(store.state);
  const stats = store.state.TimingStats?.Lines || {};
  const lines = store.state.TimingData?.Lines || {};
  const nums = orderedNumbers(store.state);
  const rows = nums.map((n) => {
    const st = stats[n] || {};
    const sec = list(st.BestSectors).map((b) => lapSeconds(b?.Value));
    const sp = st.BestSpeeds || {};
    const speed = (k) => Number(sp[k]?.Value) || null;
    const ideal = sec.length === 3 && sec.every((v) => v > 0) ? sec[0] + sec[1] + sec[2] : null;
    const bestLap = lapSeconds(st.PersonalBestLapTime?.Value) || lapSeconds(lines[n]?.BestLapTime?.Value);
    return { n, s1: sec[0] || null, s2: sec[1] || null, s3: sec[2] || null, ideal, best: bestLap, i1: speed('I1'), i2: speed('I2'), fl: speed('FL'), st: speed('ST') };
  });
  const cols = [['s1', 'S1', 'time'], ['s2', 'S2', 'time'], ['s3', 'S3', 'time'], ['ideal', 'Tour idéal', 'time'], ['best', 'Meilleur tour', 'time'],
    ['i1', 'Inter 1', 'speed'], ['i2', 'Inter 2', 'speed'], ['fl', 'Ligne', 'speed'], ['st', 'Speed trap', 'speed']];
  const extreme = {};
  for (const [k, , kind] of cols) {
    const vals = rows.map((r) => r[k]).filter((v) => v > 0);
    extreme[k] = vals.length ? (kind === 'time' ? Math.min(...vals) : Math.max(...vals)) : null;
  }
  const kind = cols.find((c) => c[0] === opts.sort)?.[2] || 'time';
  rows.sort((a, b) => (a[opts.sort] > 0 ? 0 : 1) - (b[opts.sort] > 0 ? 0 : 1) || (kind === 'time' ? a[opts.sort] - b[opts.sort] : b[opts.sort] - a[opts.sort]));
  const fmt = (v, k) => (!v ? '<span class="dim">—</span>' : cols.find((c) => c[0] === k)[2] === 'time' ? (k === 'ideal' || k === 'best' ? fmtLap(v) : v.toFixed(3)) : String(v));
  $('#anaSectors').innerHTML = `<table class="sector-board"><tr><th>#</th><th>Pilote</th>${cols.map(([k, label]) => `<th class="${opts.sort === k ? 'sorted' : ''}" data-sort="${k}" title="Trier">${label}</th>`).join('')}</tr>
    ${rows.map((r, i) => `<tr data-num="${r.n}"><td>${i + 1}</td><td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[r.n])}"></span><b>${esc(dl[r.n]?.Tla || r.n)}</b></span></td>
      ${cols.map(([k]) => `<td class="${r[k] && r[k] === extreme[k] ? 'purple' : ''}">${fmt(r[k], k)}</td>`).join('')}</tr>`).join('')}</table>
    <div class="small muted" style="padding:6px 10px">Tour idéal = somme des meilleurs secteurs du pilote · violet = meilleur de la séance · vitesses en km/h (Inter 1 / 2 : points de mesure intermédiaires, Ligne : ligne d'arrivée).</div>`;
}

export function renderAnalysis(force = false) {
  const tab = activeTab();
  if (!tab || !document.querySelector('.p-analysis')?.offsetParent) return;
  const wrap = document.querySelector('.p-analysis .panel-body');
  const key = `${tab}|${versionOf(['TimingData', 'TimingAppData', 'TimingStats', 'DriverList', '__reset'])}|${JSON.stringify(opts)}|${highlight}|${hoverX}|${wrap.clientWidth}x${wrap.clientHeight}|${store.duel.a}|${store.duel.b}|${prefs.favs.join()}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  if (tab === 'trace') renderTrace();
  else if (tab === 'positions') renderPositions();
  else if (tab === 'laptimes') renderLapTimes();
  else if (tab === 'tyrehist') renderTyres();
  else if (tab === 'sectors') renderSectors();
}

function fillRefSelect() {
  const dl = drivers(store.state);
  const sel = $('#anaRef');
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  const html = nums.map((n) => `<option value="${n}" ${n === opts.ref ? 'selected' : ''}>${esc(dl[n].Tla)}</option>`).join('');
  if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
  if (!opts.ref && nums[0]) opts.ref = nums[0];
}

export function initAnalysis() {
  for (const id of ['anaTraceCanvas', 'anaPosCanvas', 'anaLapCanvas']) bindHover($(`#${id}`), $(`#${id}`).parentElement.querySelector('.ana-tip'));
  const sync = () => {
    $('#anaTrace').value = opts.trace;
    $('#anaClamp').value = String(opts.clamp);
    $('#anaRefWrap').hidden = opts.trace !== 'driver';
    for (const s of document.querySelectorAll('.ana-scope')) s.value = opts.scope;
    $('#anaSlow').checked = opts.lapsSlow;
  };
  sync();
  const set = (k, v) => { opts[k] = v; saveOpts(); sync(); renderAnalysis(true); };
  $('#anaTrace').addEventListener('change', (e) => set('trace', e.target.value));
  $('#anaClamp').addEventListener('change', (e) => set('clamp', Number(e.target.value)));
  $('#anaRef').addEventListener('change', (e) => set('ref', e.target.value));
  for (const s of document.querySelectorAll('.ana-scope')) s.addEventListener('change', (e) => set('scope', e.target.value));
  $('#anaSlow').addEventListener('change', (e) => set('lapsSlow', e.target.checked));
  $('#anaSectors').addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (th) { set('sort', th.dataset.sort); return; }
    const tr = e.target.closest('tr[data-num]');
    if (tr) setFocus(tr.dataset.num);
  });
  // Survol du nom en bout de courbe : met le pilote en avant ; clic : pilote suivi
  for (const id of ['anaTraceCanvas', 'anaPosCanvas', 'anaLapCanvas']) {
    $(`#${id}`).addEventListener('click', () => {
      const m = $(`#${id}`)._map;
      if (!m || hoverX === null) return;
      highlight = highlight ? null : store.focus;
      lastKey = '';
    });
  }
  on('focus', () => { highlight = store.focus; lastKey = ''; });
  setInterval(fillRefSelect, 2000);
  fillRefSelect();
  if ('ResizeObserver' in window) new ResizeObserver(() => { lastKey = ''; }).observe(document.querySelector('.p-analysis .panel-body'));
  document.querySelector('.p-analysis [data-tabs]')?.addEventListener('click', () => setTimeout(() => renderAnalysis(true), 0));
}
