// Traduction par le serveur Paddock Live (Workers AI) : actualités, radios, documents FIA. Chaque
// texte n'y est traduit qu'une fois pour tout le monde, l'ordinateur n'a plus rien à calculer.
// Les demandes de l'interface sont regroupées (jusqu'à 40 par envoi). Serveur injoignable ou plafond
// du jour atteint : pause de 10 minutes, l'interface traduit alors sur l'ordinateur comme avant.
import { request } from './net.js';

export const TRANSLATE_URL = process.env.PADDOCK_TRANSLATE_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/t';
export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
const BATCH = 40;
const WAIT_MS = 120;
const PAUSE_MS = 10 * 60e3;

async function postJSON(url, body) {
  const data = JSON.stringify(body);
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, body: data, timeout: 30000 });
  let json = null;
  try { json = JSON.parse(r.body.toString('utf8')); } catch { /* réponse illisible */ }
  return { status: r.status, json };
}

export function createCloudTranslator({ url = TRANSLATE_URL, post = postJSON, now = Date.now } = {}) {
  const pending = new Map();   // to -> [{ text, from, resolve }]
  const timers = new Map();
  const memo = new Map();      // `${from}|${to}|${text}` -> traduction (mémoire de la session)
  let pausedUntil = 0;

  const available = () => !!url && now() >= pausedUntil;

  async function flush(to) {
    clearTimeout(timers.get(to));
    timers.delete(to);
    const list = pending.get(to) || [];
    pending.delete(to);
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      let out = [];
      try {
        const r = await post(url, { to, items: part.map(({ text, from }) => ({ text, from })) });
        if (r.status === 429 || r.status >= 500 || !Array.isArray(r.json?.out)) pausedUntil = now() + PAUSE_MS;
        out = Array.isArray(r.json?.out) ? r.json.out : [];
      } catch {
        pausedUntil = now() + PAUSE_MS;
      }
      part.forEach((p, j) => {
        const t = typeof out[j] === 'string' && out[j].trim() ? out[j] : null;
        if (t) memo.set(`${p.from}|${to}|${p.text}`, t);
        p.resolve(t);
      });
    }
  }

  return {
    available,
    // Traduction d'un texte, ou null (serveur indisponible, langue non prise en charge…)
    translate(text, from, to) {
      text = String(text || '').trim();
      if (!text || !LANGS.includes(to)) return Promise.resolve(null);
      if (!LANGS.includes(from)) from = 'en';
      if (from === to) return Promise.resolve(text);
      const m = memo.get(`${from}|${to}|${text}`);
      if (m) return Promise.resolve(m);
      if (!available()) return Promise.resolve(null);
      return new Promise((resolve) => {
        const list = pending.get(to) || [];
        list.push({ text: text.slice(0, 2000), from, resolve });
        pending.set(to, list);
        if (list.length >= BATCH) flush(to);
        else if (!timers.has(to)) timers.set(to, setTimeout(() => flush(to), WAIT_MS));
      });
    },
  };
}

export const cloud = createCloudTranslator();
