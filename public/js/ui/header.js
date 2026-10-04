// En-tête : session, drapeau/état de la piste, tour, temps restant, météo, source.
import { store, f1Now, versionOf } from '../store.js';
import { $, esc, fmtDuration, sessionKind, currentStint } from '../util.js';
import { trackStatusInfo, SESSION_STATUS_FR, parseUtc, parseLapTime } from '/shared/f1.js';

let lastVer = -1;

export function renderHeader() {
  const s = store.state;
  const v = versionOf(['SessionInfo', 'TrackStatus', 'SessionStatus', 'LapCount', 'WeatherData', 'TimingData', 'TimingAppData', 'RaceControlMessages', '__reset']);
  if (v !== lastVer) {
    lastVer = v;
    const info = s.SessionInfo;
    const kind = sessionKind(s);
    $('#sessionName').textContent = info ? `${info.Meeting?.Name || ''} — ${info.Name || ''}` : (store.connected ? 'En attente de données…' : 'Connexion au serveur…');
    const status = s.SessionStatus?.Status || info?.SessionStatus;
    $('#sessionSub').textContent = info
      ? [info.Meeting?.Circuit?.ShortName, info.Meeting?.Country?.Name, status ? SESSION_STATUS_FR[status] || status : null].filter(Boolean).join(' · ')
      : '';
    document.title = info ? `F1 Dash · ${info.Meeting?.Name || ''} ${info.Name || ''}` : 'F1 Dash';

    // Drapeau / état de piste
    const ts = $('#trackStatus');
    const finished = status === 'Finished' || status === 'Finalised' || status === 'Ends';
    let cls = 'none', label = '—';
    if (finished) { cls = 'chequered'; label = 'Arrivée'; }
    else if (status === 'Aborted') { cls = 'red'; label = 'Interrompue'; }
    else if (s.TrackStatus?.Status) {
      const ti = trackStatusInfo(s.TrackStatus.Status);
      cls = ti.color; label = ti.short === 'VERT' ? 'Drapeau vert' : ti.label;
    }
    ts.className = `track-status ${cls}`;
    ts.querySelector('.ts-label').textContent = label;

    // Tour / partie de qualif
    if (kind === 'race') {
      $('#lapLabel').textContent = 'Tour';
      const lc = s.LapCount;
      $('#lapValue').textContent = lc?.CurrentLap ? `${lc.CurrentLap}${lc.TotalLaps ? ' / ' + lc.TotalLaps : ''}` : '—';
      // Tours restants (le tour en cours compte comme restant à finir)
      const left = lc?.TotalLaps && lc?.CurrentLap ? Math.max(0, Number(lc.TotalLaps) - Number(lc.CurrentLap) + (finished ? 0 : 1)) : null;
      $('#lapsLeftBox').hidden = left === null;
      if (left !== null) $('#lapsLeft').textContent = finished ? '0' : String(left);
    } else if (kind === 'quali') {
      $('#lapsLeftBox').hidden = true;
      $('#lapLabel').textContent = 'Partie';
      const part = s.TimingData?.SessionPart;
      const sprint = /sprint/i.test(info?.Name || '');
      $('#lapValue').textContent = part ? `${sprint ? 'SQ' : 'Q'}${part}` : '—';
    } else {
      $('#lapsLeftBox').hidden = true;
      $('#lapLabel').textContent = 'Session';
      $('#lapValue').textContent = info?.Name?.replace('Practice', 'EL') || '—';
    }

    // Météo compacte
    const w = s.WeatherData;
    $('#weatherMini').innerHTML = w ? `
      <div class="wm"><span class="muted">Air</span><b>${esc(w.AirTemp)}°</b></div>
      <div class="wm"><span class="muted">Piste</span><b>${esc(w.TrackTemp)}°</b></div>
      <div class="wm"><span class="muted">Pluie</span><b>${w.Rainfall === '1' || w.Rainfall === 1 ? '🌧 Oui' : 'Non'}</b></div>` : '';
    const surf = trackSurface(s);
    const sb = $('#surfaceBox');
    sb.hidden = !surf;
    if (surf) {
      sb.className = `hstat surface ${surf.cls}`;
      sb.title = surf.why;
      $('#surfaceValue').textContent = surf.label;
    }
  }

  renderBanner();

  // Temps restant (recalculé à chaque image)
  const ec = s.ExtrapolatedClock;
  let txt = '—';
  if (ec?.Remaining) {
    let rem = parseLapTime(ec.Remaining) * 1000;
    if (ec.Extrapolating) rem -= f1Now() - parseUtc(ec.Utc);
    txt = fmtDuration(Math.max(0, rem));
  }
  const cv = $('#clockValue');
  if (cv.textContent !== txt) cv.textContent = txt;
}

