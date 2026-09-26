// Direction de course, radios d'équipe, arrêts aux stands.
import { store, versionOf, on, f1Now } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { $, esc, drivers, teamColor, fmtClock, fmtLap, api } from '../util.js';
import { parseUtc, parseLapTime } from '/shared/f1.js';
import { analyzeStewards, isOpen, STATUS_LABEL, linkFiaDocs, parseFiaDoc, deletedLapsDoc } from '/shared/stewards.js';

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj.filter(Boolean) : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]).filter(Boolean);
}

const FLAG_FR = {
  GREEN: 'Vert', YELLOW: 'Jaune', 'DOUBLE YELLOW': 'Double jaune', RED: 'Rouge', BLUE: 'Bleu',
  CLEAR: 'Fin de drapeau', CHEQUERED: 'Damier', 'BLACK AND WHITE': 'Noir et blanc', 'BLACK AND ORANGE': 'Noir et orange', BLACK: 'Noir',
};

let rcmVer = -1, rcmCount = 0;
let radioVer = -1;
let pitVer = -1;

function rcmFlagClass(m) {
  if (m.Flag) return `flag-${m.Flag.replace(/ /g, '-')}`;
  if (m.Category === 'SafetyCar') return 'flag-SC';
  if (m.Category === 'Drs') return 'flag-DRS';
  return '';
}

export function renderRcm() {
  const v = versionOf(['RaceControlMessages', '__reset']);
  if (v === rcmVer) return;
  rcmVer = v;
  const msgs = list(store.state.RaceControlMessages?.Messages);
  const fresh = msgs.length > rcmCount && rcmCount > 0 ? msgs.length - rcmCount : 0;
  rcmCount = msgs.length;
  $('#rcmList').innerHTML = msgs.length
    ? msgs.slice().reverse().map((m, i) => {
      const t = parseUtc(m.Utc);
      const title = m.Flag ? `Drapeau ${FLAG_FR[m.Flag] || m.Flag}${m.Scope === 'Sector' ? ` (secteur ${m.Sector})` : ''}` : m.Category;
      return `<li class="${i < fresh ? 'new' : ''}"><div class="rcm-time">${Number.isFinite(t) ? fmtClock(t) : ''}${m.Lap ? `<br>Tour ${m.Lap}` : ''}</div>
        <div class="rcm-flag ${rcmFlagClass(m)}" title="${esc(title)}"></div><div class="rcm-msg">${esc(m.Message)}</div></li>`;
    }).join('')
    : '<li class="note">Aucun message de la direction de course.</li>';
}

export function renderRadio() {
  const v = `${versionOf(['TeamRadio', 'DriverList', '__reset'])}|${prefs.radioFilter}|${store.duel.a}|${store.duel.b}|${prefs.favs.join()}`;
  if (v === radioVer) return;
  radioVer = v;
  const dl = drivers(store.state);
  const base = store.state.SessionInfo?.Path ? `https://livetiming.formula1.com/static/${store.state.SessionInfo.Path}` : null;
  const caps = list(store.state.TeamRadio?.Captures).filter((c) => radioAllowed(c.RacingNumber)).sort((a, b) => parseUtc(b.Utc) - parseUtc(a.Utc));
  const el = $('#radioList');
  // Ne pas reconstruire la liste pendant une lecture audio.
  if ([...el.querySelectorAll('audio')].some((a) => !a.paused)) { radioVer = -1; return; }
  el.innerHTML = caps.length && base
    ? caps.map((c) => {
      const d = dl[c.RacingNumber] || {};
      return `<li><div class="r-drv"><span class="drv-bar" style="background:${teamColor(d)}"></span>${esc(d.Tla || c.RacingNumber)}</div>
        <span class="muted small">${fmtClock(parseUtc(c.Utc))}</span>
        <audio controls preload="none" src="${esc(base + c.Path)}"></audio></li>`;
    }).join('')
    : '<li class="note">Aucune radio d\'équipe pour l\'instant.</li>';
}

