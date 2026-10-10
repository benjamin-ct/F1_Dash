// Données de la saison (calendrier, classements, résultats, qualifications, sprints) depuis
// l'API publique Jolpica (successeur d'Ergast), regroupées en un seul objet compact pour
// l'espace « Saison ». Saison en cours : rafraîchie toutes les 15 min ; saisons terminées :
// gardées sur disque une fois pour toutes ; copie disque aussi utilisée hors ligne.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON, withRetry } from './net.js';
import { CACHE_DIR } from './circuits.js';

const BASE = 'https://api.jolpi.ca/ergast/f1';
const TTL = 15 * 60 * 1000;
const mem = new Map();
const pending = new Map();

// L'API Jolpica limite le nombre de requêtes (4 par seconde) : elles sont espacées, et
// relancées en cas de refus temporaire (422, 429…), d'erreur serveur ou de délai dépassé.
const GAP_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve();
let lastAt = 0;
function throttled(fn) {
  const turn = queue.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  });
  queue = turn.catch(() => {});
  return turn.then(fn);
}

function jget(url) {
  return withRetry(() => throttled(() => getJSON(url, { timeout: 30000 })));
}

// Toutes les pages d'une ressource (limite 100 par page)
async function all(pathname, pick) {
  const out = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    const d = await jget(`${BASE}/${pathname}.json?limit=100&offset=${offset}`);
    total = Number(d?.MRData?.total) || 0;
    out.push(...pick(d?.MRData));
    if (!total) break;
  }
  return out;
}

// Les courses sont découpées sur plusieurs pages : on regroupe par manche
function byRound(races, key) {
  const m = new Map();
  for (const r of races) {
    const cur = m.get(r.round) || { ...r, [key]: [] };
    cur[key].push(...(r[key] || []));
    m.set(r.round, cur);
  }
  return [...m.values()];
}

const driverOf = (d) => ({ code: d?.code || d?.familyName?.slice(0, 3).toUpperCase(), name: `${d?.givenName || ''} ${d?.familyName || ''}`.trim(), last: d?.familyName || '', number: d?.permanentNumber || null });
const iso = (s) => (s?.date ? `${s.date}T${s.time || '00:00:00Z'}` : null);
// « 1:23.456 » -> secondes (null si pas de temps)
const lapTime = (t) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(t || '').trim());
  return m ? Math.round(((Number(m[1]) || 0) * 60 + Number(m[2])) * 1000) / 1000 : null;
};
// Format des données enregistrées : une copie plus ancienne est rechargée une fois
const FORMAT = 2;

export function summarize({ schedule, driverStandings, constructorStandings, results, quali, sprint }) {
  const res = new Map(byRound(results, 'Results').map((r) => [r.round, r.Results]));
  const qual = new Map(byRound(quali, 'QualifyingResults').map((r) => [r.round, r.QualifyingResults]));
  const spr = new Map(byRound(sprint, 'SprintResults').map((r) => [r.round, r.SprintResults]));
  const row = (x) => ({
    ...driverOf(x.Driver), team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '',
    grid: Number(x.grid) || null, pos: Number(x.position) || null, posText: x.positionText, status: x.status,
    points: Number(x.points) || 0, fastest: x.FastestLap?.rank === '1', time: x.Time?.time || null,
  });
  const races = schedule.map((r) => {
    const sessions = [['FirstPractice', 'EL1'], ['SecondPractice', 'EL2'], ['ThirdPractice', 'EL3'], ['SprintQualifying', 'Qualif. sprint'], ['Sprint', 'Sprint'], ['Qualifying', 'Qualifications']]
      .filter(([k]) => r[k]).map(([k, label]) => ({ label, t: iso(r[k]) }));
    sessions.push({ label: 'Course', t: iso(r) });
    const results = (res.get(r.round) || []).map(row);
    const q = (qual.get(r.round) || []).map((x) => ({ ...driverOf(x.Driver), team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '', pos: Number(x.position) || null,
      q: [x.Q1, x.Q2, x.Q3].map((t) => lapTime(t)) }));
    const s = (spr.get(r.round) || []).map(row);
    return {
      round: Number(r.round), name: r.raceName, circuit: r.Circuit?.circuitName, locality: r.Circuit?.Location?.locality,
      country: r.Circuit?.Location?.country, lat: Number(r.Circuit?.Location?.lat), lon: Number(r.Circuit?.Location?.long),
      date: iso(r), sprint: !!r.Sprint, sessions,
      results, quali: q, sprintResults: s,
    };
  });
  return {
    races,
    drivers: (driverStandings || []).map((x) => ({ pos: Number(x.position) || null, ...driverOf(x.Driver), team: x.Constructors?.at(-1)?.name || '', teamId: x.Constructors?.at(-1)?.constructorId || '', points: Number(x.points) || 0, wins: Number(x.wins) || 0 })),
    constructors: (constructorStandings || []).map((x) => ({ pos: Number(x.position) || null, name: x.Constructor?.name, id: x.Constructor?.constructorId, points: Number(x.points) || 0, wins: Number(x.wins) || 0 })),
  };
}

async function fetchSeason(year) {
  const [schedule, ds, cs, results, quali, sprint] = await Promise.all([
    all(`${year}`, (m) => m?.RaceTable?.Races || []),
    jget(`${BASE}/${year}/driverstandings.json?limit=100`),
    jget(`${BASE}/${year}/constructorstandings.json?limit=100`),
    all(`${year}/results`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/qualifying`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/sprint`, (m) => m?.RaceTable?.Races || []),
  ]);
  return {
    year,
    v: FORMAT,
    updated: Date.now(),
    ...summarize({
      schedule,
      driverStandings: ds?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings,
      constructorStandings: cs?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings,
      results, quali, sprint,
    }),
  };
}

// Saison terminée (année passée, toutes les courses ont un résultat) : elle ne change plus,
// la copie sur disque sert indéfiniment (l'API publique limite à 500 requêtes par heure).
const finished = (d) => d && d.v === FORMAT && d.year < new Date().getFullYear() && d.races?.length && d.races.every((r) => r.results?.length);

function readDisk(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export async function season(year) {
  const hit = mem.get(year);
  if (hit && (finished(hit) || Date.now() - hit.updated < TTL)) return hit;
  const file = path.join(CACHE_DIR, `season-${year}.json`);
  if (!hit) {
    const disk = readDisk(file);
    if (finished(disk) || (disk?.v === FORMAT && Date.now() - disk.updated < TTL)) { mem.set(year, disk); return disk; }
  }
  if (pending.has(year)) return pending.get(year);
  const job = fetchSeason(year).then((data) => {
    mem.set(year, data);
    try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* cache facultatif */ }
    return data;
  }).catch((err) => {
    // API indisponible : dernière copie connue
    const disk = readDisk(file);
    if (disk) return { ...disk, stale: true };
    throw new Error(apiError(err));
  }).finally(() => pending.delete(year));
  pending.set(year, job);
  return job;
}

// Message lisible pour une erreur de l'API des résultats
function apiError(err) {
  const st = err?.status;
  if (st === 429 || st === 422) return `le serveur des résultats (Jolpica) refuse temporairement les demandes (erreur ${st} : trop de demandes en peu de temps) ; réessayez dans quelques minutes`;
  if (st >= 500) return `le serveur des résultats (Jolpica) rencontre un problème (erreur ${st}) ; réessayez plus tard`;
  return `serveur des résultats (Jolpica) injoignable : ${err?.message || err}`;
}
