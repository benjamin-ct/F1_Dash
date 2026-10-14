import test from 'node:test';
import assert from 'node:assert/strict';
import { localHost, sameSiteRequest, decodePath, webUrl } from '../server/guard.js';
import { webLink, parseFeed } from '../shared/news.js';
import { _test as f1tv } from '../server/f1tv.js';

test('sécurité : seules les adresses locales sont acceptées (DNS rebinding)', () => {
  for (const h of ['localhost:3000', '127.0.0.1:3000', '127.0.0.1', '[::1]:3000', 'LOCALHOST:3000']) assert.equal(localHost(h), true, h);
  for (const h of ['evil.example:3000', '127.0.0.1.evil.example', 'localhost.evil.example:3000', '', undefined]) assert.equal(localHost(h), false, String(h));
});

test('sécurité : l\'API refuse les requêtes venues d\'un autre site', () => {
  const host = '127.0.0.1:3000';
  assert.equal(sameSiteRequest({ host }), true, 'sans en-tête (appli de bureau, outils)');
  assert.equal(sameSiteRequest({ host, 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(sameSiteRequest({ host, 'sec-fetch-site': 'none' }), true, 'adresse tapée ou favori');
  assert.equal(sameSiteRequest({ host, 'sec-fetch-site': 'cross-site' }), false, 'image d\'une autre page');
  assert.equal(sameSiteRequest({ host, 'sec-fetch-site': 'same-site' }), false, 'autre port de localhost');
  assert.equal(sameSiteRequest({ host, origin: 'http://127.0.0.1:3000' }), true);
  assert.equal(sameSiteRequest({ host, origin: 'https://evil.example' }), false);
  assert.equal(sameSiteRequest({ host, origin: 'null' }), false);
});

test('robustesse : une adresse mal formée ne fait plus planter le serveur', () => {
  assert.equal(decodePath('/%E0%A4%A'), null);
  assert.equal(decodePath('/css/style.css'), '/css/style.css');
  assert.equal(decodePath('/a%20b'), '/a b');
});

test('sécurité : liens des actualités limités au web', () => {
  assert.equal(webLink('https://www.formula1.com/en/latest'), 'https://www.formula1.com/en/latest');
  assert.equal(webLink(' http://a.example/x '), 'http://a.example/x');
  for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ms-msdt:x', '', null]) assert.equal(webLink(u), null, String(u));
  const feed = parseFeed(`<rss><channel><item><title>Piège</title><link>javascript:alert(1)</link></item>
    <item><title>OK</title><link>https://ok.example/a</link><enclosure url="javascript:x" type="image/jpeg"/></item></channel></rss>`);
  assert.deepEqual(feed.items.map((i) => [i.title, i.link, i.img]), [['OK', 'https://ok.example/a', null]]);
  assert.equal(webUrl('https://x.example'), true);
  assert.equal(webUrl('file:///C:/x'), false);
});

test('sécurité : le jeton F1 TV ne part que vers les vrais domaines de la F1', () => {
  assert.equal(f1tv.onDomain('f1tv.formula1.com', 'formula1.com'), true);
  assert.equal(f1tv.onDomain('formula1.com', 'formula1.com'), true);
  assert.equal(f1tv.onDomain('evilformula1.com', 'formula1.com'), false);
  assert.equal(f1tv.hostAllowed('evilformula1.com'), false);
  assert.equal(f1tv.hostAllowed('x.akamaized.net'), true);
});

test('radar : seules des tuiles valides sont demandées à OpenStreetMap', async () => {
  const { validTile } = await import('../server/tiles.js');
  assert.equal(validTile(8, 164, 94), true);
  assert.equal(validTile(8, 256, 0), false, 'hors de la grille');
  assert.equal(validTile(14, 1, 1), false, 'zoom trop élevé');
  assert.equal(validTile(8, -1, 3), false);
  assert.equal(validTile(8, 1.5, 3), false);
  assert.equal(validTile(NaN, 1, 1), false);
});
