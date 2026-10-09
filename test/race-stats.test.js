import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRace, trackLength, outline } from '../server/race-stats.js';

// Deux pilotes, 4 tours ; safety car pendant le 3e tour ; arrêt de A au 2e tour.
const lap = (off, num, n, time, pos, extra = {}) => ({ off, topic: 'TimingData', data: { Lines: { [num]: { NumberOfLaps: n, LastLapTime: { Value: time }, Position: String(pos), ...extra } } } });
const events = [
  { off: 0, topic: 'TrackStatus', data: { Status: '1' } },
  { off: 0, topic: 'TimingData', data: { Lines: { 1: { Position: '1' }, 2: { Position: '2' } } } },
  lap(90000, '1', 1, '1:30.000', 1), lap(91000, '2', 1, '1:31.000', 2),
  lap(180000, '1', 2, '1:40.000', 2), lap(181000, '2', 2, '1:29.500', 1),
  { off: 200000, topic: 'TrackStatus', data: { Status: '4' } },
  { off: 290000, topic: 'TrackStatus', data: { Status: '1' } },
  lap(300000, '1', 3, '2:00.000', 2), lap(301000, '2', 3, '2:00.500', 1),
  lap(400000, '1', 4, '1:29.000', 1), lap(401000, '2', 4, '1:29.900', 2),
];
const keyframes = {
  DriverList: { 1: { Tla: 'AAA', FullName: 'Pilote A', TeamName: 'Ferrari', TeamColour: 'ED1131' }, 2: { Tla: 'BBB', FullName: 'Pilote B', TeamName: 'McLaren', TeamColour: 'F47600' } },
  TimingStats: { Lines: { 1: { PersonalBestLapTime: { Value: '1:29.000' }, BestSpeeds: { ST: { Value: '331' }, FL: { Value: '300' } } }, 2: { BestSpeeds: { ST: { Value: '328' } } } } },
  PitStopSeries: { PitTimes: { 1: [{ PitStop: { RacingNumber: '1', PitStopTime: '2.4', PitLaneTime: '21.5', Lap: '2' } }] } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM', TotalLaps: 2, New: 'true' }, { Compound: 'HARD', TotalLaps: 2, New: 'true' }] } } },
  LapCount: { TotalLaps: 4 },
};

test('summarizeRace : tours, drapeaux, vitesses, arrêts', () => {
  const res = summarizeRace({ events, keyframes });
  const a = res.drivers.find((d) => d.tla === 'AAA');
  const b = res.drivers.find((d) => d.tla === 'BBB');
  assert.deepEqual(a.laps.map((l) => l[0]), [1, 2, 3, 4]);
  assert.equal(a.laps[0][2] & 4, 4, '1er tour marqué');
  assert.equal(a.laps[1][2] & 1, 1, 'tour de l\'arrêt marqué');
  assert.equal(a.laps[2][2] & 2, 2, 'tour sous safety car marqué');
  assert.equal(a.laps[3][2], 0, 'tour propre');
  assert.equal(b.laps[1][2], 0);
  assert.equal(a.laps[1][1], 100);
  assert.deepEqual(a.speeds, { ST: 331, FL: 300, I1: null, I2: null });
  assert.deepEqual(a.stops, [{ lap: 2, stop: 2.4, lane: 21.5 }]);
  assert.equal(a.grid, 2);
  assert.equal(a.best, 89);
  assert.equal(a.stints.length, 2);
  assert.equal(res.profile.laps, 4);
  assert.equal(res.profile.topSpeed.tla, 'AAA');
  assert.equal(res.profile.stops, 1);
  assert.equal(res.profile.neutralLaps, 1);
  assert.equal(res.profile.fastest.tla, 'AAA');
});

test('longueur et tracé simplifié', () => {
  // Carré de 1 km de côté (coordonnées en dixièmes de mètre)
  const pts = [[0, 0], [10000, 0], [10000, 10000], [0, 10000]].map(([x, y]) => ({ x, y }));
  const track = { pts, rotation: 0 };
  assert.equal(trackLength(track), 4);
  const o = outline(track).split(' ');
  assert.equal(o.length, 4);
  assert.ok(o.every((p) => p.split(',').every((v) => Number(v) >= 0 && Number(v) <= 100)));
});
