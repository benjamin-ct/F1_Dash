// Commentaires audio F1 TV Pro : recherche de la vidéo de la séance (identifiants communs avec le
// chronométrage), demande du flux avec le jeton de l'abonné, et relais local des requêtes du
// lecteur (manifestes, segments, licence DRM) pour éviter les blocages CORS du navigateur.
import https from 'node:https';
import http from 'node:http';
import { getJSON, request, agent, USER_AGENT } from './net.js';

const BASE = 'https://f1tv.formula1.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
// Formats demandés dans l'ordre : HLS d'abord (souvent sans DRM), puis DASH.
const FORMATS = ['BIG_SCREEN_HLS', 'WEB_HLS', 'WEB_DASH'];

function containersOf(obj) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (o.metadata?.contentId && o.metadata?.emfAttributes) out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(obj);
  return out;
}

const cache = new Map();

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Vidéo F1 TV de la séance (live ou rediffusion) : meetingKey / sessionKey du chronométrage.
export async function findSessionContent(meetingKey, sessionKey) {
  const list = await cached(`meeting-${meetingKey}`, 60e3, async () => {
    const d = await getJSON(`${BASE}/2.0/R/ENG/WEB_DASH/ALL/PAGE/SEARCH/VOD/F1_TV_Pro_Annual/14?filter_MeetingKey=${encodeURIComponent(meetingKey)}&filter_orderByFom=Y&filter_fetchAll=Y`, { headers: { 'User-Agent': UA } });
    return containersOf(d).map((c) => ({
      contentId: c.metadata.contentId,
      title: c.metadata.title,
      subtype: c.metadata.contentSubtype,
      sessionKey: String(c.metadata.emfAttributes?.MeetingSessionKey || ''),
      state: c.metadata.emfAttributes?.state || '',
    }));
  });
  const main = list.filter((c) => c.sessionKey === String(sessionKey) && ['LIVE', 'REPLAY'].includes(c.subtype));
  const content = main.find((c) => c.subtype === 'LIVE') || main[0] || null;
  if (!content) return { content: null };
  const details = await contentDetails(content.contentId);
  return { content: { ...content, ...details } };
}

export async function contentDetails(contentId) {
  return cached(`content-${contentId}`, 60e3, async () => {
    const d = await getJSON(`${BASE}/3.0/R/ENG/WEB_DASH/ALL/CONTENT/VIDEO/${encodeURIComponent(contentId)}/F1_TV_Pro_Annual/14`, { headers: { 'User-Agent': UA } });
    const md = d?.resultObj?.containers?.[0]?.metadata || {};
    const channels = (md.additionalStreams || [])
      // Canaux avec commentaires / son : flux international et émission « F1 Live »
      .filter((s) => s.type !== 'obc' && ['INTERNATIONAL', 'F1 LIVE'].includes(String(s.title).toUpperCase()))
      .map((s) => ({ channelId: s.channelId, title: s.title, main: /contentId=\d+$/.test(s.playbackUrl || '') && !/channelId/.test(s.playbackUrl || '') }));
    return {
      title: md.title || null,
      live: md.contentSubtype === 'LIVE',
      languages: ['ENG', ...(md.availableLanguages || []).map((l) => l.languageCode)].filter((x, i, a) => x && a.indexOf(x) === i),
      channels,
    };
  });
}

// Hôtes que le relais accepte : F1 TV et les CDN vidéo, plus ceux renvoyés par l'API de lecture.
const allowedHosts = new Set(String(process.env.F1TV_PROXY_EXTRA_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean));
const CDN_SUFFIXES = ['formula1.com', 'akamaized.net', 'akamaihd.net', 'akamai.net', 'edgesuite.net', 'edgekey.net', 'cloudfront.net', 'fastly.net', 'llnwd.net', 'llnw.net', 'irdeto.com', 'axprod.net', 'drmtoday.com'];

// Stations de radio ajoutées par l'utilisateur (hôtes autorisés pour le relais).
export function allowHost(host) {
  if (host) allowedHosts.add(host);
}

