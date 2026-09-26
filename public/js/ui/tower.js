// Tableau de classement (course / qualifications / essais).
import { store, setDuel, setFocus, versionOf, displayNow, f1Now } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, tyreBadge, currentStint } from '../util.js';
import { segmentClass, parseUtc } from '/shared/f1.js';

let lastKey = '';
let lastRender = 0;

function timingClass(obj) {
  if (!obj) return '';
  if (obj.OverallFastest) return 'purple';
  if (obj.PersonalFastest) return 'green';
  return '';
}

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function sectorCell(sec) {
  const segs = list(sec?.Segments);
  const val = sec?.Value || '';
  return `<td class="sector"><div class="sector-val ${timingClass(sec)}">${esc(val) || '<span class="dim">—</span>'}</div>` +
    (segs.length ? `<div class="segs">${segs.map((s) => `<i class="seg ${segmentClass(s?.Status)}"></i>`).join('')}</div>` : '') + '</td>';
}

function blueFlagged(state) {
  const out = new Set();
  const now = f1Now();
  for (const m of list(state.RaceControlMessages?.Messages)) {
    if (m?.Flag === 'BLUE' && m.RacingNumber) {
      const t = parseUtc(m.Utc);
      if (now - t < 20000 && now >= t) out.add(String(m.RacingNumber));
    }
  }
  return out;
}

function gapText(v) {
  if (v === undefined || v === null || v === '') return '<span class="dim">—</span>';
  if (/^LAP/i.test(v)) return '<span class="dim">Leader</span>';
  return esc(v);
}

