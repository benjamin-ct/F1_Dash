// Visuels des posts pour les réseaux sociaux (mode créateur), dessinés sur un canvas aux formats
// des réseaux : Instagram / Facebook (1080 × 1350), story (1080 × 1920), X / Threads / Bluesky
// (1600 × 900). Les textes des visuels sont en français (contenu publié).

import { teammateDuels, FLASH_KINDS, GRID_SOURCE } from './social-more.js';

export const FORMATS = {
  ig: { w: 1080, h: 1350, name: 'instagram' },
  story: { w: 1080, h: 1920, name: 'story' },
  x: { w: 1600, h: 900, name: 'x' },
};

const C = { bg: '#0b0d12', bg2: '#151a24', panel: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.10)', text: '#f3f5f9', muted: '#9aa3b2', red: '#e10600', gold: '#e8c35a', silver: '#c7ccd6', bronze: '#d08a4f', green: '#3ddc84' };
const TITLE = '"Saira Condensed", "Titillium Web", sans-serif';
const BODY = '"Titillium Web", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const MEDAL = [C.gold, C.silver, C.bronze];

// Diapositives selon la séance, après une couverture « Résultats » (anti-spoiler : le vainqueur
// n'est pas dévoilé dès la première image, ni dans l'aperçu du réseau)
export function slidesFor(d) {
  if (d.news) return ['news'];
  if (d.post === 'prerace') return ['couverture', 'grille', ...(d.weather || d.tyres ? ['meteo'] : [])];
  if (d.post === 'champ') return ['couverture', 'champpilotes', 'champecuries'];
  if (d.post === 'flash') return ['flash'];
  if (!d.rows.length) return [];
  let list = ['meilleurtemps', 'podium', 'classement', ...(d.facts.length ? ['faits'] : [])];
  const duels = teammateDuels(d).length >= 3 ? ['duels'] : [];
  if (d.kind === 'race') list = ['vainqueur', 'podium', 'classement', ...duels, 'faits', ...(d.champ ? ['championnat'] : [])];
  else if (d.kind === 'quali') list = ['pole', 'podium', 'classement', ...duels, ...(d.facts.length ? ['faits'] : [])];
  return ['couverture', ...list];
}
export const SLIDE_NAMES = { grille: 'Grille de départ', meteo: 'Météo et pneus', champpilotes: 'Championnat pilotes', champecuries: 'Championnat constructeurs', flash: 'Flash', duels: 'Duels entre coéquipiers', news: 'News', couverture: 'Couverture', vainqueur: 'Vainqueur', pole: 'Pole position', meilleurtemps: 'Meilleur temps', podium: 'Podium', classement: 'Classement', faits: 'Faits marquants', championnat: 'Championnat' };

// ---------- Outils de dessin ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}
function fit(ctx, text, max, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > max && s > 10);
  return s + 2;
}
function txt(ctx, text, x, y, { size = 32, weight = 400, family = BODY, color = C.text, align = 'left', max = 0, base = 'alphabetic', spacing = 0 } = {}) {
  const s = max ? fit(ctx, text, max, size, weight, family) : size;
  ctx.font = `${weight} ${s}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return s;
}
function wrap(ctx, text, x, y, maxW, lineH, maxLines, style) {
  ctx.font = `${style.weight || 400} ${style.size}px ${style.family || BODY}`;
  const words = String(text).split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) { txt(ctx, `${line}…`, x, y + n * lineH, style); return n + 1; }
      txt(ctx, line, x, y + n * lineH, style);
      n++;
      line = words[i];
    } else line = test;
  }
  if (line) { txt(ctx, line, x, y + n * lineH, style); n++; }
  return n;
}
const alpha = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(139,149,168,${a})`;
  const v = parseInt(m[1], 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
// Couleur d'écurie trop sombre sur le fond : éclaircie
function vivid(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#8b95a8';
  const v = parseInt(m[1], 16);
  let r = v >> 16; let g = (v >> 8) & 255; let b = v & 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (l < 70) { const k = 70 / Math.max(l, 1); r = Math.min(255, r * k + 40); g = Math.min(255, g * k + 40); b = Math.min(255, b * k + 40); }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function background(ctx, W, H, accent) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (accent) {
    const rg = ctx.createRadialGradient(W * 0.85, H * 0.2, 0, W * 0.85, H * 0.2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, alpha(accent, 0.28));
    rg.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // Fines lignes obliques (effet vitesse)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H * 0.45, 0); ctx.stroke(); }
  ctx.restore();
}

// En-tête : drapeau, Grand Prix, séance et date ; pied : signature
function frame(ctx, W, H, d, o, title) {
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(Math.min(W, H) * 0.085));
  let x = pad + 28;
  if (o.flag) {
    const fh = Math.round(Math.min(W, H) * 0.04);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, x, top + 4, fw, fh, 5); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, x, top + 4, fw, fh); ctx.restore();
    x += fw + 16;
  }
  const s1 = Math.round(Math.min(W, H) * 0.046);
  txt(ctx, d.gp.toUpperCase(), x, top + s1 * 0.95, { size: s1, weight: 800, family: TITLE, max: W - x - pad, spacing: 0.5 });
  const sub = [d.label, d.date, d.circuit].filter(Boolean).join('  ·  ').toUpperCase();
  txt(ctx, sub, pad + 28, top + s1 * 0.95 + Math.round(s1 * 0.85), { size: Math.round(s1 * 0.52), weight: 600, family: TITLE, color: C.muted, max: W - pad * 2 - 28, spacing: 1.5 });
  if (title) txt(ctx, title.toUpperCase(), W - pad, top + s1 * 0.95, { size: Math.round(s1 * 0.6), weight: 700, family: TITLE, color: C.red, align: 'right', spacing: 3 });
  // Pied
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, color: C.text, spacing: 1 });
  if (!d.final) txt(ctx, 'RÉSULTATS PROVISOIRES', W - pad, fy, { size: Math.round(Math.min(W, H) * 0.022), weight: 700, family: TITLE, color: C.gold, align: 'right', spacing: 2 });
  return { pad, top: top + Math.round(Math.min(W, H) * 0.14), bottom: fy - Math.round(Math.min(W, H) * 0.06) };
}

