// Mode créateur : publication des posts sur les réseaux du propriétaire (X, Facebook, Instagram,
// Threads, brouillon vidéo TikTok). Les clés et jetons restent dans config.json sur cet ordinateur
// (jamais dans une sauvegarde des réglages) ; l'interface n'en voit que le nom du compte.
import crypto from 'node:crypto';
import { getConfig, saveConfig } from './config.js';
import { xLength } from '../shared/social.js';
import { call, GRAPH, THREADS, timing, publishFacebook, publishInstagram, publishThreads, freshThreads } from '../shared/meta-publish.js';

const XAPI = 'https://api.x.com/2';
const TIKTOK = 'https://open.tiktokapis.com/v2';
export const NETWORKS = ['x', 'facebook', 'instagram', 'threads', 'tiktok'];

const conf = () => getConfig().social || {};
const save = (net, v) => saveConfig({ social: { ...conf(), [net]: v } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Comptes ----------
export function accountsInfo() {
  const c = conf();
  return {
    x: { connected: !!c.x?.accessToken, name: c.x?.username || '' },
    facebook: { connected: !!c.meta?.pageToken, name: c.meta?.pageName || '' },
    instagram: { connected: !!c.meta?.igId, name: c.meta?.igUsername ? `@${c.meta.igUsername}` : '' },
    threads: { connected: !!c.threads?.token, name: c.threads?.username ? `@${c.threads.username}` : '', expiresAt: c.threads?.expiresAt || null },
    tiktok: { connected: !!c.tiktok?.refreshToken, name: c.tiktok?.name || '', configured: !!c.tiktok?.clientKey },
  };
}

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function saveAccount(net, b) {
  if (b.remove) {
    const c = { ...conf() };
    if (net === 'facebook' || net === 'instagram') delete c.meta; else delete c[net];
    saveConfig({ social: c });
    return accountsInfo();
  }
  if (net === 'x') {
    const k = { apiKey: str(b.apiKey), apiSecret: str(b.apiSecret), accessToken: str(b.accessToken), accessSecret: str(b.accessSecret) };
    if (Object.values(k).some((v) => !v)) throw new Error('Les 4 clés sont nécessaires');
    const me = await call(`${XAPI}/users/me`, { headers: { Authorization: oauth1('GET', `${XAPI}/users/me`, k) } });
    save('x', { ...k, username: me?.data?.username ? `@${me.data.username}` : '' });
  } else if (net === 'facebook' || net === 'instagram') {
    const appId = str(b.appId); const appSecret = str(b.appSecret); const userToken = str(b.userToken, 1000);
    if (!appId || !appSecret || !userToken) throw new Error('Identifiant de l\'app, clé secrète et jeton nécessaires');
    // Jeton longue durée, puis jeton de la page (sans date d'expiration) et compte Instagram relié
    const long = await call(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken })}`);
    const pages = await call(`${GRAPH}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token })}`);
    const list = pages?.data || [];
    const page = list.find((p) => p.id === str(b.pageId)) || list.find((p) => p.instagram_business_account) || list[0];
    if (!page) throw new Error('Aucune page Facebook accessible avec ce jeton');
    saveConfig({ social: { ...conf(), meta: { appId, appSecret, pageId: page.id, pageName: page.name, pageToken: page.access_token, igId: page.instagram_business_account?.id || '', igUsername: page.instagram_business_account?.username || '' } } });
  } else if (net === 'threads') {
    const appSecret = str(b.appSecret); const token = str(b.token, 1000);
    if (!appSecret || !token) throw new Error('Clé secrète Threads et jeton nécessaires');
    let long = { access_token: token, expires_in: 0 };
    try { long = await call(`https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: appSecret, access_token: token })}`); } catch { /* déjà un jeton longue durée */ }
    const me = await call(`${THREADS}/me?${new URLSearchParams({ fields: 'id,username', access_token: long.access_token })}`);
    save('threads', { appSecret, token: long.access_token, expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : null, userId: me.id, username: me.username || '' });
  } else if (net === 'tiktok') {
    const clientKey = str(b.clientKey); const clientSecret = str(b.clientSecret);
    if (!clientKey || !clientSecret) throw new Error('Client key et client secret nécessaires');
    save('tiktok', { ...(conf().tiktok || {}), clientKey, clientSecret });
  } else throw new Error('Réseau inconnu');
  return accountsInfo();
}

// ---------- X : signature OAuth 1.0a (corps JSON ou multipart : non signé) ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function oauth1(method, url, k, { nonce = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000), params: extra = {} } = {}) {
  const u = new URL(url);
  const params = { oauth_consumer_key: k.apiKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(timestamp), oauth_token: k.accessToken, oauth_version: '1.0' };
  const all = [...Object.entries(params), ...u.searchParams.entries(), ...Object.entries(extra)].map(([a, b]) => [enc(a), enc(b)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(all.map(([a, b]) => `${a}=${b}`).join('&'))].join('&');
  const sig = crypto.createHmac('sha1', `${enc(k.apiSecret)}&${enc(k.accessSecret)}`).update(base).digest('base64');
  return `OAuth ${Object.entries({ ...params, oauth_signature: sig }).map(([a, b]) => `${enc(a)}="${enc(b)}"`).join(', ')}`;
}

async function publishX(text, images) {
  const k = conf().x;
  if (!k?.accessToken) throw new Error('Compte X non connecté');
  const auth = (method, url) => ({ Authorization: oauth1(method, url, k) });
  const ids = [];
  for (const img of images.slice(0, 4)) {
    const init = await call(`${XAPI}/media/upload/initialize`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/initialize`), json: { media_type: 'image/png', total_bytes: img.length, media_category: 'tweet_image' } });
    const id = init?.data?.id;
    const form = new FormData();
    form.append('segment_index', '0');
    form.append('media', new Blob([img], { type: 'image/png' }), 'image.png');
    await call(`${XAPI}/media/upload/${id}/append`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/${id}/append`), form });
    await call(`${XAPI}/media/upload/${id}/finalize`, { method: 'POST', headers: auth('POST', `${XAPI}/media/upload/${id}/finalize`) });
    ids.push(id);
  }
  const post = await call(`${XAPI}/tweets`, { method: 'POST', headers: auth('POST', `${XAPI}/tweets`), json: { text, ...(ids.length ? { media: { media_ids: ids } } : {}) } });
  const user = String(k.username || '').replace('@', '') || 'i';
  return { url: `https://x.com/${user}/status/${post?.data?.id}` };
}

