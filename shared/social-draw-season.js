// Visuels des posts de saison (mode créateur) : horaires du week-end, pneus et météo, records du
// circuit, notes des pilotes, duels entre coéquipiers, positions tour par tour, récap de la semaine,
// et images de la vidéo animée de la course. Mêmes outils de dessin que les autres posts.
import { C, TITLE, BODY, MONO, MEDAL, rr, txt, fitLines, vivid, background, frame, newsSlide } from './social-draw.js';
import { lapStr } from './social-season.js';

const dec = (v, n = 1) => (v == null ? '—' : Number(v).toFixed(n).replace('.', ','));
const TYRE = { hard: ['DURS', '#f3f5f9'], medium: ['MÉDIUMS', '#f5c518'], soft: ['TENDRES', '#e10600'] };

function panel(ctx, x, y, w, h, r = 18) { rr(ctx, x, y, w, h, r); ctx.fillStyle = C.panel; ctx.fill(); }
const note = (ctx, W, f, text) => txt(ctx, text, W - f.pad, f.bottom + 6, { size: 22, weight: 600, color: C.muted, align: 'right' });

// ---------- Programme : horaires (heure de Paris), groupés par jour ----------
export function horaires(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const f = frame(ctx, W, H, d, o, 'Horaires');
  const land = W > H;
  const days = [];
  for (const s of d.sessions) { const k = s.dayNum; let g = days.find((x) => x.k === k); if (!g) days.push(g = { k, day: s.day, list: [] }); g.list.push(s); }
  if (land) {
    const cw = (W - f.pad * 2 - 30 * (days.length - 1)) / Math.max(1, days.length);
    days.forEach((g, i) => {
      const x = f.pad + i * (cw + 30);
      panel(ctx, x, f.top, cw, f.bottom - f.top);
      txt(ctx, g.day.toUpperCase(), x + 28, f.top + 58, { size: 40, weight: 800, family: TITLE, spacing: 2 });
      txt(ctx, g.k.toUpperCase(), x + 28, f.top + 94, { size: 24, weight: 600, family: TITLE, color: C.muted, spacing: 2 });
      g.list.forEach((s, j) => {
        const y = f.top + 170 + j * 130;
        txt(ctx, s.time, x + 28, y, { size: 64, weight: 700, family: MONO, color: s.main ? C.text : C.muted });
        txt(ctx, s.label.toUpperCase(), x + 28, y + 44, { size: 28, weight: 700, family: TITLE, color: s.main ? C.red : C.muted, spacing: 1, max: cw - 56 });
      });
    });
  } else {
    const rows = d.sessions.length + days.length;
    const unit = Math.min(H > 1600 ? 150 : 112, (f.bottom - f.top - 20) / Math.max(rows, 1));
    let y = f.top + 10;
    for (const g of days) {
      txt(ctx, `${g.day} ${g.k}`.toUpperCase(), f.pad, y + unit * 0.62, { size: Math.round(unit * 0.32), weight: 800, family: TITLE, color: C.red, spacing: 3 });
      ctx.fillStyle = C.line; ctx.fillRect(f.pad, y + unit * 0.8, W - f.pad * 2, 2);
      y += unit;
      for (const s of g.list) {
        if (s.main) { panel(ctx, f.pad, y + 6, W - f.pad * 2, unit - 12, 14); ctx.fillStyle = C.red; ctx.fillRect(f.pad, y + unit * 0.2, 8, unit * 0.6); }
        txt(ctx, s.time, f.pad + 34, y + unit * 0.64, { size: Math.round(unit * 0.44), weight: 700, family: MONO, color: s.main ? C.text : C.muted });
        txt(ctx, s.label.toUpperCase(), f.pad + 34 + unit * 1.75, y + unit * 0.62, { size: Math.round(unit * 0.36), weight: s.main ? 800 : 700, family: TITLE, color: s.main ? C.text : C.muted, spacing: 1, max: W - f.pad * 2 - unit * 2.2 });
        y += unit;
      }
    }
  }
  note(ctx, W, f, 'Heures de Paris');
}

