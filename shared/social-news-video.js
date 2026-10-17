// Vidéo « Breaking news » (mode créateur) : animation verticale 1080 × 1920 tirée des données d'un post
// news (newsPost), enregistrée dans le navigateur par makeAnimation. Quatre temps : intro « BREAKING
// NEWS », l'info (photo, type, titre, résumé), les points clés un par un, puis « Abonnez-vous ».
// Bandeau défilant au-dessus de la zone couverte par les légendes de TikTok et des Reels.
import { C, TITLE, BODY, rr, txt, fitLines, vivid, alpha, lightColor, background, photo, coverPhoto, driverPhoto } from './social-draw.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - (1 - clamp01(x)) ** 3;
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const INTRO = 1.8;
const OUTRO = 2.8;
const WIPE = 0.5;   // passage d'un temps à l'autre : bande rouge qui balaie l'écran

// Durées : le temps de lire (environ 3,5 mots par seconde) ; 4 points clés au plus
export function newsVideoTiming(d) {
  const pts = (d.points || []).slice(0, 4);
  const main = Math.min(9, Math.max(5, 2.2 + (words(d.title) + words(d.summary)) / 3.5));
  const per = pts.map((p) => Math.min(6, Math.max(3, 1.2 + words(p) / 3.5)));
  const starts = [INTRO, INTRO + main];
  per.forEach((s) => starts.push(starts.at(-1) + s));
  return { pts, main, starts, duration: starts.at(-1) + OUTRO };
}

// Bande rouge inclinée qui traverse l'écran ; k de 0 à 1, l'écran entièrement couvert à k = 0,5
function wipe(ctx, W, H, k) {
  if (k <= 0 || k >= 1) return;
  const sk = W * 0.35;
  const bw = W + sk * 2;
  const x = -bw - sk + (W + bw + sk * 2) * k;
  ctx.fillStyle = C.red;
  ctx.beginPath(); ctx.moveTo(x + sk, 0); ctx.lineTo(x + bw + sk, 0); ctx.lineTo(x + bw, H); ctx.lineTo(x, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(x + bw + sk, 0); ctx.lineTo(x + bw + sk + W * 0.03, 0); ctx.lineTo(x + bw + W * 0.03, H); ctx.lineTo(x + bw, H); ctx.closePath(); ctx.fill();
}

// Étiquette du type de nouvelle ; renvoie sa largeur
function chip(ctx, b, x, y, u, size = 34) {
  ctx.font = `700 ${Math.round(size * u)}px ${TITLE}`;
  const w = ctx.measureText(b.label).width + 6 * b.label.length * u + 44 * u;
  rr(ctx, x, y, w, size * 1.7 * u, 8 * u); ctx.fillStyle = b.color; ctx.fill();
  txt(ctx, b.label, x + 22 * u, y + size * 1.21 * u, { size: Math.round(size * u), weight: 700, family: TITLE, color: lightColor(b.color) ? C.bg : '#fff', spacing: 6 * u });
  return w;
}

// En-tête (Actu F1, date ; à droite : point rouge qui clignote, signature)
function header(ctx, W, d, o, u, t) {
  const pad = 60 * u; const top = 120 * u;
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 10 * u, 64 * u);
  txt(ctx, 'ACTU F1', pad + 28 * u, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, d.date.toUpperCase(), pad + 28 * u, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  const s = txt(ctx, 'BREAKING NEWS', W - pad, top + 30 * u, { size: Math.round(32 * u), weight: 800, family: TITLE, color: C.text, align: 'right', spacing: 3 });
  ctx.font = `800 ${s}px ${TITLE}`;
  const tw = ctx.measureText('BREAKING NEWS').width + 13 * 3;
  ctx.fillStyle = alpha('#e10600', 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2.2)));
  ctx.beginPath(); ctx.arc(W - pad - tw - 22 * u, top + 19 * u, 11 * u, 0, Math.PI * 2); ctx.fill();
  txt(ctx, o.signature || '@BenjyPaddock', W - pad, top + 62 * u, { size: Math.round(24 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 1 });
}

