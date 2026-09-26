// Outils de course : simulateur d'arrêt au stand et détection des bagarres.
import { store, setDuel, versionOf } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, fmtSigned } from '../util.js';
import { parseGap, parseLapTime } from '/shared/f1.js';
import { currentTrack } from './map.js';
import { lapGapSeries } from './duel.js';

// Écart au leader en secondes (les retardataires sont convertis avec le dernier tour du leader).
function gapsToLeader(state) {
  const lines = state.TimingData?.Lines || {};
  const nums = orderedNumbers(state).filter((n) => lines[n] && !lines[n].Retired && !lines[n].Stopped);
  const leader = nums[0];
  const leaderLap = parseLapTime(lines[leader]?.LastLapTime?.Value) || parseLapTime(lines[leader]?.BestLapTime?.Value) || 90;
  const out = [];
  for (const n of nums) {
    const g = parseGap(lines[n].GapToLeader);
    let s = null;
    if (n === leader || g?.leader) s = 0;
    else if (g?.laps) s = g.laps * leaderLap;
    else if (g && g.s !== undefined) s = g.s;
    if (s !== null) out.push({ num: n, gap: s, lapped: g?.laps || 0 });
  }
  return out.sort((a, b) => a.gap - b.gap);
}

// ---------------- Simulateur d'arrêt ----------------
let simDriver = null;
let lossOverride = null;
let simKey = '';

function defaultLoss() {
  const pl = currentTrack()?.raw?.pitLoss;
  const ts = String(store.state.TrackStatus?.Status || '1');
  if (!pl) return { value: 22, label: 'valeur par défaut' };
  if (ts === '4' && pl.sc) return { value: Number(pl.sc), label: 'sous voiture de sécurité' };
  if ((ts === '6' || ts === '7') && pl.vsc) return { value: Number(pl.vsc), label: 'sous VSC' };
  return { value: Number(pl.normal) || 22, label: 'en conditions normales' };
}

export function renderPitSim(force = false) {
  const el = $('#pitsim');
  if (!el.classList.contains('active') && !force) return;
  const key = `${versionOf(['TimingData', 'TrackStatus', 'DriverList', '__reset'])}|${simDriver}|${lossOverride}|${store.focus}`;
  if (key === simKey && !force) return;
  // Pas de reconstruction pendant la saisie, et au plus une fois par seconde.
  if (!force && (el.contains(document.activeElement) || performance.now() - (renderPitSim.last || 0) < 1000)) return;
  renderPitSim.last = performance.now();
  simKey = key;
  const s = store.state;
  const dl = drivers(s);
  if (sessionKind(s) !== 'race') {
    el.innerHTML = '<div class="note">Le simulateur d\'arrêt au stand est disponible pendant les courses (et sprints).</div>';
    return;
  }
  const gaps = gapsToLeader(s);
  if (!gaps.length) { el.innerHTML = '<div class="note">En attente des écarts…</div>'; return; }
  const me = simDriver && gaps.find((g) => g.num === simDriver) ? simDriver : (store.focus && gaps.find((g) => g.num === store.focus) ? store.focus : store.duel.a && gaps.find((g) => g.num === store.duel.a) ? store.duel.a : gaps[0].num);
  const loss = defaultLoss();
  const lossVal = lossOverride ?? loss.value;
  const mine = gaps.find((g) => g.num === me);
  const projected = mine.gap + lossVal;
  const others = gaps.filter((g) => g.num !== me);
  const ahead = [...others].reverse().find((g) => g.gap <= projected);
  const behind = others.find((g) => g.gap > projected);
  const newPos = others.filter((g) => g.gap <= projected).length + 1;
  const curPos = gaps.findIndex((g) => g.num === me) + 1;
  const order = [...others, { num: me, gap: projected, me: true }].sort((a, b) => a.gap - b.gap);
  const idx = order.findIndex((o) => o.me);
  const slice = order.slice(Math.max(0, idx - 3), idx + 4);

  el.innerHTML = `<div class="pitsim">
    <div class="row">
      <select id="simDriver">${gaps.map((g) => `<option value="${g.num}" ${g.num === me ? 'selected' : ''}>${esc(dl[g.num]?.Tla || g.num)}</option>`).join('')}</select>
      <span class="small">Temps perdu au stand</span>
      <input id="simLoss" type="number" step="0.5" min="5" max="60" value="${lossVal.toFixed(1)}"> <span class="small muted">s (${lossOverride !== null ? 'manuel' : esc(loss.label)})</span>
      ${lossOverride !== null ? '<button class="btn small" id="simLossReset">Auto</button>' : ''}
    </div>
    <div class="pit-result">
      <div class="small muted">Si <b>${esc(dl[me]?.Tla || me)}</b> s'arrête maintenant (actuellement P${curPos}) :</div>
      <div class="big">P${newPos}</div>
      <div class="small">${ahead ? `à <b>${(projected - ahead.gap).toFixed(1).replace('.', ',')} s</b> derrière ${esc(dl[ahead.num]?.Tla || ahead.num)}` : 'en tête'}${behind ? ` · <b>${(behind.gap - projected).toFixed(1).replace('.', ',')} s</b> devant ${esc(dl[behind.num]?.Tla || behind.num)}` : ''}</div>
      ${behind && behind.gap - projected < 1.5 ? '<div class="small" style="color:var(--orange)">⚠ Sortie des stands très serrée : risque de ressortir derrière.</div>' : ''}
    </div>
    <table class="pit-order">${slice.map((o) => `<tr class="${o.me ? 'me' : ''}"><td>P${order.indexOf(o) + 1}</td>
      <td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[o.num])}"></span>${esc(dl[o.num]?.Tla || o.num)}${o.me ? ' (après arrêt)' : ''}</span></td>
      <td style="text-align:right">${o.me ? '' : fmtSigned(o.gap - projected, 1) + ' s'}</td></tr>`).join('')}</table>
    <p class="small muted">Estimation : écart au leader actuel + temps perdu dans la voie des stands (source : MultiViewer, ajustable). Ne tient pas compte des pneus neufs ni du trafic.</p>
  </div>`;
  $('#simDriver').onchange = (e) => { simDriver = e.target.value; renderPitSim(true); };
  $('#simLoss').onchange = (e) => { const v = parseFloat(e.target.value); lossOverride = Number.isFinite(v) ? v : null; renderPitSim(true); };
  const r = $('#simLossReset');
  if (r) r.onclick = () => { lossOverride = null; renderPitSim(true); };
}

