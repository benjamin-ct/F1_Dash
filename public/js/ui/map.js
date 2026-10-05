// Carte du circuit : tracé, secteurs sous drapeau, voitures (GPS ou estimées), virages.
import { store, displayNow, f1Now } from '../store.js';
import { $, api, drivers, teamColor, storageGet, storageSet } from '../util.js';
import { loadTrack } from '../track.js';
import { parseUtc } from '/shared/f1.js';

const canvas = () => $('#mapCanvas');
let ctx = null;
let track = null;
let trackKey = null;
let zones = null;          // zones ligne droite / détection estimées (serveur)
let xf = null;
let size = { w: 0, h: 0, dpr: 1 };
let lastFrame = performance.now();

// Couleurs de la carte selon le thème (Noir par défaut, Bleu nuit en option)
const PALETTES = {
  noir: { outline: '#050506', track: '#3b3b44', trackLine: '#5d5d68', chip: 'rgba(14,14,17,.92)', chipEdge: '#3b3b44', chipText: '#c9c9d2', label: 'rgba(0,0,0,.8)', ring: '#000000' },
  bleu: { outline: '#0c0f15', track: '#3a4356', trackLine: '#566079', chip: 'rgba(16,20,28,.9)', chipEdge: '#3a4356', chipText: '#c3cad6', label: 'rgba(10,12,17,.78)', ring: '#0a0c11' },
};
const pal = () => PALETTES[document.documentElement.dataset.theme] || PALETTES.noir;

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function ensureTrack() {
  const info = store.state.SessionInfo;
  const key = info?.Meeting?.Circuit?.Key;
  const year = Number(info?.StartDate?.slice(0, 4)) || new Date().getFullYear();
  if (!key) return;
  const k = `${key}-${year}`;
  if (k === trackKey) return;
  trackKey = k;
  track = null;
  zones = null;
  $('#mapEmpty').textContent = 'Chargement du tracé…';
  $('#mapEmpty').hidden = false;
  loadTrack(key, year).then((t) => {
    if (trackKey !== k) return;
    track = t;
    store.positions.setTrack(t);
    // Emplacement réel des boucles de chrono (calculé une fois par circuit par le serveur).
    api(`/api/loops?key=${key}&year=${year}`).then((l) => { if (trackKey === k) store.positions.setLoops(l); }).catch(() => {});
    // Zones ligne droite et ligne de détection (estimées une fois par circuit, peut prendre ~1 min)
    api(`/api/zones?key=${key}&year=${year}`).then((z) => { if (trackKey === k) zones = z; }).catch(() => {});
    xf = null;
    $('#mapEmpty').hidden = true;
  }).catch((err) => {
    $('#mapEmpty').textContent = `Tracé indisponible (${err.message})`;
    trackKey = null;
    setTimeout(() => { if (!track) trackKey = null; }, 30000);
  });
}

function resize() {
  const c = canvas();
  const r = c.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (r.width === size.w && r.height === size.h && dpr === size.dpr) return;
  size = { w: r.width, h: r.height, dpr };
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  xf = null;
}

