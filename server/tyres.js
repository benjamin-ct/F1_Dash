// Pneus du week-end : relais des séances précédentes du Grand Prix (archives F1), choix de
// composés de Pirelli et communiqués Pirelli (flux RSS de press.pirelli.com).
import fs from 'node:fs';
import path from 'node:path';
import { getText, getJSON, HttpError, withRetry } from './net.js';
import { seasonIndex } from './replay.js';
import { CACHE_DIR } from './circuits.js';
import { dryAllocation } from '../shared/tyres.js';

const STATIC = 'https://livetiming.formula1.com/static/';
const FEED = 'https://press.pirelli.com/feed/';

// Composés choisis par Pirelli (dur, medium, tendre) pour 2026, d'après les communiqués de
// Pirelli et les fiches « What tyres… » de formula1.com. Les Grands Prix suivants sont
// complétés automatiquement à partir du flux de Pirelli.
const PIRELLI_PRESS = 'https://press.pirelli.com/';
const F1_TYRES = 'https://www.formula1.com/en/latest/article/';
export const NOMINATIONS = {
  2026: [
    { re: /melbourne|australia/i, c: [3, 4, 5], src: `${PIRELLI_PRESS}complete-f1-tyre-range-for-the-first-three-grands-prix-of-2026/` },
    { re: /shanghai|chin/i, c: [2, 3, 4], src: `${PIRELLI_PRESS}complete-f1-tyre-range-for-the-first-three-grands-prix-of-2026/` },
    { re: /suzuka|japan/i, c: [1, 2, 3], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-japanese-grand-prix.4V0p1BrC3PbEiWNzsivaSr` },
    { re: /miami/i, c: [3, 4, 5], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-miami-grand-prix.3IDiDRC753kNe02Qwia4V1` },
    { re: /montr[ée]al|canad/i, c: [3, 4, 5], src: 'https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-canadian-gp' },
    { re: /monaco|monte carlo/i, c: [3, 4, 5], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-monaco-grand-prix.6RNlF5Skp9niWsEz6urQMr` },
    { re: /barcelona|catalunya/i, c: [2, 3, 4], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-barcelona-catalunya-grand-prix.2wVnaPZmlQUuj9P72FrjuA` },
    { re: /spielberg|austria/i, c: [3, 4, 5], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-austrian-grand-prix.2bhUStvp9xxGLpN2gvTeib` },
    { re: /silverstone|british/i, c: [1, 2, 3], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-british-grand-prix.3qD9d5o8X4x3se0F7Zg5i1` },
    { re: /spa-francorchamps|belgi/i, c: [2, 3, 4], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-belgian-grand-prix.5RaQVyMqM9Fl5ON3xTcVO0` },
    { re: /budapest|hungar/i, c: [3, 4, 5], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-hungarian-grand-prix.RikSxOCPXMkPloK0RRmqQ` },
    { re: /zandvoort|dutch|netherlands/i, c: [2, 3, 4], src: `${PIRELLI_PRESS}tyre-compounds-selected-for-zandvoort-monza-and-madrid/` },
    { re: /monza|italian/i, c: [3, 4, 5], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-italian-grand-prix.7nOpWdCgvCBFDGlnODs0gk` },
    { re: /madrid|madring|spanish/i, c: [2, 3, 4], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-spanish-grand-prix.2vlcVOBnZUFRCooVcqWG7n` },
    { re: /baku|azerbaijan/i, c: [3, 4, 5], src: `${PIRELLI_PRESS}appointment-on-saturday-for-the-azerbaijan-grand-prix/` },
    { re: /kuala lumpur|sepang|malaysia/i, c: [2, 3, 4], src: `${F1_TYRES}what-tyres-will-the-teams-and-drivers-have-for-the-2026-bahrain-grand-prix-in-malaysia.4vcrMxYY9DWg7PwyiNMrEV` },
    { re: /singapore|marina bay/i, c: [3, 4, 5], src: `${PIRELLI_PRESS}spotlight-on-singapore/` },
    { re: /austin|united states grand prix/i, c: [2, 3, 4], src: `${PIRELLI_PRESS}the-compound-selection-for-austin-mexico-city-and-so-paulo/` },
    { re: /mexico/i, c: [3, 4, 5], src: `${PIRELLI_PRESS}the-compound-selection-for-austin-mexico-city-and-so-paulo/` },
    { re: /s[ãa]o paulo|interlagos|brazil/i, c: [3, 4, 5], src: `${PIRELLI_PRESS}the-compound-selection-for-austin-mexico-city-and-so-paulo/` },
  ],
};

function readCache(name) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8')); } catch { return null; }
}
function writeCache(name, data) {
  try { fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data)); } catch (err) { console.warn('[pneus]', err.message); }
}

// ---------- Flux Pirelli ----------
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;|&rsquo;|&lsquo;/g, '\'')
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…');

