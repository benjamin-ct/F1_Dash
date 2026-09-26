// Duel entre deux pilotes : écart en direct, tendance, historique, comparaison détaillée.
import { store, setDuel, displayNow, versionOf, on } from '../store.js';
import { $, esc, drivers, orderedNumbers, sessionKind, teamColor, tyreBadge, currentStint, fmtLap, fmtSigned } from '../util.js';
import { parseGap, parseLapTime } from '/shared/f1.js';
import { lineChart } from './charts.js';

let skeletonFor = null;
let lastSlowKey = '';
let liveSeries = [];
let liveSeriesKey = '';
let lastLiveSample = 0;
let lastFast = 0;

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function gapSeconds(raw) {
  const g = parseGap(raw);
  if (!g) return null;
  if (g.leader) return 0;
  return g.s ?? null;
}

// Écart officiel (chronométrage). Renvoie {ahead: 'a'|'b', gap (s) | null, laps}
export function officialGap(state, a, b) {
  const kind = sessionKind(state);
  const lines = state.TimingData?.Lines || {};
  const la = lines[a] || {}, lb = lines[b] || {};
  if (kind === 'race') {
    const pa = Number(la.Position), pb = Number(lb.Position);
    if (!pa || !pb) return null;
    const ahead = pa < pb ? 'a' : 'b';
    const front = ahead === 'a' ? la : lb, back = ahead === 'a' ? lb : la;
    if (Math.abs(pa - pb) === 1) {
      const iv = parseGap(back.IntervalToPositionAhead?.Value);
      if (iv?.laps) return { ahead, gap: null, laps: iv.laps };
      if (iv && iv.s !== undefined && !iv.leader) return { ahead, gap: iv.s, laps: 0 };
    }
    const gf = parseGap(front.GapToLeader), gb = parseGap(back.GapToLeader);
    if (!gf || !gb) return { ahead, gap: null, laps: 0 };
    if (gb.laps || gf.laps) return { ahead, gap: null, laps: (gb.laps || 0) - (gf.laps || 0) || 1 };
    return { ahead, gap: (gb.leader ? 0 : gb.s) - (gf.leader ? 0 : gf.s), laps: 0 };
  }
  const part = Number(state.TimingData?.SessionPart) || 1;
  const best = (l) => kind === 'quali' ? parseLapTime(list(l.BestLapTimes)[part - 1]?.Value) : parseLapTime(l.BestLapTime?.Value);
  const ta = best(la), tb = best(lb);
  if (ta === null && tb === null) return null;
  if (ta === null) return { ahead: 'b', gap: null, laps: 0 };
  if (tb === null) return { ahead: 'a', gap: null, laps: 0 };
  return { ahead: ta <= tb ? 'a' : 'b', gap: Math.abs(tb - ta), laps: 0 };
}

// Série "écart par tour" : positif = A devant B.
function lapGapSeries(a, b) {
  const la = store.derived.laps[a] || [], lb = store.derived.laps[b] || [];
  const byLap = new Map(lb.map((e) => [e.lap, e]));
  const out = [];
  for (const ea of la) {
    const eb = byLap.get(ea.lap);
    if (!eb) continue;
    const ga = gapSeconds(ea.gap), gb = gapSeconds(eb.gap);
    if (ga === null || gb === null) continue;
    out.push({ x: ea.lap, y: gb - ga, pit: ea.pit || eb.pit, pitA: ea.pit, pitB: eb.pit });
  }
  return out;
}

