import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-studio-'));
// Code d'essai (le vrai code n'est jamais dans le dépôt) : son empreinte remplace celle du créateur
const CODE = 'ESSAI-42';
const HASH = (await import('node:crypto')).createHash('sha256').update(`paddock-live:${CODE}`).digest('hex');
process.env.PADDOCK_CREATOR_HASH = HASH;
const { studioApi, freshF1tv, runSchedule } = await import('../analytics/studio.js');
const { studioKey, enableStudio, syncStudio, disableStudio, studioInfo } = await import('../server/studio-sync.js');
const { saveConfig, getConfig } = await import('../server/config.js');
const { timing } = await import('../shared/meta-publish.js');

// Base D1 réduite aux requêtes de la page du créateur
function fakeDB() {
  const studio = new Map();
  const fails = new Map();
  const db = {
    studio, fails,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() {
          if (/FROM studio WHERE k/.test(sql)) return studio.has(args[0]) ? { v: studio.get(args[0]) } : null;
          if (/FROM studio_fail/.test(sql)) return fails.has(`${args[0]}|${args[1]}`) ? { n: fails.get(`${args[0]}|${args[1]}`) } : null;
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async all() {
          if (/^SELECT k, v FROM studio WHERE k LIKE \?$/.test(sql)) return { results: [...studio].filter(([k]) => k.startsWith(args[0].replace(/%$/, ''))).map(([k, v]) => ({ k, v })) };
          throw new Error(`SQL inattendu : ${sql}`);
        },
        async run() {
          if (/^INSERT INTO studio \(/.test(sql)) studio.set(args[0], args[1]);
          else if (/^INSERT INTO studio_fail/.test(sql)) fails.set(`${args[0]}|${args[1]}`, (fails.get(`${args[0]}|${args[1]}`) || 0) + 1);
          else if (/^DELETE FROM studio$/.test(sql)) studio.clear();
          else if (/^DELETE FROM studio WHERE k LIKE \?$/.test(sql)) { for (const k of [...studio.keys()]) if (k.startsWith(args[0].replace(/%$/, ''))) studio.delete(k); }
          else throw new Error(`SQL inattendu : ${sql}`);
          return {};
        },
      };
      return st;
    },
  };
  return db;
}
globalThis.caches = { default: { match: async () => null, put: async () => {} } };

const env = { DB: fakeDB(), STUDIO_CODE_HASH: HASH, STATS_KEY: 'secret-du-serveur' };
const worker = (url, init) => studioApi(new Request(url, init), env, new URL(url));

test('page du créateur : clé dérivée identique dans l\'appli et dans le navigateur (PBKDF2)', async () => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('ABC123'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('paddock-live-studio'), iterations: 200000, hash: 'SHA-256' }, base, 256);
  assert.equal(Buffer.from(bits).toString('base64url'), studioKey(' abc123 '));
});

test('page du créateur : code faux refusé, clé inconnue refusée, page non activée', async () => {
  let r = await worker('https://s.test/studio/api/init', { method: 'POST', body: JSON.stringify({ code: 'MAUVAIS', key: studioKey('MAUVAIS') }) });
  assert.equal(r.status, 401);
  r = await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey('X') } });
  assert.equal(r.status, 409);   // rien d'activé
  r = await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': 'court' } });
  assert.equal(r.status, 401);
  assert.equal([...env.DB.fails.values()][0], 2);
});

