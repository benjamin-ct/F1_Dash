// Visuels des posts pour les réseaux sociaux (mode créateur), dessinés sur un canvas aux formats
// des réseaux : Instagram / Facebook (1080 × 1350), story (1080 × 1920), X / Threads / Bluesky
// (1600 × 900). Les textes des visuels sont en français (contenu publié).

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

// Diapositives selon la séance
export function slidesFor(d) {
  if (!d.rows.length) return [];
  if (d.kind === 'race') return ['vainqueur', 'podium', 'classement', 'faits', ...(d.champ ? ['championnat'] : [])];
  if (d.kind === 'quali') return ['pole', 'podium', 'classement', ...(d.facts.length ? ['faits'] : [])];
  return ['classement'];
}
export const SLIDE_NAMES = { vainqueur: 'Vainqueur', pole: 'Pole position', podium: 'Podium', classement: 'Classement', faits: 'Faits marquants', championnat: 'Championnat' };

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
  txt(ctx, o.signature || 'Paddock Live', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, color: C.text, spacing: 1 });
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
  } else if (d.kind === 'quali') {
    if (r[0].gap) items.push(['Temps', r[0].gap]);
    if (r[1]?.gap) items.push(['Sur P2', r[1].gap]);
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
  const f = frame(ctx, W, H, d, o, d.kind === 'quali' ? 'Top 3' : 'Podium');
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
    txt(ctx, i === 0 ? (d.kind === 'quali' ? p.gap : p.team) : p.gap || p.team, cx, tt + (land ? 132 : 150), { size: land ? 28 : 32, weight: 600, family: i === 0 && d.kind !== 'quali' ? BODY : MONO, color: C.muted, align: 'center', max: colW - 16 });
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
    const gx = d.kind === 'race' ? right - fs * 2.4 : right;
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

export function drawSlide(canvas, slide, fmt, d, o = {}) {
  const { w, h } = FORMATS[fmt];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (slide === 'vainqueur') hero(ctx, w, h, d, o, 'VAINQUEUR');
  else if (slide === 'pole') hero(ctx, w, h, d, o, 'POLE POSITION');
  else if (slide === 'podium') podium(ctx, w, h, d, o);
  else if (slide === 'classement') classement(ctx, w, h, d, o);
  else if (slide === 'faits') faits(ctx, w, h, d, o);
  else if (slide === 'championnat' && d.champ) championnat(ctx, w, h, d, o);
  return canvas;
}