function trendText(series, tlaA, tlaB, gapNow) {
  const clean = series.filter((p) => !p.pit);
  if (clean.length < 3) return 'La tendance apparaîtra après quelques tours communs.';
  const pts = clean.slice(-4);
  const first = pts[0], last = pts[pts.length - 1];
  const rate = (last.y - first.y) / (last.x - first.x || 1); // variation de l'écart par tour (A devant si > 0)
  const gap = gapNow ?? last.y;
  if (Math.abs(rate) < 0.03) return `Écart <b>stable</b> (${fmtSigned(rate, 2)} s/tour sur les ${pts.length} derniers tours).`;
  const front = gap >= 0 ? tlaA : tlaB, back = gap >= 0 ? tlaB : tlaA;
  const closing = (gap >= 0 && rate < 0) || (gap < 0 && rate > 0);
  const r = Math.abs(rate).toFixed(2).replace('.', ',');
  if (!closing) return `<b>${esc(front)}</b> creuse l'écart : <b>+${r} s/tour</b> sur ${esc(back)}.`;
  const lapsToCatch = Math.abs(gap) / Math.abs(rate);
  const lc = store.state.LapCount;
  const remaining = lc?.TotalLaps && lc?.CurrentLap ? lc.TotalLaps - lc.CurrentLap : null;
  let eta = `rattrapage estimé dans <b>~${Math.max(1, Math.round(lapsToCatch))} tour(s)</b>`;
  if (remaining !== null && lapsToCatch > remaining) eta += ` (au-delà des ${remaining} tours restants)`;
  return `<b>${esc(back)}</b> revient sur ${esc(front)} : <b>−${r} s/tour</b> · ${eta}.`;
}

function fillSelect(sel, value, dl, nums) {
  const opts = ['<option value="">— Choisir —</option>', ...nums.map((n) => `<option value="${n}" ${n === value ? 'selected' : ''}>${esc(dl[n]?.Tla || n)} · ${esc(dl[n]?.LastName || dl[n]?.FullName || '')}</option>`)];
  const html = opts.join('');
  if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
  sel.value = value || '';
}

function skeleton() {
  $('#duelBody').innerHTML = `
    <div class="duel-hero" id="dHero"></div>
    <div class="duel-trend" id="dTrend"></div>
    <div id="dLiveWrap"><div class="chart-title"><span>Écart en direct (GPS) — 3 dernières minutes</span><span>positif = A devant</span></div><div class="duel-chart" id="dLive"></div></div>
    <div id="dLapWrap"><div class="chart-title"><span>Écart à chaque tour (s)</span><span>positif = A devant</span></div><div class="duel-chart" id="dLap"></div></div>
    <table class="cmp" id="dCmp"></table>
    <div id="dTele"></div>
    <div class="chart-title"><span>Derniers tours</span></div>
    <table class="laps-cmp" id="dLaps"></table>`;
}

