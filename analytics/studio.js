// Page web du créateur (/studio/) : posts des séances et des grosses news, préparés dans le
// navigateur (téléphone compris) et publiés sur Facebook, Instagram et Threads depuis ce serveur,
// toujours après validation. Rien n'est publié tout seul.
//
// Accès : clé dérivée du code du mode créateur (PBKDF2, calculée par l'appli et par la page, jamais
// le code lui-même sauf à l'activation, vérifiée contre son empreinte). Les jetons des réseaux
// (envoyés par l'appli) sont chiffrés avec cette clé (AES-GCM) : sans elle, la base ne contient
// rien d'utilisable. Essais ratés limités par adresse et par jour.
import { DEFAULT_SOURCES, feedUrl } from '../shared/news-sources.js';
import { publishFacebook, publishInstagram, publishThreads, freshThreads, commentFacebook, replyThreads, withComment } from '../shared/meta-publish.js';
import { publishBluesky, replyBluesky } from '../shared/bluesky-publish.js';
import { addEntry } from '../shared/post-history.js';
import { postStats } from '../shared/post-stats.js';
import { pushApi } from './alerts.js';

// Empreinte du code (la même que dans l'appli) : SHA-256 de « paddock-live:<CODE> » (STUDIO_CODE_HASH :
// autre empreinte, pour les tests)
const CODE_HASH = '821f51db5c6d39c7ae10873a31723f8d4748fc2a925c6736f4a57afa7d2dacc0';
const MAX_FAILS = 30;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const ARCHIVE = 'https://livetiming.formula1.com/static/';
const IMG_HOSTS = new Set(['media.formula1.com', 'www.formula1.com', 'flagcdn.com']);

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const unb64url = (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '='));
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const sameHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function getRow(env, k) {
  return (await env.DB.prepare('SELECT v FROM studio WHERE k = ?').bind(k).first())?.v ?? null;
}
async function setRow(env, k, v) {
  await env.DB.prepare('INSERT INTO studio (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, v, Date.now()).run();
}

// ---------- Essais ratés ----------
const ipOf = (req) => req.headers.get('CF-Connecting-IP') || 'local';
const today = () => new Date().toISOString().slice(0, 10);
async function fails(env, req) {
  return (await env.DB.prepare('SELECT n FROM studio_fail WHERE ip = ? AND day = ?').bind(ipOf(req), today()).first())?.n || 0;
}
async function failed(env, req) {
  await env.DB.prepare('INSERT INTO studio_fail (ip, day, n) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET n = n + 1').bind(ipOf(req), today()).run();
  await new Promise((r) => setTimeout(r, 600));
}

// ---------- Coffre chiffré (jetons des réseaux, connexion F1 TV) ----------
const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(raw, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(raw), enc.encode(JSON.stringify(data)));
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
}
async function open(raw, sealed) {
  if (!sealed) return null;
  const { iv, ct } = JSON.parse(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(raw), unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// Contenu accepté du coffre (rien d'autre n'est gardé)
function cleanVault(v) {
  const s = (x, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : '');
  const out = { at: Date.now() };
  if (v?.meta?.pageToken) out.meta = { pageId: s(v.meta.pageId, 40), pageName: s(v.meta.pageName, 120), pageToken: s(v.meta.pageToken), igId: s(v.meta.igId, 40), igUsername: s(v.meta.igUsername, 60) };
  if (v?.threads?.token) out.threads = { token: s(v.threads.token), userId: s(v.threads.userId, 40), username: s(v.threads.username, 60), expiresAt: Number(v.threads.expiresAt) || null };
  if (v?.bluesky?.appPassword) out.bluesky = { handle: s(v.bluesky.handle, 120), appPassword: s(v.bluesky.appPassword, 100), did: s(v.bluesky.did, 120) };
  if (v?.f1tv) out.f1tv = s(v.f1tv, 6000);
  if (v?.f1tvOff === true) out.f1tvOff = true;
  return out;
}

// Clé de l'en-tête vérifiée : octets de la clé, ou réponse d'erreur
async function auth(req, env) {
  if (await fails(env, req) >= MAX_FAILS) return { error: json({ error: 'Trop d\'essais aujourd\'hui, réessayez demain' }, 429) };
  let raw;
  try { raw = unb64url(req.headers.get('X-Studio-Key') || ''); } catch { raw = null; }
  if (!raw || raw.length !== 32) { await failed(env, req); return { error: json({ error: 'Code incorrect' }, 401) }; }
  const verifier = await getRow(env, 'verifier');
  if (!verifier) return { error: json({ error: 'Page pas encore activée : activez-la depuis l\'appli (Posts → Publier… → Comptes…)' }, 409) };
  if (!sameHex(await sha(raw), verifier)) { await failed(env, req); return { error: json({ error: 'Code incorrect' }, 401) }; }
  return { raw };
}

// ---------- Jetons tenus à jour par le serveur (l'appli peut rester fermée) ----------
const jwtExp = (jwt) => {
  try { return (JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0) * 1000; } catch { return 0; }
};
// Session du compte formula1.com contenue dans le jeton (envoyée telle quelle à la F1)
const jwtSession = (jwt) => {
  try { const id = JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).SessionId; return typeof id === 'string' && id ? id : null; } catch { return null; }
};

// Connexion F1 TV (jeton de ~4 jours) : renouvelée dans ses dernières 24 heures avec la session du
// compte formula1.com (~30 jours), comme le fait l'appli. Clé et identifiant publics du site F1.
export async function freshF1tv(token, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!token || jwtExp(token) - now > 24 * 3600e3) return token;
  const sid = jwtSession(token);
  if (!sid) return token;
  try {
    const res = await fetchFn('https://api.formula1.com/v1/account/Subscriber/RetrieveSubscriber', {
      method: 'POST', body: '{}',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', apikey: 'fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7', 'CD-SystemId': '60a9ad84-e93d-480f-80d6-af37494f2e22', 'cd-sessionid': sid, orderSubmitted: 'true' },
    });
    if (res.status !== 200) return token;
    const next = (await res.json())?.data?.subscriptionToken;
    return next && jwtExp(next) > jwtExp(token) ? next : token;
  } catch { return token; }
}

