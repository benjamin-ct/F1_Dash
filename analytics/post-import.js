// Posts publiés en dehors du Studio et de l'appli (à la main, kit de démarrage) : relus chez chaque
// réseau relié (Instagram, Facebook, Threads, Bluesky) et ajoutés au journal des publications pour
// apparaître dans les statistiques. Les posts déjà connus ou retirés par le créateur sont ignorés ;
// ceux publiés à quelques minutes d'écart sur plusieurs réseaux forment une seule entrée.
import { call, GRAPH, THREADS } from '../shared/meta-publish.js';

const BSKY = 'https://public.api.bsky.app/xrpc';
export const IMPORT_DAYS = 30;
const GROUP_MS = 20 * 60e3;

// Post lu : { net, id, url, text, at } ; réseau illisible -> ignoré (erreur notée)
async function read(net, job, errors) {
  try { return await job(); } catch (err) { errors[net] = String(err?.message || err).slice(0, 200); return []; }
}
const asPost = (net, id, url, text, at) => ({ net, id, url: /^https:\/\//.test(url || '') ? url : null, text: String(text || ''), at: Date.parse(at) || 0 });

export async function recentPosts(acc, { days = IMPORT_DAYS, fetchFn = fetch } = {}) {
  const errors = {};
  const since = Date.now() - days * 86400e3;
  const m = acc.meta;
  const jobs = [];
  if (m?.igId && m.pageToken) {
    jobs.push(read('instagram', async () => (await call(`${GRAPH}/${m.igId}/media?${new URLSearchParams({ fields: 'id,caption,permalink,timestamp', limit: '25', access_token: m.pageToken })}`)).data?.map((p) => asPost('instagram', p.id, p.permalink, p.caption, p.timestamp)) || [], errors));
  }
  if (m?.pageId && m.pageToken) {
    jobs.push(read('facebook', async () => (await call(`${GRAPH}/${m.pageId}/posts?${new URLSearchParams({ fields: 'id,message,permalink_url,created_time', limit: '25', access_token: m.pageToken })}`)).data?.map((p) => asPost('facebook', p.id, p.permalink_url, p.message, p.created_time)) || [], errors));
  }
  if (acc.threads?.token) {
    jobs.push(read('threads', async () => (await call(`${THREADS}/me/threads?${new URLSearchParams({ fields: 'id,text,permalink,timestamp', limit: '25', access_token: acc.threads.token })}`)).data?.map((p) => asPost('threads', p.id, p.permalink, p.text, p.timestamp)) || [], errors));
  }
  const b = acc.bluesky;
  if (b?.did || b?.handle) {
    jobs.push(read('bluesky', async () => {
      const r = await fetchFn(`${BSKY}/app.bsky.feed.getAuthorFeed?${new URLSearchParams({ actor: b.did || b.handle, limit: '30', filter: 'posts_no_replies' })}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`Bluesky : erreur ${r.status}`);
      // Reposts d'autres comptes exclus : seulement les posts du compte
      return ((await r.json()).feed || []).filter((f) => !f.reason && (!b.did || f.post?.author?.did === b.did)).map(({ post: p }) => ({
        ...asPost('bluesky', null, `https://bsky.app/profile/${p.author?.handle || b.handle}/post/${String(p.uri).split('/').pop()}`, p.record?.text, p.record?.createdAt || p.indexedAt),
        id: { uri: p.uri, cid: p.cid },
      }));
    }, errors));
  }
  const posts = (await Promise.all(jobs)).flat().filter((p) => p.at >= since && p.at <= Date.now() + 60e3);
  return { posts, errors };
}

const idOf = (p) => (typeof p.id === 'object' && p.id ? p.id.uri : p.id);
// Clé courte : identifiant du post (Bluesky : fin de l'adresse at://)
const keyOf = (p) => `imp-${p.net}-${String(idOf(p)).split('/').pop()}`.slice(0, 80);
const title = (text) => {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return [...line].length > 90 ? `${[...line].slice(0, 89).join('')}…` : line;
};

// Entrées à ajouter au journal : posts inconnus, regroupés par proximité dans le temps (un réseau
// une seule fois par entrée)
export function importEntries(history, removed, posts) {
  const known = new Set();
  for (const e of history || []) for (const r of Object.values(e?.nets || {})) { const id = idOf(r || {}); if (id) known.add(id); }
  const fresh = (posts || []).filter((p) => idOf(p) && !known.has(idOf(p))).sort((a, b) => a.at - b.at);
  const groups = [];
  for (const p of fresh) {
    const g = groups.at(-1);
    if (g && p.at - g[0].at <= GROUP_MS && !g.some((x) => x.net === p.net)) g.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => ({
    key: keyOf(g[0]),
    at: g[0].at,
    kind: 'session',
    title: title(g.find((p) => p.text.trim())?.text) || 'Post',
    nets: Object.fromEntries(g.map((p) => [p.net, { id: p.id, url: p.url }])),
  })).filter((e) => !(removed || []).includes(e.key));
}