function renderHero(a, b) {
  const s = store.state;
  const dl = drivers(s);
  const da = dl[a] || {}, db = dl[b] || {};
  const lines = s.TimingData?.Lines || {};
  const disp = displayNow();
  const off = officialGap(s, a, b);
  const la = lines[a] || {}, lb = lines[b] || {};
  const running = !la.Retired && !lb.Retired && !la.Stopped && !lb.Stopped;
  let live = sessionKind(s) === 'race' && running ? store.positions.liveGap(a, b, disp) : null;
  // Garde-fou : si le GPS contredit nettement le chronométrage (voiture au garage, tour de retard…), on s'en tient à l'officiel.
  if (live && off && (off.laps || (off.gap !== null && Math.abs(live.gap - off.gap) > 5))) live = null;

  let main = '—', lbl = '', src = '';
  if (live && !live.laps) {
    main = live.gap.toFixed(live.gap < 10 ? 2 : 1).replace('.', ',');
    lbl = `${esc(dl[live.ahead]?.Tla || live.ahead)} devant`;
    src = off?.gap !== null && off?.gap !== undefined ? `Officiel : ${off.gap.toFixed(3).replace('.', ',')} s · GPS temps réel` : 'GPS temps réel';
  } else if (off) {
    const aheadNum = off.ahead === 'a' ? a : b;
    if (off.laps) { main = `+${off.laps} T`; lbl = `${esc(dl[aheadNum]?.Tla || aheadNum)} a un tour d'avance`; }
    else if (off.gap !== null) { main = off.gap.toFixed(3).replace('.', ','); lbl = `${esc(dl[aheadNum]?.Tla || aheadNum)} devant`; }
    src = sessionKind(s) === 'race' ? 'Chronométrage officiel' : 'Écart sur le meilleur tour';
  }

  const side = (num, d, cls) => {
    const l = lines[num] || {};
    const pos = l.Position ? `P${l.Position}` : '';
    return `<div class="duel-side ${cls}"><div class="duel-name"><span class="duel-swatch" style="background:${teamColor(d)}"></span>${esc(d.Tla || num)}</div>
      <div class="duel-sub">${esc(pos)} · ${esc(d.TeamName || '')}</div></div>`;
  };
  $('#dHero').innerHTML = `${side(a, da, 'a')}
    <div class="duel-gap"><div class="duel-gap-val">${main}${main !== '—' && !main.includes('T') ? '<small style="font-size:16px"> s</small>' : ''}</div>
      <div class="duel-gap-lbl">${lbl}</div><div class="duel-gap-src">${src}</div></div>
    ${side(b, db, 'b')}`;

  // Échantillonnage de l'écart GPS pour le graphique "en direct"
  const key = `${a}-${b}-${store.ver.__reset || 0}`;
  if (key !== liveSeriesKey) { liveSeries = []; liveSeriesKey = key; }
  if (live && !live.laps && disp - lastLiveSample >= 1000) {
    lastLiveSample = disp;
    liveSeries.push({ t: disp, y: live.ahead === a ? live.gap : -live.gap });
    while (liveSeries.length && disp - liveSeries[0].t > 180000) liveSeries.shift();
  }
  $('#dLiveWrap').hidden = !liveSeries.length;
  if (liveSeries.length) {
    lineChart($('#dLive'), liveSeries.map((p) => ({ x: (p.t - disp) / 1000, y: p.y })), {
      height: 110, color: '#3ea6ff', yFmt: (v) => v.toFixed(1), xFmt: (v) => `${Math.round(v)} s`,
      tipFmt: (p) => `${Math.round(-p.x)} s avant : ${p.y >= 0 ? 'A' : 'B'} devant de ${Math.abs(p.y).toFixed(2)} s`, yMinSpan: 0.5,
    });
  }
}

function cmpRow(label, va, vb, better = null) {
  // better : 'low' | 'high' | null (comparaison numérique des valeurs brutes)
  let ca = '', cb = '';
  if (better && va.n !== null && vb.n !== null && va.n !== vb.n) {
    const aWins = better === 'low' ? va.n < vb.n : va.n > vb.n;
    ca = aWins ? 'win' : ''; cb = aWins ? '' : 'win';
  }
  return `<tr><td class="${ca}">${va.html}</td><td>${esc(label)}</td><td class="${cb}">${vb.html}</td></tr>`;
}