// Photo détourée posée en bas de la zone ; fade : bas fondu dans le décor
function photo(ctx, img, x, y, w, h, color, fade = 0) {
  if (!img) {
    rr(ctx, x, y, w, h, w * 0.06); ctx.fillStyle = alpha(color, 0.25); ctx.fill();
    return;
  }
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k; const dh = img.height * k;
  const dx = x + (w - dw) / 2; const dy = y + h - dh;
  if (!fade || typeof document === 'undefined') { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const off = document.createElement('canvas');
  off.width = Math.ceil(dw); off.height = Math.ceil(dh);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, dw, dh);
  o.globalCompositeOperation = 'destination-in';
  const g = o.createLinearGradient(0, dh * (1 - fade), 0, dh);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g; o.fillRect(0, 0, dw, dh);
  ctx.drawImage(off, dx, dy);
}

function circlePhoto(ctx, img, cx, cy, r, color, label) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = alpha(color, 0.35); ctx.fill();
  ctx.clip();
  if (img) {
    const k = (r * 2.2) / img.width;
    ctx.drawImage(img, cx - (img.width * k) / 2, cy - r * 0.92, img.width * k, img.height * k);
  } else if (label) {
    txt(ctx, label, cx, cy + r * 0.2, { size: Math.round(r * 0.6), weight: 800, family: TITLE, align: 'center' });
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(4, r * 0.06); ctx.strokeStyle = vivid(color); ctx.stroke();
}

// ---------- Diapositives ----------
function hero(ctx, W, H, d, o, word) {
  const w = d.rows[0];
  const col = vivid(w.color);
  background(ctx, W, H, w.color);
  const f = frame(ctx, W, H, d, o, '');
  const land = W > H;
  const img = o.photos?.[w.num];
  if (land) {
    photo(ctx, img, W * 0.52, f.top - 20, W * 0.44, f.bottom - f.top + 40, w.color, 0.25);
    const x = f.pad + 28;
    txt(ctx, word, x, f.top + 70, { size: 54, weight: 700, family: TITLE, color: C.red, spacing: 6 });
    txt(ctx, w.first, x, f.top + 170, { size: 60, weight: 600, family: BODY, max: W * 0.45 });
    txt(ctx, w.last.toUpperCase(), x, f.top + 320, { size: 170, weight: 800, family: TITLE, max: W * 0.46 });
    ctx.fillStyle = col; ctx.fillRect(x, f.top + 360, 12, 46);
    txt(ctx, w.team, x + 30, f.top + 398, { size: 42, weight: 600, family: BODY, color: C.text, max: W * 0.42 });
    stats(ctx, d, x, f.top + 450, W * 0.44, 3);
  } else {
    const ph = (f.bottom - f.top) * 0.58;
    photo(ctx, img, W * 0.12, f.top + 40, W * 0.76, ph, w.color, 0.3);
    let y = f.top + ph + 40;
    txt(ctx, word, f.pad, f.top + 50, { size: 50, weight: 700, family: TITLE, color: C.red, spacing: 6 });
    txt(ctx, w.first, f.pad, y + 20, { size: 54, weight: 600 });
    txt(ctx, w.last.toUpperCase(), f.pad, y + 165, { size: 160, weight: 800, family: TITLE, max: W - f.pad * 2 });
    y += 200;
    ctx.fillStyle = col; ctx.fillRect(f.pad, y, 12, 44);
    txt(ctx, w.team, f.pad + 30, y + 37, { size: 40, weight: 600, max: W - f.pad * 2 - 30 });
    stats(ctx, d, f.pad, y + (H > 1600 ? 130 : 100), W - f.pad * 2, 3);
  }
}

function stats(ctx, d, x, y, w, perRow) {
  const r = d.rows;
  const items = [];
  if (d.kind === 'race') {
    if (r[1]?.gap) items.push(['Avance', r[1].gap.replace(/^\+/, '')]);
    if (r[0].grid) items.push(['Départ', r[0].grid === 1 ? 'Pole' : `P${r[0].grid}`]);
    if (d.laps) items.push(['Tours', String(d.laps)]);
  } else {
    if (r[0].gap) items.push(['Temps', r[0].gap]);
    if (r[1]?.gap) items.push(['Sur P2', r[1].gap]);
    if (d.kind === 'practice' && r[0].laps) items.push(['Tours', String(r[0].laps)]);
  }
  const n = Math.min(items.length, perRow > 2 ? 3 : perRow === 1 ? 3 : 2);
  if (!n) return;
  const gap = 16;
  const cw = perRow === 1 ? w : (w - gap * (n - 1)) / n;
  items.slice(0, perRow === 1 ? 3 : n).forEach(([k, v], i) => {
    const cx = perRow === 1 ? x : x + i * (cw + gap);
    const cy = perRow === 1 ? y + i * 96 : y;
    rr(ctx, cx, cy, perRow === 1 ? Math.min(cw, 420) : cw, 84, 14); ctx.fillStyle = C.panel; ctx.fill();
    txt(ctx, k.toUpperCase(), cx + 22, cy + 32, { size: 22, weight: 700, family: TITLE, color: C.muted, spacing: 2 });
    txt(ctx, v, cx + 22, cy + 70, { size: 36, weight: 700, family: MONO, max: (perRow === 1 ? Math.min(cw, 420) : cw) - 44 });
  });
}

