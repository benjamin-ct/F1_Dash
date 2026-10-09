// Espace « Saison » (inspiré de formula1dashboard.com) : compte à rebours de la prochaine
// séance, calendrier, classements avec évolution des points, résultats et records, duels entre
// coéquipiers, statistiques détaillées. Données : API Jolpica (via le serveur, /api/season) et
// analyse des archives F1 Live Timing (/api/season/stats).
import { $, esc, api, teamColor } from '../util.js';
import { renderDrivers, renderConsistency, renderPits, renderSpeeds, renderCircuits } from './season-stats.js';
import { renderTech, renderElements, setTechFilter, translateTechDetail, toggleTechOriginal } from './season-fia.js';

// Couleurs officielles (utilisées si les couleurs contrastées sont désactivées)
const OFFICIAL = {
  mercedes: '00D7B6', ferrari: 'ED1131', mclaren: 'F47600', red_bull: '4781D7', rb: '6C98FF', williams: '1868DB',
  alpine: '00A1E8', aston_martin: '229971', haas: '9C9FA2', sauber: '01C00E', audi: 'F50537', cadillac: '909090',
};
const color = (team, teamId) => teamColor({ TeamName: team, TeamColour: OFFICIAL[teamId] || '8b95a8' });
const chip = (d) => `<span class="sz-chip" style="--tc:${color(d.team, d.teamId)}">${esc(d.last || d.name || d.code)}</span>`;
const bar = (team, teamId) => `<span class="drv-bar" style="background:${color(team, teamId)}"></span>`;

let data = null;
let year = new Date().getFullYear();
let section = 'home';
let loading = false;
let timer = null;
let stats = null;          // analyse des courses (archives) de l'année affichée
let statsTimer = null;
let drvCode = null;
let speedPt = 'ST';
let circSort = 'round';
const STATS_SECTIONS = new Set(['drivers', 'consistency', 'pits', 'speeds', 'circuits']);
const FIA_SECTIONS = new Set(['tech', 'elements']);
let fia = null;            // documents FIA (évolutions techniques, éléments moteur)
let fiaTimer = null;

async function loadFia() {
  clearTimeout(fiaTimer);
  const y = year;
  try {
    const f = await api(`/api/season/fia?year=${y}`);
    if (y !== year) return;
    fia = f;
    if (f.pending) fiaTimer = setTimeout(loadFia, 3000);
  } catch (err) {
    if (y === year) fia = { year: y, error: err.message, events: [] };
  }
  if (FIA_SECTIONS.has(section) && !$('#seasonView').hidden) render();
}

// Statistiques détaillées : analysées par le serveur en arrière-plan, on suit l'avancement.
async function loadStats() {
  clearTimeout(statsTimer);
  const y = year;
  try {
    const s = await api(`/api/season/stats?year=${y}`);
    if (y !== year) return;
    stats = s;
    if (s.pending) statsTimer = setTimeout(loadStats, 3000);
  } catch (err) {
    if (y === year) stats = { error: err.message, races: [] };
  }
  if (STATS_SECTIONS.has(section) && !$('#seasonView').hidden) render();
}

const fmtDate = (t, o) => new Date(t).toLocaleDateString('fr-FR', o || { day: '2-digit', month: 'short' });
const fmtTime = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const done = (r) => r.results.length > 0;

async function load(force = false) {
  if (loading || (data?.year === year && !force)) return;
  loading = true;
  $('#szContent').innerHTML = '<div class="note">Chargement de la saison…</div>';
  try {
    data = await api(`/api/season?year=${year}`);
  } catch (err) {
    $('#szContent').innerHTML = `<div class="note">Données de la saison indisponibles (${esc(err.message)}). Une connexion internet est nécessaire au premier affichage.</div>`;
    loading = false;
    return;
  }
  loading = false;
  render();
  if (!stats || stats.year !== year || stats.pending) loadStats();
  if (!fia || fia.year !== year || fia.pending) loadFia();
}

// ---------------- Calculs ----------------
function nextSession() {
  const now = Date.now();
  for (const r of data.races) for (const s of r.sessions) if (s.t && Date.parse(s.t) > now) return { race: r, s };
  return null;
}