export function renderPits() {
  const v = versionOf(['PitLaneTimeCollection', 'PitStopSeries', 'DriverList', '__reset']);
  if (v === pitVer) return;
  pitVer = v;
  const dl = drivers(store.state);
  // Temps d'immobilisation (si le flux PitStopSeries est disponible)
  const stationary = new Map();
  for (const [num, arr] of Object.entries(store.state.PitStopSeries?.PitTimes || {})) {
    for (const p of list(arr)) {
      const ps = p.PitStop || p;
      if (ps?.Lap) stationary.set(`${num}-${ps.Lap}`, parseLapTime(ps.PitStopTime));
    }
  }
  const rows = store.derived.pitLane.slice().sort((a, b) => b.t - a.t);
  $('#pitList').innerHTML = rows.length
    ? `<table class="pits"><tr><th>Tour</th><th>Pilote</th><th>Voie des stands</th><th>Immobilisation</th></tr>` +
      rows.map((p) => {
        const d = dl[p.num] || {};
        const st = stationary.get(`${p.num}-${p.lap}`);
        return `<tr><td>${esc(p.lap ?? '—')}</td><td><span class="drv"><span class="drv-bar" style="background:${teamColor(d)}"></span><b>${esc(d.Tla || p.num)}</b></span></td>
          <td>${p.duration ? fmtLap(p.duration) + ' s' : '—'}</td><td>${st ? fmtLap(st) + ' s' : '—'}</td></tr>`;
      }).join('') + '</table>'
    : '<div class="note">Aucun arrêt aux stands enregistré depuis le début du suivi.</div>';
}

function radioAllowed(num) {
  num = String(num);
  if (prefs.radioFilter === 'fav') return isFav(num);
  if (prefs.radioFilter === 'duel') return num === store.duel.a || num === store.duel.b;
  return true;
}

// ---- Lecture automatique des nouvelles radios (au rythme du délai TV) ----
const queue = [];
let player = null;

function playNext() {
  if (player && !player.paused && !player.ended) return;
  const next = queue.shift();
  if (!next) return;
  player ||= new Audio();
  player.src = next;
  player.play().catch(() => { /* le navigateur exige une interaction préalable */ });
  player.onended = playNext;
}

export function initRadio() {
  $('#radioFilter').value = prefs.radioFilter;
  $('#radioAuto').checked = prefs.radioAuto;
  $('#radioFilter').addEventListener('change', (e) => setPref('radioFilter', e.target.value));
  $('#radioAuto').addEventListener('change', (e) => setPref('radioAuto', e.target.checked));
  on('events', (events) => {
    if (!prefs.radioAuto) return;
    const base = store.state.SessionInfo?.Path ? `https://livetiming.formula1.com/static/${store.state.SessionInfo.Path}` : null;
    if (!base) return;
    for (const [topic, data] of events) {
      if (topic !== 'TeamRadio' || !data?.Captures) continue;
      for (const c of list(data.Captures)) if (c?.Path && radioAllowed(c.RacingNumber)) queue.push(base + c.Path);
    }
    playNext();
  });
}

// ---- Enquêtes des commissaires et limites de piste ----
const REASONS_FR = {
  'CAUSING A COLLISION': 'Accrochage provoqué',
  'LEAVING THE TRACK AND GAINING AN ADVANTAGE': 'Avantage pris hors de la piste',
  'FORCING ANOTHER DRIVER OFF THE TRACK': 'Pilote poussé hors de la piste',
  'YELLOW FLAG INFRINGEMENT': 'Non-respect du drapeau jaune',
  'SPEEDING IN THE PIT LANE': 'Excès de vitesse dans la voie des stands',
  'IMPEDING': 'Gêne d\'un autre pilote',
  'MOVING UNDER BRAKING': 'Changement de trajectoire au freinage',
  'STARTING PROCEDURE INFRINGEMENT': 'Infraction à la procédure de départ',
  'UNSAFE RELEASE': 'Relâchement dangereux aux stands',
  'TRACK LIMITS': 'Limites de piste',
  'FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS': 'Consignes du directeur de course non respectées',
  'PRACTICE START INFRINGEMENT': 'départ d\'entraînement non conforme',
  'ESCAPE ROAD INSTRUCTIONS': 'utilisation de l\'échappatoire',
};

