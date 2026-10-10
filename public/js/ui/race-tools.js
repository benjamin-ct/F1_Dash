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
  out.sort((a, b) => a.gap - b.gap);
  out.lap = leaderLap;
  return out;
}

// Cercle de position (comme le « Circle of Doom » de MultiViewer) : un tour = un tour de cercle.
// Chaque voiture est placée selon son écart au leader (le leader en haut, les poursuivants dans
// le sens inverse des aiguilles), avec la position de sortie des stands du pilote choisi.
function circleSvg(gaps, me, projected, dl) {
  const lap = gaps.lap || 90;
  const R = 100, C = 130;
  const ang = (gap) => -((gap % lap) / lap) * 2 * Math.PI;
  const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
  const mine = gaps.find((g) => g.num === me);
  // Arc entre la position actuelle et la sortie des stands
  const a0 = ang(mine.gap), a1 = ang(projected);
  const span = ((mine.gap - projected) / lap) * 2 * Math.PI;   // négatif : on recule
  const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
  const arc = `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${Math.abs(span) > Math.PI ? 1 : 0} 0 ${x1.toFixed(1)} ${y1.toFixed(1)}" class="cd-loss"/>`;
  // Étiquettes alternées dedans / dehors pour limiter les chevauchements
  const placed = [];
  const dots = gaps.map((g) => {
    const a = ang(g.gap);
    const [x, y] = pt(a, R);
    const near = placed.filter((p) => Math.abs(Math.atan2(Math.sin(p.a - a), Math.cos(p.a - a))) < 0.2).length;
    placed.push({ a });
    const lr = near % 2 ? R - 24 : R + 22;
    const [lx, ly] = pt(a, lr);
    const col = teamColor(dl[g.num]);
    return `<g class="cd-car${g.num === me ? ' me' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${g.num === me ? 7 : 5.5}" fill="${col}"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${col}">${esc(dl[g.num]?.Tla || g.num)}</text></g>`;
  }).join('');
  const [gx, gy] = pt(a1, R);
  const [glx, gly] = pt(a1, R - 40);
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * 2 * Math.PI; const [ax, ay] = pt(a, R - 6); const [bx, by] = pt(a, R + 6); return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>`; }).join('');
  return `<svg class="cd" viewBox="0 0 260 260" role="img" aria-label="Cercle de position">
    <circle cx="${C}" cy="${C}" r="${R}" class="cd-ring"/><g class="cd-ticks">${ticks}</g>
    ${arc}
    <circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="8" class="cd-ghost"/>
    <text x="${glx.toFixed(1)}" y="${gly.toFixed(1)}" class="cd-ghost-l">sortie ${esc(dl[me]?.Tla || me)}</text>
    ${dots}
    <text x="${C}" y="${C - 18}" class="cd-mid2">▲ leader en haut</text><text x="${C}" y="${C - 2}" class="cd-mid">1 tour</text><text x="${C}" y="${C + 12}" class="cd-mid2">${lap.toFixed(1).replace('.', ',')} s</text>
  </svg>`;
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
  if (!force && performance.now() - (renderPitSim.last || 0) < 1000) return;
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

  // Les commandes sont construites une seule fois : elles ne bougent pas sous la souris
  // pendant que le résultat se met à jour.
  if (!el.querySelector('.pitsim-ctrl')) {
    el.innerHTML = `<div class="pitsim">
      <div class="pitsim-ctrl">
        <label class="small muted">Pilote <select id="simDriver"></select></label>
        <div class="loss-box">
          <div class="small muted">Temps perdu au stand <span id="simLossSrc"></span></div>
          <div class="stepper">
            <button class="btn" data-step="-1" title="−1 s">−1</button>
            <button class="btn" data-step="-0.5" title="−0,5 s">−0,5</button>
            <output id="simLossVal"></output>
            <button class="btn" data-step="0.5" title="+0,5 s">+0,5</button>
            <button class="btn" data-step="1" title="+1 s">+1</button>
            <button class="btn small" id="simLossReset" title="Revenir à la valeur du circuit">Auto</button>
          </div>
          <input id="simLoss" type="range" min="10" max="45" step="0.1" aria-label="Temps perdu au stand">
        </div>
      </div>
      <div id="simOut"></div>
      <p class="small muted">Estimation : écart au leader actuel + temps perdu dans la voie des stands (source : MultiViewer, ajustable). Ne tient pas compte des pneus neufs ni du trafic.</p>
    </div>`;
    $('#simDriver').onchange = (e) => { simDriver = e.target.value; renderPitSim(true); };
    const setLoss = (v) => { lossOverride = Math.round(Math.max(5, Math.min(60, v)) * 10) / 10; renderPitSim(true); };
    $('#simLoss').oninput = (e) => setLoss(parseFloat(e.target.value));
    el.querySelector('.stepper').onclick = (e) => {
      const b = e.target.closest('[data-step]');
      if (b) setLoss((lossOverride ?? defaultLoss().value) + Number(b.dataset.step));
    };
    $('#simLossReset').onclick = () => { lossOverride = null; renderPitSim(true); };
  }
  const sel = $('#simDriver');
  const opts = gaps.map((g) => `<option value="${g.num}">${esc(dl[g.num]?.Tla || g.num)}</option>`).join('');
  if (sel._opts !== opts) { sel.innerHTML = opts; sel._opts = opts; }
  if (document.activeElement !== sel) sel.value = me;
  $('#simLossVal').textContent = `${lossVal.toFixed(1).replace('.', ',')} s`;
  $('#simLossSrc').textContent = `(${lossOverride !== null ? 'réglage manuel' : loss.label})`;
  if (document.activeElement !== $('#simLoss')) $('#simLoss').value = lossVal;
  $('#simLossReset').hidden = lossOverride === null;
  $('#simOut').innerHTML = `<div class="pitsim-cols"><div class="cd-wrap">${circleSvg(gaps, me, projected, dl)}</div><div class="pitsim-res"><div class="pit-result">
      <div class="small muted">Si <b>${esc(dl[me]?.Tla || me)}</b> s'arrête maintenant (actuellement P${curPos}) :</div>
      <div class="big">P${newPos}</div>
      <div class="small">${ahead ? `à <b>${(projected - ahead.gap).toFixed(1).replace('.', ',')} s</b> derrière ${esc(dl[ahead.num]?.Tla || ahead.num)}` : 'en tête'}${behind ? ` · <b>${(behind.gap - projected).toFixed(1).replace('.', ',')} s</b> devant ${esc(dl[behind.num]?.Tla || behind.num)}` : ''}</div>
      ${behind && behind.gap - projected < 1.5 ? '<div class="small" style="color:var(--orange)">⚠ Sortie des stands très serrée : risque de ressortir derrière.</div>' : ''}
    </div>
    <table class="pit-order">${slice.map((o) => `<tr class="${o.me ? 'me' : ''}"><td>P${order.indexOf(o) + 1}</td>
      <td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[o.num])}"></span>${esc(dl[o.num]?.Tla || o.num)}${o.me ? ' (après arrêt)' : ''}</span></td>
      <td style="text-align:right">${o.me ? '' : fmtSigned(o.gap - projected, 1) + ' s'}</td></tr>`).join('')}</table></div></div>`;
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