// Bandeau défilant « BREAKING » : type, titre et signature en boucle
function ticker(ctx, W, d, o, u, y, t, k) {
  const h = 76 * u;
  y += (1 - out3(k)) * 220 * u;
  ctx.fillStyle = 'rgba(11,13,18,0.92)'; ctx.fillRect(0, y, W, h);
  ctx.fillStyle = C.red; ctx.fillRect(0, y, W, 5 * u);
  const msg = `${d.badge.label}  ·  ${d.title.toUpperCase()}  ·  ${(o.signature || '@BenjyPaddock').toUpperCase()}  ·  `;
  const size = Math.round(34 * u);
  ctx.font = `700 ${size}px ${TITLE}`;
  const mw = ctx.measureText(msg).width + msg.length * 2;
  const lw = 250 * u;
  ctx.save();
  ctx.beginPath(); ctx.rect(lw, y, W - lw, h); ctx.clip();
  const off = (t * 150 * u) % mw;
  for (let x = lw + 24 * u - off; x < W; x += mw) txt(ctx, msg, x, y + h * 0.66, { size, weight: 700, family: TITLE, spacing: 2 });
  ctx.restore();
  ctx.fillStyle = C.red;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(lw, y); ctx.lineTo(lw - 22 * u, y + h); ctx.lineTo(0, y + h); ctx.closePath(); ctx.fill();
  txt(ctx, 'BREAKING', 28 * u, y + h * 0.68, { size: Math.round(38 * u), weight: 800, family: TITLE, color: '#fff', spacing: 3 });
}