// ---------- Programme : pneus Pirelli et météo prévue ----------
export function infos(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Pneus et météo');
  const land = W > H;
  const blocks = [d.tyres && 'tyres', d.forecast?.length && 'meteo'].filter(Boolean);
  const gap = 30;
  const bw = land ? (W - f.pad * 2 - gap * (blocks.length - 1)) / blocks.length : W - f.pad * 2;
  const full = land ? f.bottom - f.top : (f.bottom - f.top - gap * (blocks.length - 1)) / blocks.length;
  const bh = Math.min(full, land ? 620 : 600);
  const y0 = f.top + (land ? (full - bh) / 2 : (f.bottom - f.top - blocks.length * bh - gap * (blocks.length - 1)) / 2);
  blocks.forEach((b, i) => {
    const x = land ? f.pad + i * (bw + gap) : f.pad;
    const y = land ? y0 : y0 + i * (bh + gap);
    panel(ctx, x, y, bw, bh);
    txt(ctx, b === 'tyres' ? 'PNEUS PIRELLI' : 'MÉTÉO PRÉVUE', x + 30, y + 56, { size: 30, weight: 800, family: TITLE, color: C.muted, spacing: 3 });
    if (b === 'tyres') {
      const r = Math.min(bw / 9, (bh - 150) / 2.8, 110);
      ['hard', 'medium', 'soft'].forEach((k, j) => {
        const cx = x + bw * (j + 0.5) / 3;
        const cy = y + 90 + (bh - 90) * 0.45;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#1c2230'; ctx.fill();
        ctx.lineWidth = r * 0.22; ctx.strokeStyle = TYRE[k][1]; ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke();
        txt(ctx, `C${d.tyres[k]}`, cx, cy + r * 0.2, { size: Math.round(r * 0.62), weight: 800, family: TITLE, align: 'center' });
        txt(ctx, TYRE[k][0], cx, cy + r + 54, { size: Math.round(Math.min(34, r * 0.4)), weight: 700, family: TITLE, color: TYRE[k][1], align: 'center', spacing: 2 });
      });
    } else {
      const list = d.forecast.slice(-3);
      const cw = (bw - 60) / list.length;
      list.forEach((w, j) => {
        const cx = x + 30 + cw * (j + 0.5);
        const top = y + 110;
        txt(ctx, w.day.toUpperCase(), cx, top + 30, { size: 30, weight: 800, family: TITLE, align: 'center', spacing: 2 });
        txt(ctx, `${Math.round(w.tmax)}°`, cx, top + 30 + Math.min(150, bh * 0.36), { size: Math.round(Math.min(110, bh * 0.28)), weight: 800, family: TITLE, align: 'center' });
        txt(ctx, `min ${Math.round(w.tmin)}°`, cx, top + 70 + Math.min(150, bh * 0.36), { size: 28, weight: 600, color: C.muted, align: 'center' });
        const rain = Math.round(w.rain ?? 0);
        txt(ctx, `PLUIE ${rain} %`, cx, top + 120 + Math.min(150, bh * 0.36), { size: 30, weight: 800, family: TITLE, color: rain >= 50 ? '#4aa3ff' : rain >= 20 ? C.gold : C.green, align: 'center', spacing: 1 });
      });
    }
  });
  if (d.forecast?.length) note(ctx, W, f, 'Prévisions Open-Meteo, susceptibles d\'évoluer');
}

