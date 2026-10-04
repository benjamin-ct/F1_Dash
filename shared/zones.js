// Zones « ligne droite » (straight mode) et ligne de détection du mode dépassement (2026).
// Ni le flux F1 ni les données de circuit ne les décrivent : on les estime à partir de la
// télémétrie d'une séance archivée (vitesse + accélérateur recalés sur le GPS) :
//  - ligne droite : portion longue, quasi rectiligne, passée à fond par presque toutes les voitures ;
//  - détection : la FIA la place en général sur la ligne SC 1, à l'entrée des stands ; on prend
//    l'endroit où les voitures qui rentrent aux stands quittent la piste.
import { parseUtc } from './f1.js';

const M = 10;                 // unités GPS par mètre (dixièmes de mètre)
const MAX_SAMPLES = 400000;

function timelines(positions) {
  const cars = new Map();
  for (const p of positions) {
    for (const snap of p.data?.Position || []) {
      const t = parseUtc(snap.Timestamp);
      if (!Number.isFinite(t)) continue;
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (!e.X && !e.Y)) continue;
        if (!cars.has(num)) cars.set(num, []);
        cars.get(num).push({ t, x: e.X, y: e.Y });
      }
    }
  }
  for (const arr of cars.values()) arr.sort((a, b) => a.t - b.t);
  return cars;
}

