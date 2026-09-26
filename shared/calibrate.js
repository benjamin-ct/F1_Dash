// Calibration des boucles de chronométrage d'un circuit.
// À partir d'une session où le GPS est disponible (archive officielle), on mesure où se trouve
// chaque fin de mini-secteur et de secteur sur le tracé. En live sans GPS, les positions
// estimées s'appuient ensuite sur ces vrais emplacements au lieu d'une répartition uniforme.
import { parseUtc } from './f1.js';

function forEachEntry(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) obj.forEach((v, i) => v !== undefined && fn(i, v));
  else for (const k of Object.keys(obj)) fn(Number(k), obj[k]);
}

// Médiane circulaire (valeurs dans [0, L)).
function circularMedian(values, L) {
  const ref = values[0];
  const unwrapped = values.map((v) => {
    let d = v - ref;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return ref + d;
  }).sort((a, b) => a - b);
  const m = unwrapped[Math.floor(unwrapped.length / 2)];
  return ((m % L) + L) % L;
}

/**
 * @param track   instance de Track
 * @param events  [{off, topic, data}] triés : TimingData et Heartbeat
 * @param positions [{off, data}] messages Position décompressés
 * @returns {{L, segs: Object<string, number>, sectors: number[], samples: number}}
 */
export function calibrateLoops(track, events, positions) {
  const L = track.L;
  // Décalage "offset d'archive - heure F1" : même recalage que dans le navigateur (Heartbeat),
  // calculé localement (minimum glissant) car l'horloge des archives peut faire des sauts.
  const hbs = events.filter((e) => e.topic === 'Heartbeat' && e.data?.Utc)
    .map((e) => ({ utc: parseUtc(e.data.Utc), d: e.off - parseUtc(e.data.Utc) }))
    .filter((h) => Number.isFinite(h.utc)).sort((a, b) => a.utc - b.utc);
  if (!hbs.length) return null;
  const smooth = hbs.map((h, i) => {
    let m = Infinity;
    for (let k = Math.max(0, i - 4); k <= Math.min(hbs.length - 1, i + 4); k++) m = Math.min(m, hbs[k].d);
    return { utc: h.utc, d: m };
  });
  const toOff = (utc) => {
    let lo = 0, hi = smooth.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (smooth[mid].utc <= utc) lo = mid; else hi = mid;
    }
    const h = Math.abs(smooth[lo].utc - utc) <= Math.abs(smooth[hi].utc - utc) ? smooth[lo] : smooth[hi];
    return utc + h.d;
  };

  const samples = new Map(); // num -> [{off, r}]
  const hints = new Map();
  for (const msg of positions) {
    for (const snap of msg.data?.Position || []) {
      const off = toOff(parseUtc(snap.Timestamp));
      for (const [num, e] of Object.entries(snap.Entries || {})) {
        if (!e || (e.X === 0 && e.Y === 0)) continue;
        const proj = track.project(e.X, e.Y, hints.get(num) ?? -1);
        hints.set(num, proj.i);
        if (proj.d2 > 300 ** 2) continue; // hors du tracé (voie des stands, garage)
        let arr = samples.get(num);
        if (!arr) samples.set(num, (arr = []));
        if (!arr.length || off > arr[arr.length - 1].off) arr.push({ off, r: proj.r });
      }
    }
  }

  const rAt = (num, off) => {
    const arr = samples.get(num);
    if (!arr || arr.length < 2) return null;
    let lo = 0, hi = arr.length - 1;
    if (off < arr[0].off || off > arr[hi].off) return null;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].off <= off) lo = mid; else hi = mid;
    }
    const a = arr[lo], b = arr[hi];
    if (b.off - a.off > 2000) return null;
    let dr = b.r - a.r;
    if (dr < -L / 2) dr += L;
    if (dr > L / 2) dr -= L;
    const u = (off - a.off) / (b.off - a.off || 1);
    return (((a.r + dr * u) % L) + L) % L;
  };

  const found = {};
  const add = (key, r) => { if (r !== null) (found[key] ||= []).push(r); };
  const pit = {};
  for (const e of events) {
    if (e.topic !== 'TimingData' || !e.data?.Lines) continue;
    for (const [num, upd] of Object.entries(e.data.Lines)) {
      if (!upd || typeof upd !== 'object') continue;
      if (upd.InPit !== undefined) pit[num] = upd.InPit;
      if (upd.PitOut) pit[num] = true;
      if (upd.PitOut === false && !upd.InPit) pit[num] = false;
      if (pit[num]) continue;
      forEachEntry(upd.Sectors, (i, s) => {
        if (!s || typeof s !== 'object' || i > 2) return;
        forEachEntry(s.Segments, (j, seg) => {
          if (seg?.Status && seg.Status !== 2064) add(`${i}-${j}`, rAt(num, e.off));
        });
        if (s.Value && i < 2) add(`S${i}`, rAt(num, e.off));
      });
      if (upd.NumberOfLaps !== undefined) add('LINE', rAt(num, e.off));
    }
  }

  const segs = {};
  const spread = {};
  let total = 0;
  for (const [key, vals] of Object.entries(found)) {
    if (vals.length < 5) continue;
    const med = circularMedian(vals, L);
    const dev = vals.map((v) => { let d = Math.abs(v - med) % L; return Math.min(d, L - d); }).sort((a, b) => a - b);
    const mad = dev[Math.floor(dev.length / 2)];
    spread[key] = mad / L;
    // Boucle mal localisée (mises à jour groupées, retard du flux) : ignorée.
    if (mad / L > (globalThis.__CAL_MAX_SPREAD ?? 0.01)) continue;
    segs[key] = med / L;
    total += vals.length;
  }
  if (!Object.keys(segs).length) return null;
  return {
    L,
    segs,
    sectors: [0, segs.S0 ?? null, segs.S1 ?? null, 1],
    line: segs.LINE ?? 0,
    samples: total,
    spread,
  };
}
