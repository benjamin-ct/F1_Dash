// Documents officiels de la FIA (convocations, décisions des commissaires…) d'un Grand Prix,
// lus sur la page publique fia.com/documents, avec cache mémoire.
import { getText } from './net.js';

const BASE = 'https://www.fia.com';
const CHAMPIONSHIP = '/documents/championships/fia-formula-one-world-championship-14';
const TIMEOUT = 60000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  }).replace(/\s+/g, ' ').trim();
}

// Les dates de publication sont à l'heure de Paris ("26.09.26 17:40").
function parisOffset(ms) {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(tz);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000 : 0;
}

export function parsePublished(s) {
  const m = /(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const wall = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return wall - parisOffset(wall - parisOffset(wall));
}

export function parseDocumentList(html) {
  // Une ligne par document ; le lien peut être directement dans la ligne ou dans un bloc
  // intermédiaire (mise en page fia.com de 2026), le titre dans des blocs imbriqués.
  const docs = [];
  for (const chunk of html.split(/<li class="document-row/).slice(1)) {
    const href = /<a href="([^"]+)"/.exec(chunk);
    const t0 = chunk.indexOf('<div class="title">');
    const date = /date-display-single">([^<]*)</.exec(chunk);
    if (!href || t0 < 0) continue;
    const t1 = chunk.indexOf('class="published"', t0);
    const title = decode(chunk.slice(t0 + 19, t1 > 0 ? t1 : undefined).replace(/<[^>]*>?/g, ' '));
    docs.push({ title, url: new URL(decode(href[1]), BASE).toString(), published: parsePublished(date?.[1]) });
  }
  return docs;
}

function options(html, re) {
  return [...html.matchAll(re)].map((m) => ({ path: decode(m[1]), label: decode(m[2]) }));
}

let seasonCache = null;

async function seasons() {
  if (seasonCache && Date.now() - seasonCache.at < 12 * 3600e3) return seasonCache;
  const html = await getText(BASE + CHAMPIONSHIP, { timeout: TIMEOUT });
  const bySeason = {};
  for (const o of options(html, /<option value="([^"]*\/season\/season-(\d{4})-\d+)"/g)) bySeason[o.label] = o.path;
  const events = options(html, /<option value="([^"]*\/event\/[^"]+)">([^<]+)</g).map((o) => o.label);
  seasonCache = { at: Date.now(), bySeason, events };
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

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['grand', 'prix', 'of', 'the', 'formula', '1', 'gp']);

// Nom de l'épreuve côté FIA (« Italian Grand Prix », « Grand Prix of Japan »…).
export function pickEvent(events, { name, country, location }) {
  const exact = events.find((e) => norm(e) === norm(name));
  if (exact) return exact;
  const words = new Set([name, country, location].flatMap((s) => norm(s).split(' ')).filter((w) => w && !STOP.has(w)));
  let best = null, bestScore = 0;
  for (const e of events) {
    const score = norm(e).split(' ').filter((w) => words.has(w) || [...words].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
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
