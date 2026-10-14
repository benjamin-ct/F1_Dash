// Pronostics entre amis : enregistrés sur cet ordinateur (predictions.json), saisis depuis
// l'ordinateur ou les téléphones de l'accès réseau. Fermeture au début des qualifications (pole)
// et au départ de la course (podium) ; pronostics des autres cachés jusque-là.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { season } from './season.js';
import { locksOf, resultOf, scorePick, leaderboard, playerKey } from '../shared/predict.js';

const FILE = path.join(DATA_DIR, 'predictions.json');
let data = null;

function load() {
  if (!data) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { data = {}; }
  }
  return data;
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); } catch (err) { console.warn('[pronostics]', err.message); }
}

export async function predictionsView(year, me, now = Date.now()) {
  const s = await season(year);
  const store = load()[year] || { rounds: {} };
  const meKey = playerKey(me);
  const races = s.races.map((r) => {
    const locks = locksOf(r);
    const result = resultOf(r);
    const picks = Object.entries(store.rounds[r.round] || {}).map(([key, p]) => {
      const mine = key === meKey;
      const showPole = mine || !locks.pole || now >= locks.pole;
      const showPodium = mine || !locks.podium || now >= locks.podium;
      return {
        name: p.name, mine,
        pole: showPole ? p.pole || null : (p.pole ? '?' : null),
        p1: showPodium ? p.p1 || null : (p.p1 ? '?' : null),
        p2: showPodium ? p.p2 || null : (p.p2 ? '?' : null),
        p3: showPodium ? p.p3 || null : (p.p3 ? '?' : null),
        points: result ? scorePick(p, result) : null,
      };
    }).sort((a, b) => (b.points?.total || 0) - (a.points?.total || 0) || a.name.localeCompare(b.name));
    return { round: r.round, name: r.name, locality: r.locality, date: r.date, locks, result, picks };
  });
  return {
    year, now,
    drivers: s.drivers.map((d) => ({ code: d.code, name: d.name, team: d.team })),
    races,
    board: leaderboard(store, s.races),
  };
}

export async function savePrediction({ year, round, name, pole, p1, p2, p3 }, now = Date.now()) {
  const key = playerKey(name);
  if (!key) throw new Error('Indiquez votre prénom ou un pseudo');
  const s = await season(year);
  const race = s.races.find((r) => r.round === Number(round));
  if (!race) throw new Error('Grand Prix introuvable');
  const codes = new Set(s.drivers.map((d) => d.code));
  const pickOk = (c) => c === null || c === undefined || c === '' || codes.has(c);
  if (![pole, p1, p2, p3].every(pickOk)) throw new Error('Pilote inconnu');
  const podium = [p1, p2, p3].filter(Boolean);
  if (new Set(podium).size !== podium.length) throw new Error('Un même pilote ne peut pas occuper deux places du podium');
  const locks = locksOf(race);
  const poleOpen = !locks.pole || now < locks.pole;
  const podiumOpen = !locks.podium || now < locks.podium;
  if (!poleOpen && !podiumOpen) throw new Error('Pronostics fermés : la course a commencé');
  const d = load();
  d[year] ||= { rounds: {} };
  d[year].rounds[race.round] ||= {};
  const old = d[year].rounds[race.round][key] || {};
  d[year].rounds[race.round][key] = {
    name: String(name).trim().slice(0, 24),
    pole: poleOpen ? pole || null : old.pole || null,
    p1: podiumOpen ? p1 || null : old.p1 || null,
    p2: podiumOpen ? p2 || null : old.p2 || null,
    p3: podiumOpen ? p3 || null : old.p3 || null,
    at: now,
  };
  save();
  return { ok: true, poleOpen, podiumOpen };
}
