// Jeux de pneus d'un pilote sur tout le week-end, reconstitués à partir des relais de chaque
// séance (TyreStintSeries / TimingAppData : composé, neuf ou non, tours au montage et à la fin,
// pneus non changés à l'arrêt). Un jeu déjà utilisé qui revient est reconnu à son nombre de tours.

export const DRY = ['SOFT', 'MEDIUM', 'HARD'];
export const WET = ['INTERMEDIATE', 'WET'];

// Allocation réglementaire de pneus pour piste sèche (par pilote) : 13 jeux, 12 en week-end sprint.
// Un jeu de tendres en plus pour les pilotes qualifiés en Q3.
export function dryAllocation(sprint) {
  return sprint ? { HARD: 2, MEDIUM: 4, SOFT: 6 } : { HARD: 2, MEDIUM: 3, SOFT: 8 };
}

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

// Composés de la table intégrée pour un Grand Prix { name, location, circuit, country }, ou null
export function builtinNomination(year, m) {
  const key = `${m.name || ''} ${m.location || ''} ${m.circuit || ''} ${m.country || ''}`;
  const row = (NOMINATIONS[year] || []).find((r) => r.re.test(key));
  return row ? { hard: row.c[0], medium: row.c[1], soft: row.c[2], url: row.src } : null;
}

const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

// Relais d'un pilote : tableau ou objet indexé ({ "0": {...}, "1": {...} }) selon la source
export function stintList(stints) {
  if (!stints) return [];
  const arr = Array.isArray(stints) ? stints : Object.keys(stints).sort((a, b) => a - b).map((k) => stints[k]);
  return arr.filter((s) => s && s.Compound && s.Compound !== 'UNKNOWN' && !/TEST/.test(s.Compound));
}

// sessions : [{ name, stints: { num: [relais…] } }] dans l'ordre du week-end.
// Renvoie { num: [{ compound, laps, fresh, sessions: [noms] }] }.
export function buildSets(sessions) {
  const out = {};
  for (const ses of sessions) {
    for (const [num, raw] of Object.entries(ses.stints || {})) {
      const sets = (out[num] ||= []);
      let cur = null;
      for (const s of stintList(raw)) {
        const total = Number(s.TotalLaps) || 0;
        const start = Number(s.StartLaps) || 0;
        // Arrêt sans changement de pneus : même jeu
        if (cur && truthy(s.TyresNotChanged) && cur.compound === s.Compound) {
          cur.laps = Math.max(cur.laps, total);
          continue;
        }
        let set = null;
        if (!truthy(s.New) && start > 0) {
          // Jeu déjà utilisé : celui du même composé qui avait exactement ce nombre de tours
          // (à défaut le plus proche, à un tour près)
          const cands = sets.filter((x) => x.compound === s.Compound && x !== cur);
          set = cands.find((x) => x.laps === start)
            || cands.filter((x) => Math.abs(x.laps - start) <= 1).sort((a, b) => Math.abs(a.laps - start) - Math.abs(b.laps - start))[0]
            || null;
        }
        if (!set) {
          set = { compound: s.Compound, laps: 0, fresh: truthy(s.New) || start === 0, sessions: [] };
          sets.push(set);
        }
        set.laps = Math.max(set.laps, total);
        if (!set.sessions.includes(ses.name)) set.sessions.push(ses.name);
        cur = set;
      }
    }
  }
  return out;
}

// Bilan par composé : jeux neufs encore jamais montés (d'après l'allocation) et jeux utilisés.
// extraSoft : jeu de tendres supplémentaire (pilote en Q3).
export function setSummary(sets, alloc, extraSoft = false) {
  const res = {};
  for (const c of [...DRY, ...WET]) {
    const mine = (sets || []).filter((s) => s.compound === c);
    const freshUsed = mine.filter((s) => s.fresh).length;
    const total = c in alloc ? alloc[c] + (c === 'SOFT' && extraSoft ? 1 : 0) : null;
    res[c] = {
      allocated: total,
      newLeft: total === null ? null : Math.max(0, total - freshUsed),
      used: mine.filter((s) => s.laps > 0).map((s) => s.laps).sort((a, b) => a - b),
    };
  }
  return res;
}
