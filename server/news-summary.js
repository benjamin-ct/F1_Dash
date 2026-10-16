// Résumé détaillé d'un article (posts « news » en plusieurs images) : texte de l'article lu par
// l'appli (mode lecture), points clés rédigés en français par le serveur Paddock Live (Workers AI).
import { request } from './net.js';
import { TRANSLATE_URL } from './cloud-translate.js';

export const SUMMARY_URL = process.env.PADDOCK_SUMMARY_URL ?? TRANSLATE_URL.replace(/\/t$/, '/s');

async function postJSON(url, body) {
  const data = JSON.stringify(body);
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, body: data, timeout: 90000 });
  let json = null;
  try { json = JSON.parse(r.body.toString('utf8')); } catch { /* réponse illisible */ }
  return { status: r.status, json };
}

// Article lu (createArticleReader) -> texte envoyé au résumé (titre, intertitres, paragraphes)
export function articleText(a) {
  return (a?.blocks || []).map((b) => b.h || b.p || '').filter(Boolean).join('\n\n').slice(0, 12000);
}

export function createNewsSummarizer({ articles, url = SUMMARY_URL, post = postJSON } = {}) {
  const memo = new Map();
  return async function summarize(link) {
    if (memo.has(link)) return memo.get(link);
    const a = await articles.get(link);
    const text = articleText(a);
    if (!a.readable || text.length < 200) {
      const e = new Error(`Article illisible ici${a.reason ? ` : ${a.reason}` : ''}`); e.status = 422; throw e;
    }
    const r = await post(url, { title: a.title || '', text });
    if (r.status === 429) { const e = new Error('Plafond du jour atteint, réessayez demain'); e.status = 429; throw e; }
    if (!Array.isArray(r.json?.points)) { const e = new Error(r.json?.error || 'Résumé indisponible pour le moment'); e.status = 502; throw e; }
    memo.set(link, r.json.points);
    if (memo.size > 100) memo.delete(memo.keys().next().value);
    return r.json.points;
  };
}