export function renderTower(force = false) {
  const now = performance.now();
  const key = `${versionOf(['TimingData', 'TimingAppData', 'DriverList', 'TimingStats', 'RaceControlMessages', '__reset'])}|${store.duel.a}|${store.duel.b}|${store.focus}`;
  const carTick = store.positions.car.size ? Math.floor(now / 500) : 0;
  if (!force && key + carTick === lastKey) return;
  if (!force && now - lastRender < 250) return;
  lastKey = key + carTick;
  lastRender = now;

  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const stats = s.TimingStats?.Lines || {};
  const nums = orderedNumbers(s);
  const blue = blueFlagged(s);
  const dispNow = displayNow();
  const showDrs = (Number(s.SessionInfo?.StartDate?.slice(0, 4)) || 2026) < 2026;

  const part = Number(s.TimingData?.SessionPart) || 1;
  const noEntries = list(s.TimingData?.NoEntries);
  const cutoff = kind === 'quali' && part < 3 ? Number(noEntries[part]) || null : null;

  let head;
  if (kind === 'race') {
    head = '<th>Pos</th><th>Pilote</th><th class="t-gap">Écart</th><th class="t-int">Interv.</th><th class="t-lap">Dernier</th><th class="t-lap">Meilleur</th><th>S1</th><th>S2</th><th>S3</th><th>Pneu</th><th title="Arrêts aux stands">Arr.</th><th title="Vitesse au speed trap">V.max</th><th>Duel</th>';
  } else if (kind === 'quali') {
    head = '<th>Pos</th><th>Pilote</th><th class="t-lap">Meilleur</th><th class="t-gap">Écart</th><th class="t-int">Interv.</th><th class="t-lap">Dernier</th><th>S1</th><th>S2</th><th>S3</th><th class="t-lap">Q1</th><th class="t-lap">Q2</th><th class="t-lap">Q3</th><th>Pneu</th><th>Duel</th>';
  } else {
    head = '<th>Pos</th><th>Pilote</th><th class="t-lap">Meilleur</th><th class="t-gap">Écart</th><th class="t-int">Interv.</th><th class="t-lap">Dernier</th><th>S1</th><th>S2</th><th>S3</th><th>Pneu</th><th title="Tours">Tours</th><th>Duel</th>';
  }

  const rows = nums.map((num) => {
    const d = dl[num] || {};
    const l = lines[num] || {};
    const a = app[num] || {};
    const pos = l.Position || d.Line || '';
    const stint = currentStint(a);
    const tags = [];
    if (l.Retired) tags.push('<span class="tag ret">ABD</span>');
    else if (l.Stopped) tags.push('<span class="tag stop">ARRÊT</span>');
    else if (l.InPit) tags.push('<span class="tag pit">STAND</span>');
    else if (l.PitOut) tags.push('<span class="tag out">SORTIE</span>');
    if (blue.has(num)) tags.push('<span class="tag flag-blue" title="Drapeau bleu">BLEU</span>');
    if (showDrs) {
      const car = store.positions.carAt(num, dispNow);
      if (car && car.drs >= 10) tags.push('<span class="tag drs">DRS</span>');
    }

    let posDelta = '';
    if (kind === 'race' && a.GridPos && pos) {
      const dlt = Number(a.GridPos) - Number(pos);
      if (dlt) posDelta = `<span class="pos-delta ${dlt > 0 ? 'up' : 'down'}">${dlt > 0 ? '▲' : '▼'}${Math.abs(dlt)}</span>`;
    }

    const drv = `<td><div class="drv"><span class="drv-bar" style="background:${teamColor(d)}"></span><span class="drv-num">${esc(d.RacingNumber || num)}</span><span class="drv-tla" title="${esc(d.FullName || '')} — ${esc(d.TeamName || '')}">${esc(d.Tla || num)}</span><span class="drv-tags">${tags.join('')}</span></div></td>`;
    const sectors = list(l.Sectors);
    const secCells = [0, 1, 2].map((i) => sectorCell(sectors[i])).join('');
    const tyre = `<td>${stint ? tyreBadge(stint.Compound, stint.TotalLaps, stint.New) : '<span class="dim">—</span>'}</td>`;
    const duel = `<td><div class="duel-btns"><button class="ab a ${store.duel.a === num ? 'on' : ''}" data-duel="a" data-num="${num}" title="Pilote A du duel">A</button><button class="ab b ${store.duel.b === num ? 'on' : ''}" data-duel="b" data-num="${num}" title="Pilote B du duel">B</button></div></td>`;
    const last = `<td class="t-lap ${timingClass(l.LastLapTime)}">${esc(l.LastLapTime?.Value || '') || '<span class="dim">—</span>'}</td>`;

    let cells;
    if (kind === 'race') {
      const int = l.IntervalToPositionAhead || {};
      const best = l.BestLapTime?.Value || '';
      const bestPurple = stats[num]?.PersonalBestLapTime?.Position === 1;
      const st = l.Speeds?.ST;
      cells = `<td class="pos">${esc(pos)}${posDelta}</td>${drv}
        <td class="t-gap">${gapText(l.GapToLeader)}</td>
        <td class="t-int ${int.Catching ? 'catching' : ''}">${gapText(int.Value)}</td>
        ${last}<td class="t-lap ${bestPurple ? 'purple' : ''}">${esc(best) || '<span class="dim">—</span>'}</td>
        ${secCells}${tyre}<td>${esc(l.NumberOfPitStops ?? 0)}</td>
        <td class="${timingClass(st)}">${esc(st?.Value || '') || '<span class="dim">—</span>'}</td>${duel}`;
    } else if (kind === 'quali') {
      const bl = list(l.BestLapTimes);
      const stp = list(l.Stats)[part - 1] || {};
      const best = bl[part - 1]?.Value || '';
      const q = [0, 1, 2].map((i) => `<td class="t-lap ${i === part - 1 ? '' : 'dim'}">${esc(bl[i]?.Value || '') || '<span class="dim">—</span>'}</td>`).join('');
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(best) || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(stp.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int">${esc(stp.TimeDifftoPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${last}${secCells}${q}${tyre}${duel}`;
    } else {
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(l.BestLapTime?.Value || '') || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(l.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int">${esc(l.TimeDiffToPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${last}${secCells}${tyre}<td>${esc(l.NumberOfLaps ?? '')}</td>${duel}`;
    }

    const cls = ['trow'];
    if (l.KnockedOut || l.Retired) cls.push('out');
    if (cutoff && Number(pos) > cutoff && !l.KnockedOut) cls.push('danger');
    if (cutoff && Number(pos) === cutoff) cls.push('cut');
    if (store.focus === num) cls.push('focus');
    if (store.duel.a === num) cls.push('duel-a');
    if (store.duel.b === num) cls.push('duel-b');
    return `<tr class="${cls.join(' ')}" data-num="${num}">${cells}</tr>`;
  });

  $('#tower').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows.join('') || '<tr><td class="note">En attente des données de chronométrage…</td></tr>'}</tbody>`;
}

export function initTower() {
  $('#tower').addEventListener('click', (e) => {
    const b = e.target.closest('[data-duel]');
    if (b) {
      const slot = b.dataset.duel;
      setDuel(slot, store.duel[slot] === b.dataset.num ? null : b.dataset.num);
      renderTower(true);
      return;
    }
    const row = e.target.closest('tr[data-num]');
    if (row) {
      setFocus(store.focus === row.dataset.num ? null : row.dataset.num);
      renderTower(true);
    }
  });
}
