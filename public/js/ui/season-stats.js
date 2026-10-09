// Vues détaillées de l'espace « Saison » à partir de l'analyse des archives F1 Live Timing
// (/api/season/stats) et des résultats Jolpica : statistiques par pilote, régularité,
// arrêts aux stands, vitesses de pointe et profil des circuits.
import { esc, teamColor, teamMark } from '../util.js';

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null;
};
const fr = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d).replace('.', ','));
const fmtLap = (s) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return `${m ? `${m}:` : ''}${(s - m * 60).toFixed(3).padStart(m ? 6 : 5, '0')}`.replace('.', ',');
};
const isNum = (x) => /^\d+$/.test(x?.posText || '');
const STATUS_FR = { Finished: 'Arrivé', Retired: 'Abandon', Disqualified: 'Disqualifié', 'Did not start': 'Non partant', Withdrew: 'Forfait', Accident: 'Accident', Collision: 'Accrochage', Engine: 'Moteur', Gearbox: 'Boîte de vitesses', Hydraulics: 'Hydraulique', Brakes: 'Freins', Lapped: 'À un tour ou plus' };
const statusFr = (st) => {
  const m = /^\+(\d+) Laps?$/.exec(st || '');
  return m ? `+${m[1]} tour${m[1] > 1 ? 's' : ''}` : STATUS_FR[st] || st || '';
};
const short = (name) => String(name || '').replace(/ Grand Prix$/, '');
const mark = (team, col) => teamMark({ TeamName: team, TeamColour: col?.replace('#', '') });
const tcol = (team, col) => teamColor({ TeamName: team, TeamColour: col?.replace('#', '') });

// Tours représentatifs d'un pilote dans une course : hors 1er tour, tours aux stands et sous
// neutralisation, et sans les tours anormalement lents (> 107 % de sa médiane : trafic, incident…).
export function cleanLaps(d) {
  const v = d.laps.filter((l) => !(l[2] & 7)).map((l) => l[1]);
  if (v.length < 8) return null;
  const med = median(v);
  return v.filter((t) => t <= med * 1.07 && t >= med * 0.93);
}

// Pilotes de l'archive, indexés par trigramme pour chaque manche
function byRound(stats) {
  const m = new Map();
  for (const r of stats?.races || []) m.set(r.round, { race: r, by: new Map(r.drivers.map((d) => [d.tla, d])) });
  return m;
}

function pendingNote(stats) {
  if (!stats) return '<div class="note">Chargement des statistiques détaillées…</div>';
  if (stats.error) return `<div class="note">Statistiques détaillées indisponibles (${esc(stats.error)}).</div>`;
  if (stats.pending || stats.done < stats.total) {
    return `<div class="note">${stats.pending ? '⏳ Analyse des courses de la saison' : 'Courses analysées'} : <b>${stats.done} / ${stats.total}</b>${stats.pending ? ' — la première fois, les archives officielles de chaque Grand Prix sont téléchargées et analysées (environ 2 s par course), ensuite tout est conservé sur ce PC.' : ''}</div>`;
  }
  return '';
}

// Barres horizontales [{label, html?, v, text, color}]
function hbars(rows, { max, invert = false } = {}) {
  const vals = rows.map((r) => r.v).filter((v) => v !== null);
  const hi = max ?? Math.max(...vals), lo = invert ? Math.min(...vals) : 0;
  return `<div class="sz-hbars">${rows.map((r) => {
    const w = r.v === null ? 0 : invert ? (hi === lo ? 100 : 25 + (75 * (hi - r.v)) / (hi - lo)) : (100 * r.v) / (hi || 1);
    return `<div class="sz-hbar"><div class="sz-hb-l">${r.html || esc(r.label)}</div><div class="sz-hb-t"><i style="width:${Math.max(2, w)}%;background:${r.color || 'var(--accent)'}"></i></div><div class="sz-hb-v">${r.text}</div></div>`;
  }).join('')}</div>`;
}

// Cellule de carte thermique (0 = meilleur … 1 = moins bon)
const heat = (k, txt) => (k === null ? '<td class="sz-hm muted">—</td>'
  : `<td class="sz-hm" style="background:color-mix(in srgb, ${k < 0.5 ? 'var(--green)' : 'var(--orange)'} ${Math.round(Math.abs(k - 0.5) * 2 * 55)}%, transparent)">${txt}</td>`);

