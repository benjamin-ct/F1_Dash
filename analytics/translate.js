// Traduction partagée (Workers AI) : chaque texte n'est traduit qu'une fois pour tous les utilisateurs
// de Paddock Live, puis gardé dans la base. Plafond quotidien contre les abus ; au-delà, l'appli
// traduit sur l'ordinateur comme avant.
export const MODEL = '@cf/meta/m2m100-1.2b';
export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
export const MAX_ITEMS = 40;
export const MAX_TEXT = 2000;
const MAX_TOTAL = 24000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function keyOf(from, to, text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${from}|${to}|${text}`)));
}

// Corps reçu -> { to, items: [{ text, from }] }, ou null s'il est invalide
export function cleanRequest(body) {
  if (!body || typeof body !== 'object' || !LANGS.includes(body.to) || !Array.isArray(body.items)) return null;
  const items = body.items.slice(0, MAX_ITEMS).map((it) => ({
    text: typeof it?.text === 'string' ? it.text.trim().slice(0, MAX_TEXT) : '',
    from: LANGS.includes(it?.from) ? it.from : 'en',
  }));
  if (!items.length || items.some((it) => !it.text) || items.reduce((a, it) => a + it.text.length, 0) > MAX_TOTAL) return null;
  return { to: body.to, items };
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}

export async function translateBatch(env, req, day = new Date().toISOString().slice(0, 10)) {
  const keys = await Promise.all(req.items.map((it) => keyOf(it.from, req.to, it.text)));
  const out = req.items.map((it) => (it.from === req.to ? it.text : null));
  // Déjà traduits (par n'importe quel utilisateur)
  const want = [...new Set(keys.filter((k, i) => out[i] === null))];
  if (want.length) {
    const rows = (await env.DB.prepare(`SELECT k, out FROM translations WHERE k IN (${want.map(() => '?').join(',')})`).bind(...want).all()).results || [];
    const found = new Map(rows.map((r) => [r.k, r.out]));
    keys.forEach((k, i) => { if (out[i] === null && found.has(k)) out[i] = found.get(k); });
  }
  const todo = [...new Set(keys.filter((k, i) => out[i] === null))].map((k) => ({ k, it: req.items[keys.indexOf(k)] }));
  if (!todo.length) return { out, cached: true };
  // Plafond du jour
  const limit = Number(env.AI_DAILY_LIMIT) || 20000;
  const used = (await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ?1').bind(day).first())?.n || 0;
  if (used + todo.length > limit) return { out, limited: true };
  await env.DB.prepare('INSERT INTO ai_usage (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + excluded.n').bind(day, todo.length).run();
  const done = await mapLimit(todo, 6, async ({ it }) => {
    try {
      const r = await env.AI.run(MODEL, { text: it.text, source_lang: it.from, target_lang: req.to });
      const t = String(r?.translated_text || '').trim();
      return t || null;
    } catch { return null; }
  });
  const now = Date.now();
  const store = [];
  todo.forEach(({ k }, j) => {
    if (!done[j]) return;
    keys.forEach((kk, i) => { if (kk === k && out[i] === null) out[i] = done[j]; });
    store.push(env.DB.prepare('INSERT OR REPLACE INTO translations (k, out, at) VALUES (?1, ?2, ?3)').bind(k, done[j], now));
  });
  if (store.length) await env.DB.batch(store);
  return { out };
}
