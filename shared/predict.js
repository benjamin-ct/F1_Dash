// Pronostics entre amis : avant chaque Grand Prix, chacun prédit la pole et le podium. Points :
// pole exacte 3 ; chaque pilote du podium à la bonne place 3, sur le podium mais à une autre
// place 1 ; podium exact dans l'ordre +2. Les pronostics ferment au début des qualifications
// (pole) et au départ de la course (podium).

export const POINTS = { pole: 3, exact: 3, podium: 1, perfect: 2 };

// Heures de fermeture d'une manche : { pole, podium } (ms)
export function locksOf(race) {
  const t = (label) => Date.parse(race?.sessions?.find((s) => s.label === label)?.t || '') || null;
  const podium = t('Course') ?? (Date.parse(race?.date || '') || null);
  return { pole: t('Qualifications') ?? podium, podium };
}

// Points d'un pronostic { pole, p1, p2, p3 } (trigrammes) d'après les résultats officiels
// result : { pole: 'VER', podium: ['VER', 'NOR', 'LEC'] } ; détail pour l'affichage
export function scorePick(pick, result) {
  const out = { total: 0, pole: 0, podium: [0, 0, 0], perfect: 0 };
  if (!pick || !result) return out;
  if (result.pole && pick.pole && pick.pole === result.pole) out.pole = POINTS.pole;
  const podium = result.podium || [];
  if (podium.length === 3) {
    const mine = [pick.p1, pick.p2, pick.p3];
    mine.forEach((d, i) => {
      if (!d) return;
      if (podium[i] === d) out.podium[i] = POINTS.exact;
      else if (podium.includes(d)) out.podium[i] = POINTS.podium;
    });
    if (mine.every((d, i) => d && d === podium[i])) out.perfect = POINTS.perfect;
  }
  out.total = out.pole + out.podium.reduce((a, b) => a + b, 0) + out.perfect;
  return out;
}

// Résultat officiel d'une manche (données de la saison) : pole et podium, ou null si pas encore couru
export function resultOf(race) {
  const pole = (race?.quali || []).find((q) => q.pos === 1)?.code || null;
  const podium = [1, 2, 3].map((p) => (race?.results || []).find((r) => r.pos === p)?.code).filter(Boolean);
  return pole || podium.length === 3 ? { pole, podium: podium.length === 3 ? podium : [] } : null;
}

// Nom de joueur : 1 à 24 caractères lisibles ; clé insensible à la casse
export function playerKey(name) {
  const n = String(name || '').normalize('NFC').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 24);
  return n ? n.toLowerCase() : null;
}

// Classement de la saison : [{ name, total, rounds: { round: points } }], du meilleur au moins bon
export function leaderboard(store, races) {
  const byRound = new Map((races || []).map((r) => [r.round, resultOf(r)]));
  const players = new Map();
  for (const [round, picks] of Object.entries(store?.rounds || {})) {
    const res = byRound.get(Number(round));
    for (const [key, pick] of Object.entries(picks || {})) {
      const p = players.get(key) || { name: pick.name || key, total: 0, rounds: {} };
      const pts = res ? scorePick(pick, res).total : null;
      p.rounds[round] = pts;
      p.total += pts || 0;
      players.set(key, p);
    }
  }
  return [...players.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
