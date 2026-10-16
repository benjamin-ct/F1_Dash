import test from 'node:test';
import assert from 'node:assert/strict';
import { postData, captions, gapFr } from '../shared/social.js';
import { slidesFor } from '../shared/social-draw.js';

const state = {
  SessionInfo: { Type: 'Race', Name: 'Race', StartDate: '2026-09-06T13:00:00', Meeting: { Name: 'Italian Grand Prix', Country: { Code: 'ITA', Name: 'Italy' } } },
  SessionStatus: { Status: 'Finished' },
  LapCount: { CurrentLap: 53, TotalLaps: 53 },
  DriverList: { 1: { Tla: 'NOR', FirstName: 'Lando', LastName: 'Norris', TeamName: 'McLaren', TeamColour: 'FF8000' }, 16: { Tla: 'LEC', FirstName: 'Charles', LastName: 'Leclerc', TeamName: 'Ferrari' }, 44: { Tla: 'HAM', FirstName: 'Lewis', LastName: 'Hamilton', TeamName: 'Ferrari' }, 14: { Tla: 'ALO', LastName: 'Alonso' }, 18: { Tla: 'STR', LastName: 'Stroll' } },
  TimingData: { Lines: {
    1: { Position: '1', NumberOfLaps: 53, GapToLeader: 'LAP 53' }, 16: { Position: '2', GapToLeader: '+2.5', NumberOfLaps: 53 }, 44: { Position: '3', GapToLeader: '+8.123', NumberOfLaps: 53 },
    18: { Position: '4', NumberOfLaps: 52, GapToLeader: '1L', Stopped: true }, 14: { Position: '5', NumberOfLaps: 20, Retired: true },
  } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM' }, { Compound: 'HARD' }] }, 16: { GridPos: '1' }, 44: { GridPos: '10' }, 18: { GridPos: '8' }, 14: { GridPos: '6' } } },
  TimingStats: { Lines: { 44: { PersonalBestLapTime: { Value: '1:21.000', Position: 1, Lap: 50 } } } },
  RaceControlMessages: { Messages: [{ Message: 'SAFETY CAR DEPLOYED', Lap: 12 }] },
  ChampionshipPrediction: { Drivers: { 1: { RacingNumber: '1', CurrentPosition: 2, PredictedPosition: 1, CurrentPoints: 300, PredictedPoints: 325 } }, Teams: { McLaren: { TeamName: 'McLaren', CurrentPosition: 1, PredictedPosition: 1, CurrentPoints: 600, PredictedPoints: 625 } } },
};

test('posts : écarts en français', () => {
  assert.equal(gapFr('+2.5'), '+2,5 s');
  assert.equal(gapFr('1L'), '+1 tour');
  assert.equal(gapFr('3 LAPS'), '+3 tours');
  assert.equal(gapFr('LAP 53'), '');
});

test('posts : données de la course (classement, points, faits marquants, championnat)', () => {
  const d = postData(state);
  assert.equal(d.kind, 'race');
  assert.equal(d.gp, "Grand Prix d'Italie");
  assert.equal(d.date, '6 septembre 2026');
  assert.deepEqual(d.rows.map((r) => [r.tla, r.gap, r.points]), [['NOR', '', 25], ['LEC', '+2,5 s', 18], ['HAM', '+8,123 s', 15], ['STR', '+1 tour', 12], ['ALO', 'Abandon', 0]]);
  assert.equal(d.rows[0].color, '#FF8000');
  assert.equal(d.rows[2].delta, 7);
  const f = Object.fromEntries(d.facts.map((x) => [x.label, x]));
  assert.equal(f['Meilleur tour'].value, 'Hamilton');
  assert.equal(f['Plus belle remontée'].sub, 'P10 → P3 (+7)');
  assert.equal(f['Stratégie du vainqueur'].sub, 'Médiums → Durs');
  assert.equal(f.Neutralisations.value, '1 safety car');
  assert.equal(f.Abandons.sub, 'Alonso');
  assert.deepEqual([d.champ.drivers[0].tla, d.champ.drivers[0].gained, d.champ.drivers[0].move], ['NOR', 25, 1]);
});

test('posts : légendes Instagram et X', () => {
  const c = captions(postData(state), '@BenjyPaddock');
  assert.match(c.instagram, /^Lando Norris remporte le Grand Prix d'Italie !/);
  assert.match(c.instagram, /2\. Charles Leclerc \(Ferrari\) \+2,5 s/);
  assert.match(c.instagram, /\n\n@BenjyPaddock\n\n/);
  const tags = c.instagram.split('\n').at(-1).split(' ');
  assert.deepEqual(tags.slice(0, 9), ['#BenjyPaddock', '#F1', '#Formula1', '#Formule1', '#ItalianGP', '#F12026', '#RaceDay', '#LandoNorris', '#Norris']);
  for (const t of ['#Leclerc', '#Hamilton', '#McLaren', '#ScuderiaFerrari', '#Italy', '#GrandPrix']) assert.ok(tags.includes(t), t);
  assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, tags.length, 'pas de doublon');
  assert.match(c.x, /#BenjyPaddock #F1 #ItalianGP #LandoNorris$/);
  assert.match(c.threads, /#F1 #BenjyPaddock$/);
  assert.ok(c.x.length <= 280);
  assert.ok(c.threads.length <= 500);
  assert.match(c.threads, /^Lando Norris remporte/);
  assert.match(c.x, /^Norris remporte le Grand Prix d'Italie devant Leclerc et Hamilton\./);
});

test('posts : qualifications', () => {
  const q = {
    ...state,
    SessionInfo: { ...state.SessionInfo, Type: 'Qualifying', Name: 'Qualifying' },
    TimingData: { SessionPart: 3, Lines: {
      1: { Position: '1', BestLapTimes: [{ Value: '1:20.5' }, { Value: '1:20.1' }, { Value: '1:19.8' }], Stats: [{}, {}, { TimeDiffToFastest: '' }] },
      16: { Position: '2', BestLapTimes: [{}, {}, { Value: '1:19.9' }], Stats: [{}, {}, { TimeDiffToFastest: '+0.100' }] },
      14: { Position: '3', KnockedOut: true, BestLapTimes: [{ Value: '1:21.0' }], Stats: [] },
    } },
  };
  const d = postData(q);
  assert.equal(d.kind, 'quali');
  assert.deepEqual(d.rows.map((r) => r.gap), ['1:19.8', '+0,100', '1:21.0']);
  assert.equal(d.rows[2].koPart, 1);
  assert.match(captions(d).instagram, /^Pole position pour Lando Norris au Grand Prix d'Italie !/);
});

test('posts : couverture « Résultats » en première image du carrousel Instagram seulement', () => {
  const d = { kind: 'race', rows: [{}], facts: [], champ: {} };
  assert.deepEqual(slidesFor(d, 'ig'), ['couverture', 'vainqueur', 'podium', 'classement', 'faits', 'championnat']);
  assert.deepEqual(slidesFor(d, 'x'), ['vainqueur', 'podium', 'classement', 'faits', 'championnat']);
  assert.deepEqual(slidesFor(d, 'story')[0], 'vainqueur');
  assert.deepEqual(slidesFor({ ...d, kind: 'quali', champ: null }, 'ig').slice(0, 2), ['couverture', 'pole']);
  assert.deepEqual(slidesFor({ ...d, rows: [] }, 'ig'), []);
});
