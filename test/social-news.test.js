import test from 'node:test';
import assert from 'node:assert/strict';
import { bigNews, newsKind, newsPost, newsCaptions, shortSummary } from '../shared/social-news.js';
import { slidesFor } from '../shared/social-draw.js';

const NOW = Date.UTC(2026, 9, 16, 12);
const H = 3600e3;
const it = (o) => ({ id: o.title, cluster: o.title, kind: 'article', cat: 'media', lang: 'en', imp: 1, sources: 1, t: NOW - H, tags: [], summary: '', ...o });

test('posts news : type de nouvelle', () => {
  assert.equal(newsKind({ title: 'Haas sign Ferrari junior Rafael Camara for 2027' }).key, 'transfert');
  assert.equal(newsKind({ title: 'Ten things we learned in Austin' }).key, 'actu');
  assert.equal(newsKind({ title: 'Camara signs multi-year deal with Haas' }).key, 'transfert');
  assert.equal(newsKind({ title: 'Russell handed grid penalty for new engine' }).label, 'PÉNALITÉ');
  assert.equal(newsKind({ title: 'Bottas annonce sa retraite' }).key, 'depart');
  assert.equal(newsKind({ title: 'Calendar update', cat: 'official' }).key, 'officiel');
});

test('posts news : grosses news seulement, un seul article par sujet (même dans deux langues)', () => {
  const items = [
    it({ title: 'Rafael Camara signs multi-year deal with Haas', cat: 'official', sources: 9, t: NOW - 20 * H }),
    it({ title: 'Why Haas decided to risk promoting rookie Camara', cat: 'official', imp: 2, t: NOW - 20 * H }),
    it({ title: 'Rafael Câmara s\'engage avec Haas', lang: 'fr', sources: 7, t: NOW - 20 * H }),
    it({ title: 'Mekies extends Red Bull contract', imp: 2, sources: 6, t: NOW - 30 * H }),
    it({ title: 'Ten things we learned from practice', imp: 0, sources: 5 }),
    it({ title: 'Watch: onboard lap', kind: 'video', imp: 3 }),
    it({ title: 'Old contract news', imp: 3, t: NOW - 60 * H }),
  ];
  const big = bigNews(items, { now: NOW });
  assert.deepEqual(big.map((x) => x.title), ['Rafael Camara signs multi-year deal with Haas', 'Mekies extends Red Bull contract']);
  assert.equal(big[0].sources, 17);   // articles des trois sujets réunis
  assert.equal(bigNews(items, { now: NOW, all: true }).length, 3);
});

test('posts news : données du post et légendes', () => {
  const item = it({ title: 'Norris signs new McLaren contract', tags: ['NOR', 'mclaren'], sources: 4, link: 'https://x.test/a' });
  const dl = { 4: { Tla: 'NOR', FirstName: 'Lando', LastName: 'Norris', TeamName: 'McLaren', TeamColour: 'FF8000', HeadshotUrl: 'https://h.test/n.png' } };
  const d = newsPost(item, { title: 'Norris prolonge avec McLaren', summary: 'Première phrase. Deuxième phrase. Troisième phrase très longue '.repeat(5), driverList: dl, sourceName: 'Autosport' });
  assert.equal(d.badge.key, 'transfert');
  assert.equal(d.drivers[0].headshot, 'https://h.test/n.png');
  assert.equal(d.color, '#FF8000');
  assert.ok(d.summary.length <= 280);
  assert.deepEqual(slidesFor(d), ['news']);
  const c = newsCaptions(d, '@moi');
  assert.match(c.instagram, /^TRANSFERT \| Norris prolonge avec McLaren\n\nPremière phrase\./);
  assert.match(c.instagram, /Source : Autosport \(repris par 3 autres médias\)/);
  assert.match(c.instagram, /#LandoNorris #McLaren/);
  assert.ok(c.x.length <= 280 && c.threads.length <= 500);
  assert.equal(shortSummary('Court.'), 'Court.');
});
