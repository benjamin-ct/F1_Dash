// Résumé détaillé d'un article en points clés, en français (Workers AI), pour les posts « news » en
// plusieurs images. Reformulé : jamais de phrase recopiée de l'article (contrôle de passages
// identiques), seulement les faits de l'article. Chaque article n'est résumé qu'une fois (base),
// et compte dans le plafond quotidien partagé avec la traduction.
import { MODEL } from './translate.js';
import { badScript } from '../shared/translation-check.js';

const TAG = 'sum1';          // dans la clé du cache : changer les consignes = nouveaux résumés
export const MAX_INPUT = 12000;
const COST = 5;              // un résumé pèse comme 5 traductions dans le plafond du jour
const COPY_RUN = 9;          // 9 mots identiques à la suite = phrase recopiée

const SYSTEM = `You write news summaries in French for the social media account of a Formula 1 fan site.
From the article given by the user, write between 3 and 5 key points in French.
Rules:
- Each point is one complete sentence of 12 to 30 words, easy to read on a phone.
- Rephrase everything in your own words: never copy a sentence from the article, no quotations.
- Only facts stated in the article: nothing invented, no opinion, no prediction.
- Keep names of drivers, teams, people, circuits and sponsors exactly as written.
- Most important point first. Do not repeat the title word for word.
- Write French accents correctly. Do not number the points.
- Answer ONLY with a JSON array of strings.`;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function keyOf(title, text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${TAG}|${MODEL}|${title}|${text}`)));
}

// Corps reçu -> { title, text }, ou null s'il est invalide
export function cleanSummaryRequest(body) {
  if (!body || typeof body !== 'object') return null;
  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const text = typeof body.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_INPUT) : '';
  if (!title || text.length < 200) return null;
  return { title, text };
}

const words = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
// Passage de l'article repris mot pour mot dans un point (article en français surtout). text : texte
// de l'article, ou ses suites de mots déjà calculées (copyRuns)
export function copyRuns(text) {
  const src = words(text);
  const runs = new Set();
  for (let i = 0; i + COPY_RUN <= src.length; i++) runs.add(src.slice(i, i + COPY_RUN).join(' '));
  return runs;
}
export function copiedFrom(point, text) {
  const runs = text instanceof Set ? text : copyRuns(text);
  const w = words(point);
  for (let i = 0; i + COPY_RUN <= w.length; i++) if (runs.has(w.slice(i, i + COPY_RUN).join(' '))) return true;
  return false;
}

// Réponse du modèle -> points retenus (2 au moins), ou null
export function parsePoints(reply, text = '') {
  const t = String(reply || '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let list;
  try { list = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(list)) return null;
  const runs = copyRuns(text);
  const out = list.filter((x) => typeof x === 'string').map((x) => x.replace(/^\s*(?:[-–—•*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 20 && x.length <= 320 && !badScript(x, 'fr') && !copiedFrom(x, runs)).slice(0, 5);
  return out.length >= 2 ? out : null;
}

export async function summarizeArticle(env, req, day = new Date().toISOString().slice(0, 10)) {
  const k = await keyOf(req.title, req.text);
  const hit = await env.DB.prepare('SELECT out FROM translations WHERE k = ?1').bind(k).first();
  if (hit?.out) { try { return { points: JSON.parse(hit.out), cached: true }; } catch { /* entrée abîmée : refaite */ } }
  const limit = Number(env.AI_DAILY_LIMIT) || 20000;
  const used = (await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ?1').bind(day).first())?.n || 0;
  if (used + COST > limit) return { limited: true };
  await env.DB.prepare('INSERT INTO ai_usage (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + excluded.n').bind(day, COST).run();
  // Deux essais : réponse mal formée ou trop proche du texte de l'article
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply = null;
    try {
      const r = await env.AI.run(MODEL, {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Title: ${req.title}\n\nArticle:\n${req.text}` }],
        temperature: attempt ? 0.4 : 0.2,
        max_tokens: 900,
      });
      reply = r?.response ?? r?.choices?.[0]?.message?.content;
    } catch { reply = null; }
    const points = parsePoints(reply, req.text);
    if (points) {
      await env.DB.prepare('INSERT OR REPLACE INTO translations (k, out, at) VALUES (?1, ?2, ?3)').bind(k, JSON.stringify(points), Date.now()).run();
      return { points };
    }
  }
  return { points: null };
}