// ---------------- Pilotes ----------------
export function renderDrivers(ctx, code) {
  const { data, stats } = ctx;
  const drv = data.drivers.find((d) => d.code === code) || data.drivers[0];
  if (!drv) return '<div class="note">Pas encore de résultats.</div>';
  const races = data.races.filter((r) => r.results.length);
  const R = byRound(stats);
  const rows = races.map((r) => {
    const res = r.results.find((x) => x.code === drv.code);
    const q = r.quali.find((x) => x.code === drv.code);
    const spr = r.sprintResults.find((x) => x.code === drv.code);
    const a = R.get(r.round)?.by.get(drv.code);
    return { r, res, q, spr, a };
  }).filter((x) => x.res || x.q);
  const started = rows.filter((x) => x.res);
  const fin = started.filter((x) => isNum(x.res));
  const mate = (r) => r.results.find((x) => x.teamId === drv.teamId && x.code !== drv.code);
  let qd = [0, 0];
  for (const x of rows) {
    const m = x.r.quali.find((y) => y.teamId === drv.teamId && y.code !== drv.code);
    if (x.q?.pos && m?.pos) qd[x.q.pos < m.pos ? 0 : 1]++;
  }
  const mateName = rows.map((x) => mate(x.r)).find(Boolean)?.last;
  const tops = rows.map((x) => x.a?.speeds?.ST).filter(Boolean);
  const stops = rows.flatMap((x) => x.a?.stops || []).map((s) => s.stop).filter((v) => v > 0 && v < 15);
  const sig = rows.map((x) => { const c = x.a && cleanLaps(x.a); return c ? sd(c) : null; }).filter((v) => v !== null);
  const gained = started.filter((x) => x.res.grid && isNum(x.res)).reduce((n, x) => n + (x.res.grid - x.res.pos), 0);
  const col = ctx.color(drv.team, drv.teamId);
  const card = (label, v, sub = '') => `<div class="sz-card sz-kpi"><div class="muted small">${label}</div><div class="sz-big">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
  const pts = started.reduce((n, x) => n + x.res.points, 0) + rows.reduce((n, x) => n + (x.spr?.points || 0), 0);

  // Graphique : position au départ (pointillés) et à l'arrivée, manche par manche
  const W = 900, H = 230, pl = 30, pr = 12, pt = 10, pb = 24;
  const rounds = races.map((r) => r.round);
  const X = (rd) => pl + ((rounds.indexOf(rd)) / Math.max(1, rounds.length - 1)) * (W - pl - pr);
  const Y = (p) => pt + ((p - 1) / 21) * (H - pt - pb);
  const line = (pts2, dash) => `<polyline fill="none" stroke="${col}" stroke-width="2.2" ${dash ? 'stroke-dasharray="4 4" opacity=".6"' : ''} points="${pts2.map(([x, y]) => `${x},${y}`).join(' ')}"/>`;
  const finPts = started.filter((x) => isNum(x.res)).map((x) => [X(x.r.round), Y(x.res.pos)]);
  const gridPts = started.filter((x) => x.res.grid).map((x) => [X(x.r.round), Y(x.res.grid)]);
  let grid = '';
  for (const p of [1, 5, 10, 15, 20]) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(p)}" y2="${Y(p)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(p) + 4}" class="sz-ax" text-anchor="end">${p}</text>`;
  for (const rd of rounds) grid += `<text x="${X(rd)}" y="${H - 6}" class="sz-ax" text-anchor="middle">R${rd}</text>`;
  const dots = started.map((x) => (isNum(x.res)
    ? `<circle cx="${X(x.r.round)}" cy="${Y(x.res.pos)}" r="${x.res.pos <= 3 ? 5 : 3.5}" fill="${x.res.pos === 1 ? '#ffd166' : col}" stroke="var(--panel)" stroke-width="1.5"><title>R${x.r.round} ${esc(short(x.r.name))} : P${x.res.pos}</title></circle>`
    : `<text x="${X(x.r.round)}" y="${H - pb - 2}" class="sz-ax sz-dnf" text-anchor="middle">✕</text>`)).join('');
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="sz-svg">${grid}${line(gridPts, true)}${line(finPts)}${dots}</svg>`;

  return `<div class="sz-h2h-pick"><label class="small">Pilote <select id="szDriver">${data.drivers.map((d) => `<option value="${d.code}" ${d.code === drv.code ? 'selected' : ''}>${d.pos}. ${esc(d.name)}</option>`).join('')}</select></label></div>
    <div class="sz-drv-head" style="--tc:${col}">${ctx.bar(drv.team, drv.teamId)}<div><div class="sz-drv-name">${esc(drv.name)} <span class="muted">#${esc(drv.number || '')}</span></div>
      <div class="muted">${esc(drv.team)} · P${drv.pos} au championnat · ${drv.points} pts</div></div></div>
    <div class="sz-cards sz-kpis">
      ${card('Victoires', drv.wins || 0)}
      ${card('Podiums', fin.filter((x) => x.res.pos <= 3).length)}
      ${card('Poles', rows.filter((x) => x.q?.pos === 1).length)}
      ${card('Meilleurs tours', started.filter((x) => x.res.fastest).length)}
      ${card('Points par course', fr(started.length ? pts / started.length : null), `${pts} pts en ${started.length} GP (sprints inclus)`)}
      ${card('Dans les points', `${started.filter((x) => x.res.points > 0).length}/${started.length}`)}
      ${card('Moyenne au départ', fr(mean(started.map((x) => x.res.grid).filter(Boolean))))}
      ${card('Moyenne à l\'arrivée', fr(mean(fin.map((x) => x.res.pos))), fin.length ? `meilleur : P${Math.min(...fin.map((x) => x.res.pos))}` : '')}
      ${card('Places gagnées', `${gained >= 0 ? '+' : ''}${gained}`, 'grille → arrivée, cumul')}
      ${card('Abandons', started.length - fin.length)}
      ${card('Duel qualif', `${qd[0]} – ${qd[1]}`, mateName ? `face à ${esc(mateName)}` : '')}
      ${card('Vitesse de pointe', tops.length ? `${Math.max(...tops)} km/h` : '—', tops.length ? `moyenne ${fr(mean(tops), 0)} km/h` : '')}
      ${card('Immobilisation moyenne', stops.length ? `${fr(mean(stops))} s` : '—', stops.length ? `${stops.length} arrêts` : '')}
      ${card('Régularité', sig.length ? `${fr(median(sig), 3)} s` : '—', 'écart-type médian des tours')}
    </div>
    <section class="sz-box"><h3>Départ (pointillés) et arrivée, course par course</h3>${chart}</section>
    <section class="sz-box"><h3>Courses</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Qualif.</th><th>Grille</th><th>Arrivée</th><th>Points</th><th>Meilleur tour</th><th>V. max</th><th>Arrêts</th><th>Statut</th></tr>
      ${rows.map((x) => `<tr><td>R${x.r.round}</td><td>${esc(short(x.r.name))}${x.spr ? ` <span class="sz-tag sprint">Sprint P${x.spr.pos ?? '—'}</span>` : ''}</td><td>${x.q?.pos ? `P${x.q.pos}` : '—'}</td>
        <td>${x.res?.grid ? `P${x.res.grid}` : x.res ? 'Stands' : '—'}</td><td><b>${x.res ? (isNum(x.res) ? `P${x.res.pos}` : 'Abandon') : '—'}</b></td><td>${x.res?.points || ''}</td>
        <td>${x.a?.best ? fmtLap(x.a.best) : '—'}${x.res?.fastest ? ' <span class="sz-tag sprint">MT</span>' : ''}</td><td>${x.a?.speeds?.ST ? `${x.a.speeds.ST} km/h` : '—'}</td>
        <td>${x.a ? x.a.stops.map((s) => `${fr(s.stop)} s`).join(' · ') || '0' : '—'}</td><td class="muted small">${esc(statusFr(x.res?.status))}</td></tr>`).join('')}</table></section>
    ${pendingNote(stats)}`;
}

// ---------------- Régularité ----------------
export function renderConsistency(ctx) {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  // Par course : écart-type des tours propres, et rythme (écart de la médiane au meilleur pilote)
  const per = new Map();   // tla -> { d, sig: Map(round -> σ), pace: [] }
  for (const rd of rounds) {
    const { race } = R.get(rd);
    const meds = [];
    for (const d of race.drivers) {
      const c = cleanLaps(d);
      if (!c) continue;
      const e = per.get(d.tla) || { d, sig: new Map(), pace: [] };
      e.d = d;
      e.sig.set(rd, sd(c));
      e.med = e.med || new Map();
      e.med.set(rd, median(c));
      per.set(d.tla, e);
      meds.push(median(c));
    }
    const best = Math.min(...meds);
    for (const e of per.values()) if (e.med?.has(rd)) e.pace.push(((e.med.get(rd) - best) / best) * 100);
  }
  const rows = [...per.values()].filter((e) => e.sig.size >= Math.max(2, rounds.length / 3))
    .map((e) => ({ ...e, score: median([...e.sig.values()]), paceAvg: mean(e.pace) }))
    .sort((a, b) => a.score - b.score);
  // Régularité des résultats (Jolpica)
  const fin = new Map();
  for (const r of data.races.filter((x) => x.results.length)) {
    for (const x of r.results) {
      const f = fin.get(x.code) || { pos: [], n: 0, pts: 0 };
      f.n++;
      if (isNum(x)) f.pos.push(x.pos);
      if (x.points > 0) f.pts++;
      fin.set(x.code, f);
    }
  }
  const allSig = rows.flatMap((e) => [...e.sig.values()]);
  const lo = Math.min(...allSig), hi = Math.max(...allSig);
  const k = (v) => (v === undefined ? null : (v - lo) / ((hi - lo) || 1));
  return `${pendingNote(stats)}
    <p class="muted small">Régularité = écart-type des temps au tour « propres » de chaque pilote (hors 1er tour, tours aux stands, safety car / VSC et tours à plus de 7 % de sa médiane). Plus la valeur est basse, plus le pilote enchaîne des tours identiques. Le rythme est l'écart moyen de son tour médian à celui du pilote le plus rapide de chaque course.</p>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Les plus réguliers (écart-type médian)</h3>${hbars(rows.map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.score, text: `${fr(e.score, 3)} s`, color: tcol(e.d.team, e.d.color) })), { invert: true })}</section>
      <section class="sz-box"><h3>Rythme de course (écart au plus rapide)</h3>${hbars([...rows].sort((a, b) => a.paceAvg - b.paceAvg).map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.paceAvg, text: `+${fr(e.paceAvg, 2)} %`, color: tcol(e.d.team, e.d.color) })), { invert: true })}</section>
    </div>
    <section class="sz-box"><h3>Écart-type par Grand Prix (s)</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Pilote</th>${rounds.map((rd) => `<th title="${esc(short(data.races.find((r) => r.round === rd)?.name))}">R${rd}</th>`).join('')}<th>Médiane</th></tr>
      ${rows.map((e) => `<tr><td>${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b></td>${rounds.map((rd) => heat(k(e.sig.get(rd)), e.sig.has(rd) ? fr(e.sig.get(rd), 2) : '—')).join('')}<td><b>${fr(e.score, 3)}</b></td></tr>`).join('')}</table></div></section>
    <section class="sz-box"><h3>Régularité des résultats</h3><table class="sz-table"><tr><th>Pilote</th><th>Arrivées</th><th>Dans les points</th><th>Position moyenne</th><th>Écart-type des positions</th></tr>
      ${data.drivers.map((d) => { const f = fin.get(d.code); return f ? `<tr><td>${ctx.bar(d.team, d.teamId)}<b>${esc(d.name)}</b></td><td>${f.pos.length}/${f.n}</td><td>${Math.round((f.pts / f.n) * 100)} %</td><td>${fr(mean(f.pos))}</td><td>${fr(sd(f.pos))}</td></tr>` : ''; }).join('')}</table></section>`;
}

// ---------------- Arrêts aux stands ----------------
export function renderPits(ctx) {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const all = [];
  for (const { race } of R.values()) for (const d of race.drivers) for (const s of d.stops) all.push({ ...s, d, round: race.round });
  const valid = all.filter((s) => s.stop > 0 && s.stop < 15);
  const name = (rd) => short(data.races.find((r) => r.round === rd)?.name);
  const teams = new Map();
  for (const s of all) {
    const t = teams.get(s.d.team) || { team: s.d.team, color: s.d.color, stops: [], n: 0 };
    t.n++;
    if (s.stop > 0 && s.stop < 15) t.stops.push(s.stop);
    teams.set(s.d.team, t);
  }
  const tl = [...teams.values()].filter((t) => t.stops.length).map((t) => ({ ...t, med: median(t.stops), best: Math.min(...t.stops), under25: t.stops.filter((v) => v < 2.5).length }))
    .sort((a, b) => a.med - b.med);
  const fastest = [...valid].sort((a, b) => a.stop - b.stop).slice(0, 15);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  return `${pendingNote(stats)}
    <div class="sz-cards">
      <div class="sz-card sz-kpi"><div class="muted small">Arrêts</div><div class="sz-big">${all.length}</div><div class="muted small">${R.size} Grands Prix analysés</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Immobilisation médiane</div><div class="sz-big">${fr(median(valid.map((s) => s.stop)), 2)} s</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Arrêt le plus rapide</div><div class="sz-big">${fastest[0] ? `${fr(fastest[0].stop, 1)} s` : '—'}</div><div class="muted small">${fastest[0] ? `${esc(fastest[0].d.team)} · ${esc(fastest[0].d.tla)} · R${fastest[0].round}` : ''}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Temps médian dans la voie des stands</div><div class="sz-big">${fr(median(all.map((s) => s.lane).filter((v) => v > 5 && v < 60)), 1)} s</div></div>
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Immobilisation médiane par écurie</h3>${hbars(tl.map((t) => ({ html: `${mark(t.team, t.color)}<b>${esc(t.team)}</b>`, v: t.med, text: `${fr(t.med, 2)} s`, color: tcol(t.team, t.color) })), { invert: true })}</section>
      <section class="sz-box"><h3>Les 15 arrêts les plus rapides</h3><table class="sz-table"><tr><th>#</th><th>Écurie</th><th>Pilote</th><th>Grand Prix</th><th>Tour</th><th>Immob.</th></tr>
        ${fastest.map((s, i) => `<tr><td>${i + 1}</td><td>${mark(s.d.team, s.d.color)}${esc(s.d.team)}</td><td><b>${esc(s.d.tla)}</b></td><td>R${s.round} ${esc(name(s.round))}</td><td>${s.lap ?? '—'}</td><td><b>${fr(s.stop, 1)} s</b></td></tr>`).join('')}</table></section>
    </div>
    <section class="sz-box"><h3>Écuries</h3><table class="sz-table"><tr><th>Écurie</th><th>Arrêts</th><th>Médiane</th><th>Meilleur</th><th>Sous 2,5 s</th></tr>
      ${tl.map((t) => `<tr><td>${mark(t.team, t.color)}<b>${esc(t.team)}</b></td><td>${t.n}</td><td>${fr(t.med, 2)} s</td><td>${fr(t.best, 1)} s</td><td>${t.under25}</td></tr>`).join('')}</table></section>
    <section class="sz-box"><h3>Par Grand Prix</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Arrêts</th><th>Immob. médiane</th><th>Plus rapide</th><th>Voie des stands</th></tr>
      ${rounds.map((rd) => { const p = R.get(rd).race.profile; const f = valid.filter((s) => s.round === rd).sort((a, b) => a.stop - b.stop)[0];
        return `<tr><td>R${rd}</td><td>${esc(name(rd))}</td><td>${p.stops}</td><td>${p.stopMedian ? `${fr(p.stopMedian, 2)} s` : '—'}</td><td>${f ? `${fr(f.stop, 1)} s · ${esc(f.d.tla)}` : '—'}</td><td>${p.pitLane ? `${fr(p.pitLane, 1)} s` : '—'}</td></tr>`; }).join('')}</table></section>
    <p class="muted small">Immobilisation : temps à l'arrêt mesuré par la F1 (les arrêts de plus de 15 s — réparations, pénalités — sont exclus des moyennes). Voie des stands : de l'entrée à la sortie.</p>`;
}

// ---------------- Vitesses de pointe ----------------
const SPEED_POINTS = { ST: 'Speed trap', FL: 'Ligne d\'arrivée', I1: 'Intermédiaire 1', I2: 'Intermédiaire 2' };

export function renderSpeeds(ctx, point = 'ST') {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const rounds = [...R.keys()].sort((a, b) => a - b);
  const drv = new Map();
  const team = new Map();   // team -> { color, byRound: Map(rd -> max) }
  for (const rd of rounds) {
    for (const d of R.get(rd).race.drivers) {
      const v = d.speeds?.[point];
      if (!v) continue;
      const e = drv.get(d.tla) || { d, vals: [] };
      e.vals.push(v);
      drv.set(d.tla, e);
      const t = team.get(d.team) || { team: d.team, color: d.color, by: new Map() };
      t.by.set(rd, Math.max(t.by.get(rd) || 0, v));
      team.set(d.team, t);
    }
  }
  const dl = [...drv.values()].map((e) => ({ ...e, max: Math.max(...e.vals), avg: mean(e.vals) })).sort((a, b) => b.max - a.max);
  const tl = [...team.values()].map((t) => ({ ...t, avg: mean([...t.by.values()]) })).sort((a, b) => b.avg - a.avg);
  const lo = Math.min(...dl.map((e) => e.avg)) - 3;
  const top = (rd) => Math.max(...[...team.values()].map((t) => t.by.get(rd) || 0));
  const low = (rd) => Math.min(...[...team.values()].map((t) => t.by.get(rd)).filter(Boolean));
  return `${pendingNote(stats)}
    <div class="sz-h2h-pick"><label class="small">Point de mesure <select id="szSpeedPt">${Object.entries(SPEED_POINTS).map(([k, l]) => `<option value="${k}" ${k === point ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Écuries : moyenne des meilleures vitesses par course</h3>${hbars(tl.map((t) => ({ html: `${mark(t.team, t.color)}<b>${esc(t.team)}</b>`, v: t.avg - lo, text: `${fr(t.avg, 1)} km/h`, color: tcol(t.team, t.color) })))}</section>
      <section class="sz-box"><h3>Pilotes : vitesse maximale de la saison</h3>${hbars(dl.slice(0, 22).map((e) => ({ html: `${mark(e.d.team, e.d.color)}<b>${esc(e.d.tla)}</b>`, v: e.max - lo, text: `${e.max} km/h`, color: tcol(e.d.team, e.d.color) })))}</section>
    </div>
    <section class="sz-box"><h3>Meilleure vitesse de chaque écurie par Grand Prix (km/h)</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Écurie</th>${rounds.map((rd) => `<th title="${esc(short(data.races.find((r) => r.round === rd)?.name))}">R${rd}</th>`).join('')}<th>Moy.</th></tr>
      ${tl.map((t) => `<tr><td>${mark(t.team, t.color)}<b>${esc(t.team)}</b></td>${rounds.map((rd) => { const v = t.by.get(rd); if (!v) return '<td class="muted">—</td>'; const span = top(rd) - low(rd) || 1; return heat((top(rd) - v) / span, v); }).join('')}<td><b>${fr(t.avg, 1)}</b></td></tr>`).join('')}</table></div></section>
    <section class="sz-box"><h3>Vitesse maximale par Grand Prix</h3><table class="sz-table"><tr><th>Manche</th><th>Grand Prix</th><th>Vitesse</th><th>Pilote</th></tr>
      ${rounds.map((rd) => { const b = R.get(rd).race.drivers.filter((d) => d.speeds?.[point]).sort((a, c) => c.speeds[point] - a.speeds[point])[0];
        return `<tr><td>R${rd}</td><td>${esc(short(data.races.find((r) => r.round === rd)?.name))}</td><td><b>${b ? `${b.speeds[point]} km/h` : '—'}</b></td><td>${b ? `${mark(b.team, b.color)}${esc(b.tla)}` : ''}</td></tr>`; }).join('')}</table></section>
    <p class="muted small">Meilleure vitesse de chaque pilote au point de mesure choisi pendant la course (archives officielles F1).</p>`;
}

// ---------------- Profil des circuits ----------------
const SORTS = { round: 'Calendrier', avgSpeed: 'Vitesse moyenne', topSpeed: 'Vitesse de pointe', gains: 'Dépassements', neutral: 'Neutralisations', length: 'Longueur' };

export function renderCircuits(ctx, sort = 'round') {
  const { data, stats } = ctx;
  const R = byRound(stats);
  if (!R.size) return pendingNote(stats);
  const items = [...R.values()].map(({ race }) => {
    const r = data.races.find((x) => x.round === race.round) || {};
    const p = race.profile;
    return { round: race.round, r, p, avgSpeed: p.fastest?.avgSpeed || 0, topSpeed: p.topSpeed?.kmh || 0, gains: p.gains || 0, neutral: p.neutralPct || 0, length: p.length || 0 };
  });
  items.sort((a, b) => (sort === 'round' ? a.round - b.round : b[sort] - a[sort]));
  const range = (k) => { const v = items.map((x) => x[k]).filter(Boolean); return [Math.min(...v), Math.max(...v)]; };
  const rg = { avgSpeed: range('avgSpeed'), topSpeed: range('topSpeed'), gains: range('gains'), neutral: range('neutral') };
  const meter = (label, k, v, txt) => {
    const [a, b] = rg[k];
    const w = b > a ? 8 + (92 * (v - a)) / (b - a) : 50;
    return `<div class="sz-meter"><span>${label}</span><div><i style="width:${v ? w : 0}%"></i></div><b>${txt}</b></div>`;
  };
  return `${pendingNote(stats)}
    <div class="sz-h2h-pick"><label class="small">Trier par <select id="szCircSort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="sz-circs">${items.map(({ round, r, p }) => `<article class="sz-circ">
      <div class="sz-circ-head"><span class="muted">R${round}</span> <b>${esc(short(r.name))}</b><div class="muted small">${esc(r.circuit || '')} · ${esc(r.locality || '')}</div></div>
      <div class="sz-circ-body">
        ${p.outline ? `<svg viewBox="0 0 100 100" class="sz-outline"><polygon points="${p.outline}"/></svg>` : '<div class="sz-outline muted small">Tracé indisponible</div>'}
        <dl class="sz-facts">
          <dt>Longueur</dt><dd>${p.length ? `${fr(p.length, 3)} km` : '—'}</dd>
          <dt>Virages</dt><dd>${p.corners ?? '—'}</dd>
          <dt>Tours</dt><dd>${p.laps || '—'}${p.distance ? ` · ${fr(p.distance, 1)} km` : ''}</dd>
          <dt>Meilleur tour</dt><dd>${p.fastest ? `${fmtLap(p.fastest.time)} · ${esc(p.fastest.tla)}` : '—'}</dd>
          <dt>Arrêts</dt><dd>${p.stops}${p.stopMedian ? ` · ${fr(p.stopMedian, 1)} s` : ''}</dd>
          <dt>Voie des stands</dt><dd>${p.pitLane ? `${fr(p.pitLane, 1)} s` : '—'}</dd>
        </dl>
      </div>
      ${meter('Vitesse moyenne', 'avgSpeed', p.fastest?.avgSpeed, p.fastest?.avgSpeed ? `${fr(p.fastest.avgSpeed, 0)} km/h` : '—')}
      ${meter('Vitesse de pointe', 'topSpeed', p.topSpeed?.kmh, p.topSpeed ? `${p.topSpeed.kmh} km/h` : '—')}
      ${meter('Dépassements', 'gains', p.gains, `${p.gains}`)}
      ${meter('Neutralisations', 'neutral', p.neutralPct, `${fr(p.neutralPct, 0)} % des tours`)}
    </article>`).join('')}</div>
    <p class="muted small">Vitesse moyenne : sur le meilleur tour de la course. Dépassements : places gagnées en piste d'un tour à l'autre (hors 1er tour, arrêts et neutralisations) — une estimation. Neutralisations : tours du leader sous safety car, VSC ou drapeau rouge. Les jauges comparent les circuits de la saison entre eux.</p>`;
}
