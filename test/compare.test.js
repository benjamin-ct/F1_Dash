import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniSectors } from '../server/compare.js';

test('comparaison : mini-secteurs reconstruits (boucles connues + interpolation)', () => {
  // Ligne à 0,1 du tracé ; fins de secteur à 0,4 et 0,7 (soit 0,3 et 0,6 depuis la ligne)
  const loops = { line: 0.1, segs: { S0: 0.4, S1: 0.7, '0-0': 0.2, '1-1': 0.6, '2-0': 0.8 } };
  const m = miniSectors(loops, [3, 3, 2]);
  assert.equal(m.length, 8);
  assert.deepEqual(m.map((x) => x.name), ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2']);
  // Boucle connue 0-0 : fin de 1.1 à 0,1 depuis la ligne ; 1.2 interpolée entre 0,1 et 0,3
  assert.ok(Math.abs(m[0].to - 0.1) < 1e-9 && !m[0].approx);
  assert.ok(Math.abs(m[1].to - 0.2) < 1e-9 && m[1].approx);
  // Fin de secteur et fin du tour exactes, sans trou ni chevauchement
  assert.ok(Math.abs(m[2].to - 0.3) < 1e-9);
  assert.equal(m.at(-1).to, 1);
  for (let i = 1; i < m.length; i++) assert.equal(m[i].from, m[i - 1].to);
  // Sans fin de secteur connue : seulement les boucles localisées
  assert.equal(miniSectors({ line: 0, segs: { '0-0': 0.2, '0-1': 0.5 } }, [2, 2, 2]).length, 2);
  assert.deepEqual(miniSectors(null), []);
});
