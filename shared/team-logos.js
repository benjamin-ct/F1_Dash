// Logos officiels des écuries (formula1.com) : appli (couleur ou blanc) et posts (blanc, grand format)
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
const url = (path, white, h) => `https://media.formula1.com/image/upload/c_fit,h_${h}/q_auto/v1740000000/common/f1/${path}logo${white ? 'white' : ''}.webp`;

// Chemin du logo d'une écurie (d'après son nom), null si inconnue
export const teamLogoPath = (name) => (name && TEAM_LOGOS.find(([re]) => re.test(name))?.[1]) || null;

export function teamLogoUrl(name, { white = false, h = 64 } = {}) {
  const p = teamLogoPath(name);
  return p ? url(p, white, h) : null;
}

// Posts : tous les logos blancs chargés une fois (load : adresse -> image), par chemin de logo
export async function loadTeamLogos(load) {
  const out = {};
  await Promise.all(TEAM_LOGOS.map(async ([, p]) => { out[p] = await load(url(p, true, 128)).catch(() => null); }));
  return out;
}