test('page du créateur : coffre chiffré, sans le code rien n\'est lisible', async () => {
  saveConfig({ creator: true, social: { meta: { appSecret: 'secret-app', pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, threads: { token: 'jeton-th', userId: 't1', username: 'moi', appSecret: 'secret-th' } } });
  const fetchFn = (url, init) => worker(url, init);
  const info = await enableStudio(CODE, { fetchFn });
  assert.equal(info.enabled, true);
  const sealed = env.DB.studio.get('vault');
  for (const s of ['jeton-page', 'jeton-th', 'secret-app', 'secret-th']) assert.ok(!sealed.includes(s));
  const me = await (await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey(CODE) } })).json();
  assert.equal(me.facebook, 'Ma page');
  assert.equal(me.instagram, '@moi');
  assert.ok(me.sources.length > 10);
  assert.equal(JSON.stringify(me).includes('jeton'), false);
  // Jeton changé dans l'appli : nouvel envoi
  saveConfig({ social: { ...getConfig().social, threads: { token: 'jeton-th-2', userId: 't1', username: 'moi2' } } });
  assert.equal(await syncStudio({ fetchFn }), true);
  assert.equal(await syncStudio({ fetchFn }), false);   // rien de nouveau
  const me2 = await (await worker('https://s.test/studio/api/me', { headers: { 'X-Studio-Key': studioKey(CODE) } })).json();
  assert.equal(me2.threads, '@moi2');

  // Publication sur Facebook : progression puis lien
  const realFetch = globalThis.fetch;
  let refuse = false;
  Object.assign(timing, { poll: 1, maxPoll: 1, visible: [] });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname.endsWith('/photos')) return ok({ id: 'ph1' });
    if (u.searchParams.get('fields') === 'images') return ok({ images: [{ width: 1080, source: 'https://cdn.test/a.jpg' }] });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'p1_42' });
    if (u.pathname.endsWith('/comments')) return refuse ? new Response(JSON.stringify({ error: { message: '(#200) Permissions error' } }), { status: 403 }) : ok({ id: 'c1' });
    return realFetch(url, opts);
  };
  try {
    const form = new FormData();
    form.append('network', 'facebook');
    form.append('text', 'Bonjour');
    form.append('images', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], { type: 'image/jpeg' }), 'a.jpg');
    form.append('comment', "Lire l'article : https://a.test/x");
    const send = async () => {
      const r = await worker('https://s.test/studio/api/publish', { method: 'POST', body: form, headers: { 'X-Studio-Key': studioKey(CODE) } });
      return (await r.text()).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
    };
    assert.deepEqual(await send(), { done: true, url: 'https://www.facebook.com/p1_42', id: 'p1_42', comment: true, commentError: null });
    // Commentaire refusé (permission manquante) : le post est publié quand même, avec la raison
    refuse = true;
    const r2 = await send();
    assert.equal(r2.done, true);
    assert.equal(r2.comment, false);
    assert.match(r2.commentError, /Permissions error.*permission manquante/);
  } finally { globalThis.fetch = realFetch; }

  await disableStudio({ fetchFn });
  assert.equal(studioInfo().enabled, false);
  assert.equal(env.DB.studio.size, 0);
});

test('page du créateur : relais limités (sources connues, archives F1, images F1 et drapeaux)', async () => {
  // Activation directe (sans code réel) pour essayer les relais : vérificateur d'une clé de test
  const key = studioKey('TEST');
  const raw = Buffer.from(key, 'base64url');
  env.DB.studio.set('verifier', Buffer.from(await crypto.subtle.digest('SHA-256', raw)).toString('hex'));
  const h = { headers: { 'X-Studio-Key': key } };
  assert.equal((await worker('https://s.test/studio/api/feed?id=inconnu', h)).status, 404);
  assert.equal((await worker('https://s.test/studio/api/archive?p=../../etc/passwd', h)).status, 400);
  assert.equal((await worker('https://s.test/studio/api/archive?p=2026/x/../y/Index.json', h)).status, 400);
  assert.equal((await worker(`https://s.test/studio/api/img?u=${encodeURIComponent('https://evil.test/a.png')}`, h)).status, 400);
  assert.equal((await worker('https://s.test/studio/api/publish', { method: 'POST', body: new FormData(), ...h })).status, 409);   // pas de comptes
});

const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

