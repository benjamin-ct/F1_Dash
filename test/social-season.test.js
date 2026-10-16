import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { weekendData, recordsData, ratingsData, raceRatings, teamDuelsData, raceLapsData, recapData, seasonCaptions, teamColor } from '../shared/social-season.js';
import { parseRaceLaps, cleanPace, lapsLedBy } from '../shared/race-laps.js';
import { questionCaptions, questionFor } from '../shared/social-follow.js';
import { slidesFor } from '../shared/social-draw.js';
import { newsPost } from '../shared/social-news.js';
import { xLength } from '../shared/social.js';
import { createScheduler } from '../server/post-schedule.js';
import { forecast } from '../server/forecast.js';

const drv = (code, name, team, teamId) => ({ code, name, last: name.split(' ').at(-1), team, teamId });
const D = { VER: drv('VER', 'Max Verstappen', 'Red Bull', 'red_bull'), TSU: drv('TSU', 'Yuki Tsunoda', 'Red Bull', 'red_bull'), LEC: drv('LEC', 'Charles Leclerc', 'Ferrari', 'ferrari'), HAM: drv('HAM', 'Lewis Hamilton', 'Ferrari', 'ferrari') };
const res = (code, pos, grid, pts, posText = String(pos)) => ({ ...D[code], pos, grid, points: pts, posText, status: posText === 'R' ? 'Accident' : 'Finished' });
const quali = (code, pos, q3) => ({ ...D[code], pos, q: [q3 + 1, q3 + 0.5, q3] });
const race = (round, results, q) => ({ round, name: 'United States Grand Prix', locality: 'Austin', country: 'USA', lat: 30.13, lon: -97.64, date: `2026-10-${round}T19:00:00Z`, sprint: false,
  sessions: [{ label: 'EL1', t: '2026-10-23T17:30:00Z' }, { label: 'Qualifications', t: '2026-10-24T21:00:00Z' }, { label: 'Course', t: '2026-10-25T19:00:00Z' }],
  results, quali: q, sprintResults: [] });
const R1 = race(10, [res('VER', 1, 2, 25), res('LEC', 2, 1, 18), res('HAM', 3, 4, 15), res('TSU', 4, 3, 12, 'R')], [quali('LEC', 1, 90), quali('VER', 2, 90.1), quali('TSU', 3, 90.4), quali('HAM', 4, 90.5)]);
const R2 = race(11, [res('LEC', 1, 1, 25), res('HAM', 2, 3, 18), res('VER', 3, 2, 15), res('TSU', 4, 4, 12)], [quali('LEC', 1, 90), quali('VER', 2, 90.2), quali('HAM', 3, 90.3), quali('TSU', 4, 90.6)]);

test('programme du week-end : horaires en heure de Paris, météo des jours de séance', () => {
  const d = weekendData(R1, { year: 2026, tyres: { hard: 2, medium: 3, soft: 4 }, forecast: [{ date: '2026-10-23', tmax: 25, tmin: 14, rain: 10 }, { date: '2026-10-25', tmax: 27.4, tmin: 15, rain: 30 }, { date: '2026-11-02', tmax: 1, tmin: 0, rain: 0 }] });
  assert.deepEqual(d.sessions.map((s) => [s.label, s.day, s.time]), [['Essais libres 1', 'Vendredi', '19:30'], ['Qualifications', 'Samedi', '23:00'], ['Course', 'Dimanche', '20:00']]);
  assert.equal(d.iso, 'us');
  assert.equal(d.date, '23 au 25 octobre 2026');
  assert.deepEqual(d.forecast.map((f) => f.day), ['Vendredi', 'Dimanche']);
  assert.deepEqual(slidesFor(d), ['couverture', 'horaires', 'infos']);
  const c = seasonCaptions(d, '@moi');
  assert.match(c.instagram, /^Programme du week-end : Grand Prix des États-Unis/);
  assert.match(c.instagram, /Dim\. 20:00 · Course/);
  assert.match(c.instagram, /Météo prévue dimanche : 27 °C, 30 % de risque de pluie/);
  assert.ok(xLength(c.x) <= 280 && c.threads.length <= 500);
});

test('le saviez-vous : records du circuit et spécialiste de la pole', () => {
  const p = (tla, time, team = 'Ferrari') => ({ tla, time, team, color: 'E80020' });
  const rec = { editions: [{ year: 2025, pole: p('LEC', 92.8), fastest: p('HAM', 97.1) }, { year: 2024, pole: p('LEC', 92.3), fastest: null }, { year: 2023, pole: p('HAM', 94.0), fastest: p('LEC', 96.5) }],
    bestPole: { ...p('LEC', 92.3), year: 2024 }, bestRaceLap: { ...p('LEC', 96.5), year: 2023 } };
  const d = recordsData(R1, rec, { year: 2026, names: { LEC: 'Charles Leclerc', HAM: 'Lewis Hamilton' } });
  assert.deepEqual(d.facts.map((f) => f.label), ['Record de la pole', 'Record du tour en course', 'Spécialiste de la pole']);
  assert.equal(d.facts[0].value, '1:32.300');
  assert.match(d.facts[2].sub, /2 poles sur les 3 dernières éditions/);
  assert.deepEqual(slidesFor(d), ['couverture', 'records', 'editions']);
  assert.deepEqual(slidesFor(recordsData(R1, { editions: [] }, { year: 2026 })), []);
});