function podium(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0].color);
  const f = frame(ctx, W, H, d, o, d.kind === 'race' ? 'Podium' : 'Top 3');
  const top3 = d.rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top3[i]);
  const land = W > H;
  const colW = (W - f.pad * 2) / 3;
  const baseY = f.bottom - (land ? 10 : 40);
  const heights = land ? [230, 170, 130] : H > 1600 ? [640, 520, 420] : [380, 300, 240];
  const r = Math.min(land ? 95 : H > 1600 ? 170 : 125, colW * 0.42);
  order.forEach((i, k) => {
    const p = top3[i];
    const cx = f.pad + colW * k + colW / 2;
    const h = heights[i];
    const y0 = baseY - h;
    const g = ctx.createLinearGradient(0, y0, 0, baseY);
    g.addColorStop(0, alpha(p.color, 0.55)); g.addColorStop(1, alpha(p.color, 0.08));
    rr(ctx, cx - colW * 0.44, y0, colW * 0.88, h, 18); ctx.fillStyle = g; ctx.fill();
    txt(ctx, String(i + 1), cx, y0 + h * 0.5 + 40, { size: Math.round(h * 0.42), weight: 800, family: TITLE, color: MEDAL[i], align: 'center' });
    const tt = y0 - (land ? 150 : 172);
    const cy = tt - 18 - r;
    circlePhoto(ctx, o.photos?.[p.num], cx, cy, r, p.color, p.tla);
    txt(ctx, p.first, cx, tt + 40, { size: land ? 30 : 34, weight: 600, align: 'center', max: colW - 20 });
    txt(ctx, p.last.toUpperCase(), cx, tt + (land ? 90 : 100), { size: land ? 50 : 60, weight: 800, family: TITLE, align: 'center', max: colW - 16 });
    txt(ctx, i === 0 ? (d.kind !== 'race' ? p.gap || p.team : p.team) : p.gap || p.team, cx, tt + (land ? 132 : 150), { size: land ? 28 : 32, weight: 600, family: i === 0 && d.kind === 'race' ? BODY : MONO, color: C.muted, align: 'center', max: colW - 16 });
  });
}

function classement(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, d.kind === 'quali' ? 'Grille' : 'Classement');
  const rows = d.rows.slice(0, 22);
  const land = W > H;
  const cols = land ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * 40) / cols;
  const rowH = Math.min(land ? 62 : H > 1600 ? 76 : 48, (f.bottom - f.top + 20) / per);
  const fs = Math.round(rowH * 0.5);
  rows.forEach((r, i) => {
    const c = Math.floor(i / per);
    const x = f.pad + c * (colW + 40);
    const y = f.top - 10 + (i % per) * rowH;
    if (i % 2 === 0) { rr(ctx, x, y, colW, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
    const mid = y + rowH / 2 + fs * 0.34;
    txt(ctx, String(r.pos), x + 44, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x + 62, y + rowH * 0.2, 7, rowH * 0.56);
    txt(ctx, r.tla, x + 86, mid, { size: fs, weight: 800, family: TITLE, color: r.out ? C.muted : C.text });
    txt(ctx, r.last, x + 86 + fs * 2.6, mid, { size: Math.round(fs * 0.86), weight: 600, color: C.muted, max: colW * 0.36 });
    const right = x + colW - 18;
    if (d.kind === 'race' && r.points) {
      txt(ctx, `+${r.points}`, right, mid, { size: Math.round(fs * 0.8), weight: 700, family: TITLE, color: C.green, align: 'right' });
    }
    // Essais : nombre de tours de chaque pilote à droite, écart juste avant
    const laps = d.kind === 'practice' && d.rows.some((x) => x.laps);
    if (laps) txt(ctx, r.laps ? `${r.laps} tours` : '', right, mid, { size: Math.round(fs * 0.72), weight: 600, color: C.muted, align: 'right' });
    const gx = d.kind === 'race' ? right - fs * 2.4 : laps ? right - fs * 3.9 : right;
    txt(ctx, r.out ? 'ABANDON' : r.gap || (i === 0 && d.kind === 'race' ? 'VAINQUEUR' : ''), gx, mid, { size: Math.round(fs * 0.8), weight: 600, family: r.out || (i === 0 && d.kind === 'race') ? TITLE : MONO, color: r.out ? C.red : i === 0 ? C.gold : C.text, align: 'right' });
    if (d.kind === 'quali' && r.knockedOut) txt(ctx, `ÉLIMINÉ ${d.sprint ? 'SQ' : 'Q'}${r.koPart}`, x + colW * 0.6, mid, { size: Math.round(fs * 0.62), weight: 700, family: TITLE, color: C.red, spacing: 1 });
  });
}

function faits(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0].color);
  const f = frame(ctx, W, H, d, o, 'Faits marquants');
  const land = W > H;
  const cols = land ? 3 : 2;
  const items = d.facts.slice(0, land ? 6 : 6);
  const gap = 24;
  const cw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const rowsN = Math.ceil(items.length / cols);
  const textH = land ? 0 : H > 1600 ? 520 : 300;
  const ch = Math.min(land ? 290 : 300, (f.bottom - f.top - textH - gap * (rowsN - 1)) / Math.max(rowsN, 1));
  items.forEach((it, i) => {
    const x = f.pad + (i % cols) * (cw + gap);
    const y = f.top + Math.floor(i / cols) * (ch + gap);
    rr(ctx, x, y, cw, ch, 18); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = it.color ? vivid(it.color) : C.red; ctx.fillRect(x, y + 24, 8, 44);
    txt(ctx, it.label.toUpperCase(), x + 30, y + 58, { size: 26, weight: 700, family: TITLE, color: C.muted, spacing: 2, max: cw - 50 });
    txt(ctx, it.value, x + 30, y + ch * 0.55 + 20, { size: land ? 52 : 58, weight: 800, family: TITLE, max: cw - 50 });
    if (it.sub) wrap(ctx, it.sub, x + 30, y + ch * 0.55 + 70, cw - 56, 34, 2, { size: 27, weight: 600, color: C.muted });
  });
  if (!land && d.summary?.paragraphs?.length) {
    const y = f.top + rowsN * (ch + gap) + 30;
    const lines = Math.max(2, Math.floor((f.bottom - y) / 46));
    wrap(ctx, d.summary.paragraphs.slice(0, 3).join(' '), f.pad, y + 30, W - f.pad * 2, 46, lines, { size: 32, weight: 400, color: C.text });
  }
}