// Intro : « BREAKING NEWS » qui claque, éclair blanc, type d'info et date
function intro(ctx, W, H, d, u, s) {
  background(ctx, W, H, C.red);
  const cy = H * 0.44;
  // Grande bande rouge inclinée qui entre par la gauche
  const kb = out3(s / 0.35);
  ctx.save();
  ctx.translate(W / 2, cy); ctx.rotate(-0.12);
  ctx.fillStyle = C.red; ctx.fillRect(-W * 1.2 + (1 - kb) * -W * 1.5, 30 * u, W * 2.4, 190 * u);
  ctx.restore();
  // BREAKING : du très grand vers sa taille, en fondu
  const kt = out3((s - 0.1) / 0.4);
  if (kt > 0) {
    ctx.save();
    ctx.globalAlpha = kt;
    ctx.translate(W / 2, cy - 20 * u); ctx.rotate(-0.12); ctx.scale(1.6 - 0.6 * kt, 1.6 - 0.6 * kt);
    txt(ctx, 'BREAKING', 0, 0, { size: Math.round(230 * u), weight: 800, family: TITLE, align: 'center', max: W * 0.9, spacing: 4 });
    ctx.restore();
  }
  const kn = out3((s - 0.35) / 0.35);
  if (kn > 0) {
    ctx.save();
    ctx.translate(W / 2 + (1 - kn) * W, cy + 150 * u); ctx.rotate(-0.12);
    txt(ctx, 'NEWS', 0, 0, { size: Math.round(170 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 30 * u });
    ctx.restore();
  }
  const kc = out3((s - 0.75) / 0.4);
  if (kc > 0) {
    ctx.save(); ctx.globalAlpha = kc;
    ctx.font = `700 ${Math.round(40 * u)}px ${TITLE}`;
    const w = ctx.measureText(d.badge.label).width + 6 * d.badge.label.length * u + 44 * u;
    chip(ctx, d.badge, (W - w) / 2, cy + 330 * u + (1 - kc) * 40 * u, u, 40);
    txt(ctx, d.date.toUpperCase(), W / 2, cy + 470 * u + (1 - kc) * 40 * u, { size: Math.round(34 * u), weight: 600, family: TITLE, color: C.muted, align: 'center', spacing: 4 });
    ctx.restore();
  }
  // Éclair à l'arrivée de « NEWS »
  const fl = clamp01(1 - Math.abs(s - 0.45) / 0.18);
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${0.55 * fl})`; ctx.fillRect(0, 0, W, H); }
}

// Mise en page de l'info : visuel, titre au plus grand corps qui laisse place au résumé
const layouts = new WeakMap();
function mainLayout(ctx, W, H, d, o, u) {
  if (layouts.has(d)) return layouts.get(d);
  const pad = 60 * u; const colW = W - pad * 2;
  const top = 250 * u; const bottom = H - 510 * u;
  const withPhoto = d.drivers.filter((p) => o.photos?.[p.num]);
  const custom = d.image?.width ? d.image : null;
  const vis = custom ? 'image' : withPhoto.length === 1 ? 'photo' : d.drivers.length ? 'row' : '';
  const visH = vis === 'row' ? 260 * u : vis ? (bottom - top) * 0.34 : 0;
  const avail = bottom - top - visH - (vis ? 40 : 0) * u - 100 * u - 70 * u;
  const sumSize = Math.round(40 * u); const sumLh = Math.round(sumSize * 1.36);
  const sumAll = d.summary ? fitLines(ctx, d.summary, colW, [sumSize], 99, BODY, 400).lines : [];
  let pick = null;
  for (const size of [120, 110, 100, 92, 84, 76, 68, 60].map((v) => Math.round(v * u))) {
    const lines = fitLines(ctx, d.title.toUpperCase(), colW, [size], 99, TITLE, 800).lines;
    if (lines.length > 5) continue;
    const lh = Math.round(size * 0.98);
    const sumN = Math.max(0, Math.min(sumAll.length, 7, Math.floor((avail - lines.length * lh) / sumLh)));
    // Résumé en entier si le titre reste grand, sinon au moins 3 lignes
    const full = sumN >= sumAll.length && size >= 84 * u;
    if (full || (!pick && sumN >= Math.min(3, sumAll.length))) pick = { size, lh, lines, sumN };
    if (full) break;
  }
  if (!pick) { const size = Math.round(60 * u); pick = { size, lh: Math.round(size * 0.98), lines: fitLines(ctx, d.title.toUpperCase(), colW, [size], 5, TITLE, 800).lines, sumN: 0 }; }
  const sum = sumAll.slice(0, pick.sumN);
  if (sum.length && sum.length < sumAll.length) sum[sum.length - 1] = `${sum[sum.length - 1].replace(/\s+\S*$/, '')}…`;
  const blockH = 100 * u + pick.lines.length * pick.lh + 70 * u + sum.length * sumLh;
  const y0 = vis ? top + visH + 40 * u : top + Math.max(0, (bottom - top - blockH) / 2.4);
  const L = { pad, colW, top, bottom, vis, visH, withPhoto, custom, sumSize, sumLh, sum, ...pick, y0 };
  layouts.set(d, L);
  return L;
}

function mainScene(ctx, W, H, d, o, u, s, dur) {
  background(ctx, W, H, d.color);
  const L = mainLayout(ctx, W, H, d, o, u);
  const x = L.pad;
  const zoom = 1 + 0.05 * clamp01(s / dur);   // lent zoom avant sur le visuel
  const kv = out3(s / 0.6);
  ctx.save();
  ctx.globalAlpha = kv;
  const dy = (1 - kv) * 90 * u;
  if (L.vis === 'image') {
    const w = W - L.pad * 2; const h = L.visH;
    ctx.save();
    rr(ctx, x, L.top + dy, w, h, 24 * u); ctx.clip();
    coverPhoto(ctx, L.custom, x - w * (zoom - 1) / 2, L.top + dy - h * (zoom - 1) / 2, w * zoom, h * zoom, 0);
    ctx.restore();
  } else if (L.vis === 'photo') {
    const p = L.withPhoto[0];
    const w = W * 0.7 * zoom; const h = L.visH * zoom;
    const g = ctx.createRadialGradient(W / 2, L.top + L.visH * 0.6, 0, W / 2, L.top + L.visH * 0.6, W * 0.45);
    g.addColorStop(0, alpha(p.color, 0.4)); g.addColorStop(1, alpha(p.color, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    photo(ctx, o.photos[p.num], (W - w) / 2, L.top + L.visH - h + dy, w, h, p.color, 0.3);
  } else if (L.vis === 'row') {
    const r = Math.round(120 * u);
    const n = Math.min(d.drivers.length, 3);
    d.drivers.slice(0, 3).forEach((p, i) => {
      const k = out3((s - i * 0.15) / 0.5);
      const cx = W / 2 + (i - (n - 1) / 2) * (r * 2 + 50 * u);
      ctx.save(); ctx.globalAlpha = k;
      driverPhoto(ctx, o.photos?.[p.num], cx, L.top + r + 10 * u + (1 - k) * 80 * u, r * (0.85 + 0.15 * k), p.color, p.tla);
      ctx.restore();
    });
  }
  ctx.restore();
  let y = L.y0;
  // Type de nouvelle : glisse depuis la gauche
  const kc = out3((s - 0.3) / 0.4);
  if (kc > 0) { ctx.save(); ctx.globalAlpha = kc; chip(ctx, d.badge, x - (1 - kc) * 200 * u, y, u); ctx.restore(); }
  y += 100 * u;
  // Titre : lignes dévoilées une à une de gauche à droite
  L.lines.forEach((l, i) => {
    const k = out3((s - 0.55 - i * 0.16) / 0.45);
    if (k <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 10, y + i * L.lh - L.lh * 0.1, (L.colW + 20) * k, L.lh * 1.1); ctx.clip();
    txt(ctx, l, x + (1 - k) * -60 * u, y + L.size * 0.82 + i * L.lh, { size: L.size, weight: 800, family: TITLE });
    ctx.restore();
  });
  y += L.lines.length * L.lh + 34 * u;
  const tEnd = 0.55 + L.lines.length * 0.16 + 0.3;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(x, y - 10 * u, 120 * u * out3((s - tEnd) / 0.4), 7 * u);
  y += 36 * u;
  L.sum.forEach((l, i) => {
    const k = out3((s - tEnd - 0.2 - i * 0.12) / 0.5);
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    txt(ctx, l, x, y + L.sumSize * 0.8 + i * L.sumLh + (1 - k) * 24 * u, { size: L.sumSize, weight: 400, color: C.text });
    ctx.restore();
  });
}

// Un point clé par écran : carte qui entre par la droite et sort par la gauche, gros numéro
function pointScene(ctx, W, H, d, o, u, i, n, s, dur) {
  background(ctx, W, H, d.color);
  const pad = 60 * u; const colW = W - pad * 2;
  const acc = d.color ? vivid(d.color) : C.red;
  txt(ctx, "L'ESSENTIEL", pad, 330 * u, { size: Math.round(64 * u), weight: 800, family: TITLE, spacing: 3 });
  const t = fitLines(ctx, d.title.toUpperCase(), colW, [Math.round(34 * u)], 2, TITLE, 700).lines;
  t.forEach((l, k) => txt(ctx, l, pad, 392 * u + k * 40 * u, { size: Math.round(34 * u), weight: 700, family: TITLE, color: C.muted, spacing: 1 }));
  // Avancement : un trait par point
  const sw = (colW - (n - 1) * 14 * u) / n;
  for (let k = 0; k < n; k++) {
    rr(ctx, pad + k * (sw + 14 * u), 500 * u, sw, 8 * u, 4 * u); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    const f = k < i ? 1 : k > i ? 0 : clamp01(s / dur);
    if (f > 0) { rr(ctx, pad + k * (sw + 14 * u), 500 * u, sw * f, 8 * u, 4 * u); ctx.fillStyle = acc; ctx.fill(); }
  }
  const kin = out3(s / 0.45);
  const kout = i < n - 1 ? clamp01((s - (dur - 0.35)) / 0.35) ** 2 : 0;
  const dx = (1 - kin) * W - kout * W;
  const top = 590 * u; const bottom = H - 560 * u;
  const lines = fitLines(ctx, d.points[i], colW - 80 * u, [72, 64, 58, 52, 46, 40].map((v) => Math.round(v * u)), 9, BODY, 600);
  const lh = Math.round(lines.size * 1.32);
  const ch = Math.min(bottom - top, 250 * u + lines.lines.length * lh);
  const cy = top + (bottom - top - ch) / 2;
  ctx.save();
  ctx.translate(dx, 0);
  rr(ctx, pad, cy, colW, ch, 26 * u); ctx.fillStyle = C.panel; ctx.fill();
  ctx.fillStyle = acc; ctx.fillRect(pad, cy + 30 * u, 8 * u, ch - 60 * u);
  txt(ctx, String(i + 1).padStart(2, '0'), pad + 40 * u, cy + 170 * u, { size: Math.round(150 * u), weight: 800, family: TITLE, color: acc });
  txt(ctx, `/ ${String(n).padStart(2, '0')}`, pad + 40 * u + 180 * u, cy + 170 * u, { size: Math.round(50 * u), weight: 700, family: TITLE, color: C.muted });
  lines.lines.forEach((l, k) => {
    const kl = out3((s - 0.25 - k * 0.1) / 0.45);
    ctx.save(); ctx.globalAlpha = kl;
    txt(ctx, l, pad + 40 * u, cy + 250 * u + lines.size * 0.8 + k * lh + (1 - kl) * 20 * u, { size: lines.size, weight: 600, color: C.text });
    ctx.restore();
  });
  ctx.restore();
}

// Fin : appel à s'abonner, signature, source
function outro(ctx, W, H, d, o, u, s) {
  background(ctx, W, H, C.red);
  const cy = H * 0.36;
  const k1 = out3(s / 0.5);
  ctx.save(); ctx.globalAlpha = k1;
  txt(ctx, "TOUTE L'ACTU F1", W / 2, cy + (1 - k1) * 60 * u, { size: Math.round(110 * u), weight: 800, family: TITLE, align: 'center', max: W * 0.88, spacing: 2 });
  txt(ctx, 'EN DIRECT ET EN FRANÇAIS', W / 2, cy + 80 * u + (1 - k1) * 60 * u, { size: Math.round(44 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 4 });
  ctx.restore();
  const k2 = out3((s - 0.35) / 0.5);
  const sig = o.signature || '@BenjyPaddock';
  ctx.save(); ctx.globalAlpha = k2;
  txt(ctx, sig, W / 2, cy + 260 * u, { size: Math.round(72 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', max: W * 0.86, spacing: 1 });
  ctx.restore();
  const k3 = out3((s - 0.7) / 0.45);
  if (k3 > 0) {
    const pulse = 1 + 0.04 * Math.sin(Math.max(0, s - 1.1) * Math.PI * 3);
    const bw = 560 * u; const bh = 120 * u;
    ctx.save();
    ctx.globalAlpha = k3;
    ctx.translate(W / 2, cy + 420 * u); ctx.scale(pulse * (0.7 + 0.3 * k3), pulse * (0.7 + 0.3 * k3));
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fillStyle = C.red; ctx.fill();
    txt(ctx, 'ABONNEZ-VOUS', 0, 20 * u, { size: Math.round(56 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 3 });
    ctx.restore();
  }
  if (d.source) {
    ctx.save(); ctx.globalAlpha = k2;
    txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W / 2, cy + 600 * u, { size: Math.round(28 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2, max: W * 0.86 });
    ctx.restore();
  }
}

export function newsFrame(ctx, W, H, d, o, t) {
  const tm = newsVideoTiming(d);
  const u = W / 1080;
  const n = tm.pts.length;
  const pd = { ...d, points: tm.pts };
  const tickY = H - 470 * u;
  if (t < INTRO) intro(ctx, W, H, d, u, t);
  else if (t < tm.starts[1]) mainScene(ctx, W, H, d, o, u, t - INTRO, tm.main);
  else if (t < tm.starts.at(-1)) {
    const i = tm.starts.findLastIndex((st) => st <= t) - 1;
    pointScene(ctx, W, H, pd, o, u, i, n, t - tm.starts[i + 1], tm.starts[i + 2] - tm.starts[i + 1]);
  } else outro(ctx, W, H, d, o, u, t - tm.starts.at(-1));
  if (t >= INTRO && t < tm.starts.at(-1)) {
    header(ctx, W, d, o, u, t);
    ticker(ctx, W, d, o, u, tickY, t, (t - INTRO) / 0.5);
    if (d.source) txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W / 2, tickY + 140 * u, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2, max: W - 120 * u });
  }
  // Passages : intro → info, info → points, points → fin
  for (const b of [INTRO, tm.starts[1], tm.starts.at(-1)].filter((v, k, a) => a.indexOf(v) === k)) {
    const k = (t - (b - WIPE / 2)) / WIPE;
    if (k > 0 && k < 1) wipe(ctx, W, H, k);
  }
}
