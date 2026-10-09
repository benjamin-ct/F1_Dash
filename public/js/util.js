// Petits utilitaires d'affichage.
import { parseLapTime, parseUtc } from '/shared/f1.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtLap(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

export function fmtSigned(sec, digits = 3) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  return `${sec >= 0 ? '+' : '−'}${Math.abs(sec).toFixed(digits)}`;
}

export function fmtDuration(ms, withHours = true) {
  if (!Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const core = (withHours || h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (neg ? '-' : '') + core;
}

export function fmtClock(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDelay(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function lapSeconds(v) {
  return parseLapTime(v);
}

export { parseUtc };

// Couleurs officielles : plusieurs équipes ont des teintes très proches (bleus, rouges, gris).
// Palette « contrastée » : une teinte bien distincte par équipe, proche de son identité.
const VIVID_TEAMS = [
  [/racing bulls|visa|alphatauri|\brb\b/i, '#b3c2ff'], // lavande
  [/red bull/i, '#2f4fff'],                             // bleu roi
  [/ferrari/i, '#ff2a2a'],                              // rouge
  [/mclaren/i, '#ff8a00'],                              // orange
  [/mercedes/i, '#00e0c6'],                             // turquoise
  [/aston/i, '#1f9a45'],                                // vert
  [/williams/i, '#00aaff'],                             // bleu ciel
  [/alpine/i, '#ff5fc8'],                               // rose
  [/haas/i, '#ffffff'],                                 // blanc
  [/audi|sauber|kick/i, '#8f979f'],                     // gris titane
  [/cadillac/i, '#d4b04a'],                             // or
];
let vividTeams = false;
export function setVividTeams(v) { vividTeams = !!v; }

export function teamColor(driver) {
  if (vividTeams && driver?.TeamName) {
    const hit = VIVID_TEAMS.find(([re]) => re.test(driver.TeamName));
    if (hit) return hit[1];
  }
  const c = driver?.TeamColour;
  return c ? `#${c.replace('#', '')}` : '#8b95a8';
}

// Logos officiels (version blanche) des écuries, servis par formula1.com
const TEAM_LOGOS = [
  [/racing bulls|visa|alphatauri|\brb\b/i, '2026/racingbulls/2026racingbulls'],
  [/red bull/i, '2026/redbullracing/2026redbullracing'],
  [/ferrari/i, '2026/ferrari/2026ferrari'],
  [/mclaren/i, '2026/mclaren/2026mclaren'],
  [/mercedes/i, '2026/mercedes/2026mercedes'],
  [/aston/i, '2026/astonmartin/2026astonmartin'],
  [/williams/i, '2026/williams/2026williams'],
  [/alpine/i, '2026/alpine/2026alpine'],
  [/haas/i, '2026/haasf1team/2026haasf1team'],
  [/sauber|kick/i, '2025/kicksauber/2025kicksauber'],
  [/audi/i, '2026/audi/2026audi'],
  [/cadillac/i, '2026/cadillac/2026cadillac'],
];
let teamLogos = true;
export function setTeamLogos(v) { teamLogos = !!v; }
let logoColor = true;
export function setLogoColor(v) { logoColor = !!v; }

// Logo en couleurs officielles (sur pastille claire : certains sont noirs) ou version blanche
export function teamLogo(teamName, color = logoColor) {
  const hit = teamName && TEAM_LOGOS.find(([re]) => re.test(teamName));
  return hit ? `https://media.formula1.com/image/upload/c_fit,h_64/q_auto/v1740000000/common/f1/${hit[1]}logo${color ? '' : 'white'}.webp` : null;
}

// Repère d'écurie d'un pilote : logo officiel (réglage « logos »), sinon barre de couleur.
// Logo en couleurs : pastille claire liserée de la couleur d'équipe ; logo blanc : sur la couleur d'équipe.
export function teamMark(driver) {
  const col = teamColor(driver);
  const logo = teamLogos ? teamLogo(driver?.TeamName) : null;
  if (!logo) return `<span class="drv-bar" style="background:${col}"></span>`;
  return `<span class="team-logo${logoColor ? ' color' : ''}" style="--tc:${col};background-image:url('${logo}')" title="${esc(driver?.TeamName || '')}"></span>`;
}

export const COMPOUNDS = {
  SOFT: { letter: 'S', color: '#ff3b3b', name: 'Tendre' },
  MEDIUM: { letter: 'M', color: '#ffd12e', name: 'Medium' },
  HARD: { letter: 'H', color: '#f2f2ee', name: 'Dur' },
  INTERMEDIATE: { letter: 'I', color: '#43b02a', name: 'Intermédiaire' },
  WET: { letter: 'W', color: '#2f8cff', name: 'Pluie' },
};

export function compoundInfo(c) {
  return COMPOUNDS[c] || { letter: '?', color: '#7a8396', name: c ? c.toLowerCase() : 'Inconnu' };
}

export function tyreBadge(compound, age, isNew) {
  const ci = compoundInfo(compound);
  return `<span class="tyre" style="--tc:${ci.color}" title="${esc(ci.name)}${isNew === false || isNew === 'false' ? ' (occasion)' : ''}">${ci.letter}</span>` +
    (age !== undefined && age !== null ? `<span class="tyre-age">${age}</span>` : '');
}

// Liste des stints (tableau ou objet indexé).
export function stintsOf(appLine) {
  const s = appLine?.Stints;
  if (!s) return [];
  return (Array.isArray(s) ? s : Object.keys(s).sort((a, b) => a - b).map((k) => s[k])).filter(Boolean);
}

export function currentStint(appLine) {
  const st = stintsOf(appLine);
  return st.length ? st[st.length - 1] : null;
}

export function drivers(state) {
  const dl = state.DriverList || {};
  const out = {};
  for (const [k, v] of Object.entries(dl)) if (v && typeof v === 'object' && (v.Tla || v.RacingNumber)) out[k] = v;
  return out;
}

export function sessionKind(state) {
  const info = state.SessionInfo || {};
  if (info.Type === 'Race') return 'race';
  if (info.Type === 'Qualifying' || /qualif|shootout/i.test(info.Name || '')) return 'quali';
  return 'practice';
}

// Classement : ordre d'affichage officiel (Line), à défaut Position.
export function orderedNumbers(state) {
  const lines = state.TimingData?.Lines || {};
  const dl = drivers(state);
  const nums = new Set([...Object.keys(lines), ...Object.keys(dl)]);
  const rank = (n) => Number(lines[n]?.Line ?? lines[n]?.Position ?? dl[n]?.Line ?? 999);
  return [...nums].filter((n) => lines[n] || dl[n]).sort((a, b) => rank(a) - rank(b));
}

export function throttle(fn, ms) {
  let last = 0, timer = null;
  return (...args) => {
    const now = performance.now();
    const run = () => { last = performance.now(); timer = null; fn(...args); };
    if (now - last >= ms) run();
    else if (!timer) timer = setTimeout(run, ms - (now - last));
  };
}

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
