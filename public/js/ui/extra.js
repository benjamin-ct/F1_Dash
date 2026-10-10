// Onglets : télémétrie du pilote suivi, stratégie pneus, météo, championnat (prévision).
import { store, displayNow, versionOf, setFocus } from '../store.js';
import { $, esc, drivers, orderedNumbers, teamColor, teamMark, stintsOf, compoundInfo, COMPOUNDS, fmtLap, fmtSigned, lapSeconds } from '../util.js';

let lastTele = 0;
let stratVer = -1, wxVer = -1, champVer = -1;

function focusDriver() {
  const dl = drivers(store.state);
  if (store.focus && dl[store.focus]) return store.focus;
  if (store.duel.a && dl[store.duel.a]) return store.duel.a;
  return orderedNumbers(store.state)[0] || null;
}

// Pilote B de la télémétrie (comparaison) : choisi dans l'onglet, sinon pilote B du duel
let teleB = null;
let teleBOff = false;

// Compteur : vitesse sur l'anneau extérieur (0 à 360 km/h), accélérateur (gauche) et frein
// (droite) sur les arcs intérieurs, régime et rapport au centre
const SPEED_MAX = 360;
function arc(cx, cy, r, a0, a1) {
  const pt = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function dial(c, color, uid) {
  const cx = 130, cy = 128, R = 98, r = 64;
  const sp = Math.max(0, Math.min(SPEED_MAX, c?.speed || 0));
  const thr = Math.max(0, Math.min(100, c?.thr || 0));
  const brk = c?.brk > 0 ? 100 : 0;
  const aS = -135 + (270 * sp) / SPEED_MAX;
  let ticks = '';
  for (let v = 0; v <= SPEED_MAX; v += 60) {
    const a = ((-135 + (270 * v) / SPEED_MAX) * Math.PI) / 180;
    const tx = cx + (R + 19) * Math.sin(a), ty = cy - (R + 19) * Math.cos(a);
    ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" class="dl-tick">${v || ''}</text>`;
  }
  // Arcs intérieurs : accélérateur de -130° à -20° (rempli depuis le bas), frein en miroir
  const thrEnd = -130 + (110 * thr) / 100;
  // Libellés au milieu de l'espace entre l'anneau de vitesse et les arcs intérieurs
  const mid = (R - 6 + r + 4) / 2 - 3;
  return `<svg viewBox="0 0 260 248" class="dial">
    <defs><path id="thr${uid}" d="${arc(cx, cy, mid, -122, -28)}"/><path id="brk${uid}" d="${arc(cx, cy, mid, 28, 122)}"/></defs>
    <path d="${arc(cx, cy, R, -135, 135)}" class="dl-track"/>
    ${sp > 0 ? `<path d="${arc(cx, cy, R, -135, aS)}" class="dl-speed" style="stroke:${color}"/>` : ''}
    ${ticks}
    <path d="${arc(cx, cy, r, -130, -20)}" class="dl-in"/>
    ${thr > 0 ? `<path d="${arc(cx, cy, r, -130, thrEnd)}" class="dl-thr"/>` : ''}
    <path d="${arc(cx, cy, r, 130, 20)}" class="dl-in"/>
    ${brk ? `<path d="${arc(cx, cy, r, 130, 20)}" class="dl-brk"/>` : ''}
    <text class="dl-arc-lbl"><textPath href="#thr${uid}" startOffset="50%">ACCÉLÉRATEUR</textPath></text>
    <text class="dl-arc-lbl"><textPath href="#brk${uid}" startOffset="50%">FREIN</textPath></text>
    <text x="${cx}" y="${cy - 6}" class="dl-speed-val">${c?.speed ?? '—'}</text>
    <text x="${cx}" y="${cy + 10}" class="dl-unit">KM/H</text>
    <text x="${cx}" y="${cy + 33}" class="dl-rpm">${c?.rpm ?? '—'}</text>
    <text x="${cx}" y="${cy + 46}" class="dl-unit">TR/MIN</text>
    <text x="${cx}" y="${cy + 108}" class="dl-gear"><tspan class="dl-unit">RAPPORT </tspan>${c?.gear === 0 ? 'N' : c?.gear ?? '—'}</text>
  </svg>`;
}

// Vitesse des 30 dernières secondes, un trait par pilote
function speedTrace(series, width = 600) {
  const W = Math.max(300, Math.round(width)), H = 110, pl = 30, pr = 6, pt = 6, pb = 16;
  const all = series.flatMap((s) => s.pts.map((p) => p.y));
  if (!all.length) return '<div class="muted small">Pas encore de trace.</div>';
  const lo = Math.max(0, Math.min(...all) - 10), hi = Math.max(lo + 50, Math.max(...all) + 10);
  const X = (x) => pl + ((x + 30) / 30) * (W - pl - pr);
  const Y = (y) => pt + (1 - (y - lo) / (hi - lo)) * (H - pt - pb);
  let grid = '';
  for (const v of [lo, (lo + hi) / 2, hi]) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 4}" y="${Y(v) + 3}" class="sz-ax" text-anchor="end">${Math.round(v)}</text>`;
  for (const x of [-30, -20, -10, 0]) grid += `<text x="${X(x)}" y="${H - 3}" class="sz-ax" text-anchor="middle">${x ? `${x} s` : 'maint.'}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="sz-svg tele-trace">${grid}${series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} points="${s.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`).join('')}</svg>`;
}

export function renderTelemetry() {
  const now = performance.now();
  if (now - lastTele < 120) return;
  lastTele = now;
  const el = $('#telemetry');
  if (!el.classList.contains('active')) return;
  const dl = drivers(store.state);
  const num = focusDriver();
  if (!store.positions.car.size) {
    el.innerHTML = `<div class="note">Pas de télémétrie disponible.<br><br>En <b>live</b>, la F1 réserve la télémétrie (vitesse, régime, rapport, accélérateur, frein) aux abonnés F1 TV : ajoutez votre jeton dans ⚙ Réglages.<br>En <b>replay</b>, elle est incluse.</div>`;
    el._k = null;
    return;
  }
  if (!num) return;
  // Pilote B : choisi ici, sinon pilote B (ou A) du duel s'il est différent du pilote suivi
  let numB = teleBOff ? null : teleB && dl[teleB] && teleB !== num ? teleB
    : [store.duel.b, store.duel.a].find((n) => n && n !== num && dl[n]) || null;
  const disp = displayNow();
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  const key = `${num}|${numB}|${nums.length}`;
  if (el._k !== key) {
    el._k = key;
    const pick = (id, cur, none) => `<select id="${id}" class="tele-pick">${none ? '<option value="">+ Comparer…</option>' : ''}${nums.map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${esc(dl[n].Tla)}</option>`).join('')}</select>`;
    const head = (n, id) => {
      const d = dl[n] || {};
      return `<div class="tele-name" style="--tc:${teamColor(d)}">${teamMark(d)}<b>${esc(d.Tla || n)}</b><span class="muted small">${esc(d.LastName || '')}</span></div>`;
    };
    el.innerHTML = `<div class="tele2">
      <div class="tele2-bar"><span class="tele-chip" style="--tc:${teamColor(dl[num] || {})}">${pick('teleSel', num)}</span>
        <span class="tele-vs">vs</span>
        <span class="tele-chip" style="--tc:${numB ? teamColorOf(dl[numB]) : 'var(--border)'}">${pick('teleSelB', numB, true)}${numB ? '<button class="tele-x" id="teleClearB" title="Un seul pilote">✕</button>' : ''}</span>
        <span class="muted small tele-hint">clic sur un pilote du classement = pilote suivi</span></div>
      <div class="tele2-dials ${numB ? 'two' : 'one'}">
        <div class="tele2-col">${head(num)}<div id="teleDialA"></div></div>
        ${numB ? `<div class="tele2-vs">VS</div><div class="tele2-col">${head(numB)}<div id="teleDialB"></div></div>` : ''}
      </div>
      <div class="trace"><div class="chart-title"><span>Vitesse — 30 dernières secondes (km/h)</span></div><div id="teleTrace"></div></div></div>`;
    $('#teleSel').addEventListener('change', (e) => setFocus(e.target.value));
    $('#teleSelB').addEventListener('change', (e) => { teleB = e.target.value || null; teleBOff = !teleB; el._k = null; renderTelemetry.lastTrace = 0; lastTele = 0; renderTelemetry(); });
    $('#teleClearB')?.addEventListener('click', () => { teleB = null; teleBOff = true; el._k = null; lastTele = 0; renderTelemetry(); });
  }
  const cA = store.positions.carAt(num, disp);
  const colA = teamColor(dl[num] || {});
  const hA = dial(cA, colA, 'a');
  if ($('#teleDialA')._h !== hA) { $('#teleDialA').innerHTML = hA; $('#teleDialA')._h = hA; }
  let colB = null;
  if (numB) {
    const cB = store.positions.carAt(numB, disp);
    colB = teamColor(dl[numB] || {});
    const hB = dial(cB, colB, 'b');
    if ($('#teleDialB')._h !== hB) { $('#teleDialB').innerHTML = hB; $('#teleDialB')._h = hB; }
  }
  if (now - (renderTelemetry.lastTrace || 0) > 500) {
    renderTelemetry.lastTrace = now;
    const series = [num, numB].filter(Boolean).map((n, i) => ({
      color: i ? colB : colA,
      dash: i && dl[n]?.TeamName === dl[num]?.TeamName,
      pts: store.positions.carHistory(n, disp - 30000, disp).map((h) => ({ x: (h.t - disp) / 1000, y: h.speed || 0 })),
    }));
    $('#teleTrace').innerHTML = speedTrace(series, $('#teleTrace').clientWidth);
  }
}
const teamColorOf = (d) => teamColor(d || {});

