// Onglets : télémétrie du pilote suivi, stratégie pneus, météo, championnat (prévision).
import { store, displayNow, versionOf, setFocus } from '../store.js';
import { $, esc, drivers, orderedNumbers, teamColor, stintsOf, compoundInfo, COMPOUNDS } from '../util.js';
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
    el.innerHTML = `<div class="tele"><div class="tele-head"><span class="drv-bar" style="background:${teamColor(d)}"></span>
      <select id="teleSel">${nums.map((n) => `<option value="${n}" ${n === num ? 'selected' : ''}>${esc(dl[n].Tla)} · ${esc(dl[n].FullName || '')}</option>`).join('')}</select>
      <span class="muted small">(clic sur un pilote du classement pour le suivre)</span></div>
      <div class="gauges" id="teleGauges"></div>
      <div class="trace"><div class="chart-title"><span>Vitesse — 30 dernières secondes (km/h)</span></div><div id="teleTrace"></div></div></div>`;
    $('#teleSel').addEventListener('change', (e) => setFocus(e.target.value));
  }
  const clamp = (v) => Math.max(0, Math.min(100, v || 0));
  const g = (lbl, val, unit, bar = '') => `<div class="gauge"><div class="gauge-lbl">${lbl}</div><div class="gauge-val">${val}<small> ${unit}</small></div>${bar}</div>`;
  $('#teleGauges').innerHTML = c ? [
    g('Vitesse', c.speed ?? '—', 'km/h'),
    g('Rapport', c.gear ?? '—', ''),
    g('Régime', c.rpm ?? '—', 'tr/min', `<div class="bar rpm"><i style="width:${Math.min(100, ((c.rpm || 0) / 13000) * 100)}%"></i></div>`),
    g('Accélérateur', c.thr ?? '—', '%', `<div class="bar thr"><i style="width:${clamp(c.thr)}%"></i></div>`),
    g('Frein', c.brk === null ? '—' : c.brk > 0 ? 'OUI' : 'non', '', `<div class="bar brk"><i style="width:${c.brk > 0 ? 100 : 0}%"></i></div>`),
    c.drs !== undefined ? g('DRS', c.drs >= 10 ? 'OUVERT' : 'fermé', '') : g('Pilote', esc(d.Tla || num), ''),
  ].join('') : '<div class="muted">Pas de données pour ce pilote à cet instant.</div>';

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
    return { num, stints, laps: start };
  });
  total = Math.max(total, ...rows.map((r) => r.laps), 1);
  $('#strategy').innerHTML = `<div class="strat">
    <div class="strat-legend">${Object.values(COMPOUNDS).map((c) => `<span><span class="tyre" style="--tc:${c.color}">${c.letter}</span> ${c.name}</span>`).join('')}</div>
    ${rows.map((r) => `<div class="strat-row"><div class="strat-name" style="border-left:3px solid ${teamColor(dl[r.num])};padding-left:5px">${esc(dl[r.num].Tla)}</div>
      <div class="strat-track">${r.stints.map((st) => {
        const ci = compoundInfo(st.Compound);
        return `<div class="strat-stint" title="${esc(ci.name)} · ${st.len} tour(s)${st.New === 'false' || st.New === false ? ' · pneus déjà utilisés' : ''}" style="left:${(st.from / total) * 100}%;width:${Math.max(0.8, (st.len / total) * 100)}%;background:${ci.color}">${st.len >= 3 ? st.len : ''}</div>`;
      }).join('')}</div></div>`).join('')}
    <div class="strat-axis"><span></span><span style="display:flex;justify-content:space-between"><span>Tour 0</span><span>Tour ${total}</span></span></div>
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
  const mv = (cur, pred) => {
    const d = (cur || 0) - (pred || 0);
    return d ? `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : '';
  };
  $('#champ').innerHTML = `<table class="champ"><tr><th>Proj.</th><th>Pilote</th><th>Pts actuels</th><th>Pts projetés</th><th></th></tr>
    ${rows.map((r) => {
      const d = dl[r.RacingNumber] || {};
      return `<tr><td>${r.PredictedPosition ?? '—'}</td><td><span class="drv"><span class="drv-bar" style="background:${teamColor(d)}"></span><b>${esc(d.Tla || r.RacingNumber)}</b></span></td>
        <td>${r.CurrentPoints ?? '—'}</td><td><b>${r.PredictedPoints ?? '—'}</b></td><td>${mv(r.CurrentPosition, r.PredictedPosition)}</td></tr>`;
    }).join('')}</table>
    ${teams.length ? `<table class="champ" style="margin-top:10px"><tr><th>Proj.</th><th>Écurie</th><th>Pts actuels</th><th>Pts projetés</th><th></th></tr>
      ${teams.map((t) => `<tr><td>${t.PredictedPosition ?? '—'}</td><td>${esc(t.TeamName || '')}</td><td>${t.CurrentPoints ?? '—'}</td><td><b>${t.PredictedPoints ?? '—'}</b></td><td>${mv(t.CurrentPosition, t.PredictedPosition)}</td></tr>`).join('')}</table>` : ''}`;
}
