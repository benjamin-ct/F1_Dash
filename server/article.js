// Lecture d'un article de l'Actu dans l'appli (mode lecture) : la page de l'article est lue ici,
// réduite au titre, à la photo et au texte (shared/article.js), puis affichée et traduite par
// l'interface. Seuls les liens des actualités suivies sont lus (jamais une adresse quelconque).
// Gardé en mémoire 6 heures (200 articles au plus).
import { request } from './net.js';
import { extractArticle } from '../shared/article.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const TTL = 6 * 3600e3;
const MAX_CACHE = 200;
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_TEXT = 400;   // en dessous : page non lisible ici (vidéo, accès refusé…), lien vers le site

// Encodage : en-tête HTTP, sinon <meta charset>, sinon UTF-8
function decode(buf, type = '') {
  const head = buf.subarray(0, 4096).toString('latin1');
  const label = (String(type).match(/charset=([\w-]+)/i)?.[1] || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
  try { return new TextDecoder(label).decode(buf); } catch { return buf.toString('utf8'); }
}

export function createArticleReader({ fetch = request, items = () => [], now = Date.now, retryDelay = 1200 } = {}) {
  const cache = new Map();   // adresse -> { at, data }
  const running = new Map();

  async function read(url) {
    const item = items().find((it) => it.link === url);
    if (!item) { const e = new Error('Article inconnu'); e.status = 404; throw e; }
    const base = { link: url, lang: item.lang, title: item.title, image: item.img || '', description: item.summary || '', blocks: [] };
    let r;
    // Certains sites refusent une demande sur deux (protection contre les robots) : un nouvel essai
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((ok) => setTimeout(ok, retryDelay));
      try {
        r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': `${item.lang || 'en'},en;q=0.8` }, timeout: 20000, redirects: 5 });
      } catch {
        r = null;
      }
      if (r && (r.status === 200 || r.status === 404)) break;
    }
    if (!r) return { ...base, readable: false, reason: 'site injoignable' };
    if (r.status !== 200 || !r.body?.length || r.body.length > MAX_BYTES) return { ...base, readable: false, reason: `le site refuse la lecture (${r.status})` };
    const a = extractArticle(decode(r.body, r.headers?.['content-type']), url);
    const chars = a.blocks.reduce((n, b) => n + (b.p || '').length, 0);
    return {
      ...base,
      title: item.title || a.title,
      image: a.image || base.image,
      description: a.description || base.description,
      author: a.author, site: a.site, published: a.published,
      blocks: chars >= MIN_TEXT ? a.blocks : [],
      readable: chars >= MIN_TEXT,
      ...(chars >= MIN_TEXT ? {} : { reason: 'pas de texte lisible sur cette page (vidéo, accès réservé…)' }),
    };
  }

  return {
    async get(url) {
      const hit = cache.get(url);
      // Page illisible (refus, panne) : nouvel essai 10 minutes plus tard
      if (hit && now() - hit.at < (hit.data.readable ? TTL : 10 * 60e3)) return hit.data;
      if (!running.has(url)) {
        running.set(url, read(url).then((data) => {
          cache.delete(url);
          cache.set(url, { at: now(), data });
          while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
          return data;
        }).finally(() => running.delete(url)));
      }
      return running.get(url);
    },
  };
}
