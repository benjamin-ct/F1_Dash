// Tracés de circuits (API MultiViewer) et calibration des boucles de chronométrage,
// avec cache disque dans .cache/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getJSON, HttpError } from './net.js';
import { DATA_DIR } from './config.js';
import { Track } from '../shared/track.js';
import { calibrateLoops } from '../shared/calibrate.js';
import { loadArchive, seasonIndex } from './replay.js';

export const CACHE_DIR = path.join(DATA_DIR, '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function readCache(name) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8')); } catch { return null; }
}

function writeCache(name, data) {
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data));
}

export async function circuit(key, year) {
  const name = `circuit-${key}-${year}.json`;
  const cached = readCache(name);
  if (cached) return cached;
  // Le tracé de l'année peut ne pas encore exister : on remonte les saisons précédentes.
  for (let y = year; y >= year - 6; y--) {
    try {
      const data = await getJSON(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`);
      if (Array.isArray(data?.x) && data.x.length) {
        writeCache(name, data);
        return data;
      }
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
    }
  }
  return null;
}

// Sessions archivées sur ce circuit, de la plus récente à la plus ancienne.
async function candidateSessions(key, year) {
  const out = [];
  for (const y of [year, year - 1]) {
    let idx = [];
    try { idx = await seasonIndex(y); } catch { continue; }
    for (const m of idx.filter((mm) => mm.circuitKey === key).reverse()) {
      for (const s of [...m.sessions].reverse()) {
        // Les sessions de moins de 3 h n'ont pas encore d'archive complète.
        const start = Date.parse(`${s.start}Z`) - offsetMs(s.gmtOffset);
        if (Date.now() - start > 3 * 3600 * 1000) out.push(s.path);
      }
    }
  }
  return out;
}

function offsetMs(gmt) {
  const m = /^(-)?(\d+):(\d+)/.exec(gmt || '');
  if (!m) return 0;
  return (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
}

const running = new Map();

export function loops(key, year) {
  const name = `loops-${key}-${year}.json`;
  const cached = readCache(name);
  if (cached) return Promise.resolve(cached);
  if (running.has(name)) return running.get(name);
  const job = (async () => {
    const data = await circuit(key, year);
    if (!data) return null;
    const track = new Track(data);
    for (const p of (await candidateSessions(key, year)).slice(0, 3)) {
      try {
        const arc = await loadArchive(p, undefined, ['Heartbeat', 'TimingData', 'Position.z']);
        const positions = arc.stream
          .filter((s) => s.topic === 'Position')
          .map((s) => ({ off: s.off, data: JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')) }));
        if (!positions.length) continue;
        const res = calibrateLoops(track, arc.events, positions);
        if (res && Object.keys(res.segs).length > 5) {
          res.source = p;
          writeCache(name, res);
          console.log(`[calibration] circuit ${key} : ${Object.keys(res.segs).length} boucles (${p})`);
          return res;
        }
      } catch (err) {
        console.warn(`[calibration] ${p} : ${err.message}`);
      }
    }
    return null;
  })().finally(() => running.delete(name));
  running.set(name, job);
  return job;
}