function championnat(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Championnat');
  const land = W > H;
  const drv = d.champ.drivers.slice(0, 10);
  const teams = d.champ.teams.slice(0, land ? 10 : 5);
  const list = (items, x, y, w, rowH, titleText, nameOf) => {
    txt(ctx, titleText, x, y, { size: 30, weight: 700, family: TITLE, color: C.red, spacing: 3 });
    const fs = Math.round(rowH * 0.48);
    items.forEach((r, i) => {
      const ry = y + 20 + i * rowH;
      if (i % 2 === 0) { rr(ctx, x, ry, w, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
      const mid = ry + rowH / 2 + fs * 0.34;
      txt(ctx, String(r.pos ?? ''), x + 40, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
      ctx.fillStyle = vivid(r.color); ctx.fillRect(x + 56, ry + rowH * 0.22, 6, rowH * 0.52);
      txt(ctx, nameOf(r), x + 78, mid, { size: fs, weight: 700, family: TITLE, max: w * 0.5 });
      if (r.move) txt(ctx, `${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}`, x + w * 0.66, mid, { size: Math.round(fs * 0.7), weight: 700, family: BODY, color: r.move > 0 ? C.green : C.red, align: 'right' });
      if (r.gained) txt(ctx, `+${r.gained}`, x + w * 0.8, mid, { size: Math.round(fs * 0.75), weight: 700, family: TITLE, color: C.green, align: 'right' });
      txt(ctx, `${r.points ?? ''} pts`, x + w - 16, mid, { size: Math.round(fs * 0.85), weight: 700, family: MONO, align: 'right' });
    });
  };
  if (land) {
    const w = (W - f.pad * 2 - 50) / 2;
    const rowH = Math.min(56, (f.bottom - f.top - 30) / 10);
    list(drv, f.pad, f.top + 10, w, rowH, 'PILOTES', (r) => r.last.toUpperCase());
    list(teams, f.pad + w + 50, f.top + 10, w, rowH, 'CONSTRUCTEURS', (r) => r.name.toUpperCase());
  } else {
    const avail = f.bottom - f.top - 120;
    const rowH = Math.min(H > 1600 ? 74 : 58, avail / (drv.length + teams.length));
    list(drv, f.pad, f.top + 10, W - f.pad * 2, rowH, 'PILOTES', (r) => r.last.toUpperCase());
    list(teams, f.pad, f.top + 10 + 20 + drv.length * rowH + 70, W - f.pad * 2, rowH, 'CONSTRUCTEURS', (r) => r.name.toUpperCase());
  }
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 20, { size: 22, weight: 600, color: C.muted, align: 'right' });
}

// Couverture du carrousel : Grand Prix, séance, date, circuit et sommaire des images suivantes
function cover(ctx, W, H, d, o, next, fmt) {
  background(ctx, W, H, C.red);
  const land = W > H;
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  // Damier fondu en haut à droite
  const sq = Math.round(46 * u);
  ctx.save();
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if ((i + j) % 2) continue;
      const a = 0.11 * (1 - (i + j) / 16);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fillRect(W - (i + 1) * sq, j * sq, sq, sq);
    }
  }
  ctx.restore();
  // En-tête : barre rouge, Formule 1 et saison
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'FORMULE 1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `SAISON ${d.year || ''}`.trim(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 3 });

  // Bloc central : drapeau, « Résultats », séance, nom du Grand Prix
  const colW = land ? W * 0.5 : W - pad * 2;
  const tall = H / W > 1.5;   // story : bloc et sommaire groupés au milieu
  let y = land ? H * 0.3 : tall ? H * 0.27 : H * 0.24;
  if (o.flag) {
    const fh = Math.round(66 * u);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, pad, y, fw, fh, 8); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, pad, y, fw, fh); ctx.restore();
    y += fh + 30 * u;
  }
  const word = d.post === 'prerace' ? 'AVANT-COURSE' : d.post === 'champ' ? 'CHAMPIONNAT' : 'RÉSULTATS';
  txt(ctx, word, pad, y + 150 * u, { size: Math.round(190 * u), weight: 800, family: TITLE, max: colW, spacing: 2 });
  y += 190 * u;
  // Séance dans une étiquette rouge
  const tag = (d.post === 'prerace' ? (d.sprint ? 'Sprint' : 'Course') : d.post === 'champ' ? (d.final ? 'Après la course' : 'En direct') : d.kind === 'race' && !d.sprint ? 'Course' : d.label).toUpperCase();
  ctx.font = `700 ${Math.round(36 * u)}px ${TITLE}`;
  const tw = ctx.measureText(tag).width + 6 * tag.length * u;
  rr(ctx, pad, y, tw + 48 * u, 62 * u, 8 * u); ctx.fillStyle = C.red; ctx.fill();
  txt(ctx, tag, pad + 24 * u, y + 44 * u, { size: Math.round(36 * u), weight: 700, family: TITLE, spacing: 6 * u });
  y += 62 * u + 70 * u;
  const lines = wrap(ctx, d.gp.toUpperCase(), pad, y + 20 * u, colW, 92 * u, 2, { size: Math.round(92 * u), weight: 800, family: TITLE });
  y += (lines - 1) * 92 * u + 80 * u;
  const info = [d.date, d.circuit, d.kind === 'race' && d.laps ? `${d.laps} tours` : ''].filter(Boolean).join('  ·  ').toUpperCase();
  if (info) txt(ctx, info, pad, y, { size: Math.round(30 * u), weight: 600, family: TITLE, color: C.muted, max: colW, spacing: 2 });

  // Sommaire des images suivantes
  const items = next.map((s, i) => [String(i + 2).padStart(2, '0'), SLIDE_NAMES[s] || s]);
  const sx = land ? W * 0.62 : pad;
  const end = H - Math.round(Math.min(W, H) * 0.13);   // au-dessus du pied
  let sy = land ? H * 0.3 : tall ? y + 120 * u : Math.max(y + 80 * u, end - items.length * 52 * u - 40 * u);
  const lh = Math.min(52 * u, (end - sy - 22 * u) / Math.max(items.length, 1));
  txt(ctx, 'AU PROGRAMME', sx, sy, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.red, spacing: 4 });
  sy += 22 * u;
  ctx.fillStyle = C.line; ctx.fillRect(sx, sy, (land ? W - sx - pad : W * 0.5), 2);
  for (const [n, name] of items) {
    sy += lh;
    txt(ctx, n, sx, sy, { size: Math.round(30 * u), weight: 700, family: MONO, color: C.muted });
    txt(ctx, name.toUpperCase(), sx + 70 * u, sy, { size: Math.round(36 * u), weight: 700, family: TITLE, spacing: 1 });
  }

  // Pied : signature, « faites défiler », résultats provisoires
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, spacing: 1 });
  // Carrousel : on fait défiler ; story, vidéo et X : la suite vient après
  const hint = fmt === 'ig' ? 'FAITES DÉFILER' : 'À SUIVRE';
  const swipe = d.final ? hint : `RÉSULTATS PROVISOIRES · ${hint}`;
  const ax = W - pad;
  const ay = fy - Math.round(Math.min(W, H) * 0.009);
  ctx.save();
  ctx.strokeStyle = C.red; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of [0, 1]) {
    const cx = ax - k * 18 * u;
    ctx.beginPath(); ctx.moveTo(cx - 14 * u, ay - 13 * u); ctx.lineTo(cx, ay); ctx.lineTo(cx - 14 * u, ay + 13 * u); ctx.stroke();
  }
  ctx.restore();
  txt(ctx, swipe, ax - 52 * u, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: d.final ? C.text : C.gold, align: 'right', spacing: 2 });
}