function renderSlow(a, b) {
  const s = store.state;
  const kind = sessionKind(s);
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const app = s.TimingAppData?.Lines || {};
  const la = lines[a] || {}, lb = lines[b] || {};
  const tlaA = dl[a]?.Tla || a, tlaB = dl[b]?.Tla || b;

  // Graphique tour par tour + tendance (course)
  const series = kind === 'race' ? lapGapSeries(a, b) : [];
  $('#dLapWrap').hidden = kind !== 'race';
  if (kind === 'race') {
    lineChart($('#dLap'), series, {
      height: 130, color: '#ff9f1a', xFmt: (v) => `T${v}`, yFmt: (v) => v.toFixed(1),
      tipFmt: (p) => `Tour ${p.x} : ${p.y >= 0 ? tlaA : tlaB} devant de ${Math.abs(p.y).toFixed(3)} s${p.pit ? ' (arrêt)' : ''}`,
      markers: series.filter((p) => p.pit).map((p) => ({ x: p.x, y: p.y, label: `Arrêt aux stands — tour ${p.x}${p.pitA ? ' ' + tlaA : ''}${p.pitB ? ' ' + tlaB : ''}` })),
      empty: 'Le graphique se remplit à chaque tour bouclé par les deux pilotes.',
    });
    const off = officialGap(s, a, b);
    const gapNow = off && off.gap !== null && !off.laps ? (off.ahead === 'a' ? off.gap : -off.gap) : null;
    $('#dTrend').innerHTML = trendText(series, tlaA, tlaB, gapNow);
  } else {
    $('#dTrend').innerHTML = kind === 'quali' ? 'Comparaison sur la partie de qualification en cours.' : 'Comparaison des meilleurs tours de la séance.';
  }

  // Comparatif
  const num = (v) => ({ html: esc(v ?? '—') || '—', n: null });
  const lap = (v) => ({ html: v ? esc(v) : '<span class="dim">—</span>', n: parseLapTime(v) });
  const part = Number(s.TimingData?.SessionPart) || 1;
  const bestOf = (l) => kind === 'quali' ? list(l.BestLapTimes)[part - 1]?.Value : l.BestLapTime?.Value;
  const sec = (l, i) => list(l.Sectors)[i]?.Value;
  const stA = currentStint(app[a]), stB = currentStint(app[b]);
  const tyre = (st) => ({ html: st ? `${tyreBadge(st.Compound, st.TotalLaps, st.New)}` : '—', n: null });
  const spd = (l) => { const v = Number(l.Speeds?.ST?.Value); return { html: v ? `${v} km/h` : '—', n: v || null }; };
  const posv = (l) => ({ html: l.Position ? `P${esc(l.Position)}` : '—', n: Number(l.Position) || null });

  let rows = cmpRow('Position', posv(la), posv(lb), 'low');
  rows += cmpRow('Dernier tour', lap(la.LastLapTime?.Value), lap(lb.LastLapTime?.Value), 'low');
  rows += cmpRow(kind === 'quali' ? `Meilleur (Q${part})` : 'Meilleur tour', lap(bestOf(la)), lap(bestOf(lb)), 'low');
  for (let i = 0; i < 3; i++) rows += cmpRow(`Secteur ${i + 1}`, lap(sec(la, i)), lap(sec(lb, i)), 'low');
  rows += cmpRow('Pneus', tyre(stA), tyre(stB));
  if (kind === 'race') {
    rows += cmpRow('Arrêts', num(la.NumberOfPitStops ?? 0), num(lb.NumberOfPitStops ?? 0));
    rows += cmpRow('Écart leader', num(/^LAP/i.test(la.GapToLeader || '') ? 'Leader' : la.GapToLeader), num(/^LAP/i.test(lb.GapToLeader || '') ? 'Leader' : lb.GapToLeader));
  } else {
    rows += cmpRow('Tours', num(la.NumberOfLaps), num(lb.NumberOfLaps));
  }
  rows += cmpRow('Speed trap', spd(la), spd(lb), 'high');
  $('#dCmp').innerHTML = `<tr><td><b style="color:var(--blue)">A</b> ${esc(tlaA)}</td><td></td><td>${esc(tlaB)} <b style="color:var(--orange)">B</b></td></tr>${rows}`;

  // Derniers tours
  const lapsA = store.derived.laps[a] || [], lapsB = store.derived.laps[b] || [];
  const mapB = new Map(lapsB.map((e) => [e.lap, e]));
  const common = lapsA.filter((e) => mapB.has(e.lap) && (e.time || mapB.get(e.lap).time)).slice(-8).reverse();
  $('#dLaps').innerHTML = common.length
    ? `<tr><th>Tour</th><th>${esc(tlaA)}</th><th>${esc(tlaB)}</th><th>Δ (A − B)</th><th>Plus rapide</th></tr>` + common.map((ea) => {
      const eb = mapB.get(ea.lap);
      const ta = parseLapTime(ea.time), tb = parseLapTime(eb.time);
      const dlt = ta !== null && tb !== null ? ta - tb : null;
      const faster = dlt === null || dlt === 0 ? '' : dlt < 0 ? tlaA : tlaB;
      return `<tr><td>T${ea.lap}${ea.pit || eb.pit ? ' <span class="tag pit">P</span>' : ''}</td><td>${esc(ea.time || '—')}</td><td>${esc(eb.time || '—')}</td>
        <td>${dlt === null ? '—' : fmtSigned(dlt)}</td><td>${esc(faster)}</td></tr>`;
    }).join('')
    : '<tr><td class="note">Aucun tour commun pour l\'instant.</td></tr>';
}

