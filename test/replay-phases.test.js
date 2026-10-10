import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionPhases, yellowPeriods, SPEEDS } from '../server/replay.js';

const ev = (off, topic, data) => ({ off, topic, data });

test('parties de la séance : Q1, Q2, Q3 du feu vert au drapeau à damier', () => {
  const events = [
    ev(0, 'TimingData', { SessionPart: 1 }), ev(100, 'SessionStatus', { Status: 'Started' }), ev(200, 'SessionStatus', { Status: 'Finished' }),
    ev(250, 'TimingData', { SessionPart: 2 }), ev(260, 'SessionStatus', { Status: 'Inactive' }), ev(300, 'SessionStatus', { Status: 'Started' }),
    ev(400, 'SessionStatus', { Status: 'Finished' }), ev(450, 'TimingData', { SessionPart: 3 }), ev(500, 'SessionStatus', { Status: 'Started' }),
  ];
  assert.deepEqual(sessionPhases(events, 900), [{ start: 100, part: 1, end: 200 }, { start: 300, part: 2, end: 400 }, { start: 500, part: 3, end: 900 }]);
});

test('course interrompue : départ puis reprise', () => {
  const events = [ev(10, 'SessionStatus', { Status: 'Started' }), ev(50, 'SessionStatus', { Status: 'Aborted' }), ev(80, 'SessionStatus', { Status: 'Started' }), ev(120, 'SessionStatus', { Status: 'Finished' })];
  assert.deepEqual(sessionPhases(events, 200).map((p) => [p.start, p.end]), [[10, 50], [80, 120]]);
});

test('drapeaux jaunes et vitesses de lecture', () => {
  const events = [ev(5, 'TrackStatus', { Status: '2' }), ev(9, 'TrackStatus', { Status: '1' }), ev(20, 'TrackStatus', { Status: '2' })];
  assert.deepEqual(yellowPeriods(events, 30), [{ start: 5, end: 9 }, { start: 20, end: 30 }]);
  for (const s of [1, 2, 5, 10, 20, 30]) assert.ok(SPEEDS.includes(s));
});
