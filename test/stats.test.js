import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBatch, MAX_COUNT } from '../shared/stats.js';
import { createStats } from '../server/stats.js';
import worker from '../analytics/worker.js';

test('statistiques : lot nettoyé (noms, appareils, nombres), doublons additionnés', () => {
  const b = cleanBatch({ v: '1.27.0', os: 'win', items: [['rail.season', 'desktop', 2], ['rail.season', 'desktop', 3], ['Bad Name', 'desktop', 1], ['tab.map', 'tv', 1], ['tab.map', 'phone', 0], ['tab.map', 'phone', 1.5], ['x', '-', 1e9], 'nope'] });
  assert.deepEqual(b, { version: '1.27.0', os: 'win', items: [['rail.season', 'desktop', 5], ['x', '-', MAX_COUNT]] });
  assert.equal(cleanBatch({ v: 'abc', os: 'win', items: [['a', '-', 1]] }), null);
  assert.equal(cleanBatch({ v: 'dev', os: 'amiga', items: [['a', '-', 1]] }), null);
  assert.equal(cleanBatch({ v: 'dev', os: 'linux', items: [] }), null);
  assert.equal(cleanBatch(null), null);
});

function harness(initial = {}) {
  let cfg = { ...initial };
  const sent = [];
  const saved = [];
  let fail = false;
  let day = '2026-10-15';
  const s = createStats({
    config: { get: () => cfg, save: (p) => { cfg = { ...cfg, ...p }; } },
    post: async (url, body) => { if (fail) throw new Error('hors ligne'); sent.push({ url, body }); },
    store: { load: () => [], save: (items) => saved.push(items) },
    url: 'https://stats.test/e',
    version: '1.27.0',
    os: 'linux',
    today: () => day,
  });
  return { s, sent, saved, cfg: () => cfg, setFail: (v) => { fail = v; }, setDay: (d) => { day = d; } };
}

test('statistiques : rien sans accord, puis compteurs envoyés et remis à zéro', async () => {
  const h = harness();
  assert.deepEqual(h.s.state(), { available: true, enabled: false, asked: false });
  assert.equal(h.s.fromClient({ 'rail.season': 1 }, 'desktop'), 0);
  h.s.record('session.replay');
  assert.equal(await h.s.flush(), false);
  assert.equal(h.sent.length, 0);

  h.s.set(true);
  assert.deepEqual(h.s.state(), { available: true, enabled: true, asked: true });
  // Une fenêtre ne peut pas gonfler les compteurs réservés au serveur
  assert.equal(h.s.fromClient({ 'rail.season': 2, 'tab.map': 1, 'app.active': 9, 'session.live': 3, 'app.open': 1, 'BAD': 1 }, 'phone'), 3);
  h.s.record('session.replay');
  assert.equal(await h.s.flush(), true);
  const { body } = h.sent[0];
  assert.equal(body.v, '1.27.0');
  assert.equal(body.os, 'linux');
  const m = Object.fromEntries(body.items.map(([e, d, n]) => [`${e}|${d}`, n]));
  assert.deepEqual(m, { 'app.active|-': 1, 'app.install|-': 1, 'rail.season|phone': 2, 'tab.map|phone': 1, 'app.open|phone': 1, 'session.replay|-': 1 });
  assert.equal(await h.s.flush(), false);   // plus rien en attente
});

test('statistiques : installation active une fois par jour, nouvelle installation une seule fois', async () => {
  const h = harness({ stats: true });
  h.s.markActive();
  h.s.markActive();
  await h.s.flush();
  h.setDay('2026-10-16');
  await h.s.flush();
  const all = h.sent.flatMap((x) => x.body.items).map(([e, , n]) => `${e}:${n}`);
  assert.deepEqual(all.sort(), ['app.active:1', 'app.active:1', 'app.install:1']);
});

test('statistiques : hors ligne, les compteurs sont gardés pour le prochain envoi', async () => {
  const h = harness({ stats: true, statsDay: '2026-10-15', statsInstalled: true });
  h.s.fromClient({ 'rail.news': 2 }, 'desktop');
  h.setFail(true);
  assert.equal(await h.s.flush(), false);
  h.s.fromClient({ 'rail.news': 1 }, 'desktop');
  h.setFail(false);
  assert.equal(await h.s.flush(), true);
  assert.deepEqual(h.sent[0].body.items, [['rail.news', 'desktop', 3]]);
});

