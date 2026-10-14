// Actualités de la F1 : flux officiels (F1, FIA), chaînes des écuries et des pilotes, médias du
// monde entier. Le serveur relit chaque source régulièrement, garde les nouvelles sur le disque,
// repère pilotes et écuries cités, regroupe les articles d'un même sujet et prévient l'interface
// des nouveautés (la traduction et les alertes se font dans l'interface).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { request, getText, getJSON } from './net.js';
import { CACHE_DIR } from './circuits.js';
import { getConfig, saveConfig } from './config.js';
import { parseFeed, cleanText, newsTags, newsImportance, clusterNews } from '../shared/news.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const FILE = path.join(CACHE_DIR, 'news.json');
const KEEP_MS = 10 * 24 * 3600e3;
const MAX_ITEMS = 4000;
const F1_ONLY = /formula 1|formula one|\bf1\b|grand prix|formule 1/i;

const yt = (id, name, cat, lang = 'en') => ({ id: `yt-${id}`, name, kind: 'youtube', channel: id, cat, lang });
const rss = (id, name, url, cat, lang, extra = {}) => ({ id, name, kind: 'rss', url, cat, lang, ...extra });

// Sources par défaut. cat : 'official' (F1, FIA) | 'team' | 'driver' | 'media'.
// Chaînes YouTube : uniquement les chaînes officielles vérifiées (abonnés, nom).
export const DEFAULT_SOURCES = [
  rss('f1', 'Formula 1', 'https://www.formula1.com/en/latest/all.xml', 'official', 'en'),
  rss('fia-press', 'FIA — communiqués', 'https://www.fia.com/rss/press-release', 'official', 'en', { filter: 'f1' }),
  rss('fia-news', 'FIA — actualités', 'https://www.fia.com/rss/news', 'official', 'en', { filter: 'f1' }),
  yt('UCB_qr75-ydFVKSF9Dmo6izg', 'Formula 1 (YouTube)', 'official'),

  yt('UC7_VGkwCoKfqh1eZEkzey3A', 'Mercedes-AMG F1', 'team'),
  yt('UCQIyqMWCdx1GBvbw_Yi6lEA', 'Oracle Red Bull Racing', 'team'),
  yt('UC8dxVgZl9u5HeCOXnosCtuQ', 'McLaren', 'team'),
  yt('UC8pLH6_Dz4QwKYE-dtcaxeg', 'Aston Martin F1', 'team'),
  yt('UCU56G7ZKkB7xkua6EhMz5dg', 'Racing Bulls', 'team'),
  yt('UCaGImPpcZdJ_8Iu20lCbHHw', 'Haas F1 Team', 'team'),
  yt('UCl1yq_ZQvqEb_D93OVuIFGw', 'Sauber / Audi', 'team'),

  yt('UCwFIQ7wtJzYGFb2nZcVoNww', 'Lando Norris', 'driver'),
  yt('UCHl4MB8UalGLUydbWdBzG1Q', 'Lewis Hamilton', 'driver'),
  yt('UCIzIX1qgW7P3eF6JCk_afCA', 'Charles Leclerc', 'driver'),
  yt('UC1l8_AtyskpHP-weVx47POg', 'Carlos Sainz', 'driver'),

  rss('autosport', 'Autosport', 'https://www.autosport.com/rss/f1/news/', 'media', 'en'),
  rss('motorsport', 'Motorsport.com', 'https://www.motorsport.com/rss/f1/news/', 'media', 'en'),
  rss('the-race', 'The Race', 'https://www.the-race.com/category/formula-1/feed/', 'media', 'en'),
  rss('racefans', 'RaceFans', 'https://www.racefans.net/feed/', 'media', 'en'),
  rss('bbc', 'BBC Sport', 'https://feeds.bbci.co.uk/sport/formula1/rss.xml', 'media', 'en'),
  rss('sky', 'Sky Sports F1', 'https://www.skysports.com/rss/12433', 'media', 'en'),
  rss('guardian', 'The Guardian', 'https://www.theguardian.com/sport/formulaone/rss', 'media', 'en'),
  rss('racer', 'RACER', 'https://www.racer.com/category/f1/feed/', 'media', 'en'),
  rss('espn', 'ESPN', 'https://www.espn.com/espn/rss/f1/news', 'media', 'en'),

  rss('lequipe', "L'Équipe", 'https://dwh.lequipe.fr/api/edito/rss?path=/Formule-1/', 'media', 'fr'),
  rss('motorsport-fr', 'Motorsport.com France', 'https://fr.motorsport.com/rss/f1/news/', 'media', 'fr'),

  rss('marca', 'Marca', 'https://e00-marca.uecdn.es/rss/motor/formula1.xml', 'media', 'es'),
  rss('as', 'AS', 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/motor/subsection/formula_1/', 'media', 'es'),
  rss('soymotor', 'SoyMotor', 'https://soymotor.com/rss.xml', 'media', 'es'),

  rss('gazzetta', 'La Gazzetta dello Sport', 'https://www.gazzetta.it/dynamic-feed/rss/section/Formula-1.xml', 'media', 'it'),
  rss('formulapassion', 'FormulaPassion', 'https://www.formulapassion.it/feed', 'media', 'it'),
  rss('motorsport-it', 'Motorsport.com Italia', 'https://it.motorsport.com/rss/f1/news/', 'media', 'it'),

  rss('motorsport-total', 'Motorsport-Total', 'https://www.motorsport-total.com/rss/rss_formel-1.xml', 'media', 'de'),
  rss('motorsport-magazin', 'Motorsport-Magazin', 'https://www.motorsport-magazin.com/rss/formel1.xml', 'media', 'de'),

  rss('motorsport-nl', 'Motorsport.com Nederland', 'https://nl.motorsport.com/rss/f1/news/', 'media', 'nl'),
  rss('motorsport-br', 'Motorsport.com Brasil', 'https://br.motorsport.com/rss/f1/news/', 'media', 'pt'),
  rss('as-web', 'auto sport web', 'https://www.as-web.jp/f1/feed', 'media', 'ja'),
  rss('motorsport-jp', 'Motorsport.com 日本版', 'https://jp.motorsport.com/rss/f1/news/', 'media', 'ja'),
];

const EVERY = { official: 3 * 60e3, rss: 6 * 60e3, youtube: 10 * 60e3, bsky: 5 * 60e3 };
const LANGS = new Set(['en', 'fr', 'es', 'it', 'de', 'nl', 'pt', 'ja', 'zh']);

const items = new Map();           // id -> nouvelle
const runtime = new Map();         // id source -> { ok, error, count, last, nextAt, fails, etag, modified, primed }
const listeners = new Set();
let started = false;
let saveTimer = null;
const startedAt = Date.now();

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 14);
const normLink = (u) => String(u || '').replace(/^http:/, 'https:').replace(/[?#].*$/, '').replace(/\/$/, '');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const it of data.items || []) if (it?.id) items.set(it.id, it);
  } catch { /* pas encore de cache */ }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ items: [...items.values()] }));
    } catch { /* disque indisponible : la liste reste en mémoire */ }
  }, 2000);
}