// ---------- News (transfert, pénalité, annonce…) ----------
// Lignes d'un texte coupé à la largeur, au plus grand corps qui tient en maxLines lignes
function fitLines(ctx, text, maxW, sizes, maxLines, family, weight) {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${family}`;
    const out = [];
    let line = '';
    for (const w of String(text).split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    if (out.length <= maxLines || size === sizes[sizes.length - 1]) {
      if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = `${out[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
      return { size, lines: out };
    }
  }
  return { size: sizes[0], lines: [] };
}
const lightColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) > 150;
};

function newsSlide(ctx, W, H, d, o) {
  background(ctx, W, H, d.color);
  const land = W > H;
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  // En-tête : Actu F1 et date
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'ACTU F1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, d.date.toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const bottom = fy - Math.round(Math.min(W, H) * 0.07);

  // Photos des pilotes cités : une grande, ou une rangée de ronds
  const withPhoto = d.drivers.filter((p) => o.photos?.[p.num]);
  const x = pad;
  let colW = W - pad * 2;
  let areaTop = top + 110 * u;
  let centered = false;
  if (land) {
    colW = W * 0.54;
    if (withPhoto.length === 1) photo(ctx, o.photos[withPhoto[0].num], W * 0.6, top + 40 * u, W * 0.36, bottom - top - 20 * u, withPhoto[0].color, 0.25);
    else if (d.drivers.length) d.drivers.forEach((p, i) => circlePhoto(ctx, o.photos?.[p.num], W * 0.79, top + (130 + i * 230) * u + (3 - d.drivers.length) * 115 * u, 100 * u, p.color, p.tla));
    centered = true;
  } else if (withPhoto.length === 1) {
    const ph = (bottom - areaTop) * (H > 1600 ? 0.42 : 0.38);
    photo(ctx, o.photos[withPhoto[0].num], W * 0.18, areaTop, W * 0.64, ph, withPhoto[0].color, 0.3);
    areaTop += ph + 30 * u;
  } else if (d.drivers.length) {
    const r = Math.round(100 * u);
    d.drivers.forEach((p, i) => circlePhoto(ctx, o.photos?.[p.num], pad + r + i * (r * 2 + 40 * u), areaTop + r + 10 * u, r, p.color, p.tla));
    areaTop += r * 2 + 60 * u;
  } else centered = true;

  // Mise en page du texte : le plus grand titre qui laisse au moins 2 lignes de résumé
  const sumSize = Math.round((land ? 30 : 34) * u);
  const sumLh = Math.round(sumSize * 1.38);
  const sumAll = d.summary ? fitLines(ctx, d.summary, colW, [sumSize], 99, BODY, 400).lines : [];
  const maxSum = H > 1600 ? 9 : land ? 5 : 6;
  const fixed = (58 + 40 + 34 + 30) * u;
  const avail = bottom - areaTop;
  const maxTitle = land ? 4 : H > 1600 ? 6 : 5;
  let pick = null;
  for (const size of [104, 96, 88, 80, 72, 66, 60, 54, 48].map((v) => Math.round(v * u))) {
    const t = fitLines(ctx, d.title.toUpperCase(), colW, [size], 99, TITLE, 800);
    if (t.lines.length > maxTitle) continue;
    const titleH = t.lines.length * Math.round(size * 0.98);
    const sumN = Math.min(sumAll.length, maxSum, Math.floor((avail - fixed - titleH) / sumLh));
    pick = { size, lines: t.lines, sumN: Math.max(0, sumN) };
    if (sumN >= Math.min(2, sumAll.length)) break;
  }
  if (!pick) {
    const size = Math.round(48 * u);
    pick = { size, lines: fitLines(ctx, d.title.toUpperCase(), colW, [size], maxTitle, TITLE, 800).lines, sumN: 0 };
  }
  const lh = Math.round(pick.size * 0.98);
  const blockH = fixed + pick.lines.length * lh + pick.sumN * sumLh;
  let y = centered ? areaTop + Math.max(0, (avail - blockH) / 2.2) : areaTop;

  // Étiquette du type de nouvelle
  const tag = d.badge.label;
  ctx.font = `700 ${Math.round(34 * u)}px ${TITLE}`;
  const tw = ctx.measureText(tag).width + 6 * tag.length * u;
  rr(ctx, x, y, tw + 44 * u, 58 * u, 8 * u); ctx.fillStyle = d.badge.color; ctx.fill();
  txt(ctx, tag, x + 22 * u, y + 41 * u, { size: Math.round(34 * u), weight: 700, family: TITLE, color: lightColor(d.badge.color) ? C.bg : '#fff', spacing: 6 * u });
  y += (58 + 40) * u;
  pick.lines.forEach((l, i) => txt(ctx, l, x, y + pick.size * 0.82 + i * lh, { size: pick.size, weight: 800, family: TITLE }));
  y += pick.lines.length * lh + 34 * u;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(x, y - 10 * u, 90 * u, 6 * u);
  y += 30 * u;
  const sum = sumAll.slice(0, pick.sumN);
  if (sum.length && sum.length < sumAll.length) sum[sum.length - 1] = `${sum[sum.length - 1].replace(/\s+\S*$/, '')}…`;
  sum.forEach((l, i) => txt(ctx, l, x, y + sumSize * 0.8 + i * sumLh, { size: sumSize, weight: 400, color: C.text }));

  // Pied : signature et source
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, spacing: 1 });
  if (d.source) txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.022), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.55 });
}

