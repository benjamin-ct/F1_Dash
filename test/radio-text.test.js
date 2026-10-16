import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, tidy, badReply, fixRadio, collapseLoops } from '../shared/radio-text.js';

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
  // Traduction en ligne (m2m100)
  assert.equal(fixRadio('Boîte de boîte, boîte ce tour.', 'fr'), 'Rentre aux stands, rentre aux stands, rentre aux stands ce tour.');
  assert.equal(fixRadio('Boîte au prochain tour.', 'fr'), 'Rentre aux stands au prochain tour.');
  assert.equal(fixRadio('Les pneus difficiles sont bons', 'fr'), 'Les pneus durs sont bons');
  assert.equal(fixRadio('Soulever et côte au virage 1', 'fr'), 'Lever le pied au virage 1');
  assert.equal(fixRadio('Reste doux sur les freins', 'fr'), 'Reste doux sur les freins', 'doux hors des pneus inchangé');
  assert.equal(fixRadio('Caja, caja', 'es'), 'Caja, caja', 'autres langues inchangées');
});

test('radios embarquées : textes inventés sur le bruit du moteur écartés', async () => {
  const { isPhantom, newSegments } = await import('../shared/radio-text.js');
  for (const t of ['Thank you.', 'you', ' Thanks for watching! ', 'Go go go go go go', 'Subtitles by the community']) assert.equal(isPhantom(t), true, t);
  for (const t of ['Box this lap, box this lap.', 'Okay.', 'Go, go, go, push now']) assert.equal(isPhantom(t), false, t);
  // Fenêtre de 30 s commencée à 1 000 000 ms ; la précédente s'arrêtait à 1 004 000 ms
  const chunks = [
    { timestamp: [0, 3.5], text: ' Gap is two seconds.' },      // déjà donné par la fenêtre précédente
    { timestamp: [10, 12], text: ' Thank you.' },               // inventé
    { timestamp: [15, 19.2], text: ' Box this lap, box.' },
    { timestamp: [22, null], text: ' Copy.' },
  ];
  assert.deepEqual(newSegments(chunks, 1000000, 1004000).map((s) => [s.start, s.text]), [[1015000, 'Box this lap, box.'], [1022000, 'Copy.']]);
  // Phrases rapprochées d'une même radio réunies ; marqueurs « >> » retirés
  const one = [{ timestamp: [1, 3.4], text: ' >> Keep going.' }, { timestamp: [3.6, 5], text: ' >> I got it.' }, { timestamp: [9, 10], text: ' Copy.' }];
  assert.deepEqual(newSegments(one, 0, null).map((s) => s.text), ['Keep going. I got it.', 'Copy.']);
});

test('radios : phrase répétée en boucle par la reconnaissance vocale ou la traduction réduite à une fois', () => {
  assert.equal(collapseLoops(`because easier, ${'easier, '.repeat(60)}`), 'because easier…');
  assert.equal(collapseLoops(`parce que plus facile, ${'plus facile, '.repeat(80)}`), 'parce que plus facile…');
  assert.equal(clean(`(engine) because easier, ${'easier, '.repeat(30)}`), 'because easier…');
  assert.equal(collapseLoops(`I think ${'we need to box '.repeat(6)}now please.`), 'I think we need to box now please.');
  // Vraies répétitions des radios : gardées
  assert.equal(collapseLoops('Box box, box box, box box this lap, confirm'), 'Box box, box box, box box this lap, confirm');
  assert.equal(collapseLoops('Go, go, go, go, go! Push now'), 'Go, go, go, go, go! Push now');
  assert.equal(collapseLoops('Well done, Charles. Nicely driven race.'), 'Well done, Charles. Nicely driven race.');
});
