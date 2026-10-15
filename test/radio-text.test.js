import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, tidy, badReply, fixRadio } from '../shared/radio-text.js';

test('radios : transcription sans aucun mot comptée comme vide', () => {
  assert.equal(clean('-'), '');
  assert.equal(clean(' ... '), '');
  assert.equal(clean('[Music]'), '');
  assert.equal(clean('Box box (static)'), 'Box box');
  assert.equal(clean('P4'), 'P4');
});

test('radios : réponse du modèle de langage nettoyée et contrôlée', () => {
  assert.equal(tidy('<think>hmm</think> « Rentre aux stands. »'), 'Rentre aux stands.');
  assert.equal(tidy('Traduction : Reçu, on reste dehors'), 'Reçu, on reste dehors');
  assert.equal(tidy('<think>sans fin'), '');
  const en = 'We are staying out this lap';
  assert.equal(badReply('', en), true, 'vide');
  assert.equal(badReply('We are staying out this lap.', en), true, 'anglais recopié');
  assert.equal(badReply('On reste dehors ce tour-ci', en), false);
  assert.equal(badReply('x'.repeat(200), en), true, 'explication bien plus longue que la radio');
  assert.equal(badReply('Copy.', 'Copy.'), false, 'mot identique dans les deux langues accepté');
});

test('radios : jargon F1 corrigé après le petit modèle de traduction', () => {
  assert.equal(fixRadio('La boîte, la boîte, on reste dehors', 'fr'), 'Rentre aux stands, rentre aux stands, on reste dehors');
  assert.equal(fixRadio('Copie.', 'fr'), 'Reçu.');
  assert.equal(fixRadio('Les pneus difficiles sont bons', 'fr'), 'Les pneus durs sont bons');
  assert.equal(fixRadio('Soulever et côte au virage 1', 'fr'), 'Lever le pied au virage 1');
  assert.equal(fixRadio('Reste doux sur les freins', 'fr'), 'Reste doux sur les freins', 'doux hors des pneus inchangé');
  assert.equal(fixRadio('Caja, caja', 'es'), 'Caja, caja', 'autres langues inchangées');
});