function reasonFr(reason) {
  if (!reason) return '';
  return reason.split(/\s[–-]\s/).map((p) => REASONS_FR[p.trim()] || p.trim().toLowerCase()).join(' — ');
}

let stwVer = -1, stwCache = null;

function stewardsData() {
  const v = versionOf(['RaceControlMessages', '__reset']);
  if (v !== stwVer) {
    stwVer = v;
    stwCache = analyzeStewards(list(store.state.RaceControlMessages?.Messages));
  }
  return stwCache;
}

// Documents officiels FIA de l'épreuve (rafraîchis toutes les 2 min, cache côté serveur).
let fia = { key: '', docs: [], page: null, at: 0, loading: false };

function fiaState() {
  const info = store.state.SessionInfo;
  const name = info?.Meeting?.Name;
  if (!name) return fia;
  const year = Number(String(info.Path || '').slice(0, 4)) || new Date(parseUtc(info.StartDate) || Date.now()).getFullYear();
  const key = `${year}|${name}`;
  if (key !== fia.key) fia = { key, docs: [], page: null, at: 0, loading: false };
  if (!fia.loading && Date.now() - fia.at > (fia.error ? 30000 : 120000)) {
    fia.loading = true;
    const q = new URLSearchParams({ year, name, country: info.Meeting.Country?.Name || '', location: info.Meeting.Location || '' });
    const cur = fia;
    api(`/api/fia-docs?${q}`)
      .then((r) => { cur.docs = r.docs || []; cur.page = r.page; cur.error = null; })
      .catch((err) => { cur.error = err.message; })
      .finally(() => { cur.loading = false; cur.at = Date.now(); stwRenderKey = ''; });
  }
  return fia;
}

const DOC_KIND = { decision: 'Décision', infringement: 'Infraction', offence: 'Infraction', summons: 'Convocation' };

function docLink(doc, dl) {
  if (!doc) return '';
  const info = parseFiaDoc(doc);
  const who = info.cars[0] ? ` — ${esc(dl[info.cars[0]]?.Tla || `voiture ${info.cars[0]}`)}` : '';
  return `<a class="fia-doc" href="${esc(doc.url)}" target="_blank" rel="noopener" title="${esc(doc.title)}">📄 ${esc(DOC_KIND[info.type] || 'Document')} FIA${info.num ? ` n° ${info.num}` : ''}${who}<span class="muted"> · ${esc(info.subject.replace(/^Cars?\s+[\d\s,&and]+-\s*/i, ''))}</span> ↗</a>`;
}

let stwRenderKey = '';

function sessionEnded() {
  const st = store.state.SessionStatus?.Status || store.state.SessionInfo?.SessionStatus;
  return ['Finished', 'Finalised', 'Ends'].includes(st);
}

function penaltyState(d) {
  if (d.kind !== 'penalty' || !/SECOND TIME|DRIVE|STOP/.test(d.text) || store.state.SessionInfo?.Type !== 'Race') return '';
  if (/SECOND TIME/.test(d.text) && sessionEnded()) return '<span class="muted small">ajoutée à son temps de course</span>';
  return '<span class="muted small">à purger</span>';
}