const tag = (xml, name) => {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return m ? m[1].trim() : '';
};

// Articles du flux : { title, url, date (ms), paras: [texte] }
export function parseFeed(xml) {
  return xml.split('<item>').slice(1).map((it) => {
    const html = tag(it, 'description');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => decode(m[1].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 1);
    return { title: decode(tag(it, 'title')), url: tag(it, 'link'), date: Date.parse(tag(it, 'pubDate')) || 0, paras };
  });
}

// Articles Formule 1 (le flux mêle MotoGP, Superbike, rallye, pneus de série…)
export function isF1Article(a) {
  const head = `${a.title} ${a.paras[0] || ''}`;
  if (/\b(moto ?gp|moto2|moto3|superbike|worldsbk|wrc|rally|cycling|bicycle)\b/i.test(head)) return false;
  if (/p zero|bespoke|cyber tyre|investment|board of directors|decree|shareholder/i.test(a.title)) return false;
  return /\bC[1-6]\b|grand prix|\bFP[123]\b|qualifying|sprint|pole/i.test(`${a.title} ${a.paras.join(' ')}`);
}

// Paragraphes sur la F1 seulement (les comptes rendus finissent souvent par la F2 / F3)
const OTHER_SERIES = /\b(formula [23]|F[23] (?:sprint|feature|championship)|feature race|sprint race was won)\b/i;
export const f1Paragraphs = (paras) => paras.filter((p) => !OTHER_SERIES.test(p));

