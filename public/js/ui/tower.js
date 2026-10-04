// Tableau de classement (course / qualifications / essais).
import { store, setDuel, setFocus, versionOf, displayNow, f1Now, on } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, tyreBadge, currentStint, lapSeconds, fmtLap } from '../util.js';
import { prefs, isFav, toggleFav } from '../prefs.js';
import { segmentClass, parseUtc } from '/shared/f1.js';

let lastKey = '';
let lastRender = 0;
const prevPos = new Map();
const flashes = new Map();
let freshReset = true;

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
  return `<td class="sector c-sec"><div class="sector-val ${timingClass(sec)}">${esc(val) || '<span class="dim">—</span>'}</div>` +
    (segs.length ? `<div class="segs">${segs.map((s) => `<i class="seg ${segmentClass(s?.Status)}"></i>`).join('')}</div>` : '') + '</td>';
}

function gapText(v) {
  if (v === undefined || v === null || v === '') return '<span class="dim">—</span>';
  if (/^LAP/i.test(v)) return '<span class="dim">Leader</span>';
  return esc(v);
}

export function renderTower(force = false) {
  const now = performance.now();
  const key = `${versionOf(['TimingData', 'TimingAppData', 'DriverList', 'TimingStats', 'RaceControlMessages', '__reset'])}|${store.duel.a}|${store.duel.b}|${store.focus}|${prefs.hiddenCols.join()}|${prefs.favs.join()}`;
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
  const dispNow = displayNow();
  const showDrs = (Number(s.SessionInfo?.StartDate?.slice(0, 4)) || 2026) < 2026;

  const part = Number(s.TimingData?.SessionPart) || 1;
  const noEntries = list(s.TimingData?.NoEntries);
  const cutoff = kind === 'quali' && part < 3 ? Number(noEntries[part]) || null : null;

  const TH = (cls, label, title = '') => `<th class="${cls}"${title ? ` title="${title}"` : ''}>${label}</th>`;
  const secHead = TH('c-sec', 'S1') + TH('c-sec', 'S2') + TH('c-sec', 'S3');
  let head;
  if (kind === 'race') {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-last', 'Dernier') + TH('t-lap c-best', 'Meilleur') +
      secHead + TH('c-tyre', 'Pneu') + TH('c-pits', 'Arr.', 'Arrêts aux stands') + TH('c-speed', 'V.max', 'Vitesse au speed trap') + TH('c-duel', 'Duel');
  } else if (kind === 'quali') {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('t-lap', 'Meilleur') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-pred', 'Tour en cours', 'Temps prévu du tour lancé (secteurs réalisés + meilleurs secteurs du pilote) et position visée') +
      TH('t-lap c-last', 'Dernier') + secHead + TH('t-lap c-q', 'Q1') + TH('t-lap c-q', 'Q2') + TH('t-lap c-q', 'Q3') + TH('c-tyre', 'Pneu') + TH('c-duel', 'Duel');
  } else {
    head = TH('', 'Pos') + TH('', 'Pilote') + TH('t-lap', 'Meilleur') + TH('t-gap', 'Écart') + TH('t-int c-int', 'Interv.') + TH('t-lap c-pred', 'Tour en cours', 'Temps prévu du tour lancé') +
      TH('t-lap c-last', 'Dernier') + secHead + TH('c-tyre', 'Pneu') + TH('c-pits', 'Tours') + TH('c-duel', 'Duel');
  }

  // Meilleurs temps de la partie en cours (qualifs) / de la séance, pour classer les tours en cours.
  const bestOf = (l) => kind === 'quali' ? lapSeconds(list(l.BestLapTimes)[part - 1]?.Value) : lapSeconds(l.BestLapTime?.Value);
  const bests = nums.map((n) => ({ n, t: bestOf(lines[n] || {}) })).filter((x) => x.t);

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
    if (showDrs) {
      const car = store.positions.carAt(num, dispNow);
      if (car && car.drs >= 10) tags.push('<span class="tag drs">DRS</span>');
    }
    const pred = kind !== 'race' ? predictLap(l, stats[num]) : null;
    if (pred) tags.push('<span class="tag push" title="Tour rapide en cours">TOUR</span>');

    // Changement de position : surbrillance verte / rouge (animation CSS, voir syncRows)
    const p = Number(pos);
    const prev = prevPos.get(num);
    if (p && prev && p !== prev && !freshReset) flashes.set(num, p < prev ? 'up' : 'down');
    if (p) prevPos.set(num, p);

    let posDelta = '';
    if (kind === 'race' && a.GridPos && pos) {
      const dlt = Number(a.GridPos) - Number(pos);
      if (dlt) posDelta = `<span class="pos-delta ${dlt > 0 ? 'up' : 'down'}">${dlt > 0 ? '▲' : '▼'}${Math.abs(dlt)}</span>`;
    }

    const drv = `<td><div class="drv"><span class="drv-bar" style="background:${teamColor(d)}"></span><span class="drv-num">${esc(d.RacingNumber || num)}</span><span class="drv-tla" title="${esc(d.FullName || '')} — ${esc(d.TeamName || '')}">${esc(d.Tla || num)}</span><button class="fav-btn ${isFav(num) ? 'on' : ''}" data-fav="${num}" title="${isFav(num) ? 'Retirer des favoris' : 'Ajouter aux favoris (alertes, radios…)'}">${isFav(num) ? '★' : '☆'}</button><span class="drv-tags">${tags.join('')}</span></div></td>`;
    const sectors = list(l.Sectors);
    const secCells = [0, 1, 2].map((i) => sectorCell(sectors[i])).join('');
    const tyre = `<td class="c-tyre">${stint ? tyreBadge(stint.Compound, stint.TotalLaps, stint.New) : '<span class="dim">—</span>'}</td>`;
    const duel = `<td class="c-duel"><div class="duel-btns"><button class="ab a ${store.duel.a === num ? 'on' : ''}" data-duel="a" data-num="${num}" title="Pilote A du duel">A</button><button class="ab b ${store.duel.b === num ? 'on' : ''}" data-duel="b" data-num="${num}" title="Pilote B du duel">B</button></div></td>`;
    const last = `<td class="t-lap c-last ${timingClass(l.LastLapTime)}">${esc(l.LastLapTime?.Value || '') || '<span class="dim">—</span>'}</td>`;
    let predCell = '<td class="t-lap c-pred"><span class="dim">—</span></td>';
    if (pred) {
      const own = bestOf(l);
      const rank = bests.filter((x) => x.n !== num && x.t < pred.time).length + 1;
      const cls = rank === 1 ? 'purple' : own === null || pred.time < own ? 'green' : 'yellow';
      predCell = `<td class="t-lap c-pred"><span class="pred ${cls}" title="${pred.done} secteur(s) réalisé(s)">${fmtLap(pred.time)} <small>→ P${rank}</small></span></td>`;
    }

    let cells;
    if (kind === 'race') {
      const int = l.IntervalToPositionAhead || {};
      const best = l.BestLapTime?.Value || '';
      const bestPurple = stats[num]?.PersonalBestLapTime?.Position === 1;
      const st = l.Speeds?.ST;
      cells = `<td class="pos">${esc(pos)}${posDelta}</td>${drv}
        <td class="t-gap">${gapText(l.GapToLeader)}</td>
        <td class="t-int c-int ${int.Catching ? 'catching' : ''}">${gapText(int.Value)}</td>
        ${last}<td class="t-lap c-best ${bestPurple ? 'purple' : ''}">${esc(best) || '<span class="dim">—</span>'}</td>
        ${secCells}${tyre}<td class="c-pits">${esc(l.NumberOfPitStops ?? 0)}</td>
        <td class="c-speed ${timingClass(st)}">${esc(st?.Value || '') || '<span class="dim">—</span>'}</td>${duel}`;
    } else if (kind === 'quali') {
      const bl = list(l.BestLapTimes);
      const stp = list(l.Stats)[part - 1] || {};
      const best = bl[part - 1]?.Value || '';
      const q = [0, 1, 2].map((i) => `<td class="t-lap c-q ${i === part - 1 ? '' : 'dim'}">${esc(bl[i]?.Value || '') || '<span class="dim">—</span>'}</td>`).join('');
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(best) || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(stp.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int c-int">${esc(stp.TimeDifftoPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${predCell}${last}${secCells}${q}${tyre}${duel}`;
    } else {
      cells = `<td class="pos">${esc(pos)}</td>${drv}
        <td class="t-lap">${esc(l.BestLapTime?.Value || '') || '<span class="dim">—</span>'}</td>
        <td class="t-gap">${esc(l.TimeDiffToFastest || '') || '<span class="dim">—</span>'}</td>
        <td class="t-int c-int">${esc(l.TimeDiffToPositionAhead || '') || '<span class="dim">—</span>'}</td>
        ${predCell}${last}${secCells}${tyre}<td class="c-pits">${esc(l.NumberOfLaps ?? '')}</td>${duel}`;
    }

    const cls = ['trow'];
    if (l.KnockedOut || l.Retired) cls.push('out');
    if (cutoff && Number(pos) > cutoff && !l.KnockedOut) cls.push('danger');
    if (cutoff && Number(pos) === cutoff) cls.push('cut');
    if (store.focus === num) cls.push('focus');
    if (store.duel.a === num) cls.push('duel-a');
    if (store.duel.b === num) cls.push('duel-b');
    return { num, cls: cls.join(' '), cells };
  });
  freshReset = false;

  // Qualifs : temps à battre pour passer à la partie suivante
  let cutInfo = '';
  if (cutoff) {
    const atCut = nums.find((n) => Number(lines[n]?.Position) === cutoff);
    const t = atCut ? bestOf(lines[atCut]) : null;
    const threatened = nums.filter((n) => Number(lines[n]?.Position) > cutoff && !lines[n]?.KnockedOut).map((n) => dl[n]?.Tla || n);
    if (t) cutInfo = `<caption class="cutline">Limite ${/sprint/i.test(s.SessionInfo?.Name || '') ? 'SQ' : 'Q'}${part} (P${cutoff}) : <b>${fmtLap(t)}</b>${threatened.length ? ` · en danger : ${esc(threatened.join(', '))}` : ''}</caption>`;
  }

  const table = $('#tower');
  table.className = `tower ${prefs.hiddenCols.map((c) => `hide-${c}`).join(' ')}`;
  syncTable(table, cutInfo, head, rows);
  fitTower();
}