export function renderStrategy() {
  const v = versionOf(['TimingAppData', 'LapCount', 'DriverList', 'TimingData', '__reset']);
  if (v === stratVer) return;
  if (!$('#strategy').classList.contains('active') || performance.now() - (renderStrategy.last || 0) < 1000) return;
  renderStrategy.last = performance.now();
  stratVer = v;
  const s = store.state;
  const dl = drivers(s);
  const app = s.TimingAppData?.Lines || {};
  const nums = orderedNumbers(s).filter((n) => dl[n]);
  let total = Number(s.LapCount?.TotalLaps) || 0;
  const rows = nums.map((num) => {
    let start = 0;
    const stints = stintsOf(app[num]).map((st) => {
      const len = Math.max(0, (Number(st.TotalLaps) || 0) - (Number(st.StartLaps) || 0));
      const out = { ...st, from: start, len };
      start += len;
      return out;
    });
    return { num, stints, laps: start, pace: stintPace(num) };
  });
  total = Math.max(total, ...rows.map((r) => r.laps), 1);
  $('#strategy').innerHTML = `<div class="strat">
    <div class="strat-legend">${Object.values(COMPOUNDS).map((c) => `<span><span class="tyre" style="--tc:${c.color}">${c.letter}</span> ${c.name}</span>`).join('')}</div>
    <div class="strat-row strat-headrow"><span></span><span></span><span class="small muted" title="Moyenne des 5 derniers tours propres du relais en cours">Rythme</span><span class="small muted" title="Évolution du temps au tour sur le relais en cours (régression linéaire, hors tours perturbés)">Usure</span></div>
    ${rows.map((r) => `<div class="strat-row"><div class="strat-name" style="border-left:3px solid ${teamColor(dl[r.num])};padding-left:5px">${esc(dl[r.num].Tla)}</div>
      <div class="strat-track">${r.stints.map((st) => {
        const ci = compoundInfo(st.Compound);
        return `<div class="strat-stint" title="${esc(ci.name)} · ${st.len} tour(s)${st.New === 'false' || st.New === false ? ' · pneus déjà utilisés' : ''}" style="left:${(st.from / total) * 100}%;width:${Math.max(0.8, (st.len / total) * 100)}%;background:${ci.color}">${st.len >= 3 ? st.len : ''}</div>`;
      }).join('')}</div>
      <span class="strat-pace">${r.pace ? fmtLap(r.pace.avg) : '<span class="dim">—</span>'}</span>
      <span class="strat-deg ${r.pace?.deg > 0.08 ? 'down' : r.pace?.deg < -0.02 ? 'up' : ''}">${r.pace && r.pace.n >= 4 ? `${fmtSigned(r.pace.deg, 2)} s/t` : '<span class="dim">—</span>'}</span></div>`).join('')}
    <div class="strat-axis"><span></span><span style="display:flex;justify-content:space-between"><span>Tour 0</span><span>Tour ${total}</span></span></div>
    <p class="small muted">Usure : variation moyenne du temps au tour sur le relais en cours (positive = le pilote ralentit, les pneus se dégradent). Le carburant qui s'allège fait gagner ~0,05 s/tour, à garder en tête.</p>
  </div>`;
}

