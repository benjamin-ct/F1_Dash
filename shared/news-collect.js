// Articles d'un flux RSS mis au format des actualités (étiquettes, importance), comme dans l'appli :
// utilisé par la page web du créateur et par les alertes du serveur des statistiques.
import { parseFeed, newsTags, newsImportance } from './news.js';

// Sources générales : seulement les articles qui parlent de F1
export const F1_ONLY = /formula 1|formula one|\bf1\b|grand prix|formule 1/i;

// s : source de news-sources.js ; xml : texte du flux
export function feedItems(s, xml, now = Date.now()) {
  const out = [];
  for (const raw of parseFeed(xml).items) {
    if (s.filter === 'f1' && !F1_ONLY.test(`${raw.title} ${raw.summary}`)) continue;
    if (s.match && !new RegExp(s.match, 'i').test(`${raw.title} ${raw.summary}`)) continue;
    const t = raw.t && raw.t <= now + 10 * 60e3 ? raw.t : now - 24 * 3600e3;
    const it = { id: `${s.id}|${raw.link || raw.guid}`, src: s.id, srcName: s.name, title: String(raw.title || '').slice(0, 300), summary: raw.summary || '', link: raw.link, t, lang: s.lang, cat: s.cat, kind: 'article' };
    it.tags = newsTags(`${it.title} ${it.summary}`);
    it.imp = newsImportance(it, s.cat);
    out.push(it);
  }
  return out;
}

// Texte d'une réponse dans son encodage (certains flux ne sont pas en UTF-8)
export async function decodeBody(res) {
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 200));
  const label = ((res.headers.get('Content-Type') || '').match(/charset=([\w-]+)/i)?.[1] || head.match(/encoding=["']([\w-]+)["']/i)?.[1] || 'utf-8').toLowerCase();
  try { return new TextDecoder(label).decode(buf); } catch { return new TextDecoder().decode(buf); }
}