function interp(arr, t) {
  let lo = 0, hi = arr.length - 1;
  if (hi < 1 || t < arr[0].t || t > arr[hi].t) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = arr[lo], b = arr[hi];
  if (b.t - a.t > 1500) return null;
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

// Point du tracé le plus proche, en cherchant d'abord autour du précédent (rapide).
function project(track, x, y, hint) {
  const pts = track.pts;
  const n = pts.length;
  const near = (from, to) => {
    let best = -1, bd = Infinity;
    for (let k = from; k <= to; k++) {
      const i = ((k % n) + n) % n;
      const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { idx: best, d: Math.sqrt(bd) };
  };
  if (hint >= 0) {
    const r = near(hint - 30, hint + 60);
    if (r.d < 30 * M) return r;
  }
  return near(0, n - 1);
}

// Cap (radians) entre deux points du tracé.
function heading(pts, i, j) {
  return Math.atan2(pts[j].y - pts[i].y, pts[j].x - pts[i].x);
}

function angleDiff(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

export function estimateZones(track, carData, positions) {
  const pts = track.pts;
  const n = pts.length;
  if (n < 20) return null;
  const tl = timelines(positions);
  if (!tl.size) return null;

  // Distances cumulées le long du tracé
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % n].x - pts[i - 1].x, pts[i % n].y - pts[i - 1].y));
  const total = cum[n];
  const distFwd = (i, j) => { const d = cum[j] - cum[i]; return d >= 0 ? d : d + total; };

  // 1. Échantillons télémétrie -> point du tracé
  const bins = Array.from({ length: n }, () => []);   // [vitesse, à fond ?] par point
  const series = new Map();   // par voiture : [{t, idx, d, speed}]
  let samples = 0;
  for (const c of carData) {
    for (const entry of c.data?.Entries || []) {
      const t = parseUtc(entry.Utc);
      if (!Number.isFinite(t)) continue;
      for (const [num, car] of Object.entries(entry.Cars || {})) {
        const ch = car?.Channels;
        if (!ch) continue;
        const speed = Number(ch[2]), throttle = Number(ch[4]);
        if (!(speed > 30)) continue;
        const arr = tl.get(num);
        const p = arr && interp(arr, t);
        if (!p) continue;
        if (!series.has(num)) series.set(num, []);
        const s = series.get(num);
        const r = project(track, p.x, p.y, s.length ? s[s.length - 1].idx : -1);
        s.push({ t, idx: r.idx, d: r.d, speed });
        if (r.d > 15 * M) continue;
        bins[r.idx].push(speed, throttle >= 98 ? 1 : 0);
        if (++samples >= MAX_SAMPLES) break;
      }
      if (samples >= MAX_SAMPLES) break;
    }
    if (samples >= MAX_SAMPLES) break;
  }
  if (samples < 2000) return null;

  // 2. Proportion « à fond » par point, parmi les passages rapides (on écarte tours de
  //    rentrée, tours lents de qualif, safety car : vitesse < 85 % de la vitesse de référence),
  //    lissée sur ±25 m.
  const count = new Float64Array(n), full = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bins[i];
    if (b.length < 10) continue;
    const speeds = [];
    for (let k = 0; k < b.length; k += 2) speeds.push(b[k]);
    speeds.sort((x, y) => x - y);
    const ref = speeds[Math.floor(speeds.length * 0.9)];
    for (let k = 0; k < b.length; k += 2) {
      if (b[k] < ref * 0.85) continue;
      count[i]++;
      if (b[k + 1] && b[k] >= 160) full[i]++;
    }
  }
  const frac = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let c = count[i], f = full[i];
    for (let j = (i + 1) % n, g = 0; g < n && distFwd(i, j) <= 25 * M; j = (j + 1) % n, g++) { c += count[j]; f += full[j]; }
    for (let j = (i - 1 + n) % n, g = 0; g < n && distFwd(j, i) <= 25 * M; j = (j - 1 + n) % n, g++) { c += count[j]; f += full[j]; }
    frac[i] = c >= 5 ? f / c : 0;
  }

  // 3. Rectiligne : cap quasi constant sur ±60 m
  const ahead = (i, m) => { let j = i; for (let g = 0; g < n && distFwd(i, j) < m; g++) j = (j + 1) % n; return j; };
  const behind = (i, m) => { let j = i; for (let g = 0; g < n && distFwd(j, i) < m; g++) j = (j - 1 + n) % n; return j; };
  const straight = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = behind(i, 60 * M), b = ahead(i, 60 * M);
    straight[i] = angleDiff(heading(pts, a, i), heading(pts, i, b)) < (14 * Math.PI) / 180 ? 1 : 0;
  }
  const ok = (i) => straight[i] && frac[i] >= 0.7;

  // 4. Portions continues (circulaires), petits trous comblés, longueur minimale 300 m
  let startAt = 0;
  while (startAt < n && ok(startAt)) startAt++;
  if (startAt === n) return null;
  const runs = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (startAt + k) % n;
    if (ok(i)) {
      if (cur && distFwd(cur.to, i) <= 100 * M) cur.to = i;
      else { cur = { from: i, to: i }; runs.push(cur); }
    }
  }
  if (runs.length > 1) {
    const first = runs[0], last = runs[runs.length - 1];
    if (distFwd(last.to, first.from) <= 100 * M) { first.from = last.from; runs.pop(); }
  }
  const zones = runs
    .map((r) => ({ from: r.from, to: r.to, length: Math.round(distFwd(r.from, r.to) / M) }))
    .filter((r) => r.length >= 300);

  // 5. Détection ≈ entrée des stands : là où une voiture qui roule au limiteur hors piste
  //    a quitté le tracé (dernier point encore sur la piste avant la voie des stands).
  const entries = [];
  for (const s of series.values()) {
    for (let k = 0; k < s.length; k++) {
      if (!(s[k].d > 12 * M && s[k].speed > 40 && s[k].speed < 90)) continue;
      let e = k;
      while (e < s.length && s[e].d > 8 * M && s[e].speed < 95) e++;
      if (s[e - 1].t - s[k].t >= 8000) {
        let b = k;
        while (b > 0 && s[b].d > 4 * M && s[k].t - s[b].t < 20000) b--;
        if (s[b].d <= 4 * M) entries.push(cum[s[b].idx]);
      }
      k = e;
    }
  }
  let detection = null;
  if (entries.length >= 2) {
    const ref = entries[0];
    const un = entries.map((v) => { let d = v - ref; if (d > total / 2) d -= total; if (d < -total / 2) d += total; return ref + d; }).sort((a, b) => a - b);
    const med = ((un[Math.floor(un.length / 2)] % total) + total) % total;
    let idx = 0;
    while (idx < n - 1 && cum[idx + 1] <= med) idx++;
    detection = { idx, samples: entries.length };
  }
  return { zones, detection, samples };
}
