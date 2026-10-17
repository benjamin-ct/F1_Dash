import test from 'node:test';
import assert from 'node:assert/strict';
import { download, FILES } from '../analytics/download.js';

const names = ['Paddock-Live-1.27.19-x64-win.exe', 'Paddock-Live-1.27.19-portable.exe', 'Paddock-Live-1.27.19-mac-arm64.dmg', 'Paddock-Live-1.27.19-mac-arm64.zip', 'Paddock-Live-1.27.19-mac-x64.dmg', 'Paddock-Live-1.27.19-linux-x86_64.AppImage', 'Paddock-Live-1.27.19-linux-arm64.AppImage', 'Paddock-Live-1.27.19-linux-amd64.deb'];
const gh = async (url, opts) => {
  assert.equal(opts.redirect, 'manual');
  return { status: 302, headers: new Headers({ Location: 'https://github.com/benjamin-ct/paddock-live/releases/tag/v1.27.19' }) };
};

test('téléchargement : chaque système mène au bon fichier de la dernière version', async () => {
  for (const [os, file] of [['windows', 'x64-win.exe'], ['windows-portable', 'portable.exe'], ['mac-arm', 'mac-arm64.dmg'], ['mac-intel', 'mac-x64.dmg'], ['linux', 'x86_64.AppImage'], ['linux-arm', 'arm64.AppImage'], ['deb', 'amd64.deb']]) {
    const r = await download(`/download/${os}`, { fetchFn: gh, now: 1 });
    assert.equal(r.status, 302);
    assert.ok(r.headers.get('Location').endsWith(file), os);
    // Nom réel d'un fichier publié (liste de la version 1.27.19)
    assert.ok(names.some((n) => r.headers.get('Location').endsWith(`/v1.27.19/${n}`)), os);
  }
  assert.equal(Object.keys(FILES).length, 7);
  const j = await (await download('/download/latest.json', { fetchFn: gh, now: 2 })).json();
  assert.equal(j.version, '1.27.19');
  assert.equal(j.files.windows, 'Paddock-Live-1.27.19-x64-win.exe');
  // Système inconnu : page des versions
  assert.match((await download('/download/amiga', { fetchFn: gh, now: 3 })).headers.get('Location'), /releases\/latest$/);
});

test('nom de domaine : racine = site de l\'appli, www redirigé, workers.dev inchangé', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const env = { ASSETS: { fetch: async (req) => new Response(`site:${new URL(req.url).pathname}`) } };
  let r = await worker.fetch(new Request('https://paddocklive.app/'), env);
  assert.equal(await r.text(), 'site:/site/');
  r = await worker.fetch(new Request('https://www.paddocklive.app/legal/privacy?x=1'), env);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/legal/privacy?x=1');
  r = await worker.fetch(new Request('https://paddock-live-stats.paddock-live.workers.dev/'), env);
  assert.notEqual(await r.text(), 'site:/site/');
});

test('ancienne adresse workers.dev : connexion et statistiques renvoyées sur le nom de domaine, appels de l\'appli inchangés', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const env = { SITE_ORIGIN: 'https://paddocklive.app', STATS_KEY: 'k' };
  const W = 'https://paddock-live-stats.paddock-live.workers.dev';
  let r = await worker.fetch(new Request(`${W}/`), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/login');
  r = await worker.fetch(new Request(`${W}/stats?days=30`), env);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/stats?days=30');
  // Envoi des statistiques de l'appli : pas de redirection
  r = await worker.fetch(new Request(`${W}/e`, { method: 'POST', body: '{}' }), env);
  assert.notEqual(r.status, 302);
});