test('page du créateur : connexion F1 TV renouvelée par le serveur (appli fermée)', async () => {
  const now = Date.UTC(2026, 9, 16);
  const session = jwt({ exp: now / 1000 + 20 * 86400 });
  const old = jwt({ exp: now / 1000 + 3600, SessionId: session });
  const next = jwt({ exp: now / 1000 + 4 * 86400, SessionId: session });
  let asked = null;
  const fetchFn = async (url, init) => { asked = init.headers['cd-sessionid']; return new Response(JSON.stringify({ data: { subscriptionToken: next } }), { status: 200 }); };
  assert.equal(await freshF1tv(old, { now, fetchFn }), next);
  assert.equal(asked, session);
  // Encore valable plus de 24 h : rien demandé ; refus de la F1 : ancien jeton gardé
  asked = null;
  assert.equal(await freshF1tv(next, { now, fetchFn }), next);
  assert.equal(asked, null);
  assert.equal(await freshF1tv(old, { now, fetchFn: async () => new Response('{}', { status: 401 }) }), old);
});

test('page du créateur : journal des publications partagé et news déjà publiées reconnues', async () => {
  const { addEntry, postedEntry, mergeHistory } = await import('../shared/post-history.js');
  const key = studioKey('TEST');
  const h = { 'X-Studio-Key': key };
  const now = Date.now();
  const entry = { key: 'news:1', at: now, kind: 'news', title: 'Haas engage Câmara', srcTitle: 'Haas sign Ferrari junior Rafael Camara for 2027', link: 'https://f1.test/a', nets: { instagram: { id: '17', url: 'https://www.instagram.com/p/x' } } };
  await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry }) });
  // Même publication complétée par un autre réseau : une seule entrée
  const r = await (await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry: { ...entry, nets: { bluesky: { id: { uri: 'at://x', cid: 'c' }, url: 'https://bsky.app/profile/a/post/b' } } } }) })).json();
  assert.equal(r.items.length, 1);
  assert.deepEqual(Object.keys(r.items[0].nets).sort(), ['bluesky', 'instagram']);
  const list = r.items;
  // Même sujet, autre média et autre langue ; autre sujet ; trop ancien
  assert.ok(postedEntry({ title: "Rafael Câmara s'engage avec Haas pour 2027", t: now, link: 'https://l.test/b' }, list));
  assert.equal(postedEntry({ title: 'Mekies extends Red Bull contract', t: now }, list), null);
  assert.equal(postedEntry({ title: 'Câmara joins Haas', t: now + 5 * 86400e3 }, list), null);
  assert.ok(postedEntry({ title: 'Autre titre', t: now, link: 'https://f1.test/a' }, list));
  // Entrée invalide ignorée ; fusion appli + page web sans doublon
  assert.equal(addEntry(list, { key: 'x', nets: {} }).length, 1);
  assert.equal(mergeHistory(list, list, [{ ...entry, key: 'news:2' }]).length, 2);
  // Post supprimé sur les réseaux : retiré du journal, sa clé gardée pour que l'appli ne le renvoie pas
  const rm = await (await worker('https://s.test/studio/api/history/remove', { method: 'POST', headers: h, body: JSON.stringify({ key: 'news:1' }) })).json();
  assert.deepEqual(rm.items, []);
  assert.deepEqual(rm.removed, ['news:1']);
  assert.equal((await worker('https://s.test/studio/api/history/remove', { method: 'POST', headers: h, body: JSON.stringify({ key: '' }) })).status, 400);
  const got = await (await worker('https://s.test/studio/api/history', { headers: h })).json();
  assert.deepEqual(got.removed, ['news:1']);
  const { withoutRemoved, removeEntry } = await import('../shared/post-history.js');
  assert.deepEqual(withoutRemoved(mergeHistory(list, [{ ...entry, key: 'news:2' }]), got.removed).map((e) => e.key), ['news:2']);
  assert.deepEqual(removeEntry(list, ['a'], 'news:1').removed, ['news:1', 'a']);
  // Même post republié : il compte de nouveau
  await worker('https://s.test/studio/api/history', { method: 'POST', headers: h, body: JSON.stringify({ entry }) });
  const again = await (await worker('https://s.test/studio/api/history', { headers: h })).json();
  assert.deepEqual([again.items.length, again.removed], [1, []]);
});

