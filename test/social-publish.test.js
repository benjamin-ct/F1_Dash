import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-social-'));
const { oauth1, accountsInfo, saveAccount, publish, timing } = await import('../server/social-publish.js');
const { saveConfig } = await import('../server/config.js');

test('X : signature OAuth 1.0a (exemple de la documentation de X)', () => {
  const k = { apiKey: 'xvz1evFS4wEEPTGEFPHBog', apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', accessSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' };
  const h = oauth1('POST', 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true', k, {
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958,
    params: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  assert.match(h, /^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
});

test('comptes : jamais de clé ni de jeton renvoyé à l\'interface', async () => {
  saveConfig({ social: { x: { apiKey: 'k', apiSecret: 'secret-x', accessToken: 't', accessSecret: 's', username: '@moi' }, meta: { pageToken: 'jeton-page', pageName: 'Ma page', igId: '1', igUsername: 'moi' } } });
  const info = accountsInfo();
  assert.deepEqual(info.x, { connected: true, name: '@moi' });
  assert.equal(info.instagram.name, '@moi');
  const text = JSON.stringify(info);
  for (const s of ['secret-x', 'jeton-page']) assert.ok(!text.includes(s));
  await saveAccount('x', { remove: true });
  assert.equal(accountsInfo().x.connected, false);
  await assert.rejects(saveAccount('x', { apiKey: 'a' }), /4 clés/);
});

// Faux serveurs Meta : images déposées sur la page, conteneurs « en cours » puis prêts
function fakeMeta({ errorOn = null } = {}) {
  const log = [];
  const polls = {};
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const form = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : {};
    log.push({ method, path: u.pathname, form, fields: u.searchParams.get('fields') });
    const json = (d) => ({ ok: true, status: 200, text: async () => JSON.stringify(d) });
    if (method === 'POST' && u.pathname.endsWith('/photos')) return json({ id: `ph${++n}` });
    if (method === 'GET' && u.searchParams.get('fields') === 'images') return json({ images: [{ width: 1080, source: `https://cdn.test${u.pathname}.jpg` }, { width: 320, source: 'https://cdn.test/petite.jpg' }] });
    if (method === 'POST' && /\/(media|threads)$/.test(u.pathname)) {
      const id = `c${++n}`;
      if (form.media_type === 'CAROUSEL') {
        // Refusé si une image n'a pas fini d'être préparée (comportement de Threads)
        const notReady = form.children.split(',').filter((k) => (polls[k] || 0) < 2);
        if (notReady.length) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `Les enfants avec les ID ${notReady.join(',')} ne sont pas valides` } }) };
      }
      return json({ id });
    }
    if (method === 'GET' && /status/.test(u.searchParams.get('fields') || '')) {
      const id = u.pathname.split('/').pop();
      polls[id] = (polls[id] || 0) + 1;
      const field = u.searchParams.get('fields').startsWith('status_code') ? 'status_code' : 'status';
      if (errorOn === id) return json({ [field]: 'ERROR', ...(field === 'status' ? { error_message: 'Image illisible' } : { status: 'Error: Media download has failed.' }) });
      return json({ [field]: polls[id] >= 2 ? 'FINISHED' : 'IN_PROGRESS' });
    }
    if (method === 'POST' && /(media_publish|threads_publish)$/.test(u.pathname)) return json({ id: 'pub1' });
    if (method === 'POST' && u.pathname.endsWith('/feed')) return json({ id: 'page_post' });
    if (u.searchParams.get('fields') === 'permalink') return json({ permalink: 'https://example.test/p/1' });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  return { log, polls };
}

const PNG = (k) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`image-${k}`)]).toString('base64');