// ---------------- Bagarres ----------------
let battleKey = '';

export function renderBattles(force = false) {
  const el = $('#battles');
  if (!el.classList.contains('active') && !force) return;
  const key = versionOf(['TimingData', 'DriverList', '__reset']);
  if (key === battleKey && !force) return;
  battleKey = key;
  const s = store.state;
  if (sessionKind(s) !== 'race') {
    el.innerHTML = '<div class="note">Les bagarres sont détectées pendant les courses : pilotes à moins de 1,5 s l\'un de l\'autre.</div>';
    return;
  }
  el.innerHTML = battleList(s) || '<div class="note">Aucune bagarre en cours (aucun écart sous 1,5 s).</div>';
}

export function battleList(s, max = 20) {
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const nums = orderedNumbers(s).filter((n) => lines[n] && !lines[n].Retired && !lines[n].Stopped && !lines[n].InPit);
  const out = [];
  for (let i = 1; i < nums.length; i++) {
    const back = nums[i], front = nums[i - 1];
    const iv = parseGap(lines[back].IntervalToPositionAhead?.Value);
    if (!iv || iv.laps || iv.leader || iv.s === undefined || iv.s > 1.5) continue;
    const series = lapGapSeries(front, back).filter((p) => !p.pit).slice(-4);
    let trend = '';
    if (series.length >= 2) {
      const rate = (series.at(-1).y - series[0].y) / (series.at(-1).x - series[0].x || 1);
      if (Math.abs(rate) >= 0.05) trend = rate < 0 ? `se rapproche (${fmtSigned(rate, 2)} s/tour)` : `s'éloigne (${fmtSigned(rate, 2)} s/tour)`;
      else trend = 'écart stable';
    }
    out.push({ front, back, gap: iv.s, trend, pos: lines[back].Position });
  }
  out.sort((a, b) => a.gap - b.gap);
  return out.slice(0, max).map((b) => `<div class="battle ${b.gap < 1 ? 'hot' : ''}">
    <div><div class="battle-pair"><span class="drv-bar" style="background:${teamColor(dl[b.front])}"></span>${esc(dl[b.front]?.Tla || b.front)}
      <span class="muted">vs</span><span class="drv-bar" style="background:${teamColor(dl[b.back])}"></span>${esc(dl[b.back]?.Tla || b.back)}
      <span class="muted small">P${Number(b.pos) - 1}–P${b.pos}</span></div>
      <div class="battle-sub">${b.gap < 1 ? 'Dans la seconde · ' : ''}${esc(b.trend)}</div></div>
    <div style="display:flex;align-items:center;gap:10px"><span class="battle-gap">${b.gap.toFixed(3).replace('.', ',')}</span>
      <button class="btn small" data-battle="${b.front},${b.back}">Duel</button></div></div>`).join('');
}

export function initRaceTools() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-battle]');
    if (!b) return;
    const [front, back] = b.dataset.battle.split(',');
    setDuel('a', front);
    setDuel('b', back);
  });
}
