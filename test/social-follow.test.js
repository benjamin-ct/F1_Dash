import test from 'node:test';
import assert from 'node:assert/strict';
import { slidesFor, pointPages, slideName } from '../shared/social-draw.js';
import { followCaptions, followReason } from '../shared/social-follow.js';
import { newsPost, newsCaptions, cleanPoints } from '../shared/social-news.js';
import { xLength } from '../shared/social.js';

const race = { kind: 'race', rows: [{}], facts: [{}], champ: null, summary: { paragraphs: [] } };
const item = { id: 'n1', title: 'Hamilton extends Ferrari deal', summary: 'Ferrari has extended Hamilton.', tags: ['HAM'], src: 'f1', t: Date.UTC(2026, 9, 16), link: 'https://www.formula1.com/a/1', lang: 'en', sources: 1 };

test('abonnement : dernière image des carrousels, pas au format X ni sur une image seule', () => {
  assert.deepEqual(slidesFor(race), ['couverture', 'vainqueur', 'podium', 'classement', 'faits']);
  assert.equal(slidesFor(race, { fmt: 'ig', follow: true }).at(-1), 'abonnement');
  assert.equal(slidesFor(race, { fmt: 'story', follow: true }).at(-1), 'abonnement');
  assert.ok(!slidesFor(race, { fmt: 'x', follow: true }).includes('abonnement'));
  assert.deepEqual(slidesFor({ post: 'flash', rows: [] }, { follow: true }), ['flash']);
  assert.deepEqual(slidesFor(newsPost(item, { title: 'T', summary: 'S' }), { follow: true }), ['news']);
  assert.equal(slideName('abonnement'), 'Abonnez-vous');
  assert.equal(slideName('essentiel-2'), "L'essentiel");
  assert.match(followReason({ post: 'prerace', sprint: true }), /le sprint/);
  assert.match(followReason({ news: true }), /actu/);
});

test('abonnement : ligne ajoutée aux textes, dans la limite de chaque réseau', () => {
  const d = { kind: 'race', rows: [{}] };
  const caps = {
    instagram: 'Norris remporte le Grand Prix !\n\nPodium :\n1. Lando Norris\n\n@moi\n\n#F1 #Formula1',
    threads: 'Norris remporte le Grand Prix !\n\n@moi\n\n#F1',
    x: 'Norris remporte le Grand Prix devant Verstappen.\n\n#F1 #MexicoGP',
    bsky: 'Norris remporte le Grand Prix devant Verstappen.\n\n#F1 #MexicoGP',
    story: 'Norris remporte le Grand Prix !',
  };
  const f = followCaptions(caps, d, '@moi');
  // Signature seule remplacée par l'appel, hashtags toujours à la fin
  assert.match(f.instagram, /\n\nAbonnez-vous à @moi pour suivre toute l'actualité de la Formule 1\.\n\n#/);
  assert.ok(!f.instagram.includes('\n\n@moi\n\n'));
  assert.match(f.x, /Suivez @moi pour toute l'actu F1\./);
  assert.ok(xLength(f.x) <= 280);
  assert.ok(f.threads.length <= 500);
  assert.equal(f.story, caps.story);
  // X déjà plein : texte laissé tel quel
  const full = { x: `${'a'.repeat(270)}\n\n#F1` };
  assert.equal(followCaptions(full, d, '@moi').x, full.x);
  // Sans compte : appel générique, pas de ligne sur X
  const g = followCaptions({ instagram: 'Titre\n\n#F1', x: 'Titre\n\n#F1' }, d, '');
  assert.equal(g.instagram, "Titre\n\nAbonnez-vous pour suivre toute l'actualité de la Formule 1.\n\n#F1");
  assert.equal(g.x, 'Titre\n\n#F1');
});

test("news en plusieurs images : points clés répartis, légendes avec l'essentiel", () => {
  assert.deepEqual(cleanPoints('- Premier point du résumé.\n\n2) Deuxième point.\n•  Troisième   point.'), ['Premier point du résumé.', 'Deuxième point.', 'Troisième point.']);
  assert.equal(cleanPoints(Array(9).fill('Un point assez long.')).length, 6);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd']).map((p) => p.length), [2, 2]);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd', 'e']).map((p) => p.length), [3, 2]);
  assert.deepEqual(pointPages(['a', 'b', 'c', 'd', 'e'], 'story').map((p) => p.length), [5]);
  assert.deepEqual(pointPages([]), []);
  const points = ['Ferrari prolonge Hamilton de deux saisons.', 'Le Britannique restera jusqu’en 2028.', 'Vasseur salue son expérience.', 'Le duo avec Leclerc est maintenu.'];
  const d = newsPost(item, { title: 'Ferrari prolonge Hamilton', summary: 'Hamilton reste chez Ferrari.', points: points.join('\n') });
  assert.deepEqual(d.points, points);
  assert.deepEqual(slidesFor(d), ['news', 'essentiel-1', 'essentiel-2']);
  assert.deepEqual(slidesFor(d, { fmt: 'ig', follow: true }), ['news', 'essentiel-1', 'essentiel-2', 'abonnement']);
  assert.deepEqual(slidesFor(d, { fmt: 'story', follow: true }), ['news', 'essentiel-1', 'abonnement']);
  assert.ok(slidesFor(d, { fmt: 'x', follow: true }).length <= 4);
  const c = newsCaptions(d, '@moi');
  assert.match(c.instagram, /L'essentiel :\n– Ferrari prolonge Hamilton de deux saisons\.\n– Le Britannique/);
  assert.match(c.facebook, /L'essentiel :/);
  assert.ok(!c.x.includes("L'essentiel"));
  // Instagram : 2 200 caractères au plus, les points restent sur les images
  const long = newsPost(item, { title: 'T', summary: 'S', points: Array(6).fill('x'.repeat(250)) });
  assert.ok(newsCaptions(long, '@moi').instagram.length <= 2200);
});
