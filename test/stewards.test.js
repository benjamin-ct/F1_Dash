import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStewards, isOpen } from '../shared/stewards.js';

const M = (Message, Lap = 10) => ({ Utc: '2026-09-13T15:00:00', Lap, Category: 'Other', Message });

test('enquêtes : suivi du statut jusqu\'à la pénalité purgée', () => {
  const r = analyzeStewards([
    M('TURN 5 INCIDENT INVOLVING CARS 55 (SAI) AND 14 (ALO) NOTED (15:23:42)'),
    M('FIA STEWARDS: TURN 5 INCIDENT INVOLVING CARS 55 (SAI) AND 14 (ALO) UNDER INVESTIGATION (15:23:42)'),
    M('FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 55 (SAI) (15:23:42)'),
    M('FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 55 (SAI) (15:23:42)'),
  ]);
  assert.equal(r.incidents.length, 1);
  const inc = r.incidents[0];
  assert.equal(inc.status, 'penalty');
  assert.equal(inc.location, 'Virage 5');
  assert.deepEqual(inc.cars.map((c) => c.tla), ['SAI', 'ALO']);
  assert.equal(inc.decisions[0].label, '5 s de pénalité');
  assert.ok(inc.decisions[0].servedAt, 'pénalité purgée');
  assert.equal(isOpen(inc), false);
});

test('enquêtes : mise à jour sans heure, incidents distincts du même pilote', () => {
  const r = analyzeStewards([
    M('INCIDENT INVOLVING CAR 11 (PER) NOTED - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT (14:20:30)'),
    M('FIA STEWARDS: INCIDENT INVOLVING CAR 11 (PER) WILL BE INVESTIGATED AFTER THE RACE - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT (14:20:30)'),
    M('TURN 1 INCIDENT INVOLVING CAR 11 (PER) NOTED - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – ESCAPE ROAD INSTRUCTIONS'),
    M('FIA STEWARDS: TURN 1 INCIDENT INVOLVING CAR 11 (PER) UNDER INVESTIGATION - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – ESCAPE ROAD INSTRUCTIONS (16:09:46)'),
    M('TURN 1 INCIDENT INVOLVING CARS 1 (NOR), 10 (GAS) AND 43 (COL) NOTED'),
    M('UPDATE: TURN 1 INCIDENT INVOLVING CARS 1 (NOR), 10 (GAS) AND 43 (COL) NOTED - CAUSING A COLLISION (16:11:31)'),
    M('FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 41 (LIN) AND 30 (LAW) REVIEWED NO FURTHER INVESTIGATION (16:11:33)'),
  ]);
  assert.equal(r.incidents.length, 4);
  assert.equal(r.incidents[0].status, 'after');
  assert.equal(r.incidents[1].status, 'investigating');
  assert.equal(r.incidents[2].reason, 'CAUSING A COLLISION');
  assert.equal(r.incidents[2].cars.length, 3);
  assert.equal(r.incidents[3].status, 'nfa');
});

test('limites de piste : comptage, drapeau noir et blanc, autres suppressions', () => {
  const r = analyzeStewards([
    M('CAR 44 (HAM) TIME 1:43.055 DELETED - TRACK LIMITS AT TURN 1 LAP 4 15:09:18'),
    M('CAR 44 (HAM) TIME 1:51.932 DELETED - TRACK LIMITS AT TURN 20 LAP 5 15:12:23'),
    M('CAR 44 (HAM) LAP DELETED - TRACK LIMITS AT TURN 17 LAP 6 15:14:10 (PIT)'),
    { ...M('BLACK AND WHITE FLAG FOR CAR 44 (HAM) - TRACK LIMITS'), Category: 'Flag', Flag: 'BLACK AND WHITE' },
    M('CAR 30 (LAW) TIME 2:00.207 DELETED - DOUBLE YELLOW AT TURN 7 LAP 3 16:07:45'),
  ]);
  const ham = r.trackLimits.find((d) => d.tla === 'HAM');
  assert.equal(ham.deletions.length, 3);
  assert.deepEqual(ham.deletions.map((d) => d.turn), [1, 20, 17]);
  assert.equal(ham.deletions[2].pit, true);
  assert.ok(ham.blackWhite);
  const law = r.trackLimits.find((d) => d.tla === 'LAW');
  assert.equal(law.deletions.length, 0);
  assert.equal(law.otherDeletions.length, 1);
});