test('statistiques : refuser efface ce qui attendait', async () => {
  const h = harness({ stats: true, statsDay: '2026-10-15', statsInstalled: true });
  h.s.fromClient({ 'rail.news': 2 }, 'browser');
  h.s.set(false);
  assert.deepEqual(h.s.pending(), []);
  assert.deepEqual(h.saved.at(-1), []);
  assert.equal(await h.s.flush(), false);
  assert.equal(h.cfg().stats, false);
});

test('statistiques : adresse vide = fonction désactivée, aucune question', () => {
  const s = createStats({ config: { get: () => ({ stats: true }), save() {} }, store: { load: () => [], save() {} }, url: '' });
  assert.deepEqual(s.state(), { available: false, enabled: false, asked: true });
});

// Base D1 simulée : assez pour le Worker (insertion additionnée, requêtes repérées par leur étiquette)
function fakeD1() {
  const rows = new Map();
  const sum = (list, key) => {
    const m = new Map();
    for (const r of list) { const k = key(r); m.set(k, (m.get(k) || 0) + r.n); }
    return [...m];
  };
  return {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            sql, a,
            async all() {
              const list = [...rows.values()].filter((r) => r.day >= a[0]);
              const tag = sql.match(/\/\*(\w+)\*\//)?.[1];
              const timeline = ['app.active', 'app.open', 'app.install', 'session.live', 'session.replay'];
              if (tag === 'daily') return { results: sum(list.filter((r) => timeline.includes(r.event) || r.event.startsWith('error.')), (r) => `${r.day}|${r.event}`).map(([k, n]) => ({ day: k.split('|')[0], event: k.split('|')[1], n })) };
              if (tag === 'events') return { results: sum(list, (r) => `${r.event}|${r.device}`).map(([k, n]) => ({ event: k.split('|')[0], device: k.split('|')[1], n })) };
              if (tag === 'versions') return { results: sum(list.filter((r) => r.event === 'app.active'), (r) => r.version).map(([version, n]) => ({ version, n })).sort((x, y) => y.n - x.n) };
              if (tag === 'systems') return { results: sum(list.filter((r) => r.event === 'app.active'), (r) => r.os).map(([os, n]) => ({ os, n })).sort((x, y) => y.n - x.n) };
              throw new Error(`requête inattendue : ${sql}`);
            },
          };
        },
      };
    },
    async batch(stmts) {
      for (const { a: [day, event, device, version, os, n] } of stmts) {
        const k = [day, event, device, version, os].join('|');
        const r = rows.get(k) || { day, event, device, version, os, n: 0 };
        r.n += n;
        rows.set(k, r);
      }
    },
  };
}

const W = 'https://w.test';
const get = (env, path, cookie) => worker.fetch(new Request(W + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }), env);
const login = (env, key) => worker.fetch(new Request(`${W}/login`, { method: 'POST', body: new URLSearchParams({ key }), redirect: 'manual' }), env);

test('serveur des statistiques : réception des lots', async () => {
  const env = { DB: fakeD1(), STATS_KEY: 'secret-123' };
  const post = (body) => worker.fetch(new Request(`${W}/e`, { method: 'POST', body: JSON.stringify(body) }), env);
  assert.equal((await post({ v: '1.27.0', os: 'win', items: [['app.active', '-', 1], ['rail.season', 'desktop', 4], ['app.open', 'desktop', 2]] })).status, 204);
  assert.equal((await post({ v: '1.27.0', os: 'mac', items: [['app.active', '-', 1], ['rail.season', 'phone', 1]] })).status, 204);
  assert.equal((await post({ v: 'x', os: 'win', items: [] })).status, 400);
  assert.equal((await worker.fetch(new Request(`${W}/e`, { method: 'POST', body: '{' }), env)).status, 400);
  assert.equal((await worker.fetch(new Request(`${W}/e`, { method: 'POST', body: 'x'.repeat(40000) }), env)).status, 413);
  assert.equal([...env.DB.rows.values()].every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)), true);
  // Sans mot de passe configuré : la réception marche, les pages non
  assert.equal((await post.call(null, { v: 'dev', os: 'linux', items: [['x', '-', 1]] })).status, 204);
  assert.equal((await get({ DB: env.DB }, '/')).status, 503);
});