// Jetons prolongés si besoin (Threads : 60 jours, F1 TV : 4 jours), coffre réenregistré s'ils changent
async function refresh(env, raw, vault) {
  const th = vault.threads?.token ? await freshThreads(vault.threads) : vault.threads;
  const f1tv = await freshF1tv(vault.f1tv);
  if (th === vault.threads && f1tv === vault.f1tv) return vault;
  const next = { ...vault, threads: th, f1tv };
  await setRow(env, 'vault', await seal(raw, next));
  return next;
}

// Envoi de l'appli : ses jetons remplacent ceux du serveur, sauf s'ils sont plus anciens que ceux
// que le serveur a lui-même prolongés (appli restée fermée longtemps)
function keepNewer(old, incoming) {
  const out = { ...incoming };
  if (old.threads?.token && out.threads?.token && old.threads.userId === out.threads.userId && (old.threads.expiresAt || 0) > (out.threads.expiresAt || 0)) out.threads = old.threads;
  if (old.f1tv && out.f1tv && jwtSession(old.f1tv) === jwtSession(out.f1tv) && jwtExp(old.f1tv) > jwtExp(out.f1tv)) out.f1tv = old.f1tv;
  // Jeton expiré dans l'appli (restée fermée) : celui que le serveur a renouvelé est gardé
  if (old.f1tv && !out.f1tv && !out.f1tvOff && jwtExp(old.f1tv) > Date.now()) out.f1tv = old.f1tv;
  delete out.f1tvOff;
  return out;
}

