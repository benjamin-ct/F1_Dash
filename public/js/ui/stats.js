// Statistiques d'utilisation anonymes (avec accord) : les fonctions utilisées dans cette fenêtre sont
// comptées puis confiées au serveur de l'appli, qui envoie les totaux. Question posée une fois sur
// l'ordinateur ; réglage dans Réglages → Application.
import { $ } from '../util.js';
import { t, EN } from '../i18n.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';

let on = null;   // null tant que le réglage n'est pas connu : les événements attendent
const queue = new Map();
let timer = null;
let errors = 0;

const device = () => (window.f1desktop ? 'desktop' : document.querySelector('.grid.mobile') ? 'phone' : 'browser');

function send() {
  clearTimeout(timer);
  timer = null;
  if (!on || !queue.size) return;
  const events = Object.fromEntries(queue);
  queue.clear();
  fetch('/api/stats/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, device: device() }) }).catch(() => {});
}

export function track(name) {
  if (on === false || !/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(name)) return;
  queue.set(name, (queue.get(name) || 0) + 1);
  if (on && !timer) timer = setTimeout(send, 60e3);
}

// Clics suivis sans toucher aux modules : barre latérale, onglets, réglages, sections Saison
const CLICKS = [
  ['#rail [data-rail]', (b) => (b.dataset.rail === 'posts' ? null : `rail.${b.dataset.rail}`)],
  ['#setNav [data-sgroup]', (b) => `settings.${b.dataset.sgroup}`],
  ['#szNav [data-sz]', (b) => `season.${b.dataset.sz}`],
  ['.panel [data-tab]', (b) => `tab.${b.dataset.tab}`],
  ['[data-track]', (b) => b.dataset.track],
  ['#asStart', () => 'feature.autosync'],
  ['#backupExport', () => 'feature.backup'],
  ['#icsSeason', () => 'feature.reminders'],
];
const CHANGES = [
  ['#lanEnabled', (el) => (el.checked ? 'feature.lan' : null)],
  ['#lightsProvider', (el) => (el.value && el.value !== 'none' ? 'feature.lights' : null)],
  ['#remindSel', (el) => (el.value && el.value !== '0' ? 'feature.reminders' : null)],
];

function listen() {
  document.addEventListener('click', (e) => {
    for (const [sel, name] of CLICKS) {
      const el = e.target.closest?.(sel);
      if (el) { const n = name(el); if (n) track(n); return; }
    }
  }, true);
  document.addEventListener('change', (e) => {
    for (const [sel, name] of CHANGES) {
      if (e.target.matches?.(sel)) { const n = name(e.target); if (n) track(n); }
    }
  }, true);
  // Erreurs de l'interface : seulement le fichier et la ligne (jamais le message, qui peut
  // contenir un nom de dossier ou un texte)
  const where = (file, line) => {
    const f = String(file || '').split(/[?#]/)[0].split('/').pop().replace(/[^a-z0-9._-]/gi, '').toLowerCase().slice(0, 40);
    return f ? `error.${f}:${Number(line) || 0}` : 'error.other';
  };
  window.addEventListener('error', (e) => { if (errors++ < 20) track(where(e.filename, e.lineno)); });
  window.addEventListener('unhandledrejection', (e) => {
    const m = String(e.reason?.stack || '').match(/\/([\w.-]+\.js):(\d+):\d+/);
    if (errors++ < 20) track(m ? where(m[1], m[2]) : 'error.other');
  });
  window.addEventListener('pagehide', send);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
}

async function setConsent(value) {
  const res = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: value }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
  return res.json();
}

function apply(state) {
  on = !!state.enabled;
  if (!on) queue.clear(); else if (queue.size && !timer) timer = setTimeout(send, 5000);
  const box = $('#statsOn');
  if (box) box.checked = on;
}

const STATS_TEXT = "Paddock Live peut envoyer des statistiques d'utilisation anonymes pour savoir quelles fonctions servent le plus ou le moins : panneaux, onglets et fonctions utilisés, version de l'appli, système (Windows, macOS, Linux), ordinateur ou téléphone, direct ou replay, et les erreurs rencontrées.";
const STATS_PRIVACY = "Rien qui permette de vous identifier : ni compte F1 TV, ni identifiant, ni contenu, et l'adresse IP n'est pas conservée. Seuls des totaux par jour sont envoyés.";

function ask() {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal stats-dlg';
  dlg.innerHTML = `<div class="modal-head"><h3>${icon('chart')} ${t('Aider à améliorer Paddock Live ?')}</h3></div>
    <div class="stats-body">
      <p>${t(STATS_TEXT)}</p>
      <p class="small muted">${t(STATS_PRIVACY)}</p>
      <p class="small muted">${t('Modifiable à tout moment dans Réglages → Application.')}</p>
      <div class="row stats-actions">
        <button class="btn" data-no>${t('Non merci')}</button>
        <button class="btn btn-accent" data-yes>${t('Oui, envoyer les statistiques')}</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const answer = async (value) => {
    dlg.close();
    dlg.remove();
    try { apply(await setConsent(value)); } catch (err) { toast(err.message, 4000, 'warning'); }
    if (value) toast(t('Merci ! Statistiques anonymes activées'), 3000, 'check');
  };
  dlg.addEventListener('cancel', (e) => e.preventDefault());   // Échap : pas de réponse implicite
  $('[data-yes]', dlg).addEventListener('click', () => answer(true));
  $('[data-no]', dlg).addEventListener('click', () => answer(false));
  dlg.showModal();
}

export async function initStats() {
  listen();
  const main = !new URLSearchParams(location.search).has('win');   // pas les fenêtres détachées
  if (main) { track('app.open'); track(EN ? 'lang.en' : 'lang.fr'); }
  let state;
  try { state = await (await fetch('/api/stats')).json(); } catch { on = false; return; }
  apply(state);
  const block = $('#statsBlock');
  if (block) block.hidden = !state.available || !state.canSet;
  $('#statsOn')?.addEventListener('change', async (e) => {
    try { apply(await setConsent(e.target.checked)); } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 4000, 'warning'); }
  });
  // Première fois sur l'ordinateur : la question, une fois l'interface affichée
  if (state.available && state.canSet && !state.asked && main) setTimeout(ask, 4000);
}