test('page du créateur : relais des documents de la FIA limité aux pages F1 et aux PDF des commissaires', async () => {
  const fia = (p) => worker(`https://s.test/studio/api/fia?p=${encodeURIComponent(p)}`, { headers: { 'X-Studio-Key': studioKey('TEST') } });
  for (const bad of ['/user/login', '/documents/championships/fia-formula-e-world-championship-1', '/system/files/decision-document/../x.pdf', 'https://evil.example/x.pdf']) {
    assert.equal((await fia(bad)).status, 400, bad);
  }
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }); };
  try {
    const r = await fia('/system/files/decision-document/2026_azerbaijan_grand_prix_-_final_starting_grid.pdf');
    assert.equal(r.status, 200);
    assert.equal((await fia('/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072/event/Azerbaijan%20Grand%20Prix')).status, 200);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(asked, ['https://www.fia.com/system/files/decision-document/2026_azerbaijan_grand_prix_-_final_starting_grid.pdf', 'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072/event/Azerbaijan%20Grand%20Prix']);
});

test("page du créateur : relais des pages d'articles (résumé détaillé) en texte brut, adresses sûres seulement", async () => {
  const page = (u) => worker(`https://s.test/studio/api/page?u=${encodeURIComponent(u)}`, { headers: { 'X-Studio-Key': studioKey('TEST') } });
  for (const bad of ['http://www.formula1.com/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://user:pw@www.formula1.com/a', 'https://www.formula1.com:8443/a', 'file:///etc/passwd', 'pas une adresse']) {
    assert.equal((await page(bad)).status, 400, bad);
  }
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('<html><p>Été</p></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); };
  try {
    const r = await page('https://www.formula1.com/en/latest/article/hamilton.1234');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'text/plain; charset=utf-8');   // jamais servie comme une page du serveur
    assert.equal(await r.text(), '<html><p>Été</p></html>');
  } finally { globalThis.fetch = real; }
  assert.deepEqual(asked, ['https://www.formula1.com/en/latest/article/hamilton.1234']);
  assert.equal((await worker('https://s.test/studio/api/page?u=https%3A%2F%2Fwww.formula1.com%2Fa')).status, 401);
});

