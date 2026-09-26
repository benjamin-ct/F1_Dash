// Carte du circuit : tracé, secteurs sous drapeau, voitures (GPS ou estimées), virages.
import { store, displayNow, f1Now } from '../store.js';
import { $, api, drivers, teamColor } from '../util.js';
import { loadTrack } from '../track.js';
import { parseUtc } from '/shared/f1.js';

const canvas = () => $('#mapCanvas');
let ctx = null;
let track = null;
let trackKey = null;
let xf = null;
let size = { w: 0, h: 0, dpr: 1 };
let lastFrame = performance.now();

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
  $('#mapEmpty').textContent = 'Chargement du tracé…';
  $('#mapEmpty').hidden = false;
  loadTrack(key, year).then((t) => {
    if (trackKey !== k) return;
    track = t;
    store.positions.setTrack(t);
    // Emplacement réel des boucles de chrono (calculé une fois par circuit par le serveur).
    api(`/api/loops?key=${key}&year=${year}`).then((l) => { if (trackKey === k) store.positions.setLoops(l); }).catch(() => {});
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
  const { flags, red } = sectorFlags();
  const scMode = ts === '4' || ts === '6' || ts === '7';

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
  ctx.strokeStyle = '#0c0f15';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = red ? '#ff3b30' : scMode ? '#ffb020' : '#3a4356';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = red ? '#ff6b61' : scMode ? '#ffd27a' : '#566079';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Secteurs sous drapeau jaune
  if (flags.size && track.marshal.length) {
    for (const r of track.marshalRanges()) {
      const f = flags.get(r.number);
      if (!f) continue;
      ctx.strokeStyle = f === 'DOUBLE YELLOW' ? '#ff9f1a' : '#f5c518';
      ctx.lineWidth = f === 'DOUBLE YELLOW' ? 12 : 10;
      strokeRange(r.from, r.to);
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

  // Numéros de virage
  if ($('#mapCorners').checked) {
    ctx.font = '600 10px "Titillium Web", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7d879a';
    for (const c of track.corners) {
      const a = (c.angle * Math.PI) / 180;
      const [x, y] = xf(c.x + Math.cos(a) * 520, c.y + Math.sin(a) * 520);
      ctx.fillText(String(c.number), x, y);
    }
  }

  drawCars(dt);
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
    ctx.strokeStyle = '#0a0c11';
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
      ctx.fillStyle = 'rgba(10,12,17,.78)';
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

export function initMap() {
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

