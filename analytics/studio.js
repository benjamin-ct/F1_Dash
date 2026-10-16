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
import { addEntry, removeEntry, cleanKey } from '../shared/post-history.js';
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

// Page d'un article de l'Actu (résumé détaillé, lu dans le navigateur) : https seulement, nom de site
// (pas d'adresse IP), 3 Mo au plus
export function articleUrl(u) {
  let x;
  try { x = new URL(u); } catch { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.hostname) || /^[\d.]+$/.test(x.hostname) || /(^|\.)(localhost|local|internal)$/i.test(x.hostname)) return null;
  return x.href;
}
async function page(req, url) {
  const u = articleUrl(url.searchParams.get('u') || '');
  if (!u) return json({ error: 'Adresse refusée' }, 400);
  const res = await cached(req, u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }, 1800);
  if (res.status !== 200) return json({ error: 'Le site refuse la lecture de cet article' }, 502);
  if (Number(res.headers.get('Content-Length') || 0) > 3e6) return json({ error: 'Page trop volumineuse' }, 413);
  // Rendue comme du texte (jamais comme une page du serveur), encodage d'origine gardé
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('Content-Type') || '')?.[1];
  return new Response(res.body, { headers: { 'Content-Type': `text/plain${charset ? `; charset=${charset}` : ''}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}

// Documents de la FIA (liste des documents d'un Grand Prix, PDF des commissaires) : grille officielle
const FIA_PAGE = /^\/documents\/championships\/fia-formula-one-world-championship-14(\/season\/season-\d{4}-\d+(\/event\/[\w%.'()-]+)?)?$/;
const FIA_PDF = /^\/system\/files\/decision-document\/[\w%.'()-]+\.pdf$/;
async function fia(req, url) {
  const p = url.searchParams.get('p') || '';
  if (p.includes('..') || !(FIA_PAGE.test(p) || FIA_PDF.test(p))) return json({ error: 'Adresse refusée' }, 400);
  return cached(req, `https://www.fia.com${p}`, { headers: { 'User-Agent': UA } }, FIA_PDF.test(p) ? 3600 : 300);
}

async function image(req, url) {
  let u;
  try { u = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'Adresse invalide' }, 400); }
  if (u.protocol !== 'https:' || !IMG_HOSTS.has(u.hostname)) return json({ error: 'Adresse refusée' }, 400);
  return cached(req, u.href, { headers: { 'User-Agent': UA } }, 86400);
}

// Envoi sur un réseau (publication directe ou programmée). threads() : compte Threads à jour
async function sendTo(net, vault, { text, comment, images, small = [] }, threads) {
  if (net === 'bluesky') {
    const pics = small.slice(0, 4).map((blob) => ({ blob, width: 1600, height: 900 }));
    return withComment(() => publishBluesky(vault.bluesky, [...text].slice(0, 300).join(''), pics), comment, (id, t) => replyBluesky(vault.bluesky, id, t));
  }
  if (net === 'facebook') return withComment(() => publishFacebook(vault.meta, text, images), comment, (id, t) => commentFacebook(vault.meta, id, t));
  if (net === 'instagram') return publishInstagram(vault.meta, text.slice(0, 2200), images);
  const th = await threads();
  return withComment(() => publishThreads(th, vault.meta, text.slice(0, 500), images), comment, (id, t) => replyThreads(th, id, t));
}
const NETS = ['facebook', 'instagram', 'threads', 'bluesky'];
// Compte du réseau absent du coffre : raison, sinon null
function missing(net, vault) {
  if (net === 'bluesky') return vault.bluesky ? null : 'Compte Bluesky non envoyé : connectez-le dans l\'appli';
  if (!vault.meta?.pageToken) return 'Comptes Meta non envoyés : connectez-les dans l\'appli';
  if (net === 'threads' && !vault.threads?.token) return 'Compte Threads non envoyé : connectez-le dans l\'appli';
  return null;
}
const resultOf = (r) => ({ url: r.url || null, id: r.id ?? null, comment: !!r.comment, commentError: r.commentError || null, ...(r.visible != null ? { visible: r.visible } : {}) });

