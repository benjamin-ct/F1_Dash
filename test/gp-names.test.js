import test from 'node:test';
import assert from 'node:assert/strict';
import { gpShort, gpFull } from '../shared/gp-names.js';

test('noms des Grands Prix : courant et couru dans un autre pays', () => {
  assert.equal(gpShort('Australian Grand Prix'), 'Australie');
  assert.equal(gpFull('Australian Grand Prix'), "Grand Prix d'Australie");
  // 2026 : le Grand Prix de Bahreïn couru à Sepang
  const n = 'Bahrain Grand Prix in Malaysia';
  assert.equal(gpShort(n), 'Bahreïn (Malaisie)');
  assert.equal(gpShort(n, true), 'Bahrain (Malaysia)');
  assert.equal(gpFull(n), 'Grand Prix de Bahreïn en Malaisie');
  assert.equal(gpFull(n, true), n);
});