test('serveur des statistiques : connexion par mot de passe et session', async () => {
  const env = { DB: fakeD1(), STATS_KEY: 'secret-123' };
  const home = await get(env, '/');
  assert.equal(home.status, 200);
  const page = await home.text();
  assert.match(page, /type="password"/);
  assert.match(home.headers.get('Content-Security-Policy'), /script-src 'nonce-/);

  assert.equal((await get(env, '/stats')).headers.get('Location'), '/');   // pas connecté
  assert.equal((await get(env, '/stats.json')).status, 403);

  const bad = await login(env, 'nope');
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /Mot de passe incorrect/);
  assert.equal(bad.headers.get('Set-Cookie'), null);

  const ok = await login(env, 'secret-123');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('Location'), '/stats');
  const cookie = ok.headers.get('Set-Cookie').split(';')[0];
  assert.match(ok.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(cookie.includes('secret-123'), false);   // le mot de passe n'est pas dans le cookie

  assert.equal((await get(env, '/', cookie)).headers.get('Location'), '/stats');
  const dash = await get(env, '/stats?days=7', cookie);
  assert.equal(dash.status, 200);
  assert.match(await dash.text(), /Fonctions utilisées/);
  assert.equal((await get(env, '/stats', 'pl_stats=faux')).status, 303);
  // Ancien lien avec ?key= : session ouverte, mot de passe retiré de l'adresse
  const legacy = await get(env, '/stats?key=secret-123&days=90');
  assert.equal(legacy.headers.get('Location'), '/stats?days=90');
  assert.ok(legacy.headers.get('Set-Cookie'));
  // Changer le mot de passe déconnecte les sessions
  assert.equal((await get({ ...env, STATS_KEY: 'autre' }, '/stats', cookie)).status, 303);
  const out = await get(env, '/logout', cookie);
  assert.match(out.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('serveur des statistiques : chiffres du tableau de bord', async () => {
  const env = { DB: fakeD1(), STATS_KEY: 'k' };
  const now = Date.parse('2026-10-15T12:00:00Z');
  const add = (day, event, device, n, version = '1.27.0', os = 'win') => env.DB.batch([{ a: [day, event, device, version, os, n] }]);
  await add('2026-10-15', 'app.active', '-', 3);
  await add('2026-10-14', 'app.active', '-', 1, '1.26.1', 'mac');
  await add('2026-10-05', 'app.active', '-', 4);   // période précédente (7 jours)
  await add('2026-10-15', 'rail.season', 'desktop', 5);
  await add('2026-10-15', 'rail.season', 'phone', 2);
  await add('2026-10-15', 'tab.trace', 'browser', 1);
  await add('2026-10-15', 'app.open', 'desktop', 6);
  await add('2026-10-15', 'lang.en', 'desktop', 2);
  await add('2026-10-15', 'error.tower.js:12', 'desktop', 1);
  await add('2026-10-15', 'session.live', '-', 1);
  await add('2026-10-15', 'test.deploy', '-', 1);
  const { summary } = await import('../analytics/worker.js');
  const s = await summary(env, 7, now);
  assert.equal(s.since, '2026-10-09');
  assert.equal(s.until, '2026-10-15');
  assert.equal(s.series.dates.length, 7);
  assert.deepEqual(s.series.active, [0, 0, 0, 0, 0, 1, 3]);
  assert.equal(s.prev.active, 4);
  assert.equal(s.series.live.at(-1), 1);
  assert.equal(s.series.errors.at(-1), 1);
  assert.deepEqual(s.features.map((f) => [f.event, f.label, f.group, f.total]), [['rail.season', 'Saison', 'rail', 7], ['tab.trace', 'Analyse · Race trace', 'tab', 1]]);
  assert.equal(s.features[0].phone, 2);
  assert.ok(s.unused.includes('Mini-classement'));
  assert.ok(!s.unused.includes('Saison'));
  assert.deepEqual(s.versions.map((r) => r.label), ['v1.27.0', 'v1.26.1']);
  assert.deepEqual(s.systems.map((r) => r.label), ['Windows', 'macOS']);
  assert.deepEqual(s.devices, [{ label: 'Ordinateur (appli)', n: 6 }]);
  assert.deepEqual(s.langs, [{ label: 'Anglais', n: 2 }]);
  assert.deepEqual(s.errors.map((e) => e.event), ['error.tower.js:12']);
  assert.equal(s.features.some((f) => f.event === 'test.deploy'), false);
});
