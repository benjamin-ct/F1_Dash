// Direction de course, radios d'équipe, arrêts aux stands.
import { store, versionOf } from '../store.js';
import { $, esc, drivers, teamColor, fmtClock, fmtLap } from '../util.js';
import { parseUtc, parseLapTime } from '/shared/f1.js';

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
  const v = versionOf(['TeamRadio', 'DriverList', '__reset']);
  if (v === radioVer) return;
  radioVer = v;
  const dl = drivers(store.state);
  const base = store.state.SessionInfo?.Path ? `https://livetiming.formula1.com/static/${store.state.SessionInfo.Path}` : null;
  const caps = list(store.state.TeamRadio?.Captures).slice().sort((a, b) => parseUtc(b.Utc) - parseUtc(a.Utc));
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
