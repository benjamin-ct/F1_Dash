// Onglets : télémétrie du pilote suivi, stratégie pneus, météo, championnat (prévision).
import { store, displayNow, versionOf, setFocus } from '../store.js';
import { $, esc, drivers, orderedNumbers, teamColor, teamMark, stintsOf, compoundInfo, COMPOUNDS, fmtLap, fmtSigned, lapSeconds } from '../util.js';
import { lineChart } from './charts.js';

let lastTele = 0;
let stratVer = -1, wxVer = -1, champVer = -1;

function focusDriver() {
  const dl = drivers(store.state);
  if (store.focus && dl[store.focus]) return store.focus;
  if (store.duel.a && dl[store.duel.a]) return store.duel.a;
  return orderedNumbers(store.state)[0] || null;
}

export function renderTelemetry() {
  const now = performance.now();
  if (now - lastTele < 150) return;
  lastTele = now;
  const el = $('#telemetry');
  if (!el.classList.contains('active')) return;
  const dl = drivers(store.state);
  const num = focusDriver();
  if (!store.positions.car.size) {
    el.innerHTML = `<div class="note">Pas de télémétrie disponible.<br><br>En <b>live</b>, la F1 réserve la télémétrie (vitesse, régime, rapport, accélérateur, frein) aux abonnés F1 TV : ajoutez votre jeton dans ⚙ Réglages.<br>En <b>replay</b>, elle est incluse.</div>`;
    el._num = null;
    return;
  }
  if (!num) return;
  const disp = displayNow();
  const c = store.positions.carAt(num, disp);
  const d = dl[num] || {};
  if (el._num !== num) {
    el._num = num;
    const nums = orderedNumbers(store.state).filter((n) => dl[n]);
    el.innerHTML = `<div class="tele"><div class="tele-head">${d.HeadshotUrl ? `<img class="tele-photo" src="${esc(d.HeadshotUrl)}" alt="" onerror="this.remove()">` : ''}<span class="drv-bar" style="background:${teamColor(d)}"></span>
      <select id="teleSel">${nums.map((n) => `<option value="${n}" ${n === num ? 'selected' : ''}>${esc(dl[n].Tla)} · ${esc(dl[n].FullName || '')}</option>`).join('')}</select>
      <span class="muted small">(clic sur un pilote du classement pour le suivre)</span></div>
      <div class="gauges" id="teleGauges"></div>
      <div class="trace"><div class="chart-title"><span>Vitesse — 30 dernières secondes (km/h)</span></div><div id="teleTrace"></div></div></div>`;
    $('#teleSel').addEventListener('change', (e) => setFocus(e.target.value));
  }
  const clamp = (v) => Math.max(0, Math.min(100, v || 0));
  const g = (lbl, val, unit, bar = '') => `<div class="gauge"><div class="gauge-lbl">${lbl}</div><div class="gauge-val">${val}<small> ${unit}</small></div>${bar}</div>`;
  const gaugesHtml = c ? [
    g('Vitesse', c.speed ?? '—', 'km/h'),
    g('Rapport', c.gear ?? '—', ''),
    g('Régime', c.rpm ?? '—', 'tr/min', `<div class="bar rpm"><i style="width:${Math.min(100, ((c.rpm || 0) / 13000) * 100)}%"></i></div>`),
    g('Accélérateur', c.thr ?? '—', '%', `<div class="bar thr"><i style="width:${clamp(c.thr)}%"></i></div>`),
    g('Frein', c.brk === null ? '—' : c.brk > 0 ? 'OUI' : 'non', '', `<div class="bar brk"><i style="width:${c.brk > 0 ? 100 : 0}%"></i></div>`),
    c.drs !== undefined ? g('DRS', c.drs >= 10 ? 'OUVERT' : 'fermé', '') : g('Pilote', esc(d.Tla || num), ''),
  ].join('') : '<div class="muted">Pas de données pour ce pilote à cet instant.</div>';
  const gEl = $('#teleGauges');
  if (gEl._html !== gaugesHtml) { gEl.innerHTML = gaugesHtml; gEl._html = gaugesHtml; }

  if (now - (renderTelemetry.lastTrace || 0) > 500) {
    renderTelemetry.lastTrace = now;
    const hist = store.positions.carHistory(num, disp - 30000, disp);
    lineChart($('#teleTrace'), hist.map((h) => ({ x: (h.t - disp) / 1000, y: h.speed || 0 })), {
      height: 120, color: teamColor(d), zero: false, yFmt: (v) => String(Math.round(v)), xFmt: (v) => `${Math.round(v)} s`,
      tipFmt: (p) => `${Math.round(p.y)} km/h (${Math.round(-p.x)} s avant)`, yMinSpan: 50,
    });
  }
}

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
