import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../server/f1tv.js';

test('F1 TV : lecture des résultats de recherche', () => {
  const page = { resultObj: { containers: [
    { metadata: { contentId: 1, title: 'Rencontre', emfAttributes: {} } },
    { retrieveItems: { resultObj: { containers: [
      { metadata: { contentId: 1000010385, title: '2026 Azerbaijan Grand Prix', contentSubtype: 'REPLAY', emfAttributes: { MeetingSessionKey: '11377' } } },
      { metadata: { contentId: 42, title: 'Sans attributs' } },
    ] } } },
  ] } };
  assert.deepEqual(_test.containersOf(page).map((c) => c.metadata.contentId), [1, 1000010385]);
});

test('F1 TV : le relais n\'accepte que les hôtes vidéo connus', () => {
  assert.equal(_test.hostAllowed('f1tv.formula1.com'), true);
  assert.equal(_test.hostAllowed('f1prodlive.akamaized.net'), true);
  assert.equal(_test.hostAllowed('example.com'), false);
  assert.equal(_test.hostAllowed('formula1.com.evil.net'), false);
});