function newsConfig() {
  const c = getConfig().news || {};
  return { disabled: Array.isArray(c.disabled) ? c.disabled : [], custom: Array.isArray(c.custom) ? c.custom : [] };
}

export function allSources() {
  const { disabled, custom } = newsConfig();
  return [...DEFAULT_SOURCES, ...custom.map((s) => ({ ...s, custom: true }))].map((s) => ({ ...s, enabled: !disabled.includes(s.id) }));
}

function feedUrl(s) {
  if (s.kind === 'youtube') return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(s.channel)}`;
  if (s.kind === 'bsky') return `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(s.handle)}&limit=30&filter=posts_no_replies`;
  return s.url;
}

// Publications Bluesky → même forme que les articles d'un flux
function parseBsky(json, handle) {
  const out = [];
  for (const { post, reason } of json.feed || []) {
    if (reason || !post?.record?.text) continue;
    const text = String(post.record.text).replace(/\s+/g, ' ').trim();
    const rkey = String(post.uri || '').split('/').pop();
    const img = post.embed?.images?.[0]?.thumb || post.embed?.external?.thumb || post.embed?.media?.images?.[0]?.thumb || null;
    out.push({ guid: post.uri, title: text.length > 160 ? `${text.slice(0, 157)}…` : text, summary: text.length > 160 ? text.slice(0, 600) : '', link: `https://bsky.app/profile/${handle}/post/${rkey}`, img, t: Date.parse(post.record.createdAt) || null });
  }
  return { lang: null, items: out };
}