// ---------- Le saviez-vous : éditions précédentes ----------
export function editions(ctx, W, H, d, o) {
  background(ctx, W, H, d.bestPole?.color);
  const f = frame(ctx, W, H, d, o, 'Éditions précédentes');
  const list = d.editions.slice(0, 5);
  const head = 70;
  const rowH = Math.min(H > W ? 170 : 120, (f.bottom - f.top - head) / Math.max(1, list.length));
  const cols = [f.pad + 20, f.pad + (W - f.pad * 2) * 0.2, f.pad + (W - f.pad * 2) * 0.6];
  txt(ctx, 'ANNÉE', cols[0], f.top + 30, { size: 24, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  txt(ctx, 'POLE POSITION', cols[1], f.top + 30, { size: 24, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  txt(ctx, 'MEILLEUR TOUR EN COURSE', cols[2], f.top + 30, { size: 24, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  const cell = (x, y, p, best) => {
    if (!p) { txt(ctx, '—', x, y, { size: 40, weight: 700, family: TITLE, color: C.muted }); return; }
    ctx.fillStyle = vivid(p.color); ctx.fillRect(x, y - rowH * 0.36, 6, rowH * 0.5);
    txt(ctx, p.name.toUpperCase(), x + 22, y - rowH * 0.06, { size: Math.round(rowH * 0.26), weight: 800, family: TITLE, max: (W - f.pad * 2) * 0.36 });
    txt(ctx, lapStr(p.time), x + 22, y + rowH * 0.22, { size: Math.round(rowH * 0.22), weight: 700, family: MONO, color: best ? C.gold : C.muted });
  };
  list.forEach((e, i) => {
    const y = f.top + head + i * rowH;
    if (i % 2 === 0) panel(ctx, f.pad, y, W - f.pad * 2, rowH - 8, 12);
    const mid = y + rowH / 2;
    txt(ctx, String(e.year), cols[0], mid + rowH * 0.12, { size: Math.round(rowH * 0.34), weight: 800, family: TITLE });
    cell(cols[1], mid, e.pole, e.pole && d.bestPole && e.year === d.bestPole.year);
    cell(cols[2], mid, e.fastest, e.fastest && d.bestRaceLap && e.year === d.bestRaceLap.year);
  });
  note(ctx, W, f, 'En doré : record du circuit sur ces éditions');
}

// ---------- Notes des pilotes ----------
const noteColor = (n) => (n >= 8 ? C.green : n >= 6.5 ? C.gold : n >= 5 ? '#f39c4a' : C.red);
export function topflop(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Tops et flops');
  const land = W > H;
  const top = d.rows.slice(0, 3);
  const flop = d.rows.slice(-3).reverse();
  const card = (r, x, y, w, h, big) => {
    panel(ctx, x, y, w, h);
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y + h * 0.18, 8, h * 0.64);
    const ns = Math.round(h * (big ? 0.5 : 0.46));
    txt(ctx, dec(r.note), x + w - 30, y + h * 0.5 + ns * 0.36, { size: ns, weight: 800, family: TITLE, color: noteColor(r.note), align: 'right' });
    txt(ctx, r.last.toUpperCase(), x + 32, y + h * 0.46, { size: Math.round(h * (big ? 0.26 : 0.3)), weight: 800, family: TITLE, max: w - ns * 2.4 });
    const sub = `${r.team} · ${r.classified ? `P${r.pos}` : 'Abandon'}${r.grid ? ` (parti P${r.grid})` : ''}`;
    txt(ctx, sub, x + 32, y + h * 0.76, { size: Math.round(h * (big ? 0.15 : 0.17)), weight: 600, color: C.muted, max: w - ns * 2.4 });
  };
  if (land) {
    const cw = (W - f.pad * 2 - 30) / 2;
    const ch = (f.bottom - f.top - 70 - 40) / 3;
    [[top, 'LES TOPS', C.green], [flop, 'LES FLOPS', C.red]].forEach(([list, t, c], k) => {
      const x = f.pad + k * (cw + 30);
      txt(ctx, t, x, f.top + 30, { size: 30, weight: 800, family: TITLE, color: c, spacing: 4 });
      list.forEach((r, i) => card(r, x, f.top + 60 + i * (ch + 20), cw, ch, k === 0));
    });
  } else {
    const avail = f.bottom - f.top - 130;
    const big = avail * 0.58 / 3;
    const small = avail * 0.42 / 3;
    let y = f.top;
    txt(ctx, 'LES TOPS', f.pad, y + 30, { size: 30, weight: 800, family: TITLE, color: C.green, spacing: 4 });
    y += 50;
    top.forEach((r) => { card(r, f.pad, y, W - f.pad * 2, big - 14, true); y += big; });
    y += 20;
    txt(ctx, 'LES FLOPS', f.pad, y + 30, { size: 30, weight: 800, family: TITLE, color: C.red, spacing: 4 });
    y += 50;
    flop.forEach((r) => { card(r, f.pad, y, W - f.pad * 2, small - 12, false); y += small; });
  }
  note(ctx, W, f, `Note Paddock Live : résultat, ${d.withPace ? 'rythme, ' : ''}places gagnées, duel avec le coéquipier`);
}

export function notes(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Notes des pilotes');
  const land = W > H;
  const list = d.rows.slice(0, 22);
  const cols = land || list.length > 12 ? 2 : 1;
  const per = Math.ceil(list.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * 36) / cols;
  const rowH = Math.min(H > 1600 ? 110 : 90, (f.bottom - f.top - 10) / per);
  const fs = Math.round(rowH * 0.42);
  list.forEach((r, i) => {
    const x = f.pad + Math.floor(i / per) * (colW + 36);
    const y = f.top - 6 + (i % per) * rowH;
    if (i % 2 === 0) { rr(ctx, x, y, colW, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
    const mid = y + rowH / 2 + fs * 0.34;
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x + 12, y + rowH * 0.2, 6, rowH * 0.56);
    txt(ctx, r.code, x + 32, mid, { size: fs, weight: 800, family: TITLE });
    txt(ctx, r.classified ? `P${r.pos}` : 'AB.', x + 32 + fs * 2.6, mid, { size: Math.round(fs * 0.7), weight: 700, family: MONO, color: C.muted });
    // Barre de la note (de 3 à 10)
    const bx = x + 32 + fs * 4.6;
    const bw = colW - (bx - x) - fs * 2.6;
    rr(ctx, bx, y + rowH * 0.38, bw, rowH * 0.24, rowH * 0.12); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    rr(ctx, bx, y + rowH * 0.38, Math.max(rowH * 0.24, bw * (r.note - 3) / 7), rowH * 0.24, rowH * 0.12); ctx.fillStyle = noteColor(r.note); ctx.fill();
    txt(ctx, dec(r.note), x + colW - 14, mid, { size: fs, weight: 800, family: TITLE, color: noteColor(r.note), align: 'right' });
  });
  note(ctx, W, f, 'Notes sur 10');
}

// ---------- Duels entre coéquipiers (saison) ----------
export function equipes(ctx, W, H, d, o, page) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, `Après ${d.after} course${d.after > 1 ? 's' : ''}`);
  const per = Math.ceil(d.rows.length / Math.ceil(d.rows.length / 5));
  const list = d.rows.slice((page - 1) * per, page * per);
  const land = W > H;
  const rowH = (f.bottom - f.top) / Math.max(per, 1);
  list.forEach((r, i) => {
    const y = f.top + i * rowH;
    const h = rowH - 16;
    panel(ctx, f.pad, y, W - f.pad * 2, h);
    const col = vivid(r.color);
    ctx.fillStyle = col; ctx.fillRect(f.pad, y + 14, 8, h - 28);
    const fs = Math.round(Math.min(h * 0.2, land ? 40 : 46));
    const cx = W / 2;
    txt(ctx, r.team.toUpperCase(), cx, y + fs * 1.1, { size: Math.round(fs * 0.62), weight: 700, family: TITLE, color: col, align: 'center', spacing: 3, max: W * 0.5 });
    txt(ctx, r.a.last.toUpperCase(), f.pad + 34, y + h * 0.5, { size: fs, weight: 800, family: TITLE, max: W * 0.28 });
    txt(ctx, r.b.last.toUpperCase(), W - f.pad - 30, y + h * 0.5, { size: fs, weight: 800, family: TITLE, align: 'right', max: W * 0.28 });
    // Barres qualifs et course : part de chacun
    const bar = (label, a, b, by) => {
      const bw = W * (land ? 0.3 : 0.34);
      const bx = cx - bw / 2;
      const share = a + b ? a / (a + b) : 0.5;
      txt(ctx, label, cx, by - 8, { size: Math.max(16, Math.round(fs * 0.42)), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2 });
      rr(ctx, bx, by, bw, fs * 0.34, fs * 0.17); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      rr(ctx, bx, by, Math.max(fs * 0.34, bw * share), fs * 0.34, fs * 0.17); ctx.fillStyle = col; ctx.fill();
      txt(ctx, String(a), bx - 16, by + fs * 0.32, { size: Math.round(fs * 0.62), weight: 800, family: TITLE, align: 'right', color: a >= b ? C.text : C.muted });
      txt(ctx, String(b), bx + bw + 16, by + fs * 0.32, { size: Math.round(fs * 0.62), weight: 800, family: TITLE, color: b >= a ? C.text : C.muted });
    };
    bar('QUALIFS', r.a.q, r.b.q, y + h * 0.42);
    bar('COURSE', r.a.r, r.b.r, y + h * 0.42 + fs * 1.25);
    const gap = r.gap == null ? '' : `Écart médian en qualif : ${dec(Math.abs(r.gap), 3)} s`;
    txt(ctx, `${r.a.pts} pts`, f.pad + 34, y + h * 0.5 + fs * 0.95, { size: Math.round(fs * 0.55), weight: 700, family: MONO, color: C.muted });
    txt(ctx, `${r.b.pts} pts`, W - f.pad - 30, y + h * 0.5 + fs * 0.95, { size: Math.round(fs * 0.55), weight: 700, family: MONO, color: C.muted, align: 'right' });
    if (gap && h > fs * 3.4) txt(ctx, gap, cx, y + h - 14, { size: Math.max(18, Math.round(fs * 0.42)), weight: 600, color: C.muted, align: 'center' });
  });
}

// ---------- Positions tour par tour ----------
export function positions(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Tour par tour');
  const n = d.drivers.length;
  const left = f.pad + 70;
  const right = W - f.pad - 150;
  const top = f.top + 10;
  const bottom = f.bottom - 30;
  const xOf = (lap) => left + (right - left) * lap / Math.max(1, d.total);
  const yOf = (p) => top + (bottom - top) * (p - 1) / Math.max(1, n - 1);
  ctx.save();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (let p = 1; p <= n; p++) { ctx.beginPath(); ctx.moveTo(left, yOf(p)); ctx.lineTo(right, yOf(p)); ctx.stroke(); }
  ctx.restore();
  for (let p = 1; p <= n; p++) if (p === 1 || p % 5 === 0) txt(ctx, `P${p}`, left - 16, yOf(p) + 8, { size: 22, weight: 700, family: MONO, color: C.muted, align: 'right' });
  const step = d.total > 40 ? 10 : 5;
  for (let l = step; l <= d.total - step / 2; l += step) txt(ctx, String(l), xOf(l), bottom + 30, { size: 20, weight: 600, family: MONO, color: C.muted, align: 'center' });
  txt(ctx, 'TOURS', right, bottom + 30, { size: 20, weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  // Pilotes classés dans les 10 premiers en couleur, les autres en gris
  const order = [...d.drivers].sort((a, b) => (b.finish || 99) - (a.finish || 99));
  for (const x of order) {
    const hi = x.classified && x.finish <= 10;
    ctx.save();
    ctx.strokeStyle = hi ? vivid(x.color) : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = hi ? 5 : 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    const pts = [[0, x.grid || n], ...x.pos.map((p, i) => [i + 1, p])];
    for (const [lap, p] of pts) {
      if (!p) break;
      if (!started) { ctx.moveTo(xOf(lap), yOf(p)); started = true; } else ctx.lineTo(xOf(lap), yOf(p));
    }
    ctx.stroke();
    ctx.restore();
  }
  // Étiquettes : à l'arrivée (place finale) ou au tour de l'abandon, sans chevauchement
  const placed = [];
  for (const x of [...d.drivers].sort((a, b) => (a.finish || 99) - (b.finish || 99))) {
    const p = x.classified && x.finish ? x.finish : x.pos[x.laps - 1];
    if (!p) continue;
    const hi = x.classified && x.finish <= 10;
    const lx = (x.classified ? right : xOf(x.laps)) + 14;
    let ly = yOf(p) + 8;
    while (placed.some(([px, py]) => Math.abs(px - lx) < 80 && Math.abs(py - ly) < 20)) ly += 20;
    placed.push([lx, ly]);
    txt(ctx, x.classified ? x.code : `${x.code} AB.`, lx, ly, { size: hi ? 24 : 18, weight: 800, family: TITLE, color: hi ? C.text : C.muted });
  }
}

// ---------- Récap de la semaine ----------
export function recapCover(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const land = W > H;
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'ACTU F1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `DU ${d.date}`.toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  const colW = land ? W * 0.42 : W - pad * 2;
  let y = land ? H * 0.32 : H * (H / W > 1.5 ? 0.18 : 0.17);
  const big = txt(ctx, 'LA SEMAINE', pad, y + 140 * u, { size: Math.round(170 * u), weight: 800, family: TITLE, max: colW });
  txt(ctx, 'EN F1', pad, y + 140 * u + big * 0.95, { size: big, weight: 800, family: TITLE, color: C.red });
  y += 140 * u + big * 0.95 + 70 * u;
  // Sommaire : les infos de la semaine
  const lx = land ? W * 0.5 : pad;
  const lw = land ? W - lx - pad : W - pad * 2;
  let ly = land ? H * 0.24 : y;
  const end = H - Math.round(Math.min(W, H) * 0.12);
  const each = (end - ly) / Math.max(1, d.items.length);
  d.items.forEach((it, i) => {
    txt(ctx, String(i + 1).padStart(2, '0'), lx, ly + 40 * u, { size: Math.round(40 * u), weight: 800, family: TITLE, color: C.red });
    txt(ctx, it.badge.label, lx + 80 * u, ly + 22 * u, { size: Math.round(20 * u), weight: 700, family: TITLE, color: it.badge.color, spacing: 3 });
    const t = fitLines(ctx, it.title.toUpperCase(), lw - 80 * u, [Math.round(32 * u), Math.round(28 * u)], each > 120 * u ? 2 : 1, TITLE, 800);
    t.lines.forEach((l, k) => txt(ctx, l, lx + 80 * u, ly + 58 * u + k * t.size * 1.02, { size: t.size, weight: 800, family: TITLE }));
    ly += each;
  });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = C.line; ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, spacing: 1 });
  txt(ctx, `${d.items.length} INFOS À RETENIR`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.022), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}
export function recapItem(ctx, W, H, d, o, i, fmt) {
  const it = d.items[i - 1];
  if (!it) return;
  newsSlide(ctx, W, H, it, o, fmt);
  const u = Math.min(W, H) / 1080;
  txt(ctx, `${i} / ${d.items.length}`, W - Math.round(W * 0.055), Math.round(Math.min(W, H) * 0.06) + 46 * u, { size: Math.round(34 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
}

// ---------- Vidéo animée de la course (images successives) ----------
// Durées : présentation, course (tour par tour), arrivée
export function raceVideoTiming(d) {
  const per = Math.min(0.55, 30 / Math.max(1, d.total));
  return { intro: 2.4, per, race: per * d.total, outro: 4, duration: 2.4 + per * d.total + 4 };
}
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
// Écart au leader (temps cumulé) à la fin d'un tour
function cumTimes(d) {
  return d.drivers.map((x) => { let s = 0; return x.times.map((t) => (t ? (s += t) : null)); });
}
export function raceFrame(ctx, W, H, d, o, time) {
  const tm = raceVideoTiming(d);
  background(ctx, W, H, C.red);
  const u = W / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(H * 0.045);
  // En-tête : Grand Prix et compteur de tours
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 10, 64 * u);
  txt(ctx, d.gp.toUpperCase(), pad + 28, top + 30 * u, { size: Math.round(36 * u), weight: 800, family: TITLE, max: W * 0.6, spacing: 1 });
  txt(ctx, `SAISON ${d.year}`, pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 3 });
  const raceT = Math.max(0, Math.min(tm.race, time - tm.intro));
  const lapF = raceT / tm.per;   // tours écoulés (fractionnaires)
  const lap = Math.min(d.total, Math.floor(lapF));
  const frac = lap >= d.total ? 0 : ease(lapF - lap);
  const label = time < tm.intro ? 'GRILLE DE DÉPART' : lap >= d.total ? 'ARRIVÉE' : `TOUR ${Math.min(d.total, lap + 1)} / ${d.total}`;
  txt(ctx, label, W - pad, top + 46 * u, { size: Math.round(44 * u), weight: 800, family: TITLE, color: lap >= d.total ? C.gold : C.text, align: 'right', spacing: 2 });
  // Barre de progression
  const by = top + 100 * u;
  rr(ctx, pad, by, W - pad * 2, 8 * u, 4 * u); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
  rr(ctx, pad, by, (W - pad * 2) * Math.min(1, lapF / d.total), 8 * u, 4 * u); ctx.fillStyle = C.red; ctx.fill();
  // Position d'un pilote à un tour (0 = grille) ; abandon : en bas de la liste
  const n = d.drivers.length;
  const cum = cumTimes(d);
  // Pilote à un tour ou plus : place d'arrivée une fois ses tours bouclés
  const posAt = (x, l) => (l === 0 ? (x.grid || n) : x.pos[l - 1] || (x.classified && l > x.laps ? x.finish : null));
  const rank = (l) => {
    const live = d.drivers.map((x, i) => ({ i, p: posAt(x, l) })).filter((e) => e.p).sort((a, b) => a.p - b.p);
    const out = d.drivers.map((x, i) => ({ i, p: posAt(x, l) })).filter((e) => !e.p).sort((a, b) => d.drivers[b.i].laps - d.drivers[a.i].laps);
    const r = new Map();
    [...live, ...out].forEach((e, k) => r.set(e.i, k));
    return r;
  };
  const r0 = rank(lap);
  const r1 = rank(Math.min(d.total, lap + 1));
  const listTop = by + 50 * u;
  const rowH = Math.min(78 * u, (H - listTop - 160 * u) / n);
  const fs = Math.round(rowH * 0.48);
  const leaderCum = (l) => (l ? Math.min(...cum.map((c) => c[l - 1] || Infinity)) : 0);
  d.drivers.forEach((x, i) => {
    const k = r0.get(i) + (r1.get(i) - r0.get(i)) * frac;
    const y = listTop + k * rowH;
    const outNow = !posAt(x, Math.max(lap, 1)) && lap > 0;
    ctx.globalAlpha = outNow ? 0.45 : 1;
    rr(ctx, pad, y + 3, W - pad * 2, rowH - 6, 10 * u); ctx.fillStyle = k < 3 && lap >= d.total ? 'rgba(232,195,90,0.14)' : C.panel; ctx.fill();
    const mid = y + rowH / 2 + fs * 0.35;
    txt(ctx, String(Math.round(k) + 1), pad + 56 * u, mid, { size: fs, weight: 800, family: TITLE, align: 'right', color: Math.round(k) < 3 ? MEDAL[Math.round(k)] : C.text });
    ctx.fillStyle = vivid(x.color); ctx.fillRect(pad + 74 * u, y + rowH * 0.2, 7 * u, rowH * 0.6);
    txt(ctx, x.code, pad + 100 * u, mid, { size: fs, weight: 800, family: TITLE });
    txt(ctx, x.last.toUpperCase(), pad + 100 * u + fs * 2.6, mid, { size: Math.round(fs * 0.78), weight: 600, family: TITLE, color: C.muted, max: W * 0.4 });
    let right = '';
    if (outNow) right = 'ABANDON';
    else if (lap > x.laps && x.classified) right = `+${lap - x.laps} TOUR${lap - x.laps > 1 ? 'S' : ''}`;
    else if (lap > 0) {
      const c = cum[i][lap - 1];
      const g = c != null ? c - leaderCum(lap) : null;
      right = Math.round(k) === 0 ? 'LEADER' : g != null && g >= 0 && g < 300 ? `+${dec(g, 1)}` : '';
    } else right = x.grid ? `P${x.grid}` : 'STANDS';
    txt(ctx, right, W - pad - 20 * u, mid, { size: Math.round(fs * 0.8), weight: 700, family: /^[+\d,]+$/.test(right) ? MONO : TITLE, color: right === 'ABANDON' ? C.red : C.text, align: 'right' });
    ctx.globalAlpha = 1;
  });
  const fy = H - Math.round(H * 0.03);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(30 * u), weight: 700, family: TITLE, spacing: 1 });
  if (lap >= d.total) txt(ctx, 'ABONNEZ-VOUS POUR LA SUITE', W - pad, fy, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.red, align: 'right', spacing: 2 });
}

// ---------- Race Week : visuel propre à chaque Grand Prix ----------
// Couleurs du drapeau du pays, drapeau en fond, nom de la ville en filigrane, tracé lumineux du
// circuit ; mise en page qui alterne selon la manche (tracé à droite, en bas ou à gauche).
const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0xe10600;
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
function drawTrack(ctx, shape, box, color, u) {
  const s = Math.min(box.w / shape.w, box.h / shape.h);
  const ox = box.x + (box.w - shape.w * s) / 2;
  const oy = box.y + (box.h - shape.h * s) / 2;
  const P = ([x, y]) => [ox + x * s, oy + y * s];
  const path = () => { ctx.beginPath(); shape.pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Halo, piste, ligne centrale
  ctx.shadowColor = color; ctx.shadowBlur = 60 * u;
  ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 34 * u; path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color; ctx.lineWidth = 16 * u; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4 * u; path(); ctx.stroke();
  // Ligne de départ : damier
  const [sx, sy] = P(shape.pts[0]);
  const q = 9 * u;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(sx - 2 * q + i * q, sy - q + j * q, q, q); }
  ctx.restore();
}
export function raceweek(ctx, W, H, d, o) {
  const land = W > H;
  const u = Math.min(W, H) / 1080;
  const [c1, c2] = d.palette;
  const v = d.variant || 0;
  // Fond : dégradé sombre teinté aux couleurs du pays
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#07080c'); g.addColorStop(1, '#10131b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col, a) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  glow(v === 2 ? W * 0.15 : W * 0.85, H * 0.18, Math.max(W, H) * 0.75, c1, 0.42);
  glow(v === 2 ? W * 0.9 : W * 0.1, H * 0.95, Math.max(W, H) * 0.6, c2, 0.16);
  // Drapeau en grand, incliné et fondu
  if (o.flag) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.translate(W * (v === 2 ? 0.25 : 0.72), H * 0.32);
    ctx.rotate(-0.21);
    const fw = Math.max(W, H) * 0.95;
    ctx.drawImage(o.flag, -fw / 2, -fw * o.flag.height / o.flag.width / 2, fw, fw * o.flag.height / o.flag.width);
    ctx.restore();
  }
  // Nom de la ville en filigrane
  if (d.city) {
    ctx.save();
    ctx.translate(W / 2, H * (land ? 0.62 : 0.56));
    ctx.rotate(-0.14);
    const word = d.city.toUpperCase();
    let fs = 400 * u;
    ctx.font = `800 ${fs}px ${TITLE}`;
    const wmax = (land ? W : H) * 1.15;
    if (ctx.measureText(word).width > wmax) { fs *= wmax / ctx.measureText(word).width; ctx.font = `800 ${fs}px ${TITLE}`; }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3 * u; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(word, 0, 0);
    ctx.restore();
  }
  // Bandes de vitesse aux couleurs du drapeau
  ctx.save();
  ctx.translate(v === 2 ? 0 : W, 0);
  if (v !== 2) ctx.scale(-1, 1);
  [[c1, 0], [c2, 1], ['#ffffff', 2]].forEach(([col, i]) => {
    ctx.fillStyle = rgba(col, i === 2 ? 0.5 : 0.85);
    ctx.beginPath(); ctx.moveTo(0, H * (0.06 + i * 0.035)); ctx.lineTo(W * 0.22 - i * 40 * u, H * (0.06 + i * 0.035)); ctx.lineTo(W * 0.2 - i * 40 * u, H * (0.06 + i * 0.035) + 12 * u); ctx.lineTo(0, H * (0.06 + i * 0.035) + 12 * u); ctx.fill();
  });
  ctx.restore();
  const pad = Math.round(W * 0.06);
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const story = H / W > 1.5;
  // Bloc de texte : hauteur calculée d'abord, le tracé prend la place qui reste
  const right = !land && v === 2;
  const textLeft = land && v === 1 ? W * 0.52 : pad;
  const tx = right ? W - pad : textLeft;
  const align = right ? 'right' : 'left';
  const colW = land ? W * 0.42 : W - pad * 2;
  const facts = [[d.laps, 'TOURS'], [d.km != null ? String(d.km).replace('.', ',') : null, 'KM'], [d.corners, 'VIRAGES']].filter(([x]) => x != null);
  let big = Math.round((land ? 150 : story ? 210 : 170) * u);
  const titleSizes = [64, 56, 50, 44].map((x) => Math.round(x * (land ? 0.85 : 1) * u));
  const measure = (bg, withPrev) => {
    const t = fitLines(ctx, d.gp.toUpperCase(), colW, titleSizes, 2, TITLE, 800);
    const h = 30 * u + bg * 1.76 + 46 * u + t.lines.length * t.size * 1.02 + 20 * u + 60 * u + (facts.length ? 106 * u : 0) + (d.race ? 80 * u : 0) + (withPrev && d.prev ? 36 * u : 0);
    return { t, h };
  };
  const top0 = land ? H * 0.1 : H * 0.075;
  const bottom0 = fy - 56 * u;
  const minTrack = land ? 0 : (story ? 0.3 : 0.24) * H;
  let withPrev = true;
  let m = measure(big, withPrev);
  while (m.h > bottom0 - top0 - minTrack && big > 110 * u) { big -= 10 * u; m = measure(big, withPrev); }
  if (m.h > bottom0 - top0 - minTrack) { withPrev = false; m = measure(big, false); }
  // Position du texte (en haut pour la variante 1, en bas sinon ; à gauche ou à droite en paysage)
  const textTop = land ? top0 + Math.max(0, (bottom0 - top0 - m.h) / 2) : v === 1 ? top0 : bottom0 - m.h;
  // Tracé du circuit dans l'espace libre
  if (d.shape) {
    const gap = 30 * u;
    const box = land
      ? { x: v === 1 ? pad : W * 0.52, y: H * 0.12, w: W * 0.42, h: H * 0.7 }
      : v === 1 ? { x: pad, y: textTop + m.h + gap, w: W - pad * 2, h: bottom0 - (textTop + m.h + gap) }
        : { x: v === 2 ? pad : W * 0.3, y: Math.max(top0 + 40 * u, H * 0.15), w: W * 0.64, h: textTop - gap - Math.max(top0 + 40 * u, H * 0.15) };
    if (box.h > 80 * u) drawTrack(ctx, d.shape, box, c1, u * (land ? 0.8 : 1));
  }
  let y = textTop;
  txt(ctx, `MANCHE ${d.round}${d.rounds ? ` / ${d.rounds}` : ''}`, tx, y + 26 * u, { size: Math.round(30 * u), weight: 800, family: TITLE, color: /^#F5F5F5$/i.test(c1) ? c2 : c1, align, spacing: 6 * u });
  y += 30 * u;
  txt(ctx, 'RACE', tx, y + big * 0.86, { size: big, weight: 800, family: TITLE, align, max: colW });
  y += big * 0.86;
  // WEEK : contour aux couleurs du pays
  ctx.save();
  ctx.font = `800 ${big}px ${TITLE}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.lineWidth = 5 * u; ctx.strokeStyle = c1; ctx.fillStyle = rgba(c1, 0.18);
  ctx.fillText('WEEK', tx, y + big * 0.9); ctx.strokeText('WEEK', tx, y + big * 0.9);
  ctx.restore();
  y += big * 0.9 + 46 * u;
  const t = m.t;
  t.lines.forEach((l, i) => txt(ctx, l, tx, y + t.size * 0.82 + i * t.size * 1.02, { size: t.size, weight: 800, family: TITLE, align }));
  y += t.lines.length * t.size * 1.02 + 20 * u;
  txt(ctx, `${d.date}${d.city ? `  ·  ${d.city}` : ''}`.toUpperCase(), tx, y + 28 * u, { size: Math.round(28 * u), weight: 600, family: TITLE, color: C.muted, align, spacing: 2 * u, max: colW });
  y += 60 * u;
  // Chiffres du circuit
  if (facts.length) {
    const fw = Math.min(200 * u, colW / facts.length);
    facts.forEach(([val, lab], i) => {
      const fx = right ? tx - (facts.length - 1 - i) * fw : tx + i * fw;
      ctx.fillStyle = c1; ctx.fillRect(right ? fx - 6 * u : fx, y, 6 * u, 74 * u);
      const ix = right ? fx - 22 * u : fx + 22 * u;
      txt(ctx, String(val), ix, y + 44 * u, { size: Math.round(50 * u), weight: 800, family: TITLE, align });
      txt(ctx, lab, ix, y + 72 * u, { size: Math.round(20 * u), weight: 700, family: TITLE, color: C.muted, align, spacing: 3 * u });
    });
    y += 106 * u;
  }
  if (d.race) {
    const label = `COURSE ${d.race.day.toUpperCase()} ${d.race.time.replace(':', 'H')}`;
    ctx.font = `800 ${Math.round(30 * u)}px ${TITLE}`;
    const w = ctx.measureText(label).width + 40 * u + label.length * 2 * u;
    const bx = right ? tx - w : tx;
    rr(ctx, bx, y, w, 54 * u, 27 * u); ctx.fillStyle = C.red; ctx.fill();
    txt(ctx, label, bx + w / 2, y + 37 * u, { size: Math.round(30 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 2 * u });
    y += 80 * u;
  }
  if (withPrev && d.prev) txt(ctx, `VAINQUEUR ${d.prev.year} : ${d.prev.name.toUpperCase()}`, tx, y + 20 * u, { size: Math.round(24 * u), weight: 700, family: TITLE, color: C.muted, align, spacing: 2 * u, max: colW });
  // Pied
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.026), weight: 700, family: TITLE, spacing: 1 });
  txt(ctx, 'HEURE DE PARIS', W - pad, fy, { size: Math.round(Math.min(W, H) * 0.02), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}
