// Réglages : choix live / replay, jeton F1 TV, barre de contrôle du replay.
import { store, serverNow, on } from '../store.js';
import { $, $$, esc, api, fmtDuration, drivers, orderedNumbers } from '../util.js';
import { toast } from './delay.js';
import { prefs, toggleFav } from '../prefs.js';

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
  const speed = src.speed || 1;
  const pos = (serverNow() - store.delay - src.anchor) * speed;
  const sel = $('#rpSpeed');
  if (document.activeElement !== sel && Number(sel.value) !== speed) sel.value = String(speed);
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
  const open = () => { modal.showModal(); refreshAuth(); renderRecordings(); renderFavs(); };
  $('#settingsBtn').addEventListener('click', open);
  $('#sourceBadge').addEventListener('click', open);

  // Enregistrements locaux
  $('#recList').addEventListener('click', async (e) => {
    const play = e.target.closest('[data-play]');
    const del = e.target.closest('[data-del-rec]');
    try {
      if (play) {
        await api('/api/replay', { method: 'POST', body: { local: play.dataset.play } });
        modal.close();
        toast('Lecture de l\'enregistrement…');
      } else if (del && confirm('Supprimer définitivement cet enregistrement ?')) {
        await api(`/api/recordings?id=${encodeURIComponent(del.dataset.delRec)}`, { method: 'DELETE' });
        renderRecordings();
      }
    } catch (err) { toast(err.message); }
  });

  // Favoris
  $('#favList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (b) { toggleFav(b.dataset.fav); renderFavs(); }
  });

  // Jeton F1 TV en un clic : favori à glisser dans la barre du navigateur. Exécuté sur formula1.com,
  // il lit le cookie de session et revient sur le dashboard avec le jeton dans l'URL (#f1tv=…).
  const code = `(()=>{const c=document.cookie.split('; ').find(x=>x.startsWith('login-session='));if(!c){alert('F1 Dash : cookie introuvable. Connectez-vous sur formula1.com, ou utilisez la méthode manuelle.');return}location.href='${location.origin}/#f1tv='+encodeURIComponent(c.slice(14))})()`;
  $('#bookmarklet').href = `javascript:${code}`;
  $('#bookmarklet').addEventListener('click', (e) => { e.preventDefault(); toast('Glissez ce bouton dans votre barre de favoris, puis cliquez dessus depuis formula1.com', 5000); });
  const m = /[#&]f1tv=([^&]+)/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    api('/api/auth', { method: 'POST', body: { token: decodeURIComponent(m[1]) } })
      .then(() => toast('✅ Jeton F1 TV enregistré : GPS et télémétrie activés en live', 5000))
      .catch((err) => toast(err.message, 6000));
  }

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
    if (src) control({ action: 'seek', toMs: (src.sessionStart || 0) + store.delay * (src.speed || 1) });
  });
  const range = $('#rpRange');
  range.addEventListener('input', () => { dragging = true; });
  range.addEventListener('change', () => {
    dragging = false;
    control({ action: 'seek', toMs: Number(range.value) + store.delay * (store.status?.source?.speed || 1) });
  });
  $('#rpSpeed').addEventListener('change', (e) => control({ action: 'speed', speed: Number(e.target.value) }));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, select, textarea, button') && store.status?.source?.mode === 'replay') {
      e.preventDefault();
      control({ action: store.status?.paused ? 'resume' : 'pause' });
    }
  });

  on('status', renderReplayBar);
  setInterval(renderReplayBar, 250);
}

async function renderRecordings() {
  const el = $('#recList');
  try {
    const recs = await api('/api/recordings');
    el.innerHTML = recs.length ? recs.map((r) => `<div class="rec"><span class="rec-name" title="${esc(r.name)}">${esc(r.name)}</span>
      <span class="muted">${(r.size / 1e6).toFixed(1)} Mo</span>
      <button class="btn small" data-play="${esc(r.id)}">▶ Rejouer</button><button class="btn small" data-del-rec="${esc(r.id)}" title="Supprimer">🗑</button></div>`).join('')
      : '<span class="muted small">Aucun enregistrement pour l\'instant : ils se créent automatiquement pendant les sessions live.</span>';
  } catch (err) { el.textContent = err.message; }
}

function renderFavs() {
  const dl = drivers(store.state);
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  $('#favList').innerHTML = nums.length
    ? nums.map((n) => `<button class="fav ${prefs.favs.includes(n) ? 'on' : ''}" data-fav="${n}" title="${esc(dl[n].FullName || '')}">${esc(dl[n].Tla || n)}</button>`).join('')
    : '<span class="muted small">La liste des pilotes apparaît dès que des données sont reçues.</span>';
}