async function fetchSource(s, rt) {
  const headers = { 'User-Agent': UA, Accept: s.kind === 'bsky' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
  if (rt.etag) headers['If-None-Match'] = rt.etag;
  if (rt.modified) headers['If-Modified-Since'] = rt.modified;
  // Délai maximal : une connexion qui ne s'établit jamais (proxy, site bloqué) ne doit pas
  // occuper indéfiniment une des lectures en parallèle
  let timer;
  const res = await Promise.race([
    request(feedUrl(s), { headers, timeout: 20000 }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Délai dépassé')), 30000); }),
  ]).finally(() => clearTimeout(timer));
  if (res.status === 304) return null;
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  rt.etag = res.headers.etag || null;
  rt.modified = res.headers['last-modified'] || null;
  const body = decodeBody(res.body, res.headers['content-type']);
  return s.kind === 'bsky' ? parseBsky(JSON.parse(body), s.handle) : parseFeed(body);
}

// Encodage du flux : en-tête HTTP, sinon déclaration XML, sinon UTF-8 (certains sites allemands
// publient encore en ISO-8859-1)
function decodeBody(buf, type = '') {
  const head = buf.subarray(0, 200).toString('latin1');
  const label = (String(type).match(/charset=([\w-]+)/i)?.[1] || head.match(/encoding=["']([\w-]+)["']/i)?.[1] || 'utf-8').toLowerCase();
  try { return new TextDecoder(label).decode(buf); } catch { return buf.toString('utf8'); }
}

function emitNew(list) {
  if (!list.length) return;
  for (const fn of listeners) {
    try { fn(list); } catch { /* ignore */ }
  }
}

export function onNews(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Nombre de sources différentes par sujet
function clusterSizes(list) {
  const m = new Map();
  for (const it of list) {
    if (!m.has(it.cluster)) m.set(it.cluster, new Set());
    m.get(it.cluster).add(it.src);
  }
  return Object.fromEntries([...m].map(([k, v]) => [k, v.size]));
}

function recluster() {
  const since = Date.now() - 3 * 24 * 3600e3;
  const recent = [...items.values()].filter((it) => it.t >= since).sort((a, b) => a.t - b.t);
  clusterNews(recent);
}

function prune() {
  const min = Date.now() - KEEP_MS;
  for (const [id, it] of items) if (it.t < min) items.delete(id);
  if (items.size > MAX_ITEMS) {
    const sorted = [...items.values()].sort((a, b) => a.t - b.t);
    for (const it of sorted.slice(0, items.size - MAX_ITEMS)) items.delete(it.id);
  }
}

async function poll(s) {
  const rt = runtime.get(s.id) || {};
  runtime.set(s.id, rt);
  const now = Date.now();
  try {
    const feed = await fetchSource(s, rt);
    rt.ok = true;
    rt.error = null;
    rt.fails = 0;
    rt.last = now;
    if (feed) {
      const added = [];
      for (const raw of feed.items) {
        const id = hash(`${s.id}|${normLink(raw.link) || raw.guid}`);
        if (items.has(id)) continue;
        if (s.filter === 'f1' && !F1_ONLY.test(`${raw.title} ${raw.summary}`)) continue;
        // Date absente ou illisible : heure de découverte si la source était déjà suivie ; à la
        // première lecture, l'article est placé plus bas (il peut être ancien)
        const dated = !!raw.t && raw.t <= now + 10 * 60e3;
        const t = dated ? raw.t : rt.primed ? now : now - 24 * 3600e3;
        const lang = LANGS.has(s.lang) ? s.lang : (LANGS.has(feed.lang) ? feed.lang : 'en');
        const it = {
          id, src: s.id, title: raw.title.slice(0, 300), summary: raw.summary || '', link: raw.link, img: raw.img, t, seen: now,
          lang, cat: s.cat, kind: s.kind === 'youtube' ? 'video' : s.kind === 'bsky' ? 'post' : 'article', cluster: id,
        };
        it.tags = newsTags(`${it.title} ${it.summary}`);
        it.imp = newsImportance(it, s.cat);
        // Nouveauté signalée seulement si la source avait déjà été lue (pas au démarrage), ou si
        // elle vient d'être publiée
        it.fresh = !!rt.primed || (dated && t > now - 20 * 60e3);
        items.set(id, it);
        added.push(it);
      }
      rt.count = [...items.values()].filter((it) => it.src === s.id).length;
      if (added.length) {
        prune();
        recluster();
        scheduleSave();
        const sizes = clusterSizes([...items.values()].filter((it) => it.t >= now - 3 * 24 * 3600e3));
        emitNew(added.filter((it) => items.has(it.id)).map((it) => ({ ...it, sources: sizes[it.cluster] || 1 })));
      }
    }
    rt.primed = true;
  } catch (err) {
    rt.ok = false;
    rt.error = err.message;
    rt.fails = (rt.fails || 0) + 1;
    rt.primed = true;
  }
  const every = s.cat === 'official' && s.kind === 'rss' ? EVERY.official : EVERY[s.kind] || EVERY.rss;
  rt.nextAt = Date.now() + Math.min(60 * 60e3, every * 2 ** Math.min(4, rt.fails || 0)) + Math.random() * 20e3;
}

let running = 0;
async function tick() {
  const now = Date.now();
  for (const s of allSources()) {
    if (!s.enabled || running >= 6) continue;
    const rt = runtime.get(s.id);
    if (rt?.busy || (rt?.nextAt && rt.nextAt > now)) continue;
    const r = rt || {};
    runtime.set(s.id, r);
    r.busy = true;
    running++;
    poll(s).finally(() => { r.busy = false; running--; });
  }
}

export function startNews() {
  if (started || process.env.NO_NEWS) return;
  started = true;
  load();
  // Départ échelonné : toutes les sources ne sont pas lues à la même seconde
  allSources().forEach((s, i) => { runtime.set(s.id, { nextAt: Date.now() + 2000 + i * 800 }); });
  setInterval(tick, 5000).unref?.();
  tick();
}

export function refreshNews() {
  for (const s of allSources()) {
    const rt = runtime.get(s.id);
    if (rt && !rt.busy) rt.nextAt = 0;
  }
  tick();
}

export function newsSnapshot({ limit = 800 } = {}) {
  const list = [...items.values()].sort((a, b) => b.t - a.t);
  const sizes = clusterSizes(list.filter((it) => it.t >= Date.now() - 3 * 24 * 3600e3));
  return {
    items: list.slice(0, limit).map(({ fresh, ...it }) => ({ ...it, sources: sizes[it.cluster] || 1 })),
    sources: allSources().map((s) => {
      const rt = runtime.get(s.id) || {};
      return { id: s.id, name: s.name, cat: s.cat, lang: s.lang, kind: s.kind, enabled: s.enabled, custom: !!s.custom, ok: rt.ok ?? null, error: rt.error || null, last: rt.last || null, count: rt.count ?? [...items.values()].filter((it) => it.src === s.id).length };
    }),
    startedAt,
  };
}

// ---- Sources ajoutées par l'utilisateur ----
function safeUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname)) return null;
  return u;
}

async function resolveYouTube(u) {
  const direct = u.pathname.match(/\/channel\/(UC[\w-]{20,})/);
  let id = direct?.[1];
  if (!id) {
    const html = await getText(u.toString(), { headers: { 'User-Agent': UA, 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1' } });
    id = html.match(/"externalId":"(UC[\w-]+)"/)?.[1] || html.match(/channel_id=(UC[\w-]+)/)?.[1];
  }
  if (!id) throw new Error('Chaîne YouTube introuvable');
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'User-Agent': UA } });
  const feed = parseFeed(xml);
  const name = cleanText(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || 'YouTube';
  return { kind: 'youtube', channel: id, name, lang: feed.lang || 'en' };
}

async function resolveBsky(handle) {
  const p = await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`, { headers: { 'User-Agent': UA } });
  if (!p?.handle) throw new Error('Compte Bluesky introuvable');
  return { kind: 'bsky', handle: p.handle, name: `${p.displayName || p.handle} (Bluesky)`, lang: 'en' };
}

async function resolveFeed(u) {
  const body = await getText(u.toString(), { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/html, */*' } });
  const feed = parseFeed(body);
  if (feed.items.length) {
    const title = cleanText(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || u.hostname;
    return { kind: 'rss', url: u.toString(), name: title.slice(0, 60), lang: feed.lang || 'en' };
  }
  // Page web : on cherche le flux qu'elle annonce
  const alt = body.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (!alt) throw new Error('Aucun flux RSS / Atom trouvé à cette adresse');
  const next = safeUrl(new URL(alt.replace(/&amp;/g, '&'), u).toString());
  if (!next) throw new Error('Flux annoncé non pris en charge');
  const b2 = await getText(next.toString(), { headers: { 'User-Agent': UA } });
  const f2 = parseFeed(b2);
  if (!f2.items.length) throw new Error('Le flux trouvé est vide');
  const title = cleanText(b2.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || next.hostname;
  return { kind: 'rss', url: next.toString(), name: title.slice(0, 60), lang: f2.lang || 'en' };
}

const CATS = new Set(['official', 'team', 'driver', 'media']);

export async function addNewsSource(input, cat = 'media', lang = null) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Adresse vide');
  let found;
  const handle = raw.replace(/^@/, '').match(/^(?:https:\/\/bsky\.app\/profile\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i)?.[1];
  if (handle && (/bsky\.app\/profile\//i.test(raw) || /\.bsky\.social$/i.test(handle) || raw.startsWith('@'))) found = await resolveBsky(handle);
  else {
    const u = safeUrl(raw);
    if (!u) throw new Error('Adresse invalide (https:// attendu)');
    found = /(^|\.)youtube\.com$/i.test(u.hostname) ? await resolveYouTube(u) : await resolveFeed(u);
  }
  const key = found.channel || found.handle || found.url;
  const id = `c-${hash(key)}`;
  const { disabled, custom } = newsConfig();
  if (custom.some((s) => s.id === id) || DEFAULT_SOURCES.some((s) => (s.channel || s.url) === key)) throw new Error('Source déjà présente');
  const src = { id, ...found, cat: CATS.has(cat) ? cat : 'media', lang: LANGS.has(lang) ? lang : (LANGS.has(found.lang) ? found.lang : 'en') };
  saveConfig({ news: { disabled, custom: [...custom, src] } });
  runtime.set(id, { nextAt: 0 });
  tick();
  return src;
}

export function removeNewsSource(id) {
  const { disabled, custom } = newsConfig();
  saveConfig({ news: { disabled: disabled.filter((x) => x !== id), custom: custom.filter((s) => s.id !== id) } });
  for (const [k, it] of items) if (it.src === id) items.delete(k);
  runtime.delete(id);
  scheduleSave();
}

export function setNewsSourceEnabled(id, on) {
  const { disabled, custom } = newsConfig();
  const next = on ? disabled.filter((x) => x !== id) : [...new Set([...disabled, id])];
  saveConfig({ news: { disabled: next, custom } });
  if (on) runtime.set(id, { nextAt: 0 });
}
