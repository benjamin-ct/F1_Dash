import test from 'node:test';
import assert from 'node:assert/strict';
import { recentPosts, importEntries } from '../analytics/post-import.js';
import { addEntry } from '../shared/post-history.js';

test('posts publiés hors du Studio : lus sur Instagram, Facebook, Threads et Bluesky, regroupés et ajoutés une fois', async () => {
  const realFetch = globalThis.fetch;
  const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
  const t0 = Date.now() - 3600e3;
  const iso = (ms) => new Date(t0 + ms).toISOString();
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/igA/media')) return ok({ data: [{ id: 'ig1', caption: 'Bienvenue au paddock !\nSuite', permalink: 'https://www.instagram.com/p/AAA/', timestamp: iso(0) }, { id: 'ig0', caption: 'Très vieux', permalink: 'https://www.instagram.com/p/OLD/', timestamp: '2020-01-01T00:00:00+0000' }] });
    if (u.pathname.endsWith('/pageA/posts')) return ok({ data: [{ id: 'pageA_1', message: 'Bienvenue au paddock !', permalink_url: 'https://www.facebook.com/1', created_time: iso(2 * 60e3) }] });
    if (u.pathname.endsWith('/me/threads')) return new Response(JSON.stringify({ error: { message: 'Jeton expiré' } }), { status: 400 });
    if (u.pathname.endsWith('app.bsky.feed.getAuthorFeed')) {
      assert.equal(u.searchParams.get('actor'), 'did:plc:moi');
      return ok({ feed: [
        { post: { uri: 'at://did:plc:moi/app.bsky.feed.post/3abc', cid: 'c1', author: { did: 'did:plc:moi', handle: 'paddocklive.app' }, record: { text: 'Voici Paddock Live', createdAt: iso(5 * 60e3) } } },
        { reason: { $type: 'app.bsky.feed.defs#reasonRepost' }, post: { uri: 'at://did:plc:autre/app.bsky.feed.post/9', cid: 'c2', author: { did: 'did:plc:autre' }, record: { text: 'Repost', createdAt: iso(6 * 60e3) } } },
        { post: { uri: 'at://did:plc:moi/app.bsky.feed.post/3def', cid: 'c3', author: { did: 'did:plc:moi', handle: 'paddocklive.app' }, record: { text: 'Plus tard', createdAt: iso(50 * 60e3) } } },
      ] });
    }
    return new Response('{}', { status: 404 });
  };
  try {
    const acc = { meta: { igId: 'igA', pageId: 'pageA', pageToken: 'jeton' }, threads: { token: 't' }, bluesky: { handle: 'ancien.bsky.social', did: 'did:plc:moi' } };
    const { posts, errors } = await recentPosts(acc);
    assert.deepEqual(posts.map((p) => p.net).sort(), ['bluesky', 'bluesky', 'facebook', 'instagram']);   // trop vieux et repost exclus
    assert.match(errors.threads, /Jeton expiré/);
    const bsky = posts.find((p) => p.text === 'Voici Paddock Live');
    assert.equal(bsky.url, 'https://bsky.app/profile/paddocklive.app/post/3abc');
    assert.deepEqual(bsky.id, { uri: 'at://did:plc:moi/app.bsky.feed.post/3abc', cid: 'c1' });

    // Instagram, Facebook et Bluesky en 5 minutes : une entrée ; le post 50 minutes plus tard : une autre
    const known = [{ key: 'gp', at: 1, nets: { bluesky: { id: { uri: 'at://did:plc:moi/app.bsky.feed.post/3zzz' } } } }];
    const add = importEntries(known, [], posts);
    assert.equal(add.length, 2);
    assert.deepEqual(Object.keys(add[0].nets).sort(), ['bluesky', 'facebook', 'instagram']);
    assert.equal(add[0].title, 'Bienvenue au paddock !');
    assert.equal(add[0].key, 'imp-instagram-ig1');
    assert.equal(add[1].key, 'imp-bluesky-3def');
    assert.equal(add[0].nets.instagram.url, 'https://www.instagram.com/p/AAA/');

    // Journal mis à jour : un second passage n'ajoute rien ; un post retiré ne revient pas
    const list = add.reduce(addEntry, known);
    assert.equal(list.length, 3);
    assert.equal(importEntries(list, [], posts).length, 0);
    assert.deepEqual(importEntries(known, ['imp-bluesky-3def'], posts).map((e) => e.key), ['imp-instagram-ig1']);
  } finally { globalThis.fetch = realFetch; }
});

test('posts publiés hors du Studio : aucun compte relié, rien de lu', async () => {
  assert.deepEqual(await recentPosts({}), { posts: [], errors: {} });
  assert.deepEqual(importEntries([], [], []), []);
});