// ---------- Publication : progression ligne par ligne (JSON), puis le résultat ----------
async function publish(req, env, raw, vault) {
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Formulaire illisible' }, 400); }
  const net = String(form.get('network') || '');
  const text = String(form.get('text') || '');
  const comment = String(form.get('comment') || '').trim().slice(0, 500);
  const images = form.getAll('images').filter((f) => typeof f === 'object' && f && /^image\/(png|jpeg)$/.test(f.type) && f.size < 8e6).slice(0, 20);
  if (!NETS.includes(net)) return json({ error: 'Réseau inconnu' }, 400);
  if (missing(net, vault)) return json({ error: missing(net, vault) }, 409);
  if (!images.length) return json({ error: 'Aucune image' }, 400);
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const line = (o) => w.write(enc.encode(`${JSON.stringify(o)}\n`));
  (async () => {
    try {
      await line({ step: 'Envoi des images…' });
      const r = await sendTo(net, vault, { text, comment, images, small: images }, async () => (await refresh(env, raw, vault)).threads);
      await line({ done: true, ...resultOf(r) });
    } catch (err) {
      await line({ error: String(err?.message || err).slice(0, 300) });
    } finally {
      await w.close();
    }
  })();
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------- Publications programmées ----------
// Le post (textes de chaque réseau, visuels) est gardé dans la base et publié à l'heure choisie par
// le relevé du serveur (toutes les minutes, un réseau par passage), même page fermée. Les jetons
// utiles sont copiés pour l'occasion, chiffrés avec une clé tirée du secret du serveur (STATS_KEY,
// hors de la base) : la base seule ne permet toujours pas de publier. Visuels et jetons sont effacés
// une fois la publication faite.
const SCHED = { max: 20, ahead: 7 * 86400e3, late: 24 * 3600e3, keep: 7 * 86400e3, running: 15 * 60e3, img: 1.4e6 };
const schedKey = async (env) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`paddock-live-schedule-v1:${env.STATS_KEY}`)));
// Base64 par morceaux (visuels de plus d'un Mo)
function b64big(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
async function rowsLike(env, prefix) {
  const r = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind(`${prefix}%`).all();
  return r.results || [];
}
const delLike = (env, prefix) => env.DB.prepare('DELETE FROM studio WHERE k LIKE ?').bind(`${prefix}%`).run();

// Programmations avec l'état de chaque réseau (pending, running, done, error, expired)
async function schedJobs(env) {
  const states = new Map((await rowsLike(env, 'schedpost:')).map((r) => [r.k, JSON.parse(r.v)]));
  return (await rowsLike(env, 'sched:')).map((r) => {
    const j = JSON.parse(r.v);
    return { ...j, nets: Object.fromEntries(j.posts.map((p) => [p.network, states.get(`schedpost:${j.id}:${p.network}`) || { status: 'pending' }])) };
  }).sort((a, b) => a.at - b.at);
}
const schedSummary = (j) => ({ id: j.id, at: j.at, title: j.title, nets: j.nets });

async function scheduleAdd(req, env, raw, vault, now = Date.now()) {
  if (!env.STATS_KEY) return json({ error: 'Secret du serveur absent : programmation impossible' }, 503);
  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Formulaire illisible' }, 400); }
  const at = Number(form.get('at'));
  if (!Number.isFinite(at) || at < now - 60e3 || at > now + SCHED.ahead) return json({ error: 'Date de publication invalide (dans les 7 prochains jours)' }, 400);
  let posts, record;
  try { posts = JSON.parse(String(form.get('posts') || '[]')); record = JSON.parse(String(form.get('record') || 'null')); } catch { return json({ error: 'JSON invalide' }, 400); }
  if (!Array.isArray(posts) || !posts.length || posts.length > NETS.length) return json({ error: 'Aucun réseau choisi' }, 400);
  posts = posts.map((p) => ({ network: String(p?.network || ''), text: String(p?.text || '').slice(0, 5000), comment: String(p?.comment || '').trim().slice(0, 500) }));
  if (posts.some((p) => !NETS.includes(p.network)) || new Set(posts.map((p) => p.network)).size !== posts.length) return json({ error: 'Réseau inconnu' }, 400);
  for (const p of posts) if (missing(p.network, vault)) return json({ error: missing(p.network, vault) }, 409);
  const files = (k, n) => form.getAll(k).filter((f) => typeof f === 'object' && f && /^image\/(png|jpeg)$/.test(f.type)).slice(0, n);
  const sets = { ig: files('ig', 20), x: files('x', 4) };
  if ([...sets.ig, ...sets.x].some((f) => f.size > SCHED.img)) return json({ error: 'Visuel trop lourd (1,4 Mo au plus)' }, 413);
  if (posts.some((p) => p.network !== 'bluesky') && !sets.ig.length) return json({ error: 'Aucune image' }, 400);
  if (posts.some((p) => p.network === 'bluesky') && !sets.x.length) return json({ error: 'Aucune image' }, 400);
  if ((await schedJobs(env)).filter((j) => Object.values(j.nets).some((s) => s.status === 'pending')).length >= SCHED.max) return json({ error: `${SCHED.max} publications programmées au plus` }, 409);
  // Jetons du moment (Threads prolongé si besoin), seulement ceux des réseaux choisis
  const v = await refresh(env, raw, vault);
  const nets = posts.map((p) => p.network);
  const keys = { ...(nets.some((n) => n !== 'bluesky') ? { meta: v.meta } : {}), ...(nets.includes('threads') ? { threads: v.threads } : {}), ...(nets.includes('bluesky') ? { bluesky: v.bluesky } : {}) };
  const id = hex(crypto.getRandomValues(new Uint8Array(8)));
  for (const [set, list] of Object.entries(sets)) {
    for (const [i, f] of list.entries()) await setRow(env, `schedimg:${id}:${set}:${i}`, JSON.stringify({ type: f.type, data: b64big(new Uint8Array(await f.arrayBuffer())) }));
  }
  const job = { id, at, title: String(form.get('title') || '').slice(0, 200), record: record && typeof record === 'object' ? record : null, posts, sets: { ig: sets.ig.length, x: sets.x.length }, keys: await seal(await schedKey(env), keys), created: now };
  await setRow(env, `sched:${id}`, JSON.stringify(job));
  return json({ item: schedSummary({ ...job, nets: Object.fromEntries(nets.map((n) => [n, { status: 'pending' }])) }) });
}

async function scheduleCancel(env, id) {
  if (!/^[a-f0-9]{16}$/.test(String(id))) return json({ error: 'Publication inconnue' }, 404);
  const j = (await schedJobs(env)).find((x) => x.id === id);
  if (!j) return json({ error: 'Publication inconnue' }, 404);
  if (Object.values(j.nets).some((s) => s.status === 'running')) return json({ error: 'Publication en cours' }, 409);
  await delLike(env, `schedimg:${id}:`);
  await delLike(env, `schedpost:${id}:`);
  await delLike(env, `sched:${id}`);
  return json({ items: (await schedJobs(env)).map(schedSummary) });
}

// Relevé du serveur : publie le premier réseau arrivé à l'heure. Renvoie { published } si un post est
// parti (le relevé des alertes attend alors le passage suivant), null sinon.
export async function runSchedule(env, { now = Date.now() } = {}) {
  if (!env.DB || !env.STATS_KEY) return null;
  const jobs = await schedJobs(env);
  const setState = (j, net, st) => setRow(env, `schedpost:${j.id}:${net}`, JSON.stringify(st));
  let out = null;
  for (const j of jobs) {
    for (const p of j.posts) {
      const st = j.nets[p.network];
      // Envoi resté « en cours » (serveur interrompu) : jamais renvoyé en double
      if (st.status === 'running' && now - (st.started || 0) > SCHED.running) { st.status = 'error'; st.error = 'Envoi interrompu : vérifiez sur le réseau'; await setState(j, p.network, st); }
      if (out || st.status !== 'pending' || j.at > now) continue;
      if (now - j.at > SCHED.late) { st.status = 'expired'; await setState(j, p.network, st); continue; }
      st.status = 'running';
      await setState(j, p.network, { status: 'running', started: now });
      try {
        const keys = await open(await schedKey(env), j.keys);
        if (!keys) throw new Error('Jetons effacés');
        const imgs = async (set) => {
          const list = [];
          for (let i = 0; i < (j.sets?.[set] || 0); i++) {
            const row = JSON.parse(await getRow(env, `schedimg:${j.id}:${set}:${i}`) || 'null');
            if (row) list.push(new Blob([unb64(row.data)], { type: row.type }));
          }
          return list;
        };
        const r = await sendTo(p.network, keys, { text: p.text, comment: p.network === 'instagram' ? '' : p.comment, images: p.network === 'bluesky' ? [] : await imgs('ig'), small: p.network === 'bluesky' ? await imgs('x') : [] }, () => freshThreads(keys.threads));
        Object.assign(st, { status: 'done', at: Date.now(), ...resultOf(r) });
        if (j.record) await setRow(env, 'history', JSON.stringify(addEntry(JSON.parse(await getRow(env, 'history') || '[]'), { ...j.record, at: Date.now(), nets: { [p.network]: { id: st.id, url: st.url } } })));
      } catch (err) {
        Object.assign(st, { status: 'error', error: String(err?.message || err).slice(0, 300) });
      }
      delete st.started;
      await setState(j, p.network, st);
      out = { published: p.network, id: j.id };
    }
    // Programmation terminée : visuels et jetons effacés, puis la trace au bout de 7 jours
    const states = Object.values(j.nets);
    if (states.every((s) => !['pending', 'running'].includes(s.status))) {
      if (j.keys) { await delLike(env, `schedimg:${j.id}:`); const { nets, ...rest } = j; await setRow(env, `sched:${j.id}`, JSON.stringify({ ...rest, keys: null })); }
      if (now - j.at > SCHED.keep) { await delLike(env, `schedpost:${j.id}:`); await delLike(env, `sched:${j.id}`); }
    }
  }
  return out;
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
  if (path === 'history' || path === 'history/remove') {
    const list = JSON.parse(await getRow(env, 'history') || '[]');
    const removed = JSON.parse(await getRow(env, 'history-removed') || '[]');
    if (req.method === 'GET' && path === 'history') return json({ items: list, removed });
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      // Post supprimé sur les réseaux : retiré du journal et des statistiques
      if (path === 'history/remove') {
        if (!cleanKey(body?.key)) return json({ error: 'Post inconnu' }, 400);
        const r = removeEntry(list, removed, body.key);
        await setRow(env, 'history', JSON.stringify(r.items));
        await setRow(env, 'history-removed', JSON.stringify(r.removed));
        return json(r);
      }
      const next = addEntry(list, body?.entry);
      await setRow(env, 'history', JSON.stringify(next));
      // Même post republié : il compte de nouveau
      const k = cleanKey(body?.entry?.key);
      if (k && removed.includes(k)) await setRow(env, 'history-removed', JSON.stringify(removed.filter((x) => x !== k)));
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
  if (path === 'fia' && req.method === 'GET') return fia(req, url);
  if (path === 'page' && req.method === 'GET') return page(req, url);
  if (path === 'schedule' && req.method === 'GET') return json({ items: (await schedJobs(env)).map(schedSummary) });
  if (path === 'schedule' && req.method === 'POST') return scheduleAdd(req, env, a.raw, vault);
  if (path === 'schedule/cancel' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    return scheduleCancel(env, body?.id);
  }
  if (path === 'publish' && req.method === 'POST') {
    if (!vault.meta?.pageToken && !vault.bluesky) return json({ error: 'Comptes non envoyés : activez la page depuis l\'appli' }, 409);
    return publish(req, env, a.raw, vault);
  }
  // Alertes des grosses news sur le téléphone (abonnements, dernières alertes)
  const pushed = await pushApi(path, req, env);
  if (pushed) return pushed;
  return json({ error: 'Introuvable' }, 404);
}
