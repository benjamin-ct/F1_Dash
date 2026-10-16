// Journal des publications du créateur (posts des séances et des news), partagé par l'appli et la
// page web : sert à marquer les news déjà publiées (même sujet reconnu, même repris par un autre
// média ou dans une autre langue) et aux statistiques des posts (identifiants par réseau).
import { sameStoryOf } from './social-news.js';

export const HISTORY_MAX = 200;
const NETS = ['instagram', 'facebook', 'threads', 'x', 'bluesky', 'tiktok'];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Entrée nettoyée : { key, at, kind: 'news' | 'session', title, srcTitle, link, summary, nets: { réseau: { id, url } } }
export function cleanEntry(e, now = Date.now()) {
  if (!e || typeof e !== 'object') return null;
  const nets = {};
  for (const n of NETS) {
    const r = e.nets?.[n];
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' ? r.id.slice(0, 200) : r.id && typeof r.id === 'object' ? { uri: str(r.id.uri, 300), cid: str(r.id.cid, 120) } : null;
    nets[n] = { id, url: /^https:\/\//.test(r.url || '') ? str(r.url, 500) : null };
  }
  if (!Object.keys(nets).length) return null;
  const at = Number(e.at) > 0 && Number(e.at) <= now + 60e3 ? Number(e.at) : now;
  return {
    key: str(e.key, 80) || `${at}`, at, kind: e.kind === 'news' ? 'news' : 'session',
    title: str(e.title, 200), srcTitle: str(e.srcTitle, 300), link: /^https:\/\//.test(e.link || '') ? str(e.link, 500) : '', summary: str(e.summary, 300), nets,
  };
}

// Ajout (ou complément d'une entrée existante, mêmes clé : autres réseaux publiés ensuite)
export function addEntry(list, entry) {
  const e = cleanEntry(entry);
  if (!e) return list;
  const out = (Array.isArray(list) ? list : []).filter(Boolean);
  const i = out.findIndex((x) => x.key === e.key);
  if (i >= 0) out[i] = { ...out[i], nets: { ...out[i].nets, ...e.nets } };
  else out.unshift(e);
  return out.sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX);
}

export const mergeHistory = (...lists) => lists.flat().filter(Boolean).reduce((acc, e) => addEntry(acc, e), []);

// Nouvelle déjà publiée : même lien, ou même sujet (noms propres, type) dans les 3 jours
export function postedEntry(item, history = []) {
  return history.find((e) => e.kind === 'news' && (
    (e.link && e.link === item.link)
    || (Math.abs((item.t || 0) - e.at) < 72 * 3600e3 && sameStoryOf({ title: e.srcTitle || e.title, summary: e.summary, t: item.t }, item))
  )) || null;
}
