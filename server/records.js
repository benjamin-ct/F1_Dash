// Références du circuit : pole et meilleur tour en course des éditions précédentes (archives F1
// Live Timing, depuis 2018), pour situer les temps de la séance. Gardées sur disque (définitives).
import fs from 'node:fs';
import path from 'node:path';
import { getJSON } from './net.js';
import { seasonIndex } from './replay.js';
import { CACHE_DIR } from './circuits.js';
import { parseLapTime } from '../shared/f1.js';

const STATIC = 'https://livetiming.formula1.com/static/';
const FIRST_YEAR = 2018;
const YEARS_BACK = 4;

function readCache(name) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8')); } catch { return null; }
}
function writeCache(name, data) {
  try { fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data)); } catch { /* cache facultatif */ }
}

// Meilleur tour d'une séance archivée : { time, tla, team, lap }
async function sessionBest(sesPath) {
  const [td, dl] = await Promise.all([
    getJSON(`${STATIC}${sesPath}TimingData.json`, { timeout: 30000 }),
    getJSON(`${STATIC}${sesPath}DriverList.json`, { timeout: 30000 }).catch(() => ({})),
  ]);
  let best = null;
  for (const [num, l] of Object.entries(td?.Lines || {})) {
    const t = parseLapTime(l?.BestLapTime?.Value);
    if (t > 0 && (!best || t < best.time)) best = { time: t, num, lap: Number(l.BestLapTime.Lap) || null };
  }
  if (!best) return null;
  const d = dl?.[best.num] || {};
  return { time: best.time, tla: d.Tla || best.num, team: d.TeamName || '', color: d.TeamColour || '', lap: best.lap };
}

async function editionOf(year, circuitKey) {
  const name = `records-${circuitKey}-${year}.json`;
  const cached = readCache(name);
  if (cached) return cached.none ? null : cached;
  let index;
  try { index = await seasonIndex(year); } catch { return null; }
  const meeting = index.find((m) => Number(m.circuitKey) === Number(circuitKey) && m.sessions.some((s) => s.type === 'Race'));
  if (!meeting) { writeCache(name, { none: true }); return null; }
  const quali = meeting.sessions.find((s) => s.type === 'Qualifying' && !/sprint/i.test(s.name));
  const race = meeting.sessions.find((s) => s.type === 'Race' && !/sprint/i.test(s.name));
  const [pole, fastest] = await Promise.all([
    quali ? sessionBest(quali.path).catch(() => null) : null,
    race ? sessionBest(race.path).catch(() => null) : null,
  ]);
  if (!pole && !fastest) return null;   // archive pas encore disponible : on réessaiera
  const out = { year, name: meeting.name, pole, fastest };
  writeCache(name, out);
  return out;
}

// Éditions précédentes (au plus 4) du Grand Prix disputé sur ce circuit
export async function circuitRecords(circuitKey, year) {
  const years = [];
  for (let y = year - 1; y >= Math.max(FIRST_YEAR, year - YEARS_BACK); y--) years.push(y);
  const editions = (await Promise.all(years.map((y) => editionOf(y, circuitKey).catch(() => null)))).filter(Boolean);
  const pick = (k) => editions.map((e) => e[k] && { ...e[k], year: e.year }).filter(Boolean).sort((a, b) => a.time - b.time)[0] || null;
  return { circuitKey, editions, bestPole: pick('pole'), bestRaceLap: pick('fastest') };
}