function makeTransform() {
  const a = (track.rotation * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const rot = (x, y) => [x * cos - y * sin, -(x * sin + y * cos)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of track.pts) {
    const [rx, ry] = rot(p.x, p.y);
    if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
  }
  const pad = 36;
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const scale = Math.min((size.w - pad * 2) / bw, (size.h - pad * 2) / bh);
  const ox = (size.w - bw * scale) / 2 - minX * scale;
  const oy = (size.h - bh * scale) / 2 - minY * scale;
  const f = (x, y) => {
    const [rx, ry] = rot(x, y);
    return [rx * scale + ox, ry * scale + oy];
  };
  f.scale = scale;
  return f;
}

// Vue (zoom / déplacement) appliquée par-dessus la projection de base.
const view = { z: 1, x: 0, y: 0 };
let followTarget = null;

function withView(base) {
  const f = (x, y) => {
    const [bx, by] = base(x, y);
    return [(bx - size.w / 2) * view.z + size.w / 2 + view.x, (by - size.h / 2) * view.z + size.h / 2 + view.y];
  };
  f.base = base;
  f.screen = track.pts.map((p) => f(p.x, p.y));
  return f;
}

function resetView() {
  view.z = 1; view.x = 0; view.y = 0;
}

// État des drapeaux par secteur de commissaires, d'après les messages de la direction de course.
function sectorFlags() {
  const flags = new Map();
  let red = false;
  const now = f1Now();
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (!m || m.Category !== 'Flag') continue;
    if (parseUtc(m.Utc) > now + 1000) continue;
    const flag = m.Flag;
    if (m.Scope === 'Track') {
      if (flag === 'RED') red = true;
      if (flag === 'GREEN' || flag === 'CLEAR') { flags.clear(); red = false; }
      if (flag === 'CHEQUERED') flags.clear();
    } else if (m.Scope === 'Sector' && m.Sector) {
      if (flag === 'CLEAR' || flag === 'GREEN') flags.delete(Number(m.Sector));
      else if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') flags.set(Number(m.Sector), flag);
    }
  }
  return { flags, red };
}

// Trait parallèle au tracé (décalé de off px vers l'extérieur du point de vue de la normale).
function strokeOffset(from, to, off) {
  const pts = xf.screen;
  const n = pts.length;
  const at = (i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [pts[i][0] - ((b[1] - a[1]) / len) * off, pts[i][1] + ((b[0] - a[0]) / len) * off];
  };
  ctx.beginPath();
  let i = from;
  ctx.moveTo(...at(i));
  for (let guard = 0; i !== to && guard < n; guard++) {
    i = (i + 1) % n;
    ctx.lineTo(...at(i));
  }
  ctx.stroke();
}