// ---------- Grille de départ (deux colonnes décalées, comme sur la piste) ----------
function grille(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, d.sprint ? 'Grille du sprint' : 'Grille de départ');
  const rows = d.rows.slice(0, 22);
  const land = W > H;
  // Notes sous la grille : source, puis pénalités et départs des stands
  const pens = rows.filter((r) => r.penalty);
  const noteSize = land ? 20 : 22;
  const notes = [GRID_SOURCE[d.gridSource] || '', ...pens.slice(0, land ? 3 : 5).map((r) => `* ${r.tla} : ${r.penalty}`)].filter(Boolean);
  if (pens.length > (land ? 3 : 5)) notes.push(`* … et ${pens.length - (land ? 3 : 5)} autre${pens.length - (land ? 3 : 5) > 1 ? 's' : ''}`);
  const noteH = notes.length * (noteSize + 8) + 14;
  const groups = land ? 2 : 1;
  const per = Math.ceil(rows.length / groups);
  const lines = Math.ceil(per / 2);
  const gw = (W - f.pad * 2 - (groups - 1) * 50) / groups;
  const cw = (gw - 24) / 2;
  const rowH = (f.bottom - noteH - f.top + 10) / (lines + 0.5);
  const fs = Math.round(Math.min(rowH * 0.36, land ? 34 : 40));
  rows.forEach((r, i) => {
    const g = Math.floor(i / per);
    const k = i % per;
    const col = k % 2;
    const x = f.pad + g * (gw + 50) + col * (cw + 24);
    const y = f.top - 6 + Math.floor(k / 2) * rowH + (col ? rowH * 0.5 : 0);
    const h = rowH * 0.86;
    rr(ctx, x, y, cw, h, 10); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y, 8, h);
    const mid = y + h / 2 + fs * 0.35;
    txt(ctx, r.pitlane ? 'PL' : String(r.pos), x + 24, mid, { size: Math.round(fs * (r.pitlane ? 0.9 : 1.2)), weight: 800, family: TITLE, color: r.pitlane ? C.red : r.pos <= 3 ? MEDAL[r.pos - 1] : C.text });
    txt(ctx, `${r.tla}${r.penalty ? '*' : ''}`, x + 24 + fs * 1.6, mid, { size: fs, weight: 800, family: TITLE, color: r.penalty ? C.gold : C.text });
    txt(ctx, r.pitlane ? 'Départ des stands' : r.last, x + 24 + fs * 3.6, mid, { size: Math.round(fs * 0.78), weight: 600, color: r.pitlane ? C.red : C.muted, max: cw - fs * 3.6 - 34 });
  });
  notes.forEach((n, i) => txt(ctx, n, f.pad, f.bottom - noteH + 14 + noteSize + i * (noteSize + 8), { size: noteSize, weight: i ? 400 : 700, family: i ? undefined : TITLE, color: i ? C.text : C.muted, spacing: i ? 0 : 1.5, max: W - f.pad * 2 }));
}

