// Lumières connectées (expérimental) : couleur des drapeaux sur les ampoules (Philips Hue, Home
// Assistant) ou en simulation à l'écran (lueur sur les bords), au rythme du délai TV. Seule la
// fenêtre principale de l'ordinateur commande les lampes.
import { store } from '../store.js';
import { $, esc, api } from '../util.js';
import { toast } from './delay.js';
import { lightState } from '/shared/lights-state.js';

const COLORS = { green: '#00DC46', yellow: '#FFC800', sc: '#FF7800', vsc: '#FF7800', red: '#FF0000', chequered: '#FFFFFF' };
let info = { provider: 'off', after: 'normal' };
let key = '';
let since = Date.now();
let sent = null;

const main = () => !new URLSearchParams(location.search).has('win') && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function current() {
  const s = store.state;
  const k = `${s.TrackStatus?.Status || ''}|${s.SessionStatus?.Status || ''}`;
  if (k !== key) { key = k; since = Date.now(); }
  return lightState(s.TrackStatus?.Status, s.SessionStatus?.Status, Date.now() - since, info.after);
}

function glow(state) {
  const el = $('#lightGlow');
  const show = info.provider === 'sim' && COLORS[state];
  el.hidden = !show;
  if (show) {
    el.style.setProperty('--lg', COLORS[state]);
    el.classList.toggle('blink', ['sc', 'red', 'chequered'].includes(state));
  }
}

async function tick() {
  if (info.provider === 'off') { glow(null); return; }
  const st = current();
  glow(st);
  if ((info.provider === 'hue' || info.provider === 'ha') && st !== sent) {
    sent = st;
    try { await api('/api/lights/set', { method: 'POST', body: { state: st } }); } catch (err) { console.warn('[lumières]', err.message); }
  }
}

// ---------- Réglages ----------
function renderSettings() {
  const box = $('#lightsBox');
  if (!box) return;
  $('#lightsProvider').value = info.provider;
  $('#lightsAfter').value = info.after;
  box.querySelector('[data-lp="hue"]').hidden = info.provider !== 'hue';
  box.querySelector('[data-lp="ha"]').hidden = info.provider !== 'ha';
  box.querySelector('[data-lp="test"]').hidden = info.provider === 'off';
  $('#hueIp').value = info.hue?.ip || '';
  $('#hueState').textContent = info.hue?.paired ? 'Pont associé' : 'Pont pas encore associé';
  $('#haUrl').value = info.ha?.url || '';
  $('#haToken').placeholder = info.ha?.hasToken ? 'Jeton enregistré (laisser vide pour le garder)' : 'Jeton d\'accès longue durée';
}

async function refresh() {
  try { info = await api('/api/lights'); } catch { info = { provider: 'off', after: 'normal' }; }
  renderSettings();
}

async function saveConf(patch) {
  try { info = await api('/api/lights', { method: 'POST', body: patch }); sent = null; renderSettings(); } catch (err) { toast(err.message, 5000); }
}

async function loadDevices() {
  const list = $('#lightsDevices');
  list.innerHTML = '<span class="muted small">Recherche des lampes…</span>';
  try {
    const { devices } = await api('/api/lights/devices');
    const chosen = new Set(info.provider === 'hue' ? info.hue?.lights || [] : info.ha?.entities || []);
    list.innerHTML = devices.length ? devices.map((d) => `<label class="toggle small"><input type="checkbox" value="${esc(d.id)}" ${chosen.has(d.id) ? 'checked' : ''}> ${esc(d.name)}</label>`).join('') : '<span class="muted small">Aucune lampe trouvée.</span>';
  } catch (err) {
    list.innerHTML = `<span class="muted small">${esc(err.message)}</span>`;
  }
}

function initSettings() {
  const box = $('#lightsBox');
  if (!box) return;
  if (!main()) { box.hidden = true; return; }
  $('#lightsProvider').addEventListener('change', (e) => saveConf({ provider: e.target.value }));
  $('#lightsAfter').addEventListener('change', (e) => saveConf({ after: e.target.value }));
  $('#hueFind').addEventListener('click', async () => {
    try {
      const { bridges } = await api('/api/lights/discover', { method: 'POST', body: {} });
      if (!bridges.length) { toast('Aucun pont Hue trouvé : saisissez son adresse IP', 5000); return; }
      $('#hueIp').value = bridges[0];
      saveConf({ hue: { ip: bridges[0] } });
    } catch (err) { toast(`Recherche impossible : ${err.message}`, 5000); }
  });
  $('#huePair').addEventListener('click', async () => {
    try { info = await api('/api/lights/pair', { method: 'POST', body: { ip: $('#hueIp').value } }); renderSettings(); toast('Pont Hue associé', 3000, 'check'); loadDevices(); } catch (err) { toast(err.message, 6000); }
  });
  $('#haSave').addEventListener('click', () => saveConf({ ha: { url: $('#haUrl').value, token: $('#haToken').value } }).then(() => { $('#haToken').value = ''; loadDevices(); }));
  $('#lightsLoad').addEventListener('click', loadDevices);
  $('#lightsDevices').addEventListener('change', () => {
    const ids = [...$('#lightsDevices').querySelectorAll('input:checked')].map((i) => i.value);
    saveConf(info.provider === 'hue' ? { hue: { lights: ids } } : { ha: { entities: ids } });
  });
  box.querySelector('[data-lp="test"]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-light-test]');
    if (!b) return;
    const st = b.dataset.lightTest;
    if (info.provider === 'sim') { glow(st); setTimeout(() => tick(), 3000); return; }
    try { await api('/api/lights/set', { method: 'POST', body: { state: st, force: true } }); sent = null; } catch (err) { toast(`Lampes injoignables : ${err.message}`, 6000); }
  });
  refresh();
}

export function initLights() {
  const g = document.createElement('div');
  g.id = 'lightGlow';
  g.className = 'light-glow';
  g.hidden = true;
  document.body.appendChild(g);
  initSettings();
  if (!main()) return;
  setInterval(tick, 1000);
}