// ---------- Relais (le navigateur ne peut pas lire ces sites directement) ----------
async function cached(req, url, init, ttl) {
  const cache = caches.default;
  const key = new Request(`https://studio.cache/${encodeURIComponent(url)}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(url, init);
  if (res.status !== 200) return new Response(null, { status: res.status === 404 ? 404 : 502 });
  const out = new Response(res.body, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': `max-age=${ttl}` } });
  await cache.put(key, out.clone());
  return out;
}

async function feed(req, url) {
  const s = DEFAULT_SOURCES.find((x) => x.id === url.searchParams.get('id') && x.kind !== 'bsky');
  if (!s) return json({ error: 'Source inconnue' }, 404);
  return cached(req, feedUrl(s), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } }, 180);
}

async function archive(req, url, vault) {
  const p = url.searchParams.get('p') || '';
  if (!/^\d{4}\/[\w .,'()-]+(\/[\w .,'()-]+)*\.(json|jsonStream)$/.test(p) || p.includes('..')) return json({ error: 'Chemin invalide' }, 400);
  const ttl = p.endsWith('Index.json') ? 300 : 600;
  // Archives de la F1 : accès libre, sinon avec la connexion F1 TV de l'appli
  let res = await cached(req, ARCHIVE + p, { headers: { 'User-Agent': UA } }, ttl);
  if ((res.status === 502 || res.status === 404) && vault?.f1tv) {
    res = await cached(req, ARCHIVE + p, { headers: { 'User-Agent': UA, Authorization: `Bearer ${vault.f1tv}`, ascendontoken: vault.f1tv } }, ttl);
  }
  if (res.status !== 200) return json({ error: vault?.f1tv ? 'Archive indisponible (pas encore publiée, ou session formula1.com expirée après ~30 jours : reconnectez F1 TV dans l\'appli)' : 'Archives réservées aux abonnés F1 TV : connectez F1 TV dans l\'appli, puis réactivez la page' }, res.status === 404 ? 404 : 502);
  return res;
}

async function image(req, url) {
  let u;
  try { u = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'Adresse invalide' }, 400); }
  if (u.protocol !== 'https:' || !IMG_HOSTS.has(u.hostname)) return json({ error: 'Adresse refusée' }, 400);
  return cached(req, u.href, { headers: { 'User-Agent': UA } }, 86400);
}

// ---------- Publication : progression ligne par ligne (JSON), puis le résultat ----------
async function publish(req, env, raw, vault) {
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Formulaire illisible' }, 400); }
  const net = String(form.get('network') || '');
  const text = String(form.get('text') || '');
  const comment = String(form.get('comment') || '').trim().slice(0, 500);
  const images = form.getAll('images').filter((f) => typeof f === 'object' && f && /^image\/(png|jpeg)$/.test(f.type) && f.size < 8e6).slice(0, 20);
  if (!['facebook', 'instagram', 'threads', 'bluesky'].includes(net)) return json({ error: 'Réseau inconnu' }, 400);
  if (net === 'bluesky' && !vault.bluesky) return json({ error: 'Compte Bluesky non envoyé : connectez-le dans l\'appli' }, 409);
  if (net !== 'bluesky' && !vault.meta?.pageToken) return json({ error: 'Comptes Meta non envoyés : connectez-les dans l\'appli' }, 409);
  if (net === 'threads' && !vault.threads?.token) return json({ error: 'Compte Threads non envoyé : connectez-le dans l\'appli' }, 409);
  if (!images.length) return json({ error: 'Aucune image' }, 400);
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const line = (o) => w.write(enc.encode(`${JSON.stringify(o)}\n`));
  (async () => {
    try {
      await line({ step: 'Envoi des images…' });
      let r;
      if (net === 'bluesky') {
        const pics = images.slice(0, 4).map((blob) => ({ blob, width: 1600, height: 900 }));
        r = await withComment(() => publishBluesky(vault.bluesky, [...text].slice(0, 300).join(''), pics), comment, (id, t) => replyBluesky(vault.bluesky, id, t));
      } else if (net === 'facebook') r = await withComment(() => publishFacebook(vault.meta, text, images), comment, (id, t) => commentFacebook(vault.meta, id, t));
      else if (net === 'instagram') r = await publishInstagram(vault.meta, text.slice(0, 2200), images);
      else {
        const th = (await refresh(env, raw, vault)).threads;
        r = await withComment(() => publishThreads(th, vault.meta, text.slice(0, 500), images), comment, (id, t) => replyThreads(th, id, t));
      }
      await line({ done: true, url: r.url || null, id: r.id ?? null, comment: !!r.comment, commentError: r.commentError || null });
    } catch (err) {
      await line({ error: String(err?.message || err).slice(0, 300) });
    } finally {
      await w.close();
    }
  })();
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------- Routes /studio/api/… ----------
export async function studioApi(req, env, url) {
  if (!env.DB) return json({ error: 'Base indisponible' }, 503);
  const path = url.pathname.slice('/studio/api/'.length);

  // Activation depuis l'appli : code vérifié une fois, puis seule la clé dérivée sert
  if (path === 'init' && req.method === 'POST') {
    if (await fails(env, req) >= MAX_FAILS) return json({ error: 'Trop d\'essais aujourd\'hui' }, 429);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const code = String(body?.code || '').trim().toUpperCase();
    if (!sameHex(await sha(`paddock-live:${code}`), env.STUDIO_CODE_HASH || CODE_HASH)) { await failed(env, req); return json({ error: 'Code incorrect' }, 401); }
    let raw;
    try { raw = unb64url(body.key); } catch { raw = null; }
    if (!raw || raw.length !== 32) return json({ error: 'Clé invalide' }, 400);
    await setRow(env, 'verifier', await sha(raw));
    await setRow(env, 'vault', await seal(raw, cleanVault(body.vault)));
    return json({ ok: true });
  }

  const a = await auth(req, env);
  if (a.error) return a.error;
  let vault = await open(a.raw, await getRow(env, 'vault')).catch(() => null) || {};

  if (path === 'sync' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    await setRow(env, 'vault', await seal(a.raw, keepNewer(vault, cleanVault(body?.vault))));
    return json({ ok: true });
  }
  if (path === 'forget' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM studio').run();
    return json({ ok: true });
  }
  if (path === 'me' && req.method === 'GET') {
    vault = await refresh(env, a.raw, vault);
    return json({
      facebook: vault.meta?.pageName || null, instagram: vault.meta?.igId ? `@${vault.meta.igUsername || ''}` : null,
      threads: vault.threads?.token ? `@${vault.threads.username || ''}` : null, bluesky: vault.bluesky ? `@${vault.bluesky.handle}` : null, f1tv: !!vault.f1tv, at: vault.at || null,
      sources: DEFAULT_SOURCES.filter((s) => s.kind === 'rss').map(({ id, name, cat, lang, filter }) => ({ id, name, cat, lang, filter: filter || null })),
    });
  }
  // Journal des publications (partagé avec l'appli)
  if (path === 'history') {
    const list = JSON.parse(await getRow(env, 'history') || '[]');
    if (req.method === 'GET') return json({ items: list });
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      const next = addEntry(list, body?.entry);
      await setRow(env, 'history', JSON.stringify(next));
      return json({ items: next });
    }
  }
  if (path === 'stats' && req.method === 'GET') {
    const v = await refresh(env, a.raw, vault);
    // 8 posts au plus : nombre de requêtes du serveur limité par appel
    return json(await postStats(JSON.parse(await getRow(env, 'history') || '[]'), { meta: v.meta, threads: v.threads, bluesky: v.bluesky }, { limit: 8 }));
  }
  if (path === 'feed' && req.method === 'GET') return feed(req, url);
  if (path === 'archive' && req.method === 'GET') return archive(req, url, await refresh(env, a.raw, vault));
  if (path === 'img' && req.method === 'GET') return image(req, url);
  if (path === 'publish' && req.method === 'POST') {
    if (!vault.meta?.pageToken && !vault.bluesky) return json({ error: 'Comptes non envoyés : activez la page depuis l\'appli' }, 409);
    return publish(req, env, a.raw, vault);
  }
  // Alertes des grosses news sur le téléphone (abonnements, dernières alertes)
  const pushed = await pushApi(path, req, env);
  if (pushed) return pushed;
  return json({ error: 'Introuvable' }, 404);
}