export function renderWeather() {
  const v = versionOf(['WeatherData', '__reset']);
  if (v === wxVer) return;
  wxVer = v;
  const w = store.state.WeatherData;
  if (!w) { $('#weather').innerHTML = '<div class="note">Pas de données météo.</div>'; return; }
  const g = (lbl, val, unit) => `<div class="gauge"><div class="gauge-lbl">${lbl}</div><div class="gauge-val">${val}<small> ${unit}</small></div></div>`;
  const wind = Number(w.WindSpeed);
  const dir = Number(w.WindDirection) || 0;
  $('#weather').innerHTML = `<div class="wx">
    ${g('Air', esc(w.AirTemp), '°C')}${g('Piste', esc(w.TrackTemp), '°C')}${g('Humidité', esc(w.Humidity), '%')}
    ${g('Pression', esc(w.Pressure), 'hPa')}
    ${g('Vent', Number.isFinite(wind) ? (wind * 3.6).toFixed(0) : '—', `km/h <span class="wind-arrow" style="transform:rotate(${dir + 180}deg)" title="Direction ${dir}°">↑</span>`)}
    ${g('Pluie', w.Rainfall === '1' || w.Rainfall === 1 ? '🌧 Oui' : 'Non', '')}
  </div><p class="note">Direction du vent : ${dir}° (d'où il vient). Données de la station météo du circuit.</p>`;
}

