// Page web du créateur (/studio/ sur le serveur Paddock Live) : l'appli y envoie les comptes des
// réseaux (Facebook, Instagram, Threads) et la connexion F1 TV, chiffrés avec une clé dérivée du
// code du mode créateur, pour préparer et publier les posts depuis le téléphone, PC éteint.
// Le code n'est envoyé qu'à l'activation (vérifié contre son empreinte) ; ensuite seule la clé sert,
// gardée dans config.json comme les jetons eux-mêmes. Nouvel envoi automatique quand un jeton change.
import crypto from 'node:crypto';
import { getConfig, saveConfig, tokenInfo } from './config.js';
import { checkCode, creatorEnabled } from './creator.js';

export const STUDIO_URL = process.env.PADDOCK_STUDIO_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev';
const EVERY = 6 * 3600e3;

export const studioKey = (code) => crypto.pbkdf2Sync(String(code).trim().toUpperCase(), 'paddock-live-studio', 200000, 32, 'sha256').toString('base64url');

// Ce qui part sur le serveur : jetons des réseaux (sans clés secrètes d'app) et connexion F1 TV valide
export function studioVault(c = getConfig()) {
  const s = c.social || {};
  const f1tv = c.f1tvToken && !tokenInfo(c.f1tvToken).expired ? c.f1tvToken : null;
  return {
    meta: s.meta?.pageToken ? { pageId: s.meta.pageId, pageName: s.meta.pageName, pageToken: s.meta.pageToken, igId: s.meta.igId, igUsername: s.meta.igUsername } : null,
    threads: s.threads?.token ? { token: s.threads.token, userId: s.threads.userId, username: s.threads.username, expiresAt: s.threads.expiresAt || null } : null,
    f1tv,
    f1tvOff: !c.f1tvToken,   // F1 TV déconnecté dans l'appli (et pas seulement expiré, appli fermée)
  };
}
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function post(path, body, key, fetchFn = fetch) {
  const res = await fetchFn(`${STUDIO_URL}/studio/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Studio-Key': key } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Erreur ${res.status}`); e.status = res.status; throw e; }
  return j;
}

export function studioInfo() {
  const st = getConfig().studio;
  return { enabled: !!st?.key, url: `${STUDIO_URL}/studio/`, at: st?.at || null, error: st?.error || null, f1tv: !!studioVault().f1tv };
}

export async function enableStudio(code, { fetchFn } = {}) {
  if (!checkCode(code)) throw new Error('Code incorrect');
  const key = studioKey(code);
  const vault = studioVault();
  await post('init', { code: String(code).trim(), key, vault }, null, fetchFn);
  saveConfig({ studio: { key, at: Date.now(), hash: digest(vault), error: null } });
  return studioInfo();
}

export async function disableStudio({ fetchFn } = {}) {
  const st = getConfig().studio;
  if (st?.key) await post('forget', {}, st.key, fetchFn).catch(() => {});
  saveConfig({ studio: null });
  return studioInfo();
}

// Nouvel envoi si les jetons ont changé (connexion, prolongation Threads, renouvellement F1 TV)
export async function syncStudio({ force = false, fetchFn } = {}) {
  const st = getConfig().studio;
  if (!st?.key || !creatorEnabled()) return false;
  const vault = studioVault();
  const h = digest(vault);
  if (!force && h === st.hash) return false;
  try {
    await post('sync', { vault }, st.key, fetchFn);
    saveConfig({ studio: { ...st, at: Date.now(), hash: h, error: null } });
    return true;
  } catch (err) {
    saveConfig({ studio: { ...st, error: err.status === 401 || err.status === 409 ? 'Page à réactiver (code changé ou données effacées)' : err.message } });
    return false;
  }
}

export function startStudioSync() {
  setTimeout(() => syncStudio(), 30000).unref?.();
  setInterval(() => syncStudio(), EVERY).unref?.();
}