test('notes des pilotes : résultat, places gagnées, duel avec le coéquipier, rythme', () => {
  const rows = raceRatings(R1);
  assert.equal(rows[0].code, 'VER');
  assert.equal(rows.at(-1).code, 'TSU');   // abandon, battu par son coéquipier
  assert.ok(rows.every((r) => r.note >= 3 && r.note <= 10));
  // Avec le rythme : un pilote bien plus rapide en course gagne des points
  const times = (base) => Array.from({ length: 20 }, (_, i) => (i === 0 ? base + 8 : base + (i % 3) * 0.1));
  const laps = { total: 20, drivers: [{ code: 'VER', times: times(95) }, { code: 'LEC', times: times(95.8) }, { code: 'HAM', times: times(94.5) }, { code: 'TSU', times: times(96) }] };
  const withPace = raceRatings(R1, { laps });
  assert.ok(withPace.find((r) => r.code === 'HAM').note > rows.find((r) => r.code === 'HAM').note);
  const d = ratingsData(R1, { year: 2026, laps });
  assert.ok(d.withPace);
  assert.deepEqual(slidesFor(d), ['couverture', 'topflop', 'notes']);
  assert.match(seasonCaptions(d, '').instagram, /1\. Max Verstappen : \d,\d\/10/);
});

test('duels entre coéquipiers sur la saison', () => {
  const season = { races: [R1, R2, { ...race(12, [], []), results: [] }], constructors: [{ id: 'ferrari' }, { id: 'red_bull' }] };
  const d = teamDuelsData(season, { year: 2026 });
  assert.equal(d.after, 2);
  assert.deepEqual(d.rows.map((r) => r.teamId), ['ferrari', 'red_bull']);
  const fer = d.rows[0];
  assert.equal(fer.a.code, 'LEC');
  assert.deepEqual([fer.a.q, fer.b.q, fer.a.r, fer.b.r], [2, 0, 2, 0]);
  assert.equal(fer.gap, -0.4);
  assert.deepEqual(slidesFor(d), ['couverture', 'equipes-1']);
  assert.match(seasonCaptions(d, '').instagram, /Ferrari : Leclerc 2-0 Hamilton en qualifs, 2-0 en course/);
  assert.equal(teamColor('red_bull'), '#3671C6');
  assert.equal(teamColor('Racing Bulls'), '#6692FF');
});

test('course tour par tour : pages de l\'API regroupées, leaders et remontées', () => {
  const T = (id, position, time) => ({ driverId: id, position: String(position), time });
  const pages = [{ round: '10', Laps: [{ number: '1', Timings: [T('max', 2, '1:40.0'), T('lec', 1, '1:39.0')] }] }, { round: '10', Laps: [{ number: '1', Timings: [T('ham', 3, '1:41.0')] }, { number: '2', Timings: [T('max', 1, '1:35.0'), T('lec', 2, '1:36.0'), T('ham', 3, '1:36.5')] }] }];
  const results = [
    { Driver: { driverId: 'max', code: 'VER', givenName: 'Max', familyName: 'Verstappen' }, Constructor: { name: 'Red Bull', constructorId: 'red_bull' }, grid: '2', position: '1', positionText: '1', status: 'Finished' },
    { Driver: { driverId: 'lec', code: 'LEC', givenName: 'Charles', familyName: 'Leclerc' }, Constructor: { name: 'Ferrari', constructorId: 'ferrari' }, grid: '1', position: '2', positionText: '2', status: 'Finished' },
    { Driver: { driverId: 'ham', code: 'HAM', givenName: 'Lewis', familyName: 'Hamilton' }, Constructor: { name: 'Ferrari', constructorId: 'ferrari' }, grid: '5', position: '3', positionText: '3', status: 'Finished' },
  ];
  const laps = parseRaceLaps(pages, results);
  assert.equal(laps.total, 2);
  assert.deepEqual(laps.drivers[0].pos, [2, 1]);
  assert.deepEqual(laps.drivers[2].times, [101, 96.5]);
  const { led, changes } = lapsLedBy(laps);
  assert.deepEqual([...led], [['LEC', 1], ['VER', 1]]);
  assert.equal(changes, 1);
  assert.equal(cleanPace([100, 90, 90.2]), null);   // trop peu de tours
  const d = raceLapsData(R1, laps, { year: 2026 });
  assert.equal(d.climbs[0].code, 'HAM');
  assert.deepEqual(slidesFor(d), ['couverture', 'positions']);
  assert.match(seasonCaptions(d, '').instagram, /Plus belles remontées : Hamilton \(P5 → P3\)/);
});