// Phrases de préconisation (stratégie, pressions, carrossage)
export function adviceSentences(paras) {
  const out = [];
  for (const p of paras) {
    if (/last year|twelve months ago|previous edition|\bC6\b|\b(?:in|of) 20\d\d\b/i.test(p)) continue;   // rappel des années passées
    for (const s of p.split(/(?<=[.!?”"])\s+/)) {
      if (/one-stop|two-stop|three-stop|\bstrateg|recommend|minimum (?:starting )?pressure|camber|psi\b/i.test(s)) out.push(s.replace(/^[“"]|[”"]$/g, '').trim());
    }
  }
  return [...new Set(out)];
}

// Choix de composés annoncés dans un texte : [{ text, c: [dur, medium, tendre] }]
export function findNominations(text) {
  const out = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    let c = null;
    const named = /C([1-6]) as (?:the )?Hard,? (?:the )?C([1-6]) as (?:the )?Medium,? and (?:the )?C([1-6]) as (?:the )?Soft/i.exec(sentence);
    if (named) c = [+named[1], +named[2], +named[3]];
    else {
      const trio = /\b(?:the )?C([1-6]),? C([1-6]),? and (?:the )?C([1-6])\b/i.exec(sentence);
      if (trio && /select|nominat|chosen|bring|opted|will be|range/i.test(sentence)) c = [+trio[1], +trio[2], +trio[3]].sort((a, b) => a - b);
    }
    if (c && c[0] < c[1] && c[1] < c[2]) out.push({ text: sentence, c });
  }
  return out;
}

let feedCache = { at: 0, items: [] };
async function feed() {
  if (Date.now() - feedCache.at < 30 * 60 * 1000) return feedCache.items;
  try {
    const items = parseFeed(await getText(FEED, { timeout: 20000 })).filter(isF1Article);
    feedCache = { at: Date.now(), items };
    // Choix de composés repérés : gardés sur disque (le flux ne garde que les derniers articles)
    const known = readCache('pirelli-nominations.json') || [];
    let changed = false;
    for (const a of items) {
      for (const n of findNominations(a.paras.join(' '))) {
        if (known.some((k) => k.text === n.text)) continue;
        known.push({ ...n, url: a.url, date: a.date });
        changed = true;
      }
    }
    if (changed) writeCache('pirelli-nominations.json', known.slice(-200));
  } catch (err) {
    console.warn('[pirelli]', err.message);
    feedCache.at = Date.now() - 25 * 60 * 1000;   // nouvel essai dans 5 min
  }
  return feedCache.items;
}

// Mots qui désignent un Grand Prix dans les textes de Pirelli (lieu et nom ; pas le pays, qui
// peut accueillir plusieurs Grands Prix)
function meetingWords(m) {
  return [m.location, m.name?.replace(/ Grand Prix$/i, ''), m.circuit].filter(Boolean)
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
}
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function nominationFor(year, m, found = []) {
  // Table intégrée (vérifiée), sinon annonce repérée dans le flux de Pirelli : une phrase qui
  // cite ce Grand Prix, publiée dans les quatre mois qui précèdent
  const key = `${m.name} ${m.location} ${m.circuit || ''} ${m.country || ''}`;
  const row = (NOMINATIONS[year] || []).find((r) => r.re.test(key));
  if (row) return { hard: row.c[0], medium: row.c[1], soft: row.c[2], url: row.src };
  const words = meetingWords(m);
  const hit = [...found].sort((a, b) => b.date - a.date).find((n) => {
    if (n.date && m.start && (n.date > m.start + 3 * 86400000 || n.date < m.start - 120 * 86400000)) return false;
    const t = plain(n.text);
    return words.some((w) => w.length > 3 && t.includes(w));
  });
  return hit ? { hard: hit.c[0], medium: hit.c[1], soft: hit.c[2], url: hit.url } : null;
}

// Composés choisis pour chaque manche d'une saison (table intégrée et annonces déjà repérées) :
// { manche: { hard, medium, soft, url } }
export function seasonNominations(year, races) {
  const found = readCache('pirelli-nominations.json') || [];
  const out = {};
  for (const r of races) {
    const n = nominationFor(year, { name: r.name, location: r.locality, circuit: r.circuit, start: Date.parse(r.date) || 0 }, found);
    if (n) out[r.round] = n;
  }
  return out;
}

// ---------- Relais des séances précédentes ----------
async function sessionStints(ses) {
  const name = `tyres-${ses.path.replace(/[^\w]+/g, '_')}.json`;
  const cached = readCache(name);
  if (cached) return cached;
  let stints = {};
  try {
    const d = await withRetry(() => getJSON(`${STATIC}${ses.path}TyreStintSeries.json`, { timeout: 30000 }), { tries: 2 });
    stints = d?.Stints || {};
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
  }
  let q3 = [];
  if (ses.type === 'Qualifying' && !/sprint/i.test(ses.name)) {
    try {
      const td = await getJSON(`${STATIC}${ses.path}TimingData.json`, { timeout: 30000 });
      q3 = Object.entries(td?.Lines || {}).filter(([, l]) => !l.KnockedOut && Number(l.Position) >= 1 && Number(l.Position) <= 10).map(([n]) => n);
    } catch { /* pas de Q3 connue */ }
  }
  const data = { name: ses.name, type: ses.type, stints, q3 };
  // Archive définitive quelques heures après la séance : gardée sur disque
  if (Object.keys(stints).length && Date.parse(ses.start) < Date.now() - 6 * 3600 * 1000) writeCache(name, data);
  return data;
}

// Tout ce qu'il faut pour le panneau Pneus. until : instant affiché (pas d'article publié après).
// hint : { name, location, country, session } d'après SessionInfo, si la séance n'est pas
// encore dans l'index des archives (tout début de séance en direct)
export async function weekendTyres(sessionPath, until = Date.now(), hint = {}) {
  const year = Number(String(sessionPath).slice(0, 4));
  if (!year) throw new Error('Séance inconnue');
  const index = await seasonIndex(year).catch(() => []);
  let meeting = index.find((m) => m.sessions.some((s) => s.path === sessionPath));
  if (!meeting && hint.name) {
    const folder = String(sessionPath).split('/')[1];
    meeting = index.find((m) => m.sessions.some((s) => s.path.split('/')[1] === folder))
      || { name: hint.name, location: hint.location, country: hint.country, sessions: [] };
    meeting = { ...meeting, sessions: [...meeting.sessions.filter((s) => s.path !== sessionPath), { name: hint.session || '', path: sessionPath, start: new Date(until).toISOString() }] };
  }
  if (!meeting) throw new Error('Grand Prix introuvable dans les archives');
  const idx = meeting.sessions.findIndex((s) => s.path === sessionPath);
  const before = meeting.sessions.slice(0, idx).filter((s) => !/test/i.test(s.name));
  const sessions = [];
  for (const s of before) sessions.push(await sessionStints(s));
  const sprint = meeting.sessions.some((s) => /sprint/i.test(s.name)) || /sprint/i.test(hint.session || '');
  const start = Date.parse(meeting.sessions[0]?.start) || 0;
  const m = { name: meeting.name, location: meeting.location, country: meeting.country, start };

  const items = await feed();
  const found = readCache('pirelli-nominations.json') || [];
  const words = meetingWords(m);
  const raceEnd = (Date.parse(meeting.sessions[meeting.sessions.length - 1]?.start) || start) + 86400000;
  const articles = items
    .filter((a) => a.date <= until && a.date >= start - 12 * 86400000 && a.date <= raceEnd)
    .filter((a) => { const t = plain(`${a.title} ${a.paras.join(' ')}`); return words.some((w) => w.length > 3 && t.includes(w)); })
    .sort((a, b) => b.date - a.date)
    .slice(0, 6)
    .map((a) => { const paras = f1Paragraphs(a.paras); return { ...a, paras, advice: adviceSentences(paras) }; });

  return {
    meeting: { name: meeting.name, location: meeting.location, country: meeting.country, sprint },
    current: meeting.sessions[idx]?.name,
    sessions,
    allocation: dryAllocation(sprint),
    nominations: nominationFor(year, m, found),
    articles,
  };
}
