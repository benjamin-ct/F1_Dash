import test from 'node:test';
import assert from 'node:assert/strict';
import { fft, Resampler, resample, findClip, matchClip, commonNoise, removeNoise, delayFromMatch, RATE } from '../shared/audio-sync.js';
import { Hub } from '../server/hub.js';

// Générateur pseudo-aléatoire reproductible
function rng(seed) {
  let a = seed * 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

// « Voix » synthétique : bruit découpé en syllabes (4 par seconde), comme une radio
function voice(sec, seed) {
  const r = rng(seed), n = Math.round(sec * RATE), out = new Float32Array(n);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const syl = Math.sin(Math.PI * ((i / RATE) * 4 % 1)) ** 2 * (0.4 + 0.6 * Math.abs(Math.sin(i / RATE * 1.7 + seed)));
    env = 0.995 * env + 0.005 * syl;
    out[i] = r() * env;
  }
  return out;
}

// Radio publiée : préambule et bruit de fond identiques dans toutes les radios, puis la voix
const BED = (() => { const r = rng(99), b = new Float32Array(20 * RATE); for (let i = 0; i < b.length; i++) b[i] = r() * 0.04; return b; })();
function radio(sec, seed) {
  const v = voice(sec, seed), out = new Float32Array(Math.round((sec + 1.45) * RATE));
  for (let i = 0; i < out.length; i++) out[i] = BED[i] + (i >= 1.45 * RATE ? v[i - Math.round(1.45 * RATE)] : 0);
  return out;
}

// Son du salon : commentaires + moteurs + écho de la pièce, avec la radio diffusée à `at` secondes
function room(clip, at, sec = 30, seed = 5) {
  const r = rng(seed), n = sec * RATE, out = new Float32Array(n);
  const talk = voice(sec, seed + 1);
  for (let i = 0; i < n; i++) out[i] = 0.8 * talk[i] + 0.15 * Math.sin(i * 0.31) + 0.05 * r();
  const p = Math.round(at * RATE);
  for (let i = 0; i < clip.length && p + i < n; i++) {
    out[p + i] += 0.6 * clip[i];
    if (p + i + 240 < n) out[p + i + 240] += 0.3 * clip[i];   // réflexion 30 ms plus tard
    if (p + i + 900 < n) out[p + i + 900] += 0.15 * clip[i];
  }
  return out;
}

test('synchro par le son : FFT aller-retour', () => {
  const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i) + i / 10), im = new Float64Array(64);
  const orig = Float64Array.from(re);
  fft(re, im);
  fft(re, im, true);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(re[i] - orig[i]) < 1e-9 && Math.abs(im[i]) < 1e-9);
});

test('synchro par le son : rééchantillonnage du micro (48 kHz -> 8 kHz), par morceaux', () => {
  const x = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 48000));
  const rs = new Resampler(48000, RATE);
  const parts = [];
  for (let i = 0; i < x.length; i += 1000) parts.push(rs.push(x.subarray(i, i + 1000)));
  const y = Float32Array.from(parts.flatMap((p) => [...p]));
  const one = resample(x, 48000, RATE);
  assert.ok(Math.abs(y.length - 8000) < 40, `longueur ${y.length}`);
  for (let i = 100; i < y.length - 100; i++) {
    assert.ok(Math.abs(y[i] - Math.sin(2 * Math.PI * 1000 * i / RATE)) < 0.02, `échantillon ${i}`);
    assert.ok(Math.abs(y[i] - one[i]) < 1e-6, 'même résultat en un bloc ou par morceaux');
  }
  // Fréquence trop aiguë pour 8 kHz : filtrée (pas de repliement)
  const hi = resample(Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 7000 * i / 48000)), 48000, RATE);
  assert.ok(Math.max(...hi.slice(200, -200).map(Math.abs)) < 0.05);
});

test('synchro par le son : la radio diffusée est retrouvée, au bon moment', () => {
  const clip = radio(6, 11);
  const mic = room(clip, 12.37);
  const r = findClip(mic, clip);
  assert.ok(Math.abs(r.pos / RATE - 12.37) < 0.005, `trouvée à ${r.pos / RATE}`);
  const noise = commonNoise([clip, radio(5, 21), radio(7, 31), radio(4, 41)]);
  const m = matchClip(mic, removeNoise(clip, noise));
  assert.ok(m.ok, `score ${m.score}, confirmation ${m.confirm}`);
  assert.ok(Math.abs(m.start / RATE - 12.37) < 0.005);
});

test('synchro par le son : une autre radio (même préambule, même bruit de fond) n\'est pas reconnue', () => {
  const aired = radio(6, 11), other = radio(6, 12);
  const mic = room(aired, 12.37);
  const noise = commonNoise([aired, other, radio(5, 21), radio(7, 31)]);
  assert.ok(!matchClip(mic, removeNoise(other, noise)).ok, 'radio absente reconnue à tort');
  assert.ok(matchClip(mic, removeNoise(aired, noise)).ok, 'la radio diffusée, elle, est reconnue');
});

test('synchro par le son : bruit de fond commun estimé à partir de plusieurs radios', () => {
  const clips = [radio(6, 1), radio(6, 2), radio(6, 3), radio(6, 4), radio(6, 5)];
  const n = commonNoise(clips);
  let err = 0, ref = 0;
  for (let i = 0; i < 1.4 * RATE; i++) { err += (n[i] - BED[i]) ** 2; ref += BED[i] ** 2; }
  assert.ok(err / ref < 1e-6, 'préambule retrouvé exactement');
  assert.equal(commonNoise([clips[0], clips[1]])[100], 0, 'moins de 3 radios : pas d\'estimation');
});

test('synchro par le son : calcul du délai', () => {
  // Le dashboard affichait 12:00:10 quand la TV a diffusé la radio publiée à 12:00:00 :
  // il est en avance de 10 s, le délai passe de 30 à 40 s.
  const utc = Date.UTC(2026, 9, 18, 12, 0, 0);
  assert.equal(delayFromMatch(30000, utc + 10000, utc), 40000);
  assert.equal(delayFromMatch(30000, utc - 5000, utc), 25000);
  assert.equal(delayFromMatch(30000, utc, utc, 500), 30500, 'correction de l\'utilisateur');
});

test('synchro par le son : radios publiées fournies par le serveur (sans délai, jusqu\'à maintenant)', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  const now = Date.now();
  hub.addEvent('__snapshot', { SessionInfo: { Path: '2026/x/y/' }, TeamRadio: { Captures: [{ Utc: '2026-10-18T12:00:00Z', RacingNumber: '1', Path: 'TeamRadio/NOR_1_a.mp3' }] } }, now - 60000);
  hub.addEvent('TeamRadio', { Captures: { 1: { Utc: '2026-10-18T12:01:00Z', RacingNumber: 44, Path: 'TeamRadio/HAM_44_b.mp3' } } }, now - 30000);
  hub.addEvent('TeamRadio', { Captures: { 2: { Utc: '2026-10-18T12:09:00Z', RacingNumber: 16, Path: 'TeamRadio/LEC_16_c.mp3' } } }, now + 60000);
  const r = hub.radioCaptures();
  hub.close();
  assert.equal(r.base, 'https://livetiming.formula1.com/static/2026/x/y/');
  assert.deepEqual(r.radios.map((x) => [x.num, x.path]), [['1', 'TeamRadio/NOR_1_a.mp3'], ['44', 'TeamRadio/HAM_44_b.mp3']], 'pas encore reçue : absente');
});
