import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveGet, archiveJSON, archivePath, archiveAccess, resetArchiveAccess, STATIC, MIRROR } from '../server/archive.js';

// Faux serveur : réponse selon la méthode (libre, jeton F1 TV, miroir)
function fake(rules) {
  const calls = [];
  const fetch = async (url, { headers }) => {
    const m = url.startsWith(MIRROR) ? 'mirror' : headers.Authorization ? 'token' : 'open';
    calls.push(m);
    const status = rules[m] ?? 401;
    return { status, body: Buffer.from(status === 200 ? `﻿{"via":"${m}"}` : '') };
  };
  return { fetch, calls };
}

test('archives : accès libre quand la F1 le permet', async () => {
  resetArchiveAccess();
  const f = fake({ open: 200 });
  assert.deepEqual(await archiveJSON('2026/Index.json', { fetch: f.fetch, token: null }), { via: 'open' });
  assert.deepEqual(f.calls, ['open']);
});

test('archives : refus anonyme, connexion F1 TV utilisée puis retenue', async () => {
  resetArchiveAccess();
  const f = fake({ open: 401, token: 200 });
  assert.deepEqual(await archiveJSON('2026/Index.json', { fetch: f.fetch, token: 'jwt' }), { via: 'token' });
  assert.equal(archiveAccess(), 'token');
  f.calls.length = 0;
  await archiveJSON('2026/x.json', { fetch: f.fetch, token: 'jwt' });
  assert.deepEqual(f.calls, ['token']);   // directement la méthode qui marche
});

test('archives : jeton envoyé seulement à la F1, miroir en dernier recours', async () => {
  resetArchiveAccess();
  const seen = [];
  const fetch = async (url, { headers }) => { seen.push([url.startsWith(MIRROR), !!headers.Authorization]); return { status: url.startsWith(MIRROR) ? 200 : 401, body: Buffer.from('{}') }; };
  await archiveJSON('2026/Index.json', { fetch, token: 'jwt' });
  assert.deepEqual(seen, [[false, false], [false, true], [true, false]]);
});

test('archives : fermées -> message clair selon la connexion F1 TV', async () => {
  resetArchiveAccess();
  const f = fake({ open: 401, mirror: 404 });
  await assert.rejects(archiveGet('2026/Index.json', { fetch: f.fetch, token: null }), (e) => e.locked && e.status === 401 && /connectez votre compte F1 TV/.test(e.message));
  const g = fake({ open: 401, token: 403, mirror: 404 });
  await assert.rejects(archiveGet('2026/Index.json', { fetch: g.fetch, token: 'jwt' }), (e) => e.locked && /même avec la connexion F1 TV/.test(e.message));
});

test('archives : fichier absent (404) et erreur serveur', async () => {
  resetArchiveAccess();
  await assert.rejects(archiveGet('2026/x.json', { fetch: fake({ open: 404, mirror: 404 }).fetch, token: null }), (e) => e.status === 404 && !e.locked);
  await assert.rejects(archiveGet('2026/x.json', { fetch: fake({ open: 503 }).fetch, token: null }), (e) => e.status === 503);
});

test('archives : contenu brut (audio) et chemin d\'une adresse', async () => {
  resetArchiveAccess();
  const buf = await archiveGet('2026/a/TeamRadio/x.mp3', { fetch: fake({ open: 200 }).fetch, token: null, raw: true });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(archivePath(`${STATIC}2026/a%20b/TeamRadio/x.mp3?t=1`), '2026/a b/TeamRadio/x.mp3');
  assert.equal(archivePath('https://example.com/static/2026/x'), null);
});