// Mise à jour du tableau ligne par ligne (au lieu de tout reconstruire) : seules les cellules
// qui changent sont réécrites, et une voiture qui gagne ou perd des places glisse jusqu'à sa
// nouvelle ligne (technique FLIP) avec une surbrillance qui s'estompe en douceur.
const rowEls = new Map();      // numéro -> <tr>
const rowHtml = new Map();     // numéro -> contenu actuel
let headHtml = '';
let captionHtml = '';

function syncTable(table, cutInfo, head, rows) {
  if (!table.tHead || table.dataset.built !== '1') {
    table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
    table.dataset.built = '1';
    rowEls.clear(); rowHtml.clear(); headHtml = ''; captionHtml = '';
  }
  if (cutInfo !== captionHtml) {
    table.caption?.remove();
    if (cutInfo) table.insertAdjacentHTML('afterbegin', cutInfo);
    captionHtml = cutInfo;
  }
  if (head !== headHtml) { table.tHead.rows[0].innerHTML = head; headHtml = head; }
  const tbody = table.tBodies[0];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="note">En attente des données de chronométrage…</td></tr>';
    rowEls.clear(); rowHtml.clear();
    return;
  }
  tbody.querySelector('td.note')?.parentElement.remove();

  // Positions avant mise à jour (pour l'animation de glissement)
  const before = new Map();
  for (const [num, tr] of rowEls) if (tr.isConnected) before.set(num, tr.getBoundingClientRect().top);

  const keep = new Set();
  rows.forEach((r, i) => {
    keep.add(r.num);
    let tr = rowEls.get(r.num);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.num = r.num;
      rowEls.set(r.num, tr);
    }
    const fl = [...tr.classList].filter((c) => c === 'flash-up' || c === 'flash-down');
    const cls = [r.cls, ...fl].join(' ');
    if (tr.className !== cls) tr.className = cls;
    if (rowHtml.get(r.num) !== r.cells) { tr.innerHTML = r.cells; rowHtml.set(r.num, r.cells); }
    if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] || null);
  });
  for (const [num, tr] of rowEls) {
    if (!keep.has(num)) { tr.remove(); rowEls.delete(num); rowHtml.delete(num); }
  }

  // Surbrillance : relancée à chaque changement de position
  for (const [num, dir] of flashes) {
    const tr = rowEls.get(num);
    if (!tr) continue;
    tr.classList.remove('flash-up', 'flash-down');
    void tr.offsetWidth;
    tr.classList.add(`flash-${dir}`);
    tr.addEventListener('animationend', () => tr.classList.remove(`flash-${dir}`), { once: true });
  }
  flashes.clear();

  // Glissement : chaque ligne déplacée part de son ancienne place et rejoint la nouvelle
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const zoom = Number(table.style.zoom) || 1;
  for (const [num, tr] of rowEls) {
    const old = before.get(num);
    if (old === undefined) continue;
    const dy = (old - tr.getBoundingClientRect().top) / zoom;
    if (Math.abs(dy) < 1) continue;
    tr.style.transition = 'none';
    tr.style.transform = `translateY(${dy}px)`;
    tr.style.position = 'relative';
    tr.style.zIndex = '2';
    requestAnimationFrame(() => {
      tr.style.transition = 'transform .6s cubic-bezier(.22, .8, .3, 1)';
      tr.style.transform = '';
      tr.addEventListener('transitionend', () => { tr.style.zIndex = ''; tr.style.position = ''; tr.style.transition = ''; }, { once: true });
    });
  }
}