// ---------- Meta : Facebook, Instagram, Threads (code partagé avec la page web du créateur) ----------
export { timing };
const blobs = (images) => images.map((b) => new Blob([b], { type: 'image/png' }));

async function threadsAccount() {
  const t = conf().threads;
  const fresh = await freshThreads(t);
  if (fresh !== t) save('threads', fresh);
  return fresh;
}

// ---------- TikTok : connexion (PKCE, retour sur cet ordinateur) et brouillon vidéo ----------
const pending = new Map();   // state -> { verifier, redirect, at }

export function tiktokLoginUrl(origin) {
  const t = conf().tiktok;
  if (!t?.clientKey) throw new Error('Renseignez d\'abord le client key et le client secret TikTok');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const redirect = `${origin}/tiktok-callback/`;
  pending.set(state, { verifier, redirect, at: Date.now() });
  // TikTok (ordinateur) : défi PKCE = SHA-256 du vérificateur, en hexadécimal
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: t.clientKey, scope: 'user.info.basic,video.upload', response_type: 'code', redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
}

function storeTiktok(t, r) {
  save('tiktok', { ...t, accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in || 86400) * 1000, refreshToken: r.refresh_token || t.refreshToken, openId: r.open_id || t.openId });
  return conf().tiktok;
}

export async function tiktokCallback(params) {
  const p = pending.get(params.get('state'));
  if (!p || Date.now() - p.at > 15 * 60e3) throw new Error('Demande de connexion expirée : recommencez depuis l\'application');
  pending.delete(params.get('state'));
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
  const t = conf().tiktok;
  const r = await call(`${TIKTOK}/oauth/token/`, { method: 'POST', form: { client_key: t.clientKey, client_secret: t.clientSecret, code: params.get('code') || '', grant_type: 'authorization_code', redirect_uri: p.redirect, code_verifier: p.verifier } });
  const saved = storeTiktok(t, r);
  try {
    const u = await call(`${TIKTOK}/user/info/?fields=display_name`, { headers: { Authorization: `Bearer ${saved.accessToken}` } });
    save('tiktok', { ...saved, name: u?.data?.user?.display_name || '' });
  } catch { /* nom facultatif */ }
}

async function tiktokToken() {
  const t = conf().tiktok;
  if (!t?.refreshToken) throw new Error('Compte TikTok non connecté');
  if (t.accessToken && t.expiresAt - Date.now() > 5 * 60e3) return t.accessToken;
  const r = await call(`${TIKTOK}/oauth/token/`, { method: 'POST', form: { client_key: t.clientKey, client_secret: t.clientSecret, grant_type: 'refresh_token', refresh_token: t.refreshToken } });
  return storeTiktok(t, r).accessToken;
}

async function publishTiktok(video, mime) {
  if (!video?.length) throw new Error('Vidéo manquante');
  const token = await tiktokToken();
  const init = await call(`${TIKTOK}/post/publish/inbox/video/init/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, json: { source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 } } });
  const res = await fetch(init.data.upload_url, { method: 'PUT', headers: { 'Content-Type': mime, 'Content-Length': String(video.length), 'Content-Range': `bytes 0-${video.length - 1}/${video.length}` }, body: video, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`Envoi de la vidéo refusé (HTTP ${res.status})`);
  return { url: null, note: 'Brouillon envoyé : ouvrez la notification dans TikTok pour ajouter un son et publier' };
}

// ---------- Publication ----------
export async function publish(net, { text = '', images = [], video = null, mime = 'video/mp4' }) {
  const imgs = images.map((b) => Buffer.from(String(b), 'base64')).filter((b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47);
  const body = String(text || '');
  if (net === 'x') return publishX(xLength(body) > 280 ? body.slice(0, 280) : body, imgs);
  if (net === 'facebook') return publishFacebook(conf().meta, body, blobs(imgs));
  if (net === 'instagram') return publishInstagram(conf().meta, body.slice(0, 2200), blobs(imgs));
  if (net === 'threads') return publishThreads(await threadsAccount(), conf().meta, body.slice(0, 500), blobs(imgs));
  if (net === 'tiktok') return publishTiktok(video ? Buffer.from(String(video), 'base64') : null, /^video\/(mp4|webm|quicktime)$/.test(mime) ? mime : 'video/mp4');
  throw new Error('Réseau inconnu');
}
