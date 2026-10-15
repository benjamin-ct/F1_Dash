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

// Base D1 simulée : assez pour le Worker (insertion additionnée et totaux par requête)
function fakeD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            sql, a,
            async all() {
              const since = a[0];
              const list = [...rows.values()].filter((r) => r.day >= since);
              const sum = (key, filter) => {
                const m = new Map();
                for (const r of list.filter(filter)) m.set(key(r), (m.get(key(r)) || 0) + r.n);
                return [...m];
              };
              if (sql.includes('GROUP BY day')) return { results: sum((r) => r.day, (r) => r.event === 'app.active').map(([day, n]) => ({ day, n })) };
              if (sql.includes('GROUP BY event, device')) return { results: sum((r) => `${r.event}|${r.device}`, () => true).map(([k, n]) => ({ event: k.split('|')[0], device: k.split('|')[1], n })) };
              if (sql.includes('GROUP BY version')) return { results: sum((r) => r.version, (r) => r.event === 'app.active').map(([version, n]) => ({ version, n })) };
              if (sql.includes('GROUP BY os')) return { results: sum((r) => r.os, (r) => r.event === 'app.active').map(([os, n]) => ({ os, n })) };
              if (sql.includes('GROUP BY device')) return { results: sum((r) => r.device, (r) => r.event === 'app.open').map(([device, n]) => ({ device, n })) };
              return { results: [] };
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

test('serveur des statistiques : réception des lots et page protégée par la clé', async () => {
  const env = { DB: fakeD1(), STATS_KEY: 'secret-123' };
  const post = (body) => worker.fetch(new Request('https://w.test/e', { method: 'POST', body: JSON.stringify(body) }), env);
  assert.equal((await post({ v: '1.27.0', os: 'win', items: [['app.active', '-', 1], ['rail.season', 'desktop', 4], ['app.open', 'desktop', 2]] })).status, 204);
  assert.equal((await post({ v: '1.27.0', os: 'mac', items: [['app.active', '-', 1], ['rail.season', 'phone', 1]] })).status, 204);
  assert.equal((await post({ v: 'x', os: 'win', items: [] })).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.test/e', { method: 'POST', body: '{' }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.test/e', { method: 'POST', body: 'x'.repeat(40000) }), env)).status, 413);
  assert.equal([...env.DB.rows.values()].every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)), true);

  assert.equal((await worker.fetch(new Request('https://w.test/stats?key=nope'), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://w.test/stats'), { DB: env.DB })).status, 503);
  const j = await (await worker.fetch(new Request('https://w.test/stats.json?key=secret-123&days=7'), env)).json();
  assert.equal(j.days, 7);
  assert.deepEqual(j.events.find((e) => e.event === 'rail.season'), { event: 'rail.season', total: 5, desktop: 4, phone: 1, browser: 0 });
  assert.deepEqual(j.systems.map((r) => r.os).sort(), ['mac', 'win']);
  const html = await (await worker.fetch(new Request('https://w.test/stats?key=secret-123'), env)).text();
  assert.match(html, /Paddock Live · statistiques/);
  assert.match(html, /Saison <small>rail\.season<\/small>/);
});