function teleBlock(num, tla) {
  const c = store.positions.carAt(num, displayNow());
  if (!c) return `<div class="gauge"><div class="gauge-lbl">${esc(tla)}</div><div class="muted small">Pas de télémétrie</div></div>`;
  const brk = c.brk > 0 ? 100 : 0;
  return `<div class="gauge mini-tele"><div class="gauge-lbl">${esc(tla)}</div>
    <div class="gauge-val">${c.speed ?? '—'}<small> km/h</small> · <span title="Rapport">${c.gear ?? '—'}</span><small>e</small></div>
    <div class="row2"><span>Accélérateur</span><span>${c.thr ?? '—'} %</span></div><div class="bar thr"><i style="width:${Math.min(100, c.thr || 0)}%"></i></div>
    <div class="row2"><span>Frein</span><span>${c.brk === null ? '—' : brk ? 'Oui' : 'Non'}</span></div><div class="bar brk"><i style="width:${brk}%"></i></div>
    <div class="row2"><span>Régime</span><span>${c.rpm ?? '—'} tr/min</span></div><div class="bar rpm"><i style="width:${Math.min(100, ((c.rpm || 0) / 13000) * 100)}%"></i></div></div>`;
}

export function renderDuel() {
  const s = store.state;
  const dl = drivers(s);
  const nums = orderedNumbers(s).filter((n) => dl[n]);
  fillSelect($('#duelA'), store.duel.a, dl, nums);
  fillSelect($('#duelB'), store.duel.b, dl, nums);
  const { a, b } = store.duel;
  if (!a || !b || !dl[a] || !dl[b]) {
    if (skeletonFor !== 'empty') {
      skeletonFor = 'empty';
      $('#duelBody').innerHTML = `<div class="duel-empty">Choisissez deux pilotes ci-dessus,<br>ou cliquez sur <b style="color:var(--blue)">A</b> et <b style="color:var(--orange)">B</b> dans le classement.<br><br>
        Vous verrez l'écart en direct, sa tendance tour par tour, l'estimation du rattrapage,<br>les temps au tour, secteurs, pneus et télémétrie côte à côte.</div>`;
    }
    return;
  }
  const pair = `${a}-${b}`;
  if (skeletonFor !== pair) { skeletonFor = pair; lastSlowKey = ''; skeleton(); }

  const now = performance.now();
  if (now - lastFast > 200) {
    lastFast = now;
    renderHero(a, b);
    const tlaA = dl[a]?.Tla || a, tlaB = dl[b]?.Tla || b;
    $('#dTele').innerHTML = store.positions.car.size ? `<div class="tele-duel">${teleBlock(a, tlaA)}${teleBlock(b, tlaB)}</div>` : '';
  }
  const slowKey = `${versionOf(['TimingData', 'TimingAppData', '__reset'])}`;
  if (slowKey !== lastSlowKey && now - (renderDuel.lastSlow || 0) > 700) {
    lastSlowKey = slowKey;
    renderDuel.lastSlow = now;
    renderSlow(a, b);
  }
}

export function initDuel() {
  $('#duelA').addEventListener('change', (e) => setDuel('a', e.target.value || null));
  $('#duelB').addEventListener('change', (e) => setDuel('b', e.target.value || null));
  $('#duelSwap').addEventListener('click', () => {
    const { a, b } = store.duel;
    store.duel = { a: b, b: a };
    setDuel('a', b);
    setDuel('b', a);
  });
  on('duel', () => { skeletonFor = null; });
}
