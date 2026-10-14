import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePick, resultOf, locksOf, leaderboard, playerKey } from '../shared/predict.js';

const result = { pole: 'VER', podium: ['VER', 'NOR', 'LEC'] };

test('pronostics : points (pole, podium exact, bonne place, ordre parfait)', () => {
  assert.equal(scorePick({ pole: 'VER', p1: 'VER', p2: 'NOR', p3: 'LEC' }, result).total, 3 + 9 + 2);
  assert.equal(scorePick({ pole: 'NOR', p1: 'NOR', p2: 'VER', p3: 'LEC' }, result).total, 0 + 1 + 1 + 3);
  assert.equal(scorePick({ pole: 'HAM', p1: 'HAM', p2: 'RUS', p3: 'PIA' }, result).total, 0);
  assert.equal(scorePick({ p1: 'VER' }, result).total, 3, 'pronostic incomplet');
  assert.equal(scorePick({ pole: 'VER', p1: 'VER' }, { pole: 'VER', podium: [] }).total, 3, 'qualifs courues, pas encore la course');
});

test('pronostics : résultat officiel et heures de fermeture', () => {
  const race = {
    date: '2026-11-01T20:00:00Z',
    sessions: [{ label: 'EL1', t: '2026-10-30T18:30:00Z' }, { label: 'Qualifications', t: '2026-11-01T00:00:00Z' }, { label: 'Course', t: '2026-11-01T20:00:00Z' }],
    quali: [{ code: 'NOR', pos: 1 }], results: [{ code: 'LEC', pos: 2 }, { code: 'NOR', pos: 1 }, { code: 'PIA', pos: 3 }],
  };
  assert.deepEqual(resultOf(race), { pole: 'NOR', podium: ['NOR', 'LEC', 'PIA'] });
  assert.equal(resultOf({ quali: [], results: [] }), null);
  assert.deepEqual(locksOf(race), { pole: Date.parse('2026-11-01T00:00:00Z'), podium: Date.parse('2026-11-01T20:00:00Z') });
});

test('pronostics : classement de la saison et noms de joueurs', () => {
  const store = { rounds: { 1: { ben: { name: 'Ben', pole: 'VER', p1: 'VER', p2: 'NOR', p3: 'LEC' }, lea: { name: 'Léa', p1: 'NOR' } }, 2: { lea: { name: 'Léa', pole: 'LEC' } } } };
  const races = [
    { round: 1, quali: [{ code: 'VER', pos: 1 }], results: [{ code: 'VER', pos: 1 }, { code: 'NOR', pos: 2 }, { code: 'LEC', pos: 3 }] },
    { round: 2, quali: [], results: [] },
  ];
  const board = leaderboard(store, races);
  assert.deepEqual(board.map((p) => [p.name, p.total]), [['Ben', 14], ['Léa', 1]]);
  assert.equal(board[1].rounds[2], null, 'manche pas encore courue');
  assert.equal(playerKey('  Léa '), 'léa');
  assert.equal(playerKey('<script>'), 'script');
  assert.equal(playerKey('   '), null);
});