test('récap de la semaine et questions en fin de texte', () => {
  const it = (title, tags = []) => ({ id: title, title, summary: 'Résumé.', tags, src: 'f1', t: Date.UTC(2026, 9, 14), link: 'https://x.test', lang: 'fr', sources: 3 });
  const items = ['Hamilton signs new Ferrari deal', 'Verstappen handed grid penalty', 'Audi confirms line-up'].map((t) => newsPost(it(t), { sourceName: 'Formula 1' }));
  const d = recapData(items, { now: Date.UTC(2026, 9, 16, 12) });
  assert.deepEqual(slidesFor(d), ['recapcover', 'recap-1', 'recap-2', 'recap-3']);
  assert.equal(d.date, '10 octobre au 16 octobre');
  const c = seasonCaptions(d, '@moi');
  assert.match(c.instagram, /^La semaine en F1 : les 3 infos à retenir\n\n1\. TRANSFERT \| Hamilton signs new Ferrari deal\n2\. PÉNALITÉ/);
  // Question adaptée, avant la signature
  const q = questionCaptions(c, d, '@moi');
  assert.match(q.instagram, /\n\nQuelle info vous a le plus marqué cette semaine \?\n\n@moi\n\n#/);
  assert.match(questionFor({ kind: 'quali', sprint: false }), /Qui gagne la course/);
  assert.match(questionFor({ news: true, badge: { key: 'penalite' } }), /Sanction méritée/);
  assert.match(questionFor({ post: 'flash', event: { kind: 'sc' } }), /Qui va en profiter/);
  const full = { x: `${'a'.repeat(275)}\n\n#F1` };
  assert.equal(questionCaptions(full, d, '').x, full.x);   // X plein : inchangé
});

test('publications programmées : publiées à l\'heure, résultat gardé, annulation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-'));
  let now = Date.UTC(2026, 9, 16, 12);
  const sent = [];
  const recorded = [];
  const s = createScheduler({ dir, now: () => now, timers: false, publish: async (net, body) => { if (net === 'x') throw new Error('refusé'); sent.push([net, body.text]); return { id: '1', url: `https://${net}.test/1` }; }, record: async (e) => recorded.push(e) });
  assert.throws(() => s.add({ at: now - 3600e3, posts: [{ body: { network: 'instagram' } }] }), /Date/);
  assert.throws(() => s.add({ at: now + 60e3, posts: [] }), /réseau/);
  const a = s.add({ at: now + 3600e3, title: 'Programme', posts: [{ body: { network: 'instagram', text: 'Bonjour', images: ['AAAA'] } }, { body: { network: 'x', text: 'Salut' } }], record: { key: 'weekend:2026-19', kind: 'weekend', title: 'Programme' } });
  const b = s.add({ at: now + 7200e3, posts: [{ body: { network: 'threads', text: 'b' } }] });
  await s.tick();
  assert.equal(sent.length, 0);   // pas encore l'heure
  s.cancel(b.id);
  now += 3600e3 + 1000;
  await s.tick();
  assert.deepEqual(sent, [['instagram', 'Bonjour']]);
  const [job] = s.list();
  assert.equal(job.status, 'error');
  assert.deepEqual(job.results, { instagram: { ok: true, url: 'https://instagram.test/1' }, x: { ok: false, error: 'refusé' } });
  assert.equal(recorded[0].nets.instagram.url, 'https://instagram.test/1');
  assert.ok(!fs.readFileSync(path.join(dir, `${a.id}.json`), 'utf8').includes('AAAA'));   // visuels retirés après publication
  await s.tick();
  assert.equal(sent.length, 1);   // jamais publiée deux fois
  assert.throws(() => s.cancel('../x'), /inconnue/);
});

test('météo prévue : jours, températures et risque de pluie', async () => {
  const days = await forecast(30.13, -97.64, { get: async (u) => { assert.match(u, /latitude=30\.1300&longitude=-97\.6400/); return { daily: { time: ['2026-10-23', '2026-10-24'], temperature_2m_max: [25, 26], temperature_2m_min: [14, 15], precipitation_probability_max: [10, null] } }; } });
  assert.deepEqual(days, [{ date: '2026-10-23', tmax: 25, tmin: 14, rain: 10 }, { date: '2026-10-24', tmax: 26, tmin: 15, rain: null }]);
  await assert.rejects(forecast('a', 1), /Coordonnées/);
});
