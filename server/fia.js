// Documents officiels de la FIA (convocations, décisions des commissaires…) d'un Grand Prix,
// lus sur la page publique fia.com/documents, avec cache mémoire.
import { getText } from './net.js';
import { BASE, CHAMPIONSHIP, parseDocumentList, parseSeasons, options, pickEvent } from '../shared/fia-list.js';

export { parseDocumentList, parsePublished, pickEvent } from '../shared/fia-list.js';

const TIMEOUT = 60000;

let seasonCache = null;

async function seasons() {
  if (seasonCache && Date.now() - seasonCache.at < 12 * 3600e3) return seasonCache;
  seasonCache = { at: Date.now(), ...parseSeasons(await getText(BASE + CHAMPIONSHIP, { timeout: TIMEOUT })) };
  return seasonCache;
}

// Épreuves d'une saison (pages de documents) : [{ name, page }]
export async function seasonEvents(year) {
  const s = await seasons();
  const season = s.bySeason[year];
  if (!season) return [];
  const html = await getText(BASE + season, { timeout: TIMEOUT });
  const seen = new Set();
  return options(html, /<option value="([^"]*\/season\/season-\d{4}-\d+\/event\/[^"]+)">([^<]+)</g)
    .filter((o) => !seen.has(o.path) && seen.add(o.path))
    .map((o) => ({ name: o.label, page: BASE + o.path }));
}

export async function eventDocuments(page) {
  return parseDocumentList(await getText(page, { timeout: TIMEOUT }));
}

const cache = new Map();

export async function fiaDocuments(year, meeting) {
  const key = `${year}|${meeting.name}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.job;
  const job = (async () => {
    const s = await seasons();
    const season = s.bySeason[year];
    if (!season) return { event: null, page: null, docs: [] };
    const event = pickEvent(s.events, meeting);
    if (!event) return { event: null, page: BASE + season, docs: [] };
    const page = `${BASE}${season}/event/${encodeURIComponent(event)}`;
    const docs = parseDocumentList(await getText(page, { timeout: TIMEOUT }));
    return { event, page, docs };
  })();
  cache.set(key, { job, expires: Date.now() + 90e3 });
  try {
    const res = await job;
    // Épreuve terminée depuis plusieurs jours : la liste ne bouge plus.
    const last = Math.max(0, ...res.docs.map((d) => d.published || 0));
    const settled = last && Date.now() - last > 4 * 86400e3;
    cache.set(key, { job, expires: Date.now() + (settled ? 12 * 3600e3 : 90e3) });
    return res;
  } catch (err) {
    if (hit) { cache.set(key, hit); return hit.job; }
    cache.delete(key);
    throw err;
  }
}