// État de la piste : déclaration de la direction de course (« TRACK DECLARED WET / DRY ») et
// pneus utilisés en piste (intermédiaires / pluie), complétés par le capteur de pluie.
export function trackSurface(s) {
  if (!s.SessionInfo) return null;
  let declared = null;
  const msgs = s.RaceControlMessages?.Messages;
  const arr = Array.isArray(msgs) ? msgs : Object.values(msgs || {});
  for (const m of arr) {
    const t = String(m?.Message || '').toUpperCase();
    if (/DECLARED WET|WET RACE|WET TRACK|TRACK IS WET|WET SESSION/.test(t)) declared = 'wet';
    else if (/DECLARED DRY|DRY RACE|DRY TRACK|TRACK IS DRY/.test(t)) declared = 'dry';
  }
  const lines = s.TimingData?.Lines || {};
  const apps = s.TimingAppData?.Lines || {};
  let wet = 0, total = 0;
  for (const [num, l] of Object.entries(lines)) {
    if (l?.Retired || l?.Stopped || l?.KnockedOut) continue;
    const c = currentStint(apps[num])?.Compound;
    if (!c || c === 'UNKNOWN') continue;
    total++;
    if (c === 'INTERMEDIATE' || c === 'WET') wet++;
  }
  const rain = s.WeatherData?.Rainfall === '1' || s.WeatherData?.Rainfall === 1;
  const share = total ? wet / total : 0;
  const tyres = total ? `${wet}/${total} voitures en pneus pluie/intermédiaires` : 'pneus inconnus';
  if (declared === 'wet' || share >= 0.5) {
    return { cls: 'wet', label: share >= 0.5 && s.TimingAppData ? 'Mouillée' : 'Humide', why: `Piste mouillée${declared === 'wet' ? ' (déclarée par la direction de course)' : ''} · ${tyres}${rain ? ' · pluie en cours' : ''}` };
  }
  if (share > 0 || rain) {
    return { cls: 'damp', label: 'Mixte', why: `Conditions changeantes · ${tyres}${rain ? ' · pluie en cours' : ''}` };
  }
  return { cls: 'dry', label: 'Sèche', why: `Piste sèche${declared === 'dry' ? ' (déclarée par la direction de course)' : ''} · ${tyres}` };
}

export function renderSource() {
  const st = store.status;
  const badge = $('#sourceBadge');
  const lbl = $('#sourceLabel');
  if (!store.connected) {
    badge.className = 'source-badge error';
    lbl.textContent = 'Serveur déconnecté';
    return;
  }
  const src = st?.source || {};
  if (src.mode === 'replay') {
    badge.className = 'source-badge replay';
    lbl.textContent = src.loading ? `Chargement ${Math.round((src.progress || 0) * 100)} %` : (src.error ? 'Erreur replay' : 'REPLAY');
    badge.title = src.error || src.session || '';
  } else if (src.mode === 'live') {
    badge.className = `source-badge ${src.connected ? 'live' : 'error'}`;
    lbl.textContent = src.connected ? 'LIVE' : 'Connexion F1…';
    badge.title = src.error || (src.authenticated ? 'Flux live (avec GPS F1 TV)' : 'Flux live (sans GPS : positions estimées)');
  } else {
    badge.className = 'source-badge';
    lbl.textContent = 'Inactif';
  }
}

// Bandeau pleine largeur : SC, VSC, drapeau rouge (et drapeau vert à la reprise).
let bannerState = { status: null, greenUntil: 0 };

function renderBanner() {
  const st = String(store.state.TrackStatus?.Status || '');
  const session = store.state.SessionStatus?.Status;
  const now = performance.now();
  if (st !== bannerState.status) {
    if (st === '1' && ['4', '5', '6', '7'].includes(bannerState.status)) bannerState.greenUntil = now + 10000;
    bannerState.status = st;
  }
  const el = $('#flagBanner');
  let cls = null, text = '', sub = '';
  if (session === 'Started' || session === 'Aborted') {
    if (st === '5' || session === 'Aborted') { cls = 'red'; text = 'Drapeau rouge'; sub = 'Session interrompue'; }
    else if (st === '4') { cls = 'sc'; text = 'Safety car'; sub = 'Voiture de sécurité en piste'; }
    else if (st === '6') { cls = 'vsc'; text = 'Virtual safety car'; sub = 'Vitesse limitée sur tout le circuit'; }
    else if (st === '7') { cls = 'vsc'; text = 'Fin de VSC'; sub = 'Reprise imminente'; }
    else if (st === '2') { cls = 'yellow'; text = 'Drapeau jaune'; sub = 'Incident sur la piste'; }
    else if (st === '1' && now < bannerState.greenUntil) { cls = 'green'; text = 'Drapeau vert'; sub = 'Reprise de la course'; }
  }
  if (!cls) { if (!el.hidden) el.hidden = true; return; }
  const key = `${cls}|${text}`;
  if (el._k !== key) {
    el._k = key;
    el.className = `flag-banner ${cls}`;
    el.querySelector('.fb-text').textContent = text;
    el.querySelector('.fb-sub').textContent = sub;
  }
  el.hidden = false;
}