test('Threads et Instagram : chaque image du carrousel est prête avant le carrousel, images déposées une seule fois', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  saveConfig({ social: { meta: { pageId: 'page1', pageToken: 'jp', igId: 'ig1', igUsername: 'moi' }, threads: { token: 'jt', userId: 'th1', username: 'moi' } } });
  try {
    const { log } = fakeMeta();
    const images = [PNG(1), PNG(2), PNG(3)];
    const th = await publish('threads', { text: 'Bonjour', images });
    assert.equal(th.url, 'https://example.test/p/1');
    const kids = log.filter((l) => l.form.is_carousel_item === 'true');
    assert.equal(kids.length, 3);
    assert.ok(kids.every((k) => /^https:\/\/cdn\.test\/.+\.jpg$/.test(k.form.image_url) && k.form.media_type === 'IMAGE'));
    const car = log.find((l) => l.form.media_type === 'CAROUSEL');
    assert.equal(car.form.text, 'Bonjour');
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 3);

    // Instagram juste après : mêmes images, rien de redéposé sur la page
    log.length = 0;
    const ig = await publish('instagram', { text: 'Légende', images });
    assert.equal(ig.url, 'https://example.test/p/1');
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 0);
    assert.equal(log.find((l) => l.form.media_type === 'CAROUSEL').form.caption, 'Légende');
    assert.ok(log.some((l) => l.path.endsWith('/media_publish')));

    // Facebook : nouvel envoi (une photo jointe à un post ne peut pas l'être à un autre)
    log.length = 0;
    await publish('facebook', { text: 'Post', images });
    assert.equal(log.filter((l) => l.path.endsWith('/photos')).length, 3);
    assert.equal(Object.keys(log.find((l) => l.path.endsWith('/feed')).form).filter((k) => k.startsWith('attached_media')).length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Threads et Instagram : image refusée par le réseau, message clair', async () => {
  const realFetch = globalThis.fetch;
  Object.assign(timing, { poll: 1, maxPoll: 1, readyMs: 2000, visible: [] });
  saveConfig({ social: { meta: { pageId: 'page2', pageToken: 'jp', igId: 'ig1' }, threads: { token: 'jt', userId: 'th1' } } });
  try {
    fakeMeta({ errorOn: 'c5' });   // 3 dépôts (ph1-3), 1re image c4, 2e image c5
    await assert.rejects(publish('threads', { text: 'x', images: [PNG(4), PNG(5), PNG(6)] }), /Image 2 refusé : Image illisible/);
    fakeMeta({ errorOn: 'c2' });   // images déjà déposées : 1re image c1, 2e image c2
    await assert.rejects(publish('instagram', { text: 'x', images: [PNG(4), PNG(5), PNG(6)] }), /Image 2 refusé : Error: Media download has failed/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Bluesky : images, liens et hashtags cliquables, lien de l\'article en réponse', async () => {
  const realFetch = globalThis.fetch;
  const records = [];
  const uploads = [];
  globalThis.fetch = async (url, opts = {}) => {
    const m = String(url).split('/xrpc/')[1];
    const ok = (d) => ({ ok: true, status: 200, json: async () => d });
    if (m === 'com.atproto.server.createSession') {
      const b = JSON.parse(opts.body);
      if (b.password !== 'mdp-app') return { ok: false, status: 401, json: async () => ({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }) };
      return ok({ accessJwt: 'jwt', did: 'did:plc:moi', handle: 'moi.bsky.social' });
    }
    if (m === 'com.atproto.repo.uploadBlob') { uploads.push(opts.headers['Content-Type']); return ok({ blob: { $type: 'blob', ref: { $link: `b${uploads.length}` }, mimeType: 'image/jpeg', size: 10 } }); }
    if (m === 'com.atproto.repo.createRecord') { const b = JSON.parse(opts.body); records.push(b.record); return ok({ uri: `at://did:plc:moi/app.bsky.feed.post/r${records.length}`, cid: `c${records.length}` }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    await assert.rejects(saveAccount('bluesky', { handle: 'moi.bsky.social', appPassword: 'faux' }), /Invalid identifier/);
    await saveAccount('bluesky', { handle: '@moi.bsky.social', appPassword: 'mdp-app' });
    assert.equal(accountsInfo().bluesky.name, '@moi.bsky.social');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]).toString('base64');
    const r = await publish('bluesky', { text: 'TRANSFERT | Titre #F1 #BenjyPaddock', images: [jpeg, jpeg], comment: "Lire l'article : https://a.test/x" });
    assert.equal(r.url, 'https://bsky.app/profile/moi.bsky.social/post/r1');
    assert.equal(r.comment, true);
    assert.deepEqual(uploads, ['image/jpeg', 'image/jpeg']);
    assert.equal(records[0].embed.images.length, 2);
    assert.deepEqual(records[0].embed.images[0].aspectRatio, { width: 1600, height: 900 });
    assert.deepEqual(records[0].facets.map((f) => f.features[0].tag), ['F1', 'BenjyPaddock']);
    assert.deepEqual(records[1].reply.parent, { uri: 'at://did:plc:moi/app.bsky.feed.post/r1', cid: 'c1' });
    assert.equal(records[1].facets[0].features[0].uri, 'https://a.test/x');
    // Mot de passe jamais renvoyé à l'interface
    assert.ok(!JSON.stringify(accountsInfo()).includes('mdp-app'));
  } finally { globalThis.fetch = realFetch; }
});

test('Threads : post vérifié visible publiquement (page lue comme un aperçu de lien)', async () => {
  const { threadsVisible } = await import('../shared/meta-publish.js');
  const real = globalThis.fetch;
  const page = (title) => new Response(`<head><meta property="og:title" content="${title}" /></head>`, { status: 200 });
  try {
    let agent = '';
    globalThis.fetch = async (u, o) => { agent = o.headers['user-agent']; return page('Paddock Live (&#064;paddocklive) on Threads'); };
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0]), true);
    assert.match(agent, /facebookexternalhit/);
    // Page de connexion à chaque essai : caché ; visible au 2e essai : visible
    globalThis.fetch = async () => page('Threads &#x2022; Log in');
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0, 0]), false);
    let n = 0;
    globalThis.fetch = async () => page(++n < 2 ? 'Threads &#x2022; Log in' : 'Paddock Live (&#064;paddocklive) on Threads');
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0, 0]), true);
    // Page illisible : on ne sait pas
    globalThis.fetch = async () => { throw new Error('réseau'); };
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', [0]), null);
    assert.equal(await threadsVisible('https://www.threads.com/@paddocklive/post/X', 'paddocklive', []), null);
  } finally { globalThis.fetch = real; }
});