// ---------- Météo et pneus Pirelli ----------
function meteo(ctx, W, H, d, o) {
  background(ctx, W, H, '#2b5fd9');
  const f = frame(ctx, W, H, d, o, 'Météo et pneus');
  const land = W > H;
  const w = d.weather;
  const tiles = w ? [['Air', `${w.air == null ? '—' : String(Math.round(w.air))} °C`], ['Piste', `${w.track == null ? '—' : String(Math.round(w.track))} °C`], ['Humidité', `${w.humidity == null ? '—' : String(Math.round(w.humidity))} %`], ['Vent', `${w.wind == null ? '—' : String(Math.round(w.wind * 3.6))} km/h`], ['Pluie', w.rain ? 'Oui' : 'Non']] : [];
  const cols = land ? 5 : 2;
  const gap = 20;
  const tw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const th = land ? 170 : 180;
  tiles.forEach(([k, v], i) => {
    const x = f.pad + (i % cols) * (tw + gap);
    const y = f.top + Math.floor(i / cols) * (th + gap);
    rr(ctx, x, y, tw, th, 16); ctx.fillStyle = C.panel; ctx.fill();
    txt(ctx, k.toUpperCase(), x + 26, y + 50, { size: 26, weight: 700, family: TITLE, color: C.muted, spacing: 2 });
    txt(ctx, v, x + 26, y + th - 36, { size: land ? 54 : 64, weight: 800, family: TITLE, max: tw - 40, color: k === 'Pluie' && w.rain ? '#4fc3f7' : C.text });
  });
  if (!d.tyres) return;
  const rowsT = Math.ceil(tiles.length / cols);
  const y0 = tiles.length ? f.top + rowsT * (th + gap) + (land ? 40 : 70) : f.top + 40;
  txt(ctx, 'PNEUS PIRELLI DU WEEK-END', f.pad, y0, { size: 30, weight: 700, family: TITLE, color: C.red, spacing: 3 });
  const tyres = [['Durs', d.tyres.hard, '#f2f2f2'], ['Médiums', d.tyres.medium, '#f5c518'], ['Tendres', d.tyres.soft, '#e10600']];
  const r = Math.min(land ? 95 : 120, (f.bottom - y0 - 120) / 2, (W - f.pad * 2) / 7);
  tyres.forEach(([name, c, color], i) => {
    const cx = f.pad + r + 10 + i * ((W - f.pad * 2 - 2 * r - 20) / 2);
    const cy = y0 + 40 + r;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#16181d'; ctx.fill();
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    txt(ctx, `C${c}`, cx, cy + r * 0.2, { size: Math.round(r * 0.5), weight: 800, family: TITLE, align: 'center' });
    txt(ctx, name.toUpperCase(), cx, cy + r + 50, { size: 30, weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2 });
  });
}

