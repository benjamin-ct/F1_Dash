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