function hostAllowed(host) {
  return allowedHosts.has(host) || CDN_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

// Demande du flux pour une vidéo / un canal, avec le jeton de l'abonné (en-tête ascendontoken).
export async function playback(contentId, channelId, token) {
  const tried = [];
  // « A » : variante « abonné connecté » de l'API, « R » : variante utilisée historiquement.
  const variants = FORMATS.flatMap((format) => ['A', 'R'].map((mode) => ({ format, mode })));
  for (const { format, mode } of variants) {
    const q = new URLSearchParams({ contentId: String(contentId) });
    if (channelId) q.set('channelId', String(channelId));
    const r = await request(`${BASE}/2.0/${mode}/ENG/${format}/ALL/CONTENT/PLAY?${q}`, { headers: { 'User-Agent': UA, ascendontoken: token, Accept: 'application/json' } });
    let body = {};
    try { body = JSON.parse(r.body.toString('utf8')); } catch { /* réponse non JSON */ }
    const o = body.resultObj || {};
    tried.push({ format: `${format} (${mode})`, status: r.status, message: body.message || null, streamType: o.streamType || null });
    if (r.status >= 200 && r.status < 300 && o.url) {
      const u = new URL(o.url);
      allowedHosts.add(u.host);
      if (o.laURL) allowedHosts.add(new URL(o.laURL, BASE).host);
      return {
        ok: true,
        format,
        url: o.url,
        streamType: o.streamType || null,
        drm: o.drmType || (o.laURL ? 'widevine' : /WV|DRM/i.test(o.streamType || '') ? 'widevine' : null),
        laURL: o.laURL ? new URL(o.laURL, BASE).toString() : null,
        drmToken: o.drmToken || o.entitlementToken || null,
        channelId: o.channelId || channelId || null,
        tried,
      };
    }
    // Jeton refusé : inutile d'essayer les autres formats
    if (r.status === 401 || r.status === 403) break;
  }
  return { ok: false, tried };
}

// Relais local : GET (manifestes, segments) et POST (licence DRM).
export function proxy(req, res, target, token) {
  let u;
  try { u = new URL(target); } catch { res.writeHead(400); res.end('URL invalide'); return; }
  // HTTPS pour F1 TV ; HTTP accepté seulement pour les stations radio ajoutées par l'utilisateur
  const okProto = u.protocol === 'https:' || (u.protocol === 'http:' && allowedHosts.has(u.host));
  if (!okProto || !hostAllowed(u.host)) { res.writeHead(403); res.end('Hôte non autorisé'); return; }
  const f1 = u.host.endsWith('formula1.com') || u.host.endsWith('akamaized.net');
  const headers = { 'User-Agent': UA, Accept: '*/*', ...(f1 ? { Origin: 'https://f1tv.formula1.com', Referer: 'https://f1tv.formula1.com/' } : {}) };
  if (req.headers.range) headers.Range = req.headers.range;
  if (u.host.endsWith('formula1.com') && token) headers.ascendontoken = token;
  const ent = req.headers['x-f1tv-entitlement'];
  if (ent) headers.entitlementtoken = ent;
  if (req.method === 'POST') headers['Content-Type'] = req.headers['content-type'] || 'application/octet-stream';
  const lib = u.protocol === 'http:' ? http : https;
  const up = lib.request(u, { method: req.method === 'POST' ? 'POST' : 'GET', ...(u.protocol === 'https:' ? { agent } : {}), headers }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      const next = new URL(r.headers.location, u).toString();
      allowedHosts.add(new URL(next).host);
      proxy(req, res, next, token);
      return;
    }
    const out = { 'Cache-Control': 'no-store', 'X-Upstream-Url': u.toString() };
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
  up.on('error', (err) => { if (!res.headersSent) res.writeHead(502); res.end(err.message); });
  // Lecteur arrêté (flux radio sans fin) : on coupe aussi la connexion en amont
  res.on('close', () => up.destroy());
  up.setTimeout(20000, () => up.destroy(new Error('Délai dépassé')));
  if (req.method === 'POST') req.pipe(up); else up.end();
}

// Liste de lecture radio (.pls / .m3u) : première adresse de flux trouvée.
export async function resolvePlaylist(target) {
  const u = new URL(target);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Adresse invalide');
  const text = (u.protocol === 'https:'
    ? (await request(u.toString(), { headers: { 'User-Agent': UA } })).body.toString('utf8')
    : await new Promise((resolve, reject) => {
      // Listes de lecture en HTTP simple (fréquent pour les radios)
      const rq = http.get(u, { headers: { 'User-Agent': UA } }, (r) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c) => { data += c; if (data.length > 20000) r.destroy(); });
        r.on('end', () => resolve(data));
        r.on('close', () => resolve(data));
      });
      rq.on('error', reject);
      rq.setTimeout(15000, () => rq.destroy(new Error('Délai dépassé')));
    })).slice(0, 20000);
  const m = /^(?:File\d+=)?\s*(https?:\/\/\S+)/im.exec(text);
  if (!m) throw new Error('Aucun flux trouvé dans la liste de lecture');
  return m[1].trim();
}

export const _test = { containersOf, hostAllowed, USER_AGENT };