test('page du créateur : publication programmée, publiée par le serveur à l\'heure (un réseau par passage)', async () => {
  saveConfig({ creator: true, social: { meta: { pageId: 'p1', pageName: 'Ma page', pageToken: 'jeton-page', igId: 'ig1', igUsername: 'moi' }, bluesky: { handle: 'moi.bsky.social', appPassword: 'mdp-app', did: 'did:plc:moi' } } });
  const fetchFn = (url, init) => worker(url, init);
  await enableStudio(CODE, { fetchFn });
  const key = { 'X-Studio-Key': studioKey(CODE) };
  const at = Date.now() + 3600e3;
  const jpeg = (n) => new Blob([new Uint8Array(n).fill(7).map((x, i) => (i < 3 ? [0xff, 0xd8, 0xff][i] : x))], { type: 'image/jpeg' });
  const form = (o = {}) => {
    const f = new FormData();
    f.append('at', String(o.at ?? at));
    f.append('title', 'Résultats');
    f.append('record', JSON.stringify({ key: 'race-2026-18', kind: 'race', title: 'Résultats' }));
    f.append('posts', JSON.stringify(o.posts ?? [{ network: 'facebook', text: 'Bonjour', comment: 'Lien' }, { network: 'bluesky', text: 'Salut' }]));
    f.append('ig', jpeg(1.2e6), 'a.jpg');
    f.append('ig', jpeg(10), 'b.jpg');
    f.append('x', jpeg(10), 'c.jpg');
    return f;
  };
  const add = async (o) => worker('https://s.test/studio/api/schedule', { method: 'POST', body: form(o), headers: key });
  // Refus : date passée, réseau non connecté, sans la clé
  assert.equal((await add({ at: Date.now() - 3600e3 })).status, 400);
  assert.equal((await add({ posts: [{ network: 'threads', text: 'x' }] })).status, 409);
  assert.equal((await worker('https://s.test/studio/api/schedule', { method: 'POST', body: form() })).status, 401);
  const r = await add();
  assert.equal(r.status, 200);
  const { item } = await r.json();
  assert.deepEqual(item.nets, { facebook: { status: 'pending' }, bluesky: { status: 'pending' } });
  // Jetons chiffrés avec le secret du serveur : absents de la base en clair
  const rows = [...env.DB.studio].filter(([k]) => k.startsWith('sched'));
  assert.ok(rows.length >= 4);
  for (const [, v] of rows) for (const sec of ['jeton-page', 'mdp-app']) assert.ok(!v.includes(sec));

  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname.endsWith('/photos')) return ok({ id: 'ph1' });
    if (u.searchParams.get('fields') === 'images') return ok({ images: [{ width: 1080, source: 'https://cdn.test/a.jpg' }] });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'p1_43' });
    if (u.pathname.endsWith('/comments')) return ok({ id: 'c1' });
    if (u.pathname.endsWith('createSession')) return ok({ accessJwt: 'jwt', did: 'did:plc:moi' });
    if (u.pathname.endsWith('uploadBlob')) return ok({ blob: { ref: 'b' } });
    if (u.pathname.endsWith('createRecord')) return ok({ uri: 'at://did:plc:moi/app.bsky.feed.post/3k', cid: 'c' });
    return new Response('{}', { status: 404 });
  };
  try {
    // Pas encore l'heure : rien ne part
    assert.equal(await runSchedule(env, { now: at - 60e3 }), null);
    assert.equal(calls.length, 0);
    // À l'heure : un réseau par passage
    assert.deepEqual(await runSchedule(env, { now: at + 1 }), { published: 'facebook', id: item.id });
    assert.ok(calls.some((c) => c.endsWith('/photos')));
    assert.deepEqual(await runSchedule(env, { now: at + 60e3 }), { published: 'bluesky', id: item.id });
    assert.equal(await runSchedule(env, { now: at + 120e3 }), null);
    const list = await (await worker('https://s.test/studio/api/schedule', { headers: key })).json();
    assert.equal(list.items[0].nets.facebook.status, 'done');
    assert.equal(list.items[0].nets.facebook.url, 'https://www.facebook.com/p1_43');
    assert.equal(list.items[0].nets.facebook.comment, true);
    assert.equal(list.items[0].nets.bluesky.status, 'done');
    // Journal des publications complété, visuels et jetons effacés une fois publiés
    const hist = await (await worker('https://s.test/studio/api/history', { headers: key })).json();
    assert.equal(hist.items[0].key, 'race-2026-18');
    assert.deepEqual(Object.keys(hist.items[0].nets).sort(), ['bluesky', 'facebook']);
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('schedimg:')).length, 0);
    assert.equal(JSON.parse(env.DB.studio.get(`sched:${item.id}`)).keys, null);
    // Une semaine plus tard : la trace disparaît
    await runSchedule(env, { now: at + 8 * 86400e3 });
    assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')).length, 0);
  } finally { globalThis.fetch = realFetch; }

  // Annulation avant l'heure ; envoi trop en retard (serveur arrêté plus d'un jour) : abandonné
  const j2 = (await (await add()).json()).item;
  const after = await (await worker('https://s.test/studio/api/schedule/cancel', { method: 'POST', body: JSON.stringify({ id: j2.id }), headers: key })).json();
  assert.equal(after.items.length, 0);
  assert.equal([...env.DB.studio.keys()].filter((k) => k.startsWith('sched')).length, 0);
  const j3 = (await (await add()).json()).item;
  assert.equal(await runSchedule(env, { now: at + 2 * 86400e3 }), null);
  const l3 = await (await worker('https://s.test/studio/api/schedule', { headers: key })).json();
  assert.equal(l3.items.find((x) => x.id === j3.id).nets.facebook.status, 'expired');
  await disableStudio({ fetchFn });
});