function badge(x, y, text, bg, fg) {
  ctx.font = '800 9.5px "Titillium Web", sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 8, w, 16, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

// Zones « ligne droite » (straight mode) et ligne de détection du mode dépassement.
function drawZones() {
  if (!zones || !$('#mapZones').checked) return;
  const pts = xf.screen;
  const n = pts.length;
  if (!n || zones.zones.some((z) => z.from >= n || z.to >= n)) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const z of zones.zones) {
    ctx.strokeStyle = 'rgba(60, 224, 138, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    strokeOffset(z.from, z.to, 9);
    ctx.setLineDash([]);
    const p = pts[z.from], q = pts[(z.from + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    badge(p[0] - ((q[1] - p[1]) / len) * 22, p[1] + ((q[0] - p[0]) / len) * 22, 'LD', '#3ce08a', '#062414');
  }
  const d = zones.detection;
  if (d && d.idx < n) {
    const p = pts[d.idx], a = pts[(d.idx - 1 + n) % n], b = pts[(d.idx + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p[0] - nx * 11, p[1] - ny * 11);
    ctx.lineTo(p[0] + nx * 11, p[1] + ny * 11);
    ctx.stroke();
    badge(p[0] + nx * 26, p[1] + ny * 26, 'DÉTECTION', '#ff4fd8', '#2a0623');
  }
  ctx.restore();
}

function strokeRange(from, to) {
  const pts = xf.screen;
  const n = pts.length;
  ctx.beginPath();
  let i = from;
  ctx.moveTo(pts[i][0], pts[i][1]);
  let guard = 0;
  while (i !== to && guard++ < n) {
    i = (i + 1) % n;
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
}

// Tracé entre deux distances de référence (r croissant, modulo L).
function strokeDist(r0, r1) {
  const L = track.L;
  if (r1 < r0) r1 += L;
  const step = L / 700;
  ctx.beginPath();
  for (let r = r0; ; r += step) {
    const last = r >= r1;
    const p = track.pointAt(last ? r1 : r);
    const [x, y] = xf(p.x, p.y);
    if (r === r0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (last) break;
  }
  ctx.stroke();
}

// Point et direction (normale) du tracé à la distance r, en coordonnées écran.
function screenAt(r) {
  const a = track.pointAt(r), b = track.pointAt(r + track.L / 400);
  const [x0, y0] = xf(a.x, a.y), [x1, y1] = xf(b.x, b.y);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  return { x: x0, y: y0, nx: -Math.sin(ang), ny: Math.cos(ang) };
}

// ---------- Secteurs et micro-secteurs du chronométrage ----------
// Couleurs des secteurs choisies pour ne pas se confondre avec les drapeaux (jaune, rouge)
const SECTOR_COLORS = ['#ff6b8a', '#2fa8e8', '#b48cff'];
let layoutCache = null;

const mod = (r, L) => ((r % L) + L) % L;

function timingLayout() {
  const s = store.state;
  const pos = store.positions;
  const counts = [0, 0, 0];
  for (const l of Object.values(s.TimingData?.Lines || {})) {
    for (let i = 0; i < 3; i++) {
      const segs = l?.Sectors?.[i]?.Segments;
      const c = segs ? (Array.isArray(segs) ? segs.length : Object.keys(segs).length) : 0;
      if (c > counts[i]) counts[i] = c;
    }
  }
  const fb = pos.sectorFractions(s);
  const key = `${trackKey}|${counts}|${fb.map((x) => x.toFixed(3))}|${pos.lineFrac()}|${!!pos.loops}`;
  if (layoutCache?.key === key) return layoutCache;
  const L = track.L, line = pos.lineFrac();
  const toR = (q) => mod((line + q) * L, L);
  const qb = [0, pos.loopQ('S0', fb[1]), pos.loopQ('S1', fb[2]), 1];
  const sectors = [0, 1, 2].map((i) => ({ i, from: toR(qb[i]), to: toR(qb[i + 1]), len: mod((qb[i + 1] - qb[i]) * L, L) || L / 3 }));
  const minis = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < counts[i]; j++) {
      const q = pos.loopQ(`${i}-${j}`, fb[i] + ((j + 1) / counts[i]) * (fb[i + 1] - fb[i]));
      minis.push({ i, j, r: toR(q), last: j === counts[i] - 1 });
    }
  }
  // Distance de chaque virage sur le tracé (pour décrire les zones sous drapeau)
  const corners = track.corners.map((c) => ({ number: c.number, r: track.t[track.nearestIndex(c.x, c.y)] }));
  layoutCache = { key, sectors, minis, counts, corners };
  return layoutCache;
}

// Secteur (1-3) et micro-secteur (1-n) contenant la distance r.
function locate(lay, r) {
  const L = track.L;
  for (const sec of lay.sectors) {
    const d = mod(r - sec.from, L);
    if (d <= sec.len) {
      const mins = lay.minis.filter((m) => m.i === sec.i);
      const k = mins.findIndex((m) => mod(m.r - sec.from, L) >= d);
      return { sector: sec.i + 1, mini: k >= 0 ? k + 1 : mins.length || null };
    }
  }
  return { sector: null, mini: null };
}

// Secteurs de commissaires : positions fournies avec le tracé (MultiViewer) ou, pour un tracé
// reconstruit à partir du GPS, estimées en découpant le tour en parts égales depuis la ligne
// (en pratique un secteur tous les ~300 m, numérotés dans le sens de la course).
let approxMarshal = null;

function marshalLayout() {
  if (track.marshal.length) return { ranges: track.marshalRanges(), approx: false };
  let maxSeen = 0;
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (m?.Scope === 'Sector' && Number(m.Sector) > maxSeen) maxSeen = Number(m.Sector);
  }
  const pts = track.pts;
  const n = pts.length;
  const line = store.positions.lineFrac();
  const key = `${trackKey}|${maxSeen}|${line.toFixed(3)}`;
  if (approxMarshal?.key === key) return approxMarshal;
  // Point de départ : ligne de départ/arrivée (temps le plus proche sur le tracé)
  const tl = line * track.L;
  let start = 0;
  for (let i = 1; i < n; i++) if (Math.abs(track.t[i] - tl) < Math.abs(track.t[start] - tl)) start = i;
  // Distances cumulées depuis la ligne (coordonnées en dixièmes de mètre)
  const cum = [0];
  for (let k = 1; k <= n; k++) {
    const a = pts[(start + k - 1) % n], b = pts[(start + k) % n];
    cum.push(cum[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n];
  const count = Math.max(maxSeen, Math.round(total / 10 / 300), 1);
  const idxAt = (d) => {
    let k = cum.findIndex((c) => c >= d);
    if (k < 0) k = n;
    return (start + k) % n;
  };
  const bounds = Array.from({ length: count + 1 }, (_, i) => idxAt((i / count) * total));
  const ranges = Array.from({ length: count }, (_, i) => ({ number: i + 1, from: bounds[i], to: bounds[i + 1] }));
  approxMarshal = { key, ranges, approx: true };
  return approxMarshal;
}

function describeZone(lay, r0, r1) {
  const L = track.L;
  const span = mod(r1 - r0, L);
  const turns = lay.corners.filter((c) => mod(c.r - r0, L) <= span).map((c) => c.number).sort((a, b) => a - b);
  const a = locate(lay, r0 + span * 0.02), b = locate(lay, r1 - span * 0.02);
  const parts = [];
  if (turns.length) parts.push(turns.length > 1 ? `virages ${turns[0]}–${turns[turns.length - 1]}` : `virage ${turns[0]}`);
  if (a.sector) {
    if (a.sector === b.sector) parts.push(`S${a.sector}${a.mini ? ` · micro-secteur${a.mini !== b.mini ? `s ${a.mini}–${b.mini}` : ` ${a.mini}`}` : ''}`);
    else parts.push(`S${a.sector}${a.mini ? `.${a.mini}` : ''} → S${b.sector}${b.mini ? `.${b.mini}` : ''}`);
  }
  return parts.join(' · ');
}

function drawSectors(lay) {
  const L = track.L;
  // Bande centrale colorée par secteur
  ctx.lineWidth = 3;
  for (const sec of lay.sectors) {
    ctx.strokeStyle = SECTOR_COLORS[sec.i];
    ctx.globalAlpha = 0.85;
    strokeDist(sec.from, sec.from + sec.len);
  }
  ctx.globalAlpha = 1;
  // Repères des micro-secteurs (petits traits) et des fins de secteur (grands traits)
  for (const m of lay.minis) {
    const p = screenAt(m.r);
    const len = m.last ? 12 : 6;
    ctx.strokeStyle = m.last ? '#ffffff' : 'rgba(233,237,244,.75)';
    ctx.lineWidth = m.last ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - p.nx * len, p.y - p.ny * len);
    ctx.lineTo(p.x + p.nx * len, p.y + p.ny * len);
    ctx.stroke();
  }
}

// Étiquettes S1 / S2 / S3 au milieu de chaque secteur, numéros de micro-secteur en zoom
// (dessinées après les numéros de virage pour rester visibles).
function drawSectorLabels(lay) {
  const L = track.L;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const sec of lay.sectors) {
    const p = screenAt(sec.from + sec.len / 2);
    const x = p.x - p.nx * 24, y = p.y - p.ny * 24;
    ctx.fillStyle = SECTOR_COLORS[sec.i];
    ctx.beginPath();
    ctx.roundRect(x - 13, y - 9, 26, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 11px "Titillium Web", sans-serif';
    ctx.fillText(`S${sec.i + 1}`, x, y + 0.5);
  }
  if ($('#mapMiniNums').checked && view.z >= 1.5) {
    ctx.font = '700 9.5px "Titillium Web", sans-serif';
    for (const sec of lay.sectors) {
      const mins = lay.minis.filter((m) => m.i === sec.i);
      let prev = sec.from;
      mins.forEach((m, k) => {
        const mid = prev + mod(m.r - prev, L) / 2;
        const p = screenAt(mid);
        ctx.fillStyle = 'rgba(233,237,244,.8)';
        ctx.fillText(`${sec.i + 1}.${k + 1}`, p.x + p.nx * 15, p.y + p.ny * 15);
        prev = m.r;
      });
    }
  }
}

// Position estimée de la voiture de sécurité : juste devant le leader.
function leaderR() {
  const lines = store.state.TimingData?.Lines || {};
  const num = Object.keys(lines).find((n) => Number(lines[n]?.Position) === 1);
  if (!num) return null;
  const disp = displayNow();
  const g = store.positions.hasGps(disp) ? store.positions.gpsAt(num, disp) : store.positions.estimatedXY(num, disp, 0);
  return g ? track.project(g.x, g.y).r : null;
}

function scEnding() {
  // « SAFETY CAR IN THIS LAP » publié après le dernier « SAFETY CAR DEPLOYED »
  let ending = false;
  const now = f1Now();
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (!m?.Message || parseUtc(m.Utc) > now + 1000) continue;
    if (/SAFETY CAR DEPLOYED/.test(m.Message) && !/VIRTUAL/.test(m.Message)) ending = false;
    if (/SAFETY CAR IN THIS LAP/.test(m.Message)) ending = true;
  }
  return ending;
}

let flagsHtml = '';

function renderFlagInfo(html) {
  if (html === flagsHtml) return;
  flagsHtml = html;
  $('#mapFlags').innerHTML = html;
}

function draw() {
  const now = performance.now();
  const dt = Math.min(0.2, (now - lastFrame) / 1000);
  lastFrame = now;
  ensureTrack();
  resize();
  const dpr = size.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  if (!track) return;
  if (!xf) xf = { base: makeTransform() };
  // Suivi du pilote : on centre la vue sur sa voiture (repérée à l'image précédente).
  if ($('#mapFollow').checked && followTarget) {
    if (view.z < 2.2) view.z += (2.6 - view.z) * Math.min(1, dt * 3);
    const tx = -(followTarget[0] - size.w / 2) * view.z, ty = -(followTarget[1] - size.h / 2) * view.z;
    view.x += (tx - view.x) * Math.min(1, dt * 4);
    view.y += (ty - view.y) * Math.min(1, dt * 4);
  }
  xf = withView(xf.base);

  const pts = xf.screen;
  const ts = String(store.state.TrackStatus?.Status || '1');
  const sf = sectorFlags();
  const flags = sf.flags;
  const red = sf.red || ts === '5';
  const sc = ts === '4', vsc = ts === '6' || ts === '7';
  const scMode = sc || vsc;
  const lay = timingLayout();

  const animated = red || scMode || [...flags.values()].includes('DOUBLE YELLOW');
  const bgKey = [size.w, size.h, size.dpr, view.x.toFixed(1), view.y.toFixed(1), view.z.toFixed(3), ts, [...flags].join(),
    lay?.key, !!zones, store.positions.lineFrac().toFixed(4), MAP_OPTS.map((k) => $(`#${k}`).checked).join(), trackKey, document.fonts?.status, document.documentElement.dataset.theme].join('|');
  let flagZones;
  if (!animated && bg.key === bgKey && bg.canvas) {
    ctx.drawImage(bg.canvas, 0, 0, size.w, size.h);
    flagZones = bg.flagZones;
  } else if (animated) {
    bg.key = '';
    flagZones = drawBackground(now, red, sc, vsc, scMode, flags, lay);
  } else {
    // Nouveau fond : dessiné hors écran puis recopié
    if (!bg.canvas) bg.canvas = document.createElement('canvas');
    if (bg.canvas.width !== canvas().width || bg.canvas.height !== canvas().height) {
      bg.canvas.width = canvas().width;
      bg.canvas.height = canvas().height;
    }
    const main = ctx;
    ctx = bg.canvas.getContext('2d');
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    try { flagZones = drawBackground(now, red, sc, vsc, scMode, flags, lay); } finally { ctx = main; }
    bg.key = bgKey;
    bg.flagZones = flagZones;
    ctx.drawImage(bg.canvas, 0, 0, size.w, size.h);
  }

  drawCars(dt);

  // Voiture de sécurité : position estimée juste devant le leader
  if (sc && !red) {
    const lr = leaderR();
    if (lr !== null) {
      const p = screenAt(lr + track.L / 45);
      ctx.beginPath();
      ctx.roundRect(p.x - 13, p.y - 9, 26, 18, 4);
      ctx.fillStyle = '#ffb020';
      ctx.fill();
      ctx.strokeStyle = '#1d1200';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#1d1200';
      ctx.font = '900 11px "Titillium Web", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SC', p.x, p.y + 0.5);
    }
  }

  // Informations : bandeau drapeau rouge / SC / VSC et zones sous drapeau jaune
  const items = [];
  if (red) items.push('<div class="mf-banner red">Drapeau rouge — séance arrêtée</div>');
  else if (sc) items.push(`<div class="mf-banner sc">Safety car${scEnding() ? ' — rentre à la fin du tour' : ' en piste'}${leaderR() !== null ? ' · position estimée' : ''}</div>`);
  else if (ts === '6') items.push('<div class="mf-banner vsc">Virtual safety car</div>');
  else if (ts === '7') items.push('<div class="mf-banner vsc">Fin de VSC — reprise imminente</div>');
  for (const z of flagZones.sort((a, b) => a.number - b.number)) {
    items.push(`<div class="mf-item ${z.dbl ? 'dy' : ''}"><b>${z.dbl ? 'Double jaune' : 'Jaune'}</b> · secteur de commissaires ${z.number}${z.text ? ` · ${z.text}` : ''}${z.approx ? ' <span class="muted">(position estimée)</span>' : ''}</div>`);
  }
  renderFlagInfo(items.join(''));
}

// Fond de carte (tracé, secteurs, zones, drapeaux, virages…) : dessiné dans un calque mis en
// cache et seulement recopié à chaque image tant que rien ne change (la carte ne fait alors
// plus que déplacer les voitures, beaucoup moins coûteux).
const bg = { canvas: null, key: '', flagZones: [] };

function drawBackground(now, red, sc, vsc, scMode, flags, lay) {
  const pts = xf.screen;
  // Drapeau rouge : toute la carte en rouge
  if (red) {
    const pulse = 0.16 + 0.06 * Math.sin(now / 260);
    ctx.fillStyle = `rgba(255, 40, 40, ${pulse})`;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size.w - 6, size.h - 6);
  } else if (scMode) {
    ctx.strokeStyle = `rgba(255, 176, 32, ${0.55 + 0.25 * Math.sin(now / 300)})`;
    ctx.lineWidth = 4;
    if (vsc) ctx.setLineDash([16, 10]);
    ctx.strokeRect(2, 2, size.w - 4, size.h - 4);
    ctx.setLineDash([]);
  }

  // Tracé
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  path();
  ctx.strokeStyle = pal().outline;
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = red ? '#ff3b30' : scMode ? '#ffb020' : pal().track;
  ctx.lineWidth = 9;
  ctx.stroke();
  if (vsc && !red) {
    // VSC : pointillés défilants sur tout le tracé
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = '#1d1200';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  } else if (red || scMode || !$('#mapSectors').checked) {
    ctx.strokeStyle = red ? '#ff6b61' : scMode ? '#ffd27a' : pal().trackLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (!red && !scMode && $('#mapSectors').checked) drawSectors(lay);

  if (!red) drawZones();

  // Secteurs de commissaires sous drapeau jaune / double jaune
  const flagZones = [];
  const marshal = flags.size ? marshalLayout() : null;
  if (marshal) {
    for (const r of marshal.ranges) {
      const f = flags.get(r.number);
      if (!f) continue;
      const dbl = f === 'DOUBLE YELLOW';
      const blink = dbl ? 0.65 + 0.35 * Math.sin(now / 180) : 1;
      ctx.globalAlpha = blink;
      ctx.strokeStyle = dbl ? '#ff9f1a' : '#f5c518';
      ctx.lineWidth = dbl ? 13 : 10;
      strokeRange(r.from, r.to);
      ctx.globalAlpha = 1;
      const r0 = track.t[r.from], r1 = track.t[r.to];
      // Fanion au début de la zone avec le numéro du secteur de commissaires
      const p = screenAt(r0);
      const x = p.x + p.nx * 20, y = p.y + p.ny * 20;
      ctx.fillStyle = dbl ? '#ff9f1a' : '#f5c518';
      ctx.beginPath();
      ctx.roundRect(x - 14, y - 9, 28, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#1a1500';
      ctx.font = '800 10.5px "Titillium Web", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dbl ? '⚑⚑' : '⚑'}${r.number}`, x, y + 0.5);
      flagZones.push({ number: r.number, dbl, approx: marshal.approx, text: describeZone(lay, r0, r1) });
    }
  }

  // Ligne de départ/arrivée (position calibrée si connue)
  {
    const lp = track.pointAt(store.positions.lineFrac() * track.L);
    const lp2 = track.pointAt(store.positions.lineFrac() * track.L + track.L / 200);
    const [x0, y0] = xf(lp.x, lp.y), [x1, y1] = xf(lp2.x, lp2.y);
    const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 - Math.cos(ang) * 11, y0 - Math.sin(ang) * 11);
    ctx.lineTo(x0 + Math.cos(ang) * 11, y0 + Math.sin(ang) * 11);
    ctx.stroke();
  }

  // Numéros de virage (pastilles)
  if ($('#mapCorners').checked) {
    const fs = Math.min(13, 10 + (view.z - 1) * 1.2);
    ctx.font = `700 ${fs}px "Titillium Web", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of track.corners) {
      const a = (c.angle * Math.PI) / 180;
      const [x, y] = xf(c.x + Math.cos(a) * 560, c.y + Math.sin(a) * 560);
      const rad = fs * 0.75 + (c.number >= 10 ? 2 : 0);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = pal().chip;
      ctx.fill();
      ctx.strokeStyle = pal().chipEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = pal().chipText;
      ctx.fillText(String(c.number), x, y + 0.5);
    }
  }

  if (!red && !scMode && $('#mapSectors').checked) drawSectorLabels(lay);
  return flagZones;
}

function drawCars(dt) {
  const s = store.state;
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const disp = displayNow();
  const gps = store.positions.hasGps(disp);
  const labels = $('#mapLabels').checked;
  const mode = $('#mapMode');
  const modeTxt = gps ? 'GPS' : 'Positions estimées';
  if (mode.textContent !== modeTxt) {
    mode.textContent = modeTxt;
    mode.className = `map-mode ${gps ? 'gps' : 'est'}`;
    mode.title = gps ? 'Positions GPS officielles' : 'Sans GPS (jeton F1 TV absent) : positions déduites des mini-secteurs du chronométrage';
  }

  const order = Object.keys(dl).sort((a, b) => (Number(lines[b]?.Position) || 99) - (Number(lines[a]?.Position) || 99));
  const special = new Set([store.duel.a, store.duel.b, store.focus].filter(Boolean));
  const drawOrder = [...order.filter((n) => !special.has(n)), ...order.filter((n) => special.has(n))];

  let inPit = 0;
  const followNum = store.focus || store.duel.a;
  if (!followNum) followTarget = null;
  for (const num of drawOrder) {
    const l = lines[num] || {};
    if (l.Retired) continue;
    let p = null;
    if (gps) {
      const g = store.positions.gpsAt(num, disp);
      if (g) p = xf(g.x, g.y);
    } else {
      if (l.InPit || l.Stopped) { if (l.InPit) inPit++; continue; }
      const e = store.positions.estimatedXY(num, disp, dt);
      if (e) p = xf(e.x, e.y);
    }
    if (!p) continue;
    if (num === followNum) {
      // Coordonnées "de base" (sans vue) pour centrer la vue à l'image suivante.
      followTarget = [(p[0] - size.w / 2 - view.x) / view.z + size.w / 2, (p[1] - size.h / 2 - view.y) / view.z + size.h / 2];
    }
    const d = dl[num];
    const col = teamColor(d);
    const isA = store.duel.a === num, isB = store.duel.b === num, isF = store.focus === num;
    const r = isA || isB || isF ? 8 : 6.5;

    if (isA || isB || isF) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isA ? '#3ea6ff' : isB ? '#ff9f1a' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal().ring;
    ctx.stroke();
    if (!gps) {
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (labels || isA || isB || isF) {
      const txt = d?.Tla || num;
      ctx.font = `700 ${isA || isB || isF ? 12 : 10.5}px "Titillium Web", sans-serif`;
      const w = ctx.measureText(txt).width + 8;
      const lx = p[0] + r + 3, ly = p[1] - 8;
      ctx.fillStyle = pal().label;
      ctx.fillRect(lx, ly, w, 16);
      ctx.fillStyle = col;
      ctx.fillRect(lx, ly, 2, 16);
      ctx.fillStyle = '#e9edf4';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, lx + 5, ly + 8.5);
    }
  }

  const legend = $('#mapLegend');
  const txt = !gps && inPit ? `${inPit} voiture(s) aux stands` : '';
  if (legend.textContent !== txt) legend.textContent = txt;
}

// Cases de la carte mémorisées d'une session à l'autre
const MAP_OPTS = ['mapLabels', 'mapCorners', 'mapSectors', 'mapMiniNums', 'mapZones'];

function initMapOptions() {
  const saved = storageGet('f1dash.mapOpts', {});
  for (const id of MAP_OPTS) {
    const el = $(`#${id}`);
    if (typeof saved[id] === 'boolean') el.checked = saved[id];
    el.addEventListener('change', () => storageSet('f1dash.mapOpts', Object.fromEntries(MAP_OPTS.map((k) => [k, $(`#${k}`).checked]))));
  }
}

export function initMap() {
  initMapOptions();
  ctx = canvas().getContext('2d');
  const c = canvas();
  // Zoom à la molette autour du curseur, déplacement à la souris, double-clic = vue d'ensemble.
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left - size.w / 2, my = e.clientY - r.top - size.h / 2;
    const z0 = view.z;
    view.z = Math.max(1, Math.min(8, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.x = mx - ((mx - view.x) * view.z) / z0;
    view.y = my - ((my - view.y) * view.z) / z0;
    if (view.z === 1) resetView();
  }, { passive: false });
  let drag = null;
  c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.x = drag.vx + e.clientX - drag.x;
    view.y = drag.vy + e.clientY - drag.y;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) $('#mapFollow').checked = false;
  });
  c.addEventListener('pointerup', () => { drag = null; });
  const reset = () => { resetView(); $('#mapFollow').checked = false; };
  c.addEventListener('dblclick', reset);
  $('#mapReset').addEventListener('click', reset);
  $('#mapFollow').addEventListener('change', (e) => { if (!e.target.checked) resetView(); });
  const loop = () => {
    try { draw(); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function currentTrack() {
  return track;
}