// Grand écran / fenêtre détachée : le classement s'agrandit pour occuper toute la hauteur
// disponible (zoom limité pour que toutes les colonnes restent visibles).
let fitKey = '';

export function fitTower(force = false) {
  const table = $('#tower');
  const wrap = table?.parentElement;
  if (!wrap || !wrap.clientHeight) return;
  const rows = table.tBodies[0]?.rows.length || 0;
  const key = `${wrap.clientWidth}x${wrap.clientHeight}|${rows}|${table.className}|${prefs.towerFit}`;
  if (key === fitKey && !force) return;
  fitKey = key;
  table.style.zoom = '';
  if (!prefs.towerFit || rows < 5) return;
  const room = (wrap.clientHeight - 2) / table.offsetHeight;
  if (room < 1.04) return;
  let z = Math.min(1.8, Math.floor(room * 50) / 50);
  while (z > 1.04) {
    table.style.zoom = z;
    if (wrap.scrollWidth <= wrap.clientWidth + 1 && wrap.scrollHeight <= wrap.clientHeight + 1) return;
    z = Math.round((z - 0.04) * 100) / 100;
  }
  table.style.zoom = '';
}

// Temps prévu d'un tour lancé : secteurs réalisés + meilleurs secteurs personnels restants.
function predictLap(l, st) {
  if (l.InPit || l.PitOut || l.Retired || l.Stopped) return null;
  const secs = list(l.Sectors);
  const best = list(st?.BestSectors).map((b) => lapSeconds(b?.Value));
  if (secs.length < 3 || best.length < 3 || best.some((b) => !b)) return null;
  let done = 0, time = 0, good = 0, seen = 0;
  for (let i = 0; i < 3; i++) {
    const segs = list(secs[i]?.Segments);
    const statuses = segs.map((g) => g?.Status || 0);
    seen += statuses.filter(Boolean).length;
    good += statuses.filter((x) => x === 2049 || x === 2051).length;
    const complete = segs.length && statuses.every(Boolean) && !statuses.includes(2064);
    if (complete && i === done) {
      const v = lapSeconds(secs[i].Value);
      if (!v) return null;
      time += v;
      done++;
    }
  }
  if (!done || done === 3 || seen < 2 || good / seen < 0.5) return null;
  for (let i = done; i < 3; i++) time += best[i];
  return { time, done };
}
export function initTower() {
  const wrap = $('#tower').parentElement;
  if ('ResizeObserver' in window) new ResizeObserver(() => fitTower()).observe(wrap);
  on('prefs', (k) => { if (k === 'towerFit') fitTower(true); });
  on('reset', () => { freshReset = true; prevPos.clear(); flashes.clear(); });
  $('#tower').addEventListener('click', (e) => {
    const b = e.target.closest('[data-duel]');
    if (b) {
      const slot = b.dataset.duel;
      setDuel(slot, store.duel[slot] === b.dataset.num ? null : b.dataset.num);
      renderTower(true);
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      toggleFav(fav.dataset.fav);
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
