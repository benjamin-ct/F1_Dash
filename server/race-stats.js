// Statistiques détaillées de chaque Grand Prix de la saison, tirées des archives officielles
// F1 Live Timing : temps au tour (régularité, rythme), vitesses de pointe, arrêts aux stands,
// relais de pneus et profil du circuit. Chaque course terminée est analysée une seule fois
// (en arrière-plan), puis conservée sur disque.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON } from './net.js';
import { loadArchive, seasonIndex } from './replay.js';
import { circuit, CACHE_DIR } from './circuits.js';
import { season } from './season.js';
import { seasonNominations } from './tyres.js';
import { createDerived, applyEvent } from '../shared/derive.js';
import { parseLapTime } from '../shared/f1.js';
import { Track } from '../shared/track.js';

const STATIC = 'https://livetiming.formula1.com/static/';
const VERSION = 2;
const NEUTRAL = new Set(['4', '5', '6', '7']);   // SC, drapeau rouge, VSC, fin de VSC

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.values(o));
const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Tracé simplifié (≈160 points) dans un carré 100 × 100, orienté comme sur la carte.
export function outline(track) {
  if (!track?.pts?.length) return null;
  const a = (track.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const step = Math.max(1, Math.floor(track.pts.length / 160));
  const pts = track.pts.filter((_, i) => i % step === 0).map((p) => [p.x * cos - p.y * sin, -(p.x * sin + p.y * cos)]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const ox = (100 - ((Math.max(...xs) - minX) / span) * 92) / 2, oy = (100 - ((Math.max(...ys) - minY) / span) * 92) / 2;
  return pts.map(([x, y]) => `${(ox + ((x - minX) / span) * 92).toFixed(1)},${(oy + ((y - minY) / span) * 92).toFixed(1)}`).join(' ');
}

export function trackLength(track) {
  if (!track?.pts?.length) return null;
  let d = 0;
  for (let i = 0; i < track.pts.length; i++) {
    const p = track.pts[i], q = track.pts[(i + 1) % track.pts.length];
    d += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return Math.round(d / 10) / 1000;   // coordonnées en dixièmes de mètre -> km
}

// Résumé d'une course à partir des événements de l'archive (flux) et des états finaux (keyframes).
// Fonction pure (testée).
export function summarizeRace({ events, keyframes = {}, track = null }) {
  const state = {};
  const derived = createDerived();
  const status = [];   // [{off, s}]
  for (const e of events) {
    applyEvent(state, derived, e.topic, e.data, e.off);
    if (e.topic === 'TrackStatus' && e.data?.Status) status.push({ off: e.off, s: String(e.data.Status) });
  }
  const statusAt = (t) => {
    let s = '1';
    for (const x of status) { if (x.off > t) break; s = x.s; }
    return s;
  };
  const neutralBetween = (t0, t1) => NEUTRAL.has(statusAt(t0)) || NEUTRAL.has(statusAt(t1)) || status.some((x) => x.off > t0 && x.off <= t1 && NEUTRAL.has(x.s));

  const dl = keyframes.DriverList || state.DriverList || {};
  const stats = keyframes.TimingStats?.Lines || state.TimingStats?.Lines || {};
  const app = keyframes.TimingAppData?.Lines || state.TimingAppData?.Lines || {};
  const pitSeries = keyframes.PitStopSeries?.PitTimes || {};
  const final = state.TimingData?.Lines || {};

  const drivers = [];
  for (const [n, d] of Object.entries(dl)) {
    if (!d || typeof d !== 'object' || !d.Tla) continue;
    const stops = list(pitSeries[n]).map((p) => p?.PitStop).filter(Boolean)
      .map((p) => ({ lap: num(p.Lap), stop: num(p.PitStopTime), lane: num(p.PitLaneTime) }));
    const stopLaps = new Set(stops.flatMap((s) => (s.lap ? [s.lap, s.lap + 1] : [])));
    let prevT = null;
    const laps = [];
    for (const l of derived.laps[n] || []) {
      const lap = num(l.lap);
      const secs = parseLapTime(l.time);
      const t0 = prevT ?? l.t - 120000;
      prevT = l.t;
      if (!lap || !secs) continue;
      let flags = 0;
      if (l.pit || stopLaps.has(lap)) flags |= 1;
      if (neutralBetween(t0, l.t)) flags |= 2;
      if (lap === 1) flags |= 4;
      laps.push([lap, r3(secs), flags, l.pos || null]);
    }
    const sp = stats[n]?.BestSpeeds || {};
    const spd = (k) => num(sp[k]?.Value);
    drivers.push({
      num: n, tla: d.Tla, name: d.FullName || d.BroadcastName || d.Tla, last: d.LastName || '', team: d.TeamName || '',
      color: d.TeamColour ? `#${String(d.TeamColour).replace('#', '')}` : null,
      grid: num(app[n]?.GridPos), pos: num(final[n]?.Position), retired: !!final[n]?.Retired,
      best: parseLapTime(stats[n]?.PersonalBestLapTime?.Value) || null,
      speeds: { ST: spd('ST'), FL: spd('FL'), I1: spd('I1'), I2: spd('I2') },
      stops,
      stints: list(app[n]?.Stints).filter((s) => s?.Compound).map((s) => ({ c: s.Compound, n: num(s.TotalLaps) || 0, new: s.New === 'true' || s.New === true })),
      laps,
    });
  }

  // Profil de la course / du circuit
  const leaderLaps = new Map();
  for (const d of drivers) for (const [lap, , flags, pos] of d.laps) if (pos === 1) leaderLaps.set(lap, flags);
  const totalLaps = num(keyframes.LapCount?.TotalLaps) || num(state.LapCount?.TotalLaps) || Math.max(0, ...drivers.flatMap((d) => d.laps.map((l) => l[0])));
  const neutralLaps = [...leaderLaps.values()].filter((f) => f & 2).length;
  const bestLap = drivers.filter((d) => d.best).sort((a, b) => a.best - b.best)[0];
  const top = drivers.filter((d) => d.speeds.ST).sort((a, b) => b.speeds.ST - a.speeds.ST)[0];
  const allStops = drivers.flatMap((d) => d.stops);
  // Places gagnées en piste (hors 1er tour, tours aux stands et neutralisés) : indicateur de dépassements
  let gains = 0;
  for (const d of drivers) {
    for (let i = 1; i < d.laps.length; i++) {
      const [, , f, p] = d.laps[i], [, , fp, pp] = d.laps[i - 1];
      if (p && pp && p < pp && !(f & 7) && !(fp & 1)) gains += pp - p;
    }
  }
  const length = trackLength(track);
  return {
    v: VERSION,
    drivers,
    profile: {
      length, laps: totalLaps, distance: length && totalLaps ? Math.round(length * totalLaps * 10) / 10 : null,
      corners: track?.corners?.length || null, outline: outline(track),
      fastest: bestLap ? { time: bestLap.best, tla: bestLap.tla, team: bestLap.team, avgSpeed: length ? Math.round((length / bestLap.best) * 3600 * 10) / 10 : null } : null,
      topSpeed: top ? { kmh: top.speeds.ST, tla: top.tla, team: top.team } : null,
      neutralLaps, neutralPct: totalLaps ? Math.round((neutralLaps / totalLaps) * 1000) / 10 : 0,
      stops: allStops.length, stopMedian: r2(median(allStops.map((s) => s.stop).filter((v) => v > 0 && v < 30))),
      pitLane: r2(median(allStops.map((s) => s.lane).filter((v) => v > 5 && v < 60))),
      gains,
    },
  };
}

async function keyframe(p, topic) {
  try { return await getJSON(`${STATIC}${p}${topic}.json`, { timeout: 60000 }); } catch { return null; }
}

async function analyseRace(p, circuitKey, year) {
  const arc = await loadArchive(p, undefined, ['TimingData', 'TrackStatus', 'TimingAppData']);
  const [TimingStats, PitStopSeries, DriverList, LapCount, TimingAppData] = await Promise.all(
    ['TimingStats', 'PitStopSeries', 'DriverList', 'LapCount', 'TimingAppData'].map((t) => keyframe(p, t)));
  let track = null;
  try {
    const raw = circuitKey ? await circuit(circuitKey, year) : null;
    if (raw) track = new Track(raw);
  } catch { /* profil sans tracé */ }
  return summarizeRace({ events: arc.events, keyframes: { TimingStats, PitStopSeries, DriverList, LapCount, TimingAppData }, track });
}

// Session « Race » de l'archive correspondant à une manche (même jour, à un jour près)
function findRaceSession(index, race) {
  const day = Date.parse(race.date?.slice(0, 10));
  for (const m of index) {
    for (const s of m.sessions) {
      if (s.type !== 'Race' || !/^race$/i.test(s.name)) continue;
      if (Math.abs(Date.parse(s.start.slice(0, 10)) - day) <= 86400000) return { path: s.path, circuitKey: m.circuitKey };
    }
  }
  return null;
}

// Message lisible quand l'index des archives officielles d'une année est inaccessible
export function archiveError(year, err) {
  return err?.status === 403 || err?.status === 404
    ? `la F1 ne donne pas accès aux archives officielles de ${year}`
    : `archives officielles de la F1 injoignables (${err?.message || err}) ; nouvel essai dans quelques minutes`;
}

const jobs = new Map();       // année -> { running, failed: Map(round -> date) }
const file = (year, round) => path.join(CACHE_DIR, `race-${year}-${round}.json`);
const readRace = (year, round) => {
  try {
    const d = JSON.parse(fs.readFileSync(file(year, round), 'utf8'));
    return d.v === VERSION ? d : null;
  } catch { return null; }
};

async function runJob(year, todo) {
  const job = jobs.get(year);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      job.current = t.round;
      try {
        const res = await analyseRace(t.path, t.circuitKey, year);
        if (!res.drivers.some((d) => d.laps.length)) throw new Error('aucun tour dans l\'archive');
        fs.writeFileSync(file(year, t.round), JSON.stringify({ ...res, round: t.round, path: t.path }));
        console.log(`[stats] ${year} R${t.round} analysée (${t.path})`);
      } catch (err) {
        job.failed.set(t.round, Date.now());
        console.warn(`[stats] ${year} R${t.round} : ${err.message}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  job.running = false;
  job.current = null;
}

// Statistiques de toutes les courses terminées de l'année. Les courses pas encore analysées
// sont traitées en arrière-plan : la réponse indique alors l'avancement (pending).
export async function seasonStats(year) {
  const sd = await season(year);
  const done = sd.races.filter((r) => r.results.length);
  const races = [];
  const todo = [];
  let index = null;
  const job = jobs.get(year) || { running: false, failed: new Map(), current: null };
  jobs.set(year, job);
  for (const r of done) {
    const cached = readRace(year, r.round);
    if (cached) { races.push(cached); continue; }
    if (job.running || Date.now() - (job.failed.get(r.round) || 0) < 10 * 60000) continue;
    if (!index) {
      try { index = await seasonIndex(year); } catch (err) { index = []; job.indexError = archiveError(year, err); }
    }
    const s = findRaceSession(index, r);
    if (s) todo.push({ round: r.round, ...s });
  }
  if (todo.length && !job.running) {
    job.running = true;
    runJob(year, todo).catch(() => { job.running = false; });
  }
  // Archives officielles inaccessibles et rien en cache : on le dit plutôt que « 0 / 22 »
  if (!races.length && !job.running && job.indexError) return { year, total: done.length, done: 0, pending: false, races, error: job.indexError };
  return { year, total: done.length, done: races.length, pending: job.running, races, tyres: seasonNominations(year, sd.races) };
}