export function renderChampionship() {
  const v = versionOf(['ChampionshipPrediction', 'DriverList', '__reset']);
  if (v === champVer) return;
  champVer = v;
  const cp = store.state.ChampionshipPrediction;
  const dl = drivers(store.state);
  if (!cp?.Drivers) {
    $('#champ').innerHTML = '<div class="note">La projection du championnat est publiée par la F1 pendant les courses (et sprints).</div>';
    return;
  }
  const rows = Object.values(cp.Drivers).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
  const teams = Object.values(cp.Teams || {}).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
  // Points marqués sur la course en cours (projetés - actuels)
  const gain = (cur, pred) => {
    const d = (Number(pred) || 0) - (Number(cur) || 0);
    return d > 0 ? `<span class="pts-gain">+${d}</span>` : '<span class="dim">—</span>';
  };
  const mv = (cur, pred) => {
    const d = (cur || 0) - (pred || 0);
    return d ? `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : '';
  };
  $('#champ').innerHTML = `<table class="champ"><tr><th>Proj.</th><th>Pilote</th><th>Pts actuels</th><th>Gagnés</th><th>Pts projetés</th><th></th></tr>
    ${rows.map((r) => {
      const d = dl[r.RacingNumber] || {};
      return `<tr><td>${r.PredictedPosition ?? '—'}</td><td><span class="drv">${teamMark(d)}<b>${esc(d.Tla || r.RacingNumber)}</b></span></td>
        <td>${r.CurrentPoints ?? '—'}</td><td>${gain(r.CurrentPoints, r.PredictedPoints)}</td><td><b>${r.PredictedPoints ?? '—'}</b></td><td>${mv(r.CurrentPosition, r.PredictedPosition)}</td></tr>`;
    }).join('')}</table>
    ${teams.length ? `<table class="champ" style="margin-top:10px"><tr><th>Proj.</th><th>Écurie</th><th>Pts actuels</th><th>Gagnés</th><th>Pts projetés</th><th></th></tr>
      ${teams.map((t) => `<tr><td>${t.PredictedPosition ?? '—'}</td><td><span class="drv">${teamMark(Object.values(dl).find((d) => d.TeamName === t.TeamName) || { TeamName: t.TeamName })}${esc(t.TeamName || '')}</span></td><td>${t.CurrentPoints ?? '—'}</td><td>${gain(t.CurrentPoints, t.PredictedPoints)}</td><td><b>${t.PredictedPoints ?? '—'}</b></td><td>${mv(t.CurrentPosition, t.PredictedPosition)}</td></tr>`).join('')}</table>` : ''}`;
}

// Rythme et dégradation sur le relais en cours (tours "propres" uniquement).
function stintPace(num) {
  const laps = store.derived.laps[num] || [];
  let start = 0;
  for (let i = laps.length - 1; i >= 0; i--) if (laps[i].pit) { start = i + 1; break; }
  const pts = laps.slice(start).filter((e) => e.lap > 1 && !e.pit).map((e) => ({ x: e.lap, y: lapSeconds(e.time) })).filter((p) => p.y);
  if (!pts.length) return null;
  const med = pts.map((p) => p.y).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  const clean = pts.filter((p) => p.y < med * 1.04);
  if (!clean.length) return null;
  const last5 = clean.slice(-5);
  const avg = last5.reduce((a, p) => a + p.y, 0) / last5.length;
  let deg = 0;
  if (clean.length >= 2) {
    const mx = clean.reduce((a, p) => a + p.x, 0) / clean.length;
    const my = clean.reduce((a, p) => a + p.y, 0) / clean.length;
    const num2 = clean.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const den = clean.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    deg = den ? num2 / den : 0;
  }
  return { avg, deg, n: clean.length };
}
