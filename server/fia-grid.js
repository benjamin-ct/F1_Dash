// Grille de départ officielle de la FIA (course ou sprint) d'un Grand Prix, lue dans le PDF des
// commissaires, gardée en mémoire tant que le document ne change pas.
import { request } from './net.js';
import { fiaDocuments } from './fia.js';
import { pdfPages } from './fia-tech.js';
import { gridDocument, parseStartingGrid } from '../shared/fia-grid.js';

const parsed = new Map();

// null si la FIA n'a pas encore publié la grille
export async function officialGrid(year, meeting, { sprint = false } = {}) {
  const { docs } = await fiaDocuments(year, meeting);
  const doc = gridDocument(docs, { sprint });
  if (!doc) return null;
  const key = `${doc.url}|${doc.published}`;
  if (!parsed.has(key)) {
    parsed.set(key, (async () => {
      const r = await request(doc.url, { timeout: 60000 });
      if (r.status !== 200) throw new Error(`grille FIA : HTTP ${r.status}`);
      const grid = parseStartingGrid(await pdfPages(r.body));
      return grid && { ...grid, title: doc.title, url: doc.url, published: doc.published };
    })());
    if (parsed.size > 20) parsed.delete(parsed.keys().next().value);
  }
  try { return await parsed.get(key); } catch (err) { parsed.delete(key); throw err; }
}
