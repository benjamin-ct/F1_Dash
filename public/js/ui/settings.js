// Réglages : choix live / replay, jeton F1 TV, barre de contrôle du replay.
import { store, serverNow, on } from '../store.js';
import { $, $$, esc, api, fmtDuration } from '../util.js';
import { toast } from './delay.js';

let archive = [];
let dragging = false;

async function loadYear(year) {
  $('#rpMeeting').innerHTML = '<option>Chargement…</option>';
  $('#rpSession').innerHTML = '';
  try {
    archive = await api(`/api/archive?year=${year}`);
  } catch (err) {
    archive = [];
    $('#rpMsg').textContent = err.message;
  }
  const meetings = archive.filter((m) => m.sessions.length);
  $('#rpMeeting').innerHTML = meetings.map((m, i) => `<option value="${i}">${esc(m.name)} (${esc(m.location || '')})</option>`).join('');
  $('#rpMeeting').value = String(meetings.length - 1);
  archive = meetings;
  fillSessions();
}

function fillSessions() {
  const m = archive[Number($('#rpMeeting').value)];
  const sessions = m?.sessions || [];
  $('#rpSession').innerHTML = sessions.map((s, i) => `<option value="${i}">${esc(s.name)} — ${esc((s.start || '').slice(0, 10))}</option>`).join('');
  $('#rpSession').value = String(Math.max(0, sessions.length - 1));
}

async function refreshAuth() {
  try {
    const a = await api('/api/auth');
    const el = $('#tokenStatus');
    if (!a.hasToken) el.innerHTML = '<span class="muted">Aucun jeton enregistré : positions estimées en live.</span>';
    else if (a.expired) el.innerHTML = '<span style="color:var(--orange)">⚠ Jeton expiré : recollez un jeton récent.</span>';
    else {
      const exp = a.expiresAt ? new Date(a.expiresAt).toLocaleString('fr-FR') : 'inconnue';
      const live = store.status?.source?.authenticated;
      el.innerHTML = `<span style="color:var(--green)">✔ Jeton enregistré</span> · expire le ${esc(exp)}${store.status?.source?.mode === 'live' ? (live ? ' · GPS reçu ✔' : ' · GPS pas encore reçu (normal hors session)') : ''}`;
    }
  } catch { /* ignore */ }
}

function renderReplayBar() {
  const src = store.status?.source;
  const bar = $('#replayBar');
  const active = src?.mode === 'replay' && !src.loading && !src.error;
  bar.hidden = !active;
  if (!active) return;
  const pos = serverNow() - store.delay - src.anchor;
  const range = $('#rpRange');
  range.max = String(src.duration);
  if (!dragging) range.value = String(Math.max(0, pos));
  const rel = pos - (src.sessionStart || 0);
  $('#rpTime').textContent = `${rel >= 0 ? 'Départ +' : 'Départ −'}${fmtDuration(Math.abs(rel))} · ${fmtDuration(pos)} / ${fmtDuration(src.duration)}`;
  $('#rpPlay').textContent = store.status.paused ? '▶' : '❚❚';
  $('#rpPlay').title = store.status.paused ? 'Reprendre' : 'Pause';
}

async function control(body) {
  try { await api('/api/replay/control', { method: 'POST', body }); } catch (err) { toast(err.message); }
}

export function initSettings() {
  const modal = $('#settingsModal');
  $('#settingsBtn').addEventListener('click', () => { modal.showModal(); refreshAuth(); });
  $('#sourceBadge').addEventListener('click', () => { modal.showModal(); refreshAuth(); });

  const now = new Date().getFullYear();
  $('#rpYear').innerHTML = Array.from({ length: now - 2018 + 1 }, (_, i) => now - i).map((y) => `<option>${y}</option>`).join('');
  $('#rpYear').addEventListener('change', (e) => loadYear(e.target.value));
  $('#rpMeeting').addEventListener('change', fillSessions);
  let yearLoaded = false;
  modal.addEventListener('toggle', () => { if (modal.open && !yearLoaded) { yearLoaded = true; loadYear(now); } });
  // Compatibilité navigateurs sans évènement "toggle" sur <dialog>
  $('#settingsBtn').addEventListener('click', () => { if (!yearLoaded) { yearLoaded = true; loadYear(now); } });
  $('#sourceBadge').addEventListener('click', () => { if (!yearLoaded) { yearLoaded = true; loadYear(now); } });

  $('#goLive').addEventListener('click', async () => {
    await api('/api/live', { method: 'POST' }).catch((err) => toast(err.message));
    modal.close();
    toast('Connexion au flux live…');
  });

  $('#goReplay').addEventListener('click', async () => {
    const m = archive[Number($('#rpMeeting').value)];
    const sess = m?.sessions[Number($('#rpSession').value)];
    if (!sess) return;
    const begin = $$('input[name=rpStartAt]').find((i) => i.checked)?.value === 'begin';
    try {
      await api('/api/replay', { method: 'POST', body: { path: sess.path, ...(begin ? { startOffsetMs: 0 } : {}) } });
      modal.close();
      toast(`Chargement du replay : ${m.name} — ${sess.name}`, 4000);
    } catch (err) {
      $('#rpMsg').textContent = err.message;
    }
  });

  $('#tokenSave').addEventListener('click', async () => {
    try {
      await api('/api/auth', { method: 'POST', body: { token: $('#tokenInput').value } });
      $('#tokenInput').value = '';
      toast('Jeton F1 TV enregistré, reconnexion au flux…');
    } catch (err) { toast(err.message, 5000); }
    refreshAuth();
  });
  $('#tokenClear').addEventListener('click', async () => {
    await api('/api/auth', { method: 'DELETE' }).catch(() => {});
    refreshAuth();
  });

  // Barre de replay
  $('#rpPlay').addEventListener('click', () => control({ action: store.status?.paused ? 'resume' : 'pause' }));
  $('#replayBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-skip]');
    if (b) control({ action: 'skip', deltaMs: Number(b.dataset.skip) });
  });
  $('#rpStart').addEventListener('click', () => {
    const src = store.status?.source;
    if (src) control({ action: 'seek', toMs: (src.sessionStart || 0) + store.delay });
  });
  const range = $('#rpRange');
  range.addEventListener('input', () => { dragging = true; });
  range.addEventListener('change', () => {
    dragging = false;
    control({ action: 'seek', toMs: Number(range.value) + store.delay });
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, select, textarea, button') && store.status?.source?.mode === 'replay') {
      e.preventDefault();
      control({ action: store.status?.paused ? 'resume' : 'pause' });
    }
  });

  on('status', renderReplayBar);
  setInterval(renderReplayBar, 250);
}