// Points cumulés par manche (course + sprint)
function pointsByRound() {
  const cum = new Map();
  const series = new Map();
  for (const r of data.races.filter(done)) {
    for (const x of [...r.results, ...r.sprintResults]) cum.set(x.code, (cum.get(x.code) || 0) + x.points);
    for (const [code, pts] of cum) {
      if (!series.has(code)) series.set(code, []);
      series.get(code).push({ x: r.round, y: pts });
    }
  }
  return series;
}

function seasonStats() {
  const races = data.races.filter(done);
  const count = (fn) => {
    const m = new Map();
    for (const r of races) for (const x of fn(r)) if (x) m.set(x.code, { d: x, n: (m.get(x.code)?.n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n)[0] || null;
  };
  const wins = count((r) => [r.results[0]]);
  const podiums = count((r) => r.results.slice(0, 3));
  const poles = count((r) => [r.quali.find((q) => q.pos === 1)]);
  // Meilleure moyenne d'arrivée (au moins la moitié des courses)
  const fin = new Map();
  for (const r of races) for (const x of r.results) if (x.pos && /^\d+$/.test(x.posText)) { const f = fin.get(x.code) || { d: x, s: 0, n: 0 }; f.s += x.pos; f.n++; fin.set(x.code, f); }
  const avg = [...fin.values()].filter((f) => f.n >= races.length / 2).map((f) => ({ d: f.d, v: f.s / f.n })).sort((a, b) => a.v - b.v)[0] || null;
  // Places gagnées (cumul) et plus belle remontée
  const gained = new Map();
  let comeback = null;
  for (const r of races) for (const x of r.results) {
    if (!x.grid || !/^\d+$/.test(x.posText)) continue;
    const g = x.grid - x.pos;
    gained.set(x.code, { d: x, v: (gained.get(x.code)?.v || 0) + Math.max(0, g) });
    if (!comeback || g > comeback.v) comeback = { d: x, v: g, r, from: x.grid, to: x.pos };
  }
  const mostGained = [...gained.values()].sort((a, b) => b.v - a.v)[0] || null;
  // Écarts de victoire
  const margins = races.map((r) => ({ r, d: r.results[0], v: parseFloat(String(r.results[1]?.time || '').replace('+', '')) })).filter((m) => m.v > 0);
  margins.sort((a, b) => a.v - b.v);
  return { wins, podiums, poles, avg, mostGained, comeback, closest: margins[0] || null, largest: margins.at(-1) || null, races: races.length };
}

// ---------------- Rendus ----------------
function standingsTable(rows, kind, limit = Infinity) {
  const lead = rows[0]?.points || 0;
  return `<table class="sz-table"><tr><th>Pos.</th><th>${kind === 'd' ? 'Pilote' : 'Écurie'}</th><th>Points</th><th>Écart</th><th>Vict.</th></tr>
    ${rows.slice(0, limit).map((x) => `<tr><td>${x.pos ?? '—'}</td><td>${kind === 'd' ? `${bar(x.team, x.teamId)}<b>${esc(x.name)}</b> <span class="muted small">${esc(x.team)}</span>` : `${bar(x.name, x.id)}<b>${esc(x.name)}</b>`}</td>
      <td><b>${x.points}</b></td><td class="muted">${x.points === lead ? '—' : `−${lead - x.points}`}</td><td>${x.wins || ''}</td></tr>`).join('')}</table>`;
}

function renderHome() {
  const nx = nextSession();
  const doneRaces = data.races.filter(done);
  const last = doneRaces.at(-1);
  const pct = data.races.length ? Math.round((doneRaces.length / data.races.length) * 1000) / 10 : 0;
  const [p1, p2] = data.drivers;
  const [c1, c2] = data.constructors;
  return `<div class="sz-cards">
      <div class="sz-card sz-count">${nx ? `<div class="sz-kicker"><span class="sz-badge">R${nx.race.round}</span> ${esc(nx.race.name)} : ${esc(nx.s.label)}</div>
        <div class="sz-countdown" id="szCountdown" data-t="${esc(nx.s.t)}"></div>
        <div class="small sz-when">${fmtDate(nx.s.t, { weekday: 'long', day: 'numeric', month: 'long' })} à ${fmtTime(nx.s.t)}</div>` : '<div class="sz-kicker">Saison terminée</div>'}</div>
      <div class="sz-card"><div class="muted small">Calendrier ${data.year}</div><div class="sz-big">${esc(nx?.race.locality || nx?.race.country || '—')}</div>
        <div class="sz-progress"><i style="width:${pct}%"></i></div><div class="muted small">${pct.toString().replace('.', ',')} % de la saison · ${doneRaces.length}/${data.races.length} courses</div></div>
      <div class="sz-card"><div class="muted small">Leader pilotes</div><div class="sz-big">${p1 ? `${bar(p1.team, p1.teamId)}${esc(p1.last)}` : '—'}</div>
        <div class="muted small">${p1 ? `${p1.points} pts${p2 ? ` · +${p1.points - p2.points} sur ${esc(p2.last)}` : ''}` : ''}</div></div>
      <div class="sz-card"><div class="muted small">Leader constructeurs</div><div class="sz-big">${c1 ? `${bar(c1.name, c1.id)}${esc(c1.name)}` : '—'}</div>
        <div class="muted small">${c1 ? `${c1.points} pts${c2 ? ` · +${c1.points - c2.points} sur ${esc(c2.name)}` : ''}` : ''}</div></div>
      ${last ? `<div class="sz-card"><div class="muted small">Dernier vainqueur · R${last.round}</div><div class="sz-big">${bar(last.results[0].team, last.results[0].teamId)}${esc(last.results[0].last)}</div><div class="muted small">${esc(last.name)}</div></div>` : ''}
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Classement pilotes</h3>${standingsTable(data.drivers, 'd', 10)}<button class="btn small" data-szgo="standings">Classement complet →</button></section>
      <section class="sz-box"><h3>Classement constructeurs</h3>${standingsTable(data.constructors, 'c', 10)}<button class="btn small" data-szgo="standings">Classement complet →</button></section>
    </div>`;
}

function renderCalendar() {
  const nx = nextSession();
  return `<div class="sz-cal">${data.races.map((r) => {
    const first = r.sessions[0]?.t || r.date;
    const status = done(r) ? '<span class="sz-tag done">Terminé</span>' : nx?.race.round === r.round ? '<span class="sz-tag next">Prochain</span>' : '<span class="sz-tag">À venir</span>';
    const w = r.results[0];
    return `<details class="sz-race ${nx?.race.round === r.round ? 'is-next' : ''}" ${nx?.race.round === r.round ? 'open' : ''}>
      <summary><div class="sz-race-top"><span class="muted">R${r.round}</span> ${r.sprint ? '<span class="sz-tag sprint">Sprint</span>' : ''} ${status}</div>
        <div class="sz-race-name">${esc(r.name.replace(' Grand Prix', ''))}</div>
        <div class="muted small">${esc(r.circuit || '')} · ${fmtDate(first)} – ${fmtDate(r.date)}</div>
        ${w ? `<div class="small">🏆 ${chip(w)} ${r.quali[0] ? `· pole ${chip(r.quali.find((q) => q.pos === 1) || r.quali[0])}` : ''}</div>` : ''}</summary>
      <ul class="sz-sessions">${r.sessions.map((s) => `<li><span>${esc(s.label)}</span><span>${s.t ? `${fmtDate(s.t, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(s.t)}` : '—'}</span></li>`).join('')}</ul>
    </details>`;
  }).join('')}</div><p class="muted small">Horaires affichés à l'heure de cet ordinateur.</p>`;
}

function lineChartSvg(series, { w = 900, h = 300 } = {}) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return '<div class="note">Pas encore de résultats.</div>';
  const xMax = Math.max(...pts.map((p) => p.x)), xMin = Math.min(...pts.map((p) => p.x)), yMax = Math.max(...pts.map((p) => p.y)) || 1;
  const pl = 36, pr = 70, pt = 10, pb = 22;
  const X = (x) => pl + ((x - xMin) / Math.max(1, xMax - xMin)) * (w - pl - pr);
  const Y = (y) => pt + (1 - y / yMax) * (h - pt - pb);
  const step = Math.max(50, Math.ceil(yMax / 5 / 50) * 50);
  let grid = '';
  for (let v = 0; v <= yMax; v += step) grid += `<line x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(v) + 4}" class="sz-ax" text-anchor="end">${v}</text>`;
  for (let x = xMin; x <= xMax; x++) grid += `<text x="${X(x)}" y="${h - 6}" class="sz-ax" text-anchor="middle">R${x}</text>`;
  // Étiquettes de fin de courbe écartées pour ne pas se chevaucher
  const labels = series.filter((s) => s.points.length).map((s) => ({ s, last: s.points.at(-1), y: Y(s.points.at(-1).y) + 4 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  const over = (labels.at(-1)?.y ?? 0) - (h - pb);
  if (over > 0) for (let i = labels.length - 1; i >= 0; i--) labels[i].y = Math.min(labels[i].y, (labels[i + 1]?.y ?? h - pb + 13) - 13);
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4"' : ''} points="${s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`).join('')
    + labels.map(({ s, last, y }) => `<text x="${X(last.x) + 5}" y="${y}" fill="${s.color}" class="sz-lbl">${esc(s.label)} ${last.y}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="sz-svg">${grid}${lines}</svg>`;
}

function renderStandings() {
  const pr = pointsByRound();
  const seen = new Set();
  const top = data.drivers.slice(0, 10).map((d) => {
    const dashed = seen.has(d.teamId);
    seen.add(d.teamId);
    return { label: d.code, color: color(d.team, d.teamId), dashed, points: pr.get(d.code) || [] };
  });
  return `<section class="sz-box"><h3>Évolution des points — 10 premiers</h3>${lineChartSvg(top)}</section>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Pilotes</h3>${standingsTable(data.drivers, 'd')}</section>
      <section class="sz-box"><h3>Constructeurs</h3>${standingsTable(data.constructors, 'c')}</section>
    </div>`;
}

function renderResults() {
  const st = seasonStats();
  const card = (title, main, sub) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${main}</div><div class="muted small">${sub || ''}</div></div>`;
  const who = (x) => (x ? `${bar(x.d.team, x.d.teamId)}${esc(x.d.last)}` : '—');
  return `<div class="sz-cards">
      ${card('Plus de victoires', st.wins ? `${st.wins.n} <small>victoires</small>` : '—', who(st.wins))}
      ${card('Plus de podiums', st.podiums ? `${st.podiums.n} <small>podiums</small>` : '—', who(st.podiums))}
      ${card('Plus de poles', st.poles ? `${st.poles.n} <small>poles</small>` : '—', who(st.poles))}
      ${card('Meilleure moyenne à l\'arrivée', st.avg ? st.avg.v.toFixed(1).replace('.', ',') : '—', who(st.avg))}
      ${card('Plus de places gagnées', st.mostGained ? `+${st.mostGained.v} <small>places</small>` : '—', who(st.mostGained))}
      ${card('Plus belle remontée', st.comeback ? `+${st.comeback.v} <small>places</small>` : '—', st.comeback ? `${who(st.comeback)} · P${st.comeback.from} → P${st.comeback.to} · R${st.comeback.r.round}` : '')}
      ${card('Plus large victoire', st.largest ? `+${st.largest.v.toFixed(3).replace('.', ',')} s` : '—', st.largest ? `${esc(st.largest.d.last)} · R${st.largest.r.round} ${esc(st.largest.r.locality || '')}` : '')}
      ${card('Victoire la plus serrée', st.closest ? `+${st.closest.v.toFixed(3).replace('.', ',')} s` : '—', st.closest ? `${esc(st.closest.d.last)} · R${st.closest.r.round} ${esc(st.closest.r.locality || '')}` : '')}
    </div>
    <section class="sz-box"><h3>Grands Prix</h3><table class="sz-table sz-results"><tr><th>Manche</th><th>Grand Prix</th><th>Date</th><th>Vainqueur sprint</th><th>Pole</th><th>Vainqueur</th><th>2e</th><th>3e</th></tr>
      ${data.races.map((r) => `<tr class="${done(r) ? '' : 'muted'}"><td>R${r.round}</td><td>${esc(r.name.replace(' Grand Prix', ''))}</td><td>${fmtDate(r.date)}</td>
        <td>${r.sprintResults[0] ? chip(r.sprintResults[0]) : '—'}</td><td>${r.quali.find((q) => q.pos === 1) ? chip(r.quali.find((q) => q.pos === 1)) : '—'}</td>
        <td>${r.results[0] ? chip(r.results[0]) : '—'}</td><td>${r.results[1] ? chip(r.results[1]) : ''}</td><td>${r.results[2] ? chip(r.results[2]) : ''}</td></tr>`).join('')}</table></section>`;
}

let h2hTeam = null;

function renderH2H() {
  const teams = data.constructors.map((c) => ({ id: c.id, name: c.name }));
  h2hTeam ||= teams[0]?.id;
  // Pilotes de l'écurie (le plus de courses)
  const count = new Map();
  for (const r of data.races) for (const x of [...r.results, ...r.quali]) if (x.teamId === h2hTeam) count.set(x.code, { d: x, n: (count.get(x.code)?.n || 0) + 1 });
  const pair = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.d);
  if (pair.length < 2) return `<div class="note">Pas assez de données pour cette écurie.</div>`;
  const [A, B] = pair;
  const stat = (fn) => [fn(A.code), fn(B.code)];
  const races = data.races.filter(done);
  const q = { a: 0, b: 0 }, rr = { a: 0, b: 0 };
  for (const r of races) {
    const qa = r.quali.find((x) => x.code === A.code), qb = r.quali.find((x) => x.code === B.code);
    if (qa?.pos && qb?.pos) qa.pos < qb.pos ? q.a++ : q.b++;
    const ra = r.results.find((x) => x.code === A.code), rb = r.results.find((x) => x.code === B.code);
    if (ra && rb) {
      const pa = /^\d+$/.test(ra.posText) ? ra.pos : 99, pb = /^\d+$/.test(rb.posText) ? rb.pos : 99;
      if (pa !== pb) pa < pb ? rr.a++ : rr.b++;
    }
  }
  const sum = (code, f) => races.reduce((n, r) => n + f(r, code), 0);
  const res = (r, code) => r.results.find((x) => x.code === code);
  const rows = [
    ['Duel en qualifications', [q.a, q.b]],
    ['Duel en course', [rr.a, rr.b]],
    ['Points', stat((c) => data.drivers.find((d) => d.code === c)?.points || 0)],
    ['Victoires', stat((c) => sum(c, (r, k) => (res(r, k)?.pos === 1 ? 1 : 0)))],
    ['Podiums', stat((c) => sum(c, (r, k) => (res(r, k)?.pos <= 3 && /^\d+$/.test(res(r, k)?.posText || '') ? 1 : 0)))],
    ['Poles', stat((c) => sum(c, (r, k) => (r.quali.find((x) => x.code === k)?.pos === 1 ? 1 : 0)))],
    ['Arrivées dans les points', stat((c) => sum(c, (r, k) => ((res(r, k)?.points || 0) > 0 ? 1 : 0)))],
    ['Abandons', stat((c) => sum(c, (r, k) => (res(r, k) && !/^\d+$/.test(res(r, k).posText) ? 1 : 0)))],
  ];
  const ca = color(A.team, A.teamId);
  return `<div class="sz-h2h-pick"><label class="small">Écurie <select id="szTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === h2hTeam ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
    <section class="sz-box sz-h2h"><div class="sz-h2h-head"><b style="color:${ca}">${esc(A.name)}</b><span class="sz-vs">VS</span><b>${esc(B.name)}</b></div>
      ${rows.map(([label, [a, b]]) => {
        const tot = a + b || 1;
        const better = label === 'Abandons' ? (a < b ? 'a' : b < a ? 'b' : '') : (a > b ? 'a' : b > a ? 'b' : '');
        return `<div class="sz-h2h-row"><div class="sz-h2h-label">${label}</div>
          <div class="sz-h2h-bar"><span class="${better === 'a' ? 'win' : ''}">${a}</span><div class="sz-h2h-track"><i class="a" style="width:${(a / tot) * 50}%;background:${ca}"></i><i class="b" style="width:${(b / tot) * 50}%"></i></div><span class="${better === 'b' ? 'win' : ''}">${b}</span></div></div>`;
      }).join('')}</section>
    <p class="muted small">Duel en course : meilleure place à l'arrivée quand les deux pilotes ont couru (un abandon compte comme une défaite).</p>`;
}

function render() {
  if (!data) return;
  for (const b of document.querySelectorAll('#szNav [data-sz]')) b.classList.toggle('active', b.dataset.sz === section);
  const ctx = { data, stats: stats?.year === data.year || stats?.error ? stats : null, color, bar, official: (id) => OFFICIAL[id] || '8b95a8' };
  const fiaData = fia?.year === data.year ? fia : null;
  const html = {
    home: renderHome, calendar: renderCalendar, standings: renderStandings, results: renderResults, h2h: renderH2H,
    drivers: () => renderDrivers(ctx, drvCode), consistency: () => renderConsistency(ctx), pits: () => renderPits(ctx),
    speeds: () => renderSpeeds(ctx, speedPt), circuits: () => renderCircuits(ctx, circSort),
    tech: () => renderTech(ctx, fiaData), elements: () => renderElements(ctx, fiaData),
  }[section]();
  $('#szContent').innerHTML = `${data.stale ? '<div class="note small">Hors ligne : dernières données enregistrées.</div>' : ''}${html}`;
  tick();
  if (section === 'tech' && fiaData) translateTechDetail(ctx, fiaData);
}

function tick() {
  const el = $('#szCountdown');
  if (!el) return;
  const ms = Math.max(0, Date.parse(el.dataset.t) - Date.now());
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (v) => String(v).padStart(2, '0');
  el.innerHTML = [[d, 'jours'], [h, 'h'], [m, 'min'], [s, 's']].map(([v, l]) => `<span><b>${p(v)}</b><small>${l}</small></span>`).join('');
}

export function openSeason(sec) {
  if (sec) section = sec;
  $('#seasonView').style.top = `${Math.round(document.querySelector('.topbar').getBoundingClientRect().bottom)}px`;
  $('#seasonView').hidden = false;
  $('#seasonBtn').classList.add('on');
  load();
  render();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function closeSeason() {
  $('#seasonView').hidden = true;
  $('#seasonBtn').classList.remove('on');
  clearInterval(timer);
}

export function initSeason() {
  const sel = $('#szYear');
  const now = new Date().getFullYear();
  sel.innerHTML = Array.from({ length: 8 }, (_, i) => now - i).map((y) => `<option value="${y}">${y}</option>`).join('');
  sel.addEventListener('change', () => { year = Number(sel.value); data = null; stats = null; fia = null; clearTimeout(statsTimer); clearTimeout(fiaTimer); setTechFilter(null, 'all'); load(); });
  $('#seasonBtn').addEventListener('click', () => ($('#seasonView').hidden ? openSeason() : closeSeason()));
  $('#szClose').addEventListener('click', closeSeason);
  $('#szNav').addEventListener('click', (e) => { const b = e.target.closest('[data-sz]'); if (b) { section = b.dataset.sz; render(); } });
  $('#szContent').addEventListener('click', (e) => { const b = e.target.closest('[data-szgo]'); if (b) { section = b.dataset.szgo; render(); } });
  $('#szContent').addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'szTeam') h2hTeam = e.target.value;
    else if (id === 'szDriver') drvCode = e.target.value;
    else if (id === 'szSpeedPt') speedPt = e.target.value;
    else if (id === 'szCircSort') circSort = e.target.value;
    else if (id === 'szTechGp') setTechFilter(e.target.value, 'all');
    else if (id === 'szTechTeam') setTechFilter(undefined, e.target.value);
    else if (id === 'szTechOrig') toggleTechOriginal(e.target.checked);
    else return;
    render();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#seasonView').hidden && !document.querySelector('dialog[open]')) closeSeason(); });
}