// ---------- Championnat (pilotes, constructeurs) ----------
function standings(ctx, W, H, d, o, title, rows) {
  background(ctx, W, H, rows[0]?.color);
  const f = frame(ctx, W, H, d, o, title);
  const land = W > H;
  const list = rows.slice(0, 22);
  const cols = land && list.length > 12 ? 2 : 1;
  const per = Math.ceil(list.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * 40) / cols;
  const rowH = Math.min(land ? 62 : list.length <= 12 ? (H > 1600 ? 120 : 88) : H > 1600 ? 80 : 54, (f.bottom - f.top - 24) / per);
  const fs = Math.round(rowH * 0.5);
  list.forEach((r, i) => {
    const x = f.pad + Math.floor(i / per) * (colW + 40);
    const y = f.top - 10 + (i % per) * rowH;
    if (i % 2 === 0) { rr(ctx, x, y, colW, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
    const mid = y + rowH / 2 + fs * 0.34;
    txt(ctx, String(r.pos), x + 44, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x + 62, y + rowH * 0.2, 7, rowH * 0.56);
    txt(ctx, r.label, x + 86, mid, { size: fs, weight: 800, family: TITLE, max: colW * 0.5 });
    const right = x + colW - 18;
    txt(ctx, `${r.points} pts`, right, mid, { size: Math.round(fs * 0.86), weight: 700, family: MONO, align: 'right' });
    if (r.gained) txt(ctx, `+${r.gained}`, right - fs * 4.4, mid, { size: Math.round(fs * 0.76), weight: 700, family: TITLE, color: C.green, align: 'right' });
    if (r.move) txt(ctx, r.move > 0 ? `▲${r.move}` : `▼${-r.move}`, right - fs * 6.6, mid, { size: Math.round(fs * 0.7), weight: 700, family: TITLE, color: r.move > 0 ? C.green : C.red, align: 'right' });
  });
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 6, { size: 22, weight: 600, color: C.muted, align: 'right' });
}

// ---------- Duels entre coéquipiers ----------
function duels(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Duels');
  const list = teammateDuels(d).slice(0, 12);
  const land = W > H;
  const cols = land ? 3 : 2;
  const gap = 18;
  const cw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const rowsN = Math.ceil(list.length / cols);
  const ch = Math.min(land ? 150 : H > 1600 ? 230 : 170, (f.bottom - f.top - gap * (rowsN - 1)) / rowsN);
  list.forEach((t, i) => {
    const x = f.pad + (i % cols) * (cw + gap);
    const y = f.top + Math.floor(i / cols) * (ch + gap);
    rr(ctx, x, y, cw, ch, 14); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = vivid(t.color); ctx.fillRect(x, y + 14, 8, ch - 28);
    txt(ctx, t.team.toUpperCase(), x + 26, y + ch * 0.27, { size: Math.round(ch * 0.15), weight: 700, family: TITLE, color: C.muted, spacing: 1.5, max: cw - 46 });
    const s = Math.round(ch * 0.3);
    txt(ctx, t.ahead.tla, x + 26, y + ch * 0.68, { size: s, weight: 800, family: TITLE });
    txt(ctx, `P${t.ahead.pos}`, x + 26, y + ch * 0.9, { size: Math.round(s * 0.5), weight: 700, family: MONO, color: C.gold });
    txt(ctx, 'devant', x + cw / 2, y + ch * 0.64, { size: Math.round(s * 0.45), weight: 600, color: C.muted, align: 'center' });
    txt(ctx, t.behind.tla, x + cw - 22, y + ch * 0.68, { size: s, weight: 800, family: TITLE, color: C.muted, align: 'right' });
    txt(ctx, t.behind.out ? 'ABANDON' : `P${t.behind.pos}`, x + cw - 22, y + ch * 0.9, { size: Math.round(s * 0.5), weight: 700, family: t.behind.out ? TITLE : MONO, color: t.behind.out ? C.red : C.muted, align: 'right' });
  });
}

// ---------- Flash : drapeau rouge, voiture de sécurité, abandon, pénalité ----------
function flash(ctx, W, H, d, o) {
  const ev = d.event;
  const k = FLASH_KINDS[ev.kind] || { label: 'FLASH', color: C.red };
  background(ctx, W, H, k.color);
  const land = W > H;
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'EN DIRECT', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `${d.gp} · ${d.label}`.toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2, max: W - pad * 2 - 40 });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const bottom = fy - Math.round(Math.min(W, H) * 0.07);
  const img = ev.driver ? o.photos?.[ev.driver.num] : null;
  let y = top + 140 * u;
  const colW = land && img ? W * 0.55 : W - pad * 2;
  if (img) {
    if (land) photo(ctx, img, W * 0.6, top + 40 * u, W * 0.36, bottom - top - 20 * u, ev.driver.color, 0.25);
    else { const ph = Math.min((bottom - y) * 0.5, bottom - y - 440 * u); y += Math.max(0, (bottom - y - ph - 440 * u) / 2); photo(ctx, img, W * 0.18, y, W * 0.64, ph, ev.driver.color, 0.3); y += ph + 40 * u; }
  } else y = (top + bottom) / 2 - 190 * u;   // sans photo : bloc centré
  // Bandeau du type d'évènement
  const label = fitLines(ctx, k.label, colW, [130, 116, 104, 92, 80, 70].map((v) => Math.round(v * u)), 2, TITLE, 800);
  label.lines.forEach((l, i) => {
    const ly = y + i * label.size * 1.02;
    ctx.font = `800 ${label.size}px ${TITLE}`;
    const lw = ctx.measureText(l).width;
    rr(ctx, pad - 10 * u, ly, lw + 40 * u, label.size * 0.98, 10 * u); ctx.fillStyle = k.color; ctx.fill();
    txt(ctx, l, pad + 10 * u, ly + label.size * 0.83, { size: label.size, weight: 800, family: TITLE, color: ev.kind === 'sc' || ev.kind === 'vsc' || ev.kind === 'penalty' ? C.bg : '#fff' });
  });
  y += label.lines.length * label.size * 1.02 + 50 * u;
  const t = fitLines(ctx, ev.title, colW, [72, 64, 56, 50, 44].map((v) => Math.round(v * u)), 3, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad, y + t.size * 0.85 + i * t.size, { size: t.size, weight: 800, family: TITLE }));
  y += t.lines.length * t.size + 30 * u;
  if (ev.sub) wrap(ctx, ev.sub.charAt(0).toUpperCase() + ev.sub.slice(1), pad, y + 34 * u, colW, 46 * u, 3, { size: Math.round(36 * u), weight: 400, color: C.text });
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, spacing: 1 });
  if (ev.lap) txt(ctx, `TOUR ${ev.lap}${d.laps ? ` / ${d.laps}` : ''}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}

export function drawSlide(canvas, slide, fmt, d, o = {}) {
  const { w, h } = FORMATS[fmt];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // X : 4 images au plus par post, le sommaire n'annonce que celles publiées
  if (slide === 'news') newsSlide(ctx, w, h, d, o);
  else if (slide === 'grille') grille(ctx, w, h, d, o);
  else if (slide === 'meteo') meteo(ctx, w, h, d, o);
  else if (slide === 'champpilotes') standings(ctx, w, h, d, o, 'Pilotes', d.champ.drivers.map((r) => ({ ...r, label: r.last.toUpperCase() })));
  else if (slide === 'champecuries') standings(ctx, w, h, d, o, 'Constructeurs', d.champ.teams.map((r) => ({ ...r, label: r.name.toUpperCase() })));
  else if (slide === 'duels') duels(ctx, w, h, d, o);
  else if (slide === 'flash') flash(ctx, w, h, d, o);
  else if (slide === 'couverture') cover(ctx, w, h, d, o, slidesFor(d).slice(1, fmt === 'x' ? 4 : undefined), fmt);
  else if (slide === 'vainqueur') hero(ctx, w, h, d, o, 'VAINQUEUR');
  else if (slide === 'pole') hero(ctx, w, h, d, o, 'POLE POSITION');
  else if (slide === 'meilleurtemps') hero(ctx, w, h, d, o, 'MEILLEUR TEMPS');
  else if (slide === 'podium') podium(ctx, w, h, d, o);
  else if (slide === 'classement') classement(ctx, w, h, d, o);
  else if (slide === 'faits') faits(ctx, w, h, d, o);
  else if (slide === 'championnat' && d.champ) championnat(ctx, w, h, d, o);
  return canvas;
}