export function renderStewards() {
  const data = stewardsData();
  const dl = drivers(store.state);
  const docs = fiaState();
  const now = f1Now();
  const visible = docs.docs.filter((d) => d.published <= now).length;
  const open = data.incidents.filter(isOpen);
  const badge = $('#stewardsBadge');
  badge.hidden = !open.length;
  badge.textContent = open.length;
  const tlWarn = data.trackLimits.filter((d) => d.deletions.length >= 3 || d.blackWhite).length;
  $('#tlBadge').hidden = !tlWarn;
  $('#tlBadge').textContent = tlWarn;

  const filter = document.querySelector('input[name=stwFilter]:checked')?.value || 'open';
  const key = `${stwVer}|${filter}|${Object.keys(dl).length}|${docs.key}|${docs.docs.length}|${visible}|${sessionEnded()}`;
  if (key === stwRenderKey) return;
  stwRenderKey = key;
  linkFiaDocs(data, docs.docs, now);

  const car = (c) => `<span><span class="drv-bar" style="background:${teamColor(dl[c.num])}"></span>${esc(dl[c.num]?.Tla || c.tla)}</span>`;
  const who = (cars) => cars.map((c) => `<span class="inc-who"><span class="drv-bar" style="background:${teamColor(dl[c.num])}"></span>${esc(dl[c.num]?.Tla || c.tla)}${dl[c.num]?.LastName ? ` <span class="muted">${esc(dl[c.num].LastName)}</span>` : ''}</span>`).join(' ');
  const decision = (d) => `<div class="inc-dec ${d.kind}"><div class="inc-dec-line"><span class="inc-dec-label">⚖ ${esc(d.label)}</span> pour ${who(d.cars) || '—'}
      ${d.servedAt ? `<span class="inc-served">purgée à ${fmtClock(d.servedAt)}</span>` : penaltyState(d)}</div>
      ${d.reason ? `<div class="muted small">${esc(reasonFr(d.reason))}</div>` : ''}
      ${docLink(d.doc, dl)}</div>`;
  const penalties = data.decisions.filter((d) => d.kind === 'penalty').length;
  const docsNote = docs.page ? ` · <a href="${esc(docs.page)}" target="_blank" rel="noopener">documents FIA ↗</a>` : docs.error ? ' · <span title="' + esc(docs.error) + '">documents FIA indisponibles</span>' : '';
  $('#stewardsSummary').innerHTML = `${open.length} en cours · ${data.incidents.length} au total · ${penalties} pénalité(s)${docsNote}`;
  const shown = (filter === 'open' ? open : data.incidents).slice().sort((a, b) => (isOpen(b) - isOpen(a)) || b.updated - a.updated);
  const loose = filter === 'all' ? data.decisions.filter((d) => !d.incident) : [];
  $('#stewardsList').innerHTML = shown.length || loose.length
    ? shown.map((inc) => `<div class="inc">
        <div class="inc-head"><span class="inc-status ${inc.status}">${esc(STATUS_LABEL[inc.status] || inc.status)}</span>
          <span class="inc-cars">${inc.cars.map(car).join('')}</span>
          <span class="inc-where">${esc(inc.location || '')}${inc.lap ? ` · tour ${inc.lap}` : ''}</span></div>
        ${inc.reason ? `<div class="inc-reason" title="${esc(inc.reason)}">${esc(reasonFr(inc.reason))}</div>` : ''}
        ${inc.decisions.map(decision).join('')}
        ${inc.docs.map((d) => docLink(d, dl)).join('')}
        <ul class="inc-steps">${inc.history.map((h) => `<li title="${esc(h.text)}">${fmtClock(h.t)}${h.lap ? ` (T${h.lap})` : ''} · <b>${esc(h.label)}</b>${h.cars?.length ? ` → ${esc(h.cars.map((c) => dl[c.num]?.Tla || c.tla).join(', '))}` : ''}</li>`).join('')}</ul>
      </div>`).join('') + loose.map((d) => `<div class="inc"><div class="inc-head"><span class="inc-status ${d.kind}">${esc(d.label)}</span>
        <span class="inc-cars">${d.cars.map(car).join('')}</span><span class="inc-where">${fmtClock(d.t)}${d.lap ? ` · tour ${d.lap}` : ''}</span></div>
        ${decision(d)}</div>`).join('')
    : `<div class="note">${filter === 'open' ? 'Aucune enquête en cours.' : 'Aucun incident signalé par les commissaires.'}</div>`;

  // Limites de piste
  const race = store.state.SessionInfo?.Type === 'Race';
  const tlDoc = deletedLapsDoc(docs.docs, store.state.SessionInfo?.Name, sessionEnded() ? Infinity : now);
  $('#tlList').innerHTML = data.trackLimits.length
    ? `<table class="tl-table"><tr><th>Pilote</th><th>Infractions</th><th>Virages</th><th>Dernière</th><th>Statut</th></tr>
      ${data.trackLimits.map((d) => {
        const n = d.deletions.length;
        // Le drapeau noir et blanc est placé sur l'infraction qui l'a déclenché.
        const bwAt = d.blackWhite ? Math.max(0, d.deletions.filter((x) => x.t <= d.blackWhite.t + 1000).length - 1) : -1;
        const penAt = d.penalties.length ? Math.max(0, d.deletions.filter((x) => x.t <= d.penalties[0].t + 1000).length - 1) : -1;
        const pips = Array.from({ length: Math.max(race ? 4 : 3, n) }, (_, i) => {
          const cls = i < n ? `on${i === bwAt ? ' bw' : ''}${i === penAt ? ' pen' : ''}` : '';
          return `<i class="${cls}" title="${i < n ? `Infraction ${i + 1}${i === bwAt ? ' — drapeau noir et blanc' : ''}${i === penAt ? ' — pénalité' : ''}` : ''}"></i>`;
        }).join('');
        const turns = [...new Set(d.deletions.map((x) => x.turn))].sort((a, b) => a - b).map((t) => `V${t}`).join(', ');
        const last = d.deletions.at(-1);
        const status = d.penalties.length ? `<b style="color:var(--red)">${esc(d.penalties.map((p) => p.label).join(', '))}</b>`
          : d.blackWhite ? '<b>Drapeau noir et blanc</b>'
          : race && n === 2 ? '<span class="muted">encore 1 avant l\'avertissement</span>' : '';
        const other = d.otherDeletions.length ? ` <span class="muted small" title="Temps supprimés pour une autre raison (double drapeau jaune…)">+${d.otherDeletions.length} autre(s)</span>` : '';
        return `<tr><td><span class="drv"><span class="drv-bar" style="background:${teamColor(dl[d.num])}"></span><b>${esc(dl[d.num]?.Tla || d.tla)}</b></span></td>
          <td><span class="pips">${pips}</span> ${n}${other}</td><td>${esc(turns) || '—'}</td>
          <td>${last ? `T${last.lap}${last.time ? ` (${esc(last.time)})` : ''}` : '—'}</td><td>${status}</td></tr>`;
      }).join('')}</table>
      ${tlDoc ? `<p class="note"><a class="fia-doc" href="${esc(tlDoc.url)}" target="_blank" rel="noopener">📄 Document FIA : ${esc(tlDoc.title.replace(/^Doc \d+ - /, ''))} ↗</a></p>` : ''}
      <p class="note">${race ? 'En course, la direction de course montre en général le drapeau noir et blanc après la 3e infraction ; les suivantes sont transmises aux commissaires (pénalité possible). ' : 'Hors course, un temps supprimé ne compte pas pour le classement. '}« Tour supprimé (PIT) » : infraction pendant un tour qui se termine aux stands.</p>`
    : '<div class="note">Aucun temps supprimé pour limites de piste.</div>';
}

export function initStewards() {
  for (const r of document.querySelectorAll('input[name=stwFilter]')) r.addEventListener('change', () => { stwRenderKey = ''; renderStewards(); });
}
