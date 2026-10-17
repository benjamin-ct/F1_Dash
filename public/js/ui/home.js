// Page d'accueil, sans spoiler : prochaine séance (compte à rebours), dernière séance sans son
// résultat (replay depuis le début ou tableau de bord), dernières actualités, raccourcis.
// Ouverte au lancement quand aucune séance n'est en cours ; pendant une séance, l'appli s'ouvre
// directement sur le Direct.
import { $, $$, esc, api } from '../util.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { LOCALE, EN } from '../i18n.js';
import { toast } from './delay.js';

let schedule = null;   // [{ race, round, label, t }]
let archive = null;    // dernière séance rejouable { meeting, name, path, t }
let timer = 0;
let touched = false;   // l'utilisateur a quitté l'accueil : plus d'ouverture ou de fermeture automatique

// Durée approximative d'une séance (fenêtre « en cours »)
const LONG = /course|race|grand prix/i;
const lengthOf = (label) => (LONG.test(label) && !/sprint/i.test(label) ? 150 : 75) * 60e3;
const NAMES = { Race: 'Course', Qualifying: 'Qualifications', Sprint: 'Sprint', 'Sprint Qualifying': 'Qualifications sprint', 'Sprint Shootout': 'Qualifications sprint', 'Practice 1': 'Essais libres 1', 'Practice 2': 'Essais libres 2', 'Practice 3': 'Essais libres 3' };
const sessionName = (n) => (EN ? n : NAMES[n] || n);

async function loadSchedule() {
  const year = new Date().getFullYear();
  const races = [];
  for (const y of [year, year + 1]) {
    try { races.push(...(await api(`/api/schedule?year=${y}`)).races.map((r) => ({ ...r, year: y }))); } catch { /* hors ligne */ }
    if (races.some((r) => r.sessions.some((s) => Date.parse(s.t) > Date.now()))) break;
  }
  schedule = races.flatMap((r) => r.sessions.filter((s) => s.t).map((s) => ({ race: r.name, round: r.round, year: r.year, label: s.label, t: Date.parse(s.t) })))
    .sort((a, b) => a.t - b.t);
}

// Heure de début d'une séance des archives (heure locale du circuit + décalage)
function archiveStart(s) {
  const m = /^(-)?(\d+):(\d+)/.exec(s.gmtOffset || '');
  const off = m ? (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60e3 : 0;
  return Date.parse(`${s.start}Z`) - off;
}

async function loadArchive() {
  const year = new Date().getFullYear();
  for (const y of [year, year - 1]) {
    let list;
    try { list = await api(`/api/archive?year=${y}`); } catch { continue; }
    const done = list.flatMap((m) => m.sessions.map((s) => ({ meeting: m.name, name: s.name, path: s.path, t: archiveStart(s) })))
      .filter((s) => s.t && s.t + lengthOf(s.name) < Date.now()).sort((a, b) => a.t - b.t);
    if (done.length) { archive = done.at(-1); return; }
  }
}

// Dernière séance terminée : archives F1 (rejouable), sinon calendrier (archives réservées aux
// abonnés F1 TV)
function lastSession() {
  const s = schedule?.filter((x) => x.t + lengthOf(x.label) < Date.now()).at(-1);
  if (archive && (!s || archive.t >= s.t - 3600e3)) return archive;
  return s ? { meeting: s.race, name: s.label, t: s.t, path: null } : archive;
}

const liveNow = () => schedule?.find((s) => Date.now() >= s.t - 10 * 60e3 && Date.now() <= s.t + lengthOf(s.label));
const nextSession = () => schedule?.find((s) => s.t > Date.now());

function countdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60e3));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  return d ? `${d} j ${String(h).padStart(2, '0')} h ${String(min).padStart(2, '0')} min` : h ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
}
function ago(t) {
  const h = Math.max(0, (Date.now() - t) / 3600e3);
  if (h < 1) return 'il y a moins d\'une heure';
  if (h < 24) return `il y a ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} jours`;
}
const when = (t) => new Date(t).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const gp = (name) => name.replace(/ Grand Prix$/, '');

function render() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  const live = liveNow();
  const nx = nextSession();
  const card = live
    ? `<section class="hm-card hm-live"><div class="hm-kicker"><span class="hm-dot"></span>Séance en cours</div>
        <div class="hm-title">${esc(gp(live.race))} : ${esc(live.label)}</div>
        <div class="muted">Commencée à ${esc(new Date(live.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))}</div>
        <div class="hm-actions"><button class="btn btn-accent" data-home="live">${icon('signal')} Regarder en direct</button></div></section>`
    : `<section class="hm-card hm-next"><div class="hm-kicker">Prochaine séance</div>
        ${nx ? `<div class="hm-title"><span class="hm-round">R${nx.round}</span> ${esc(gp(nx.race))} : ${esc(nx.label)}</div>
        <div class="hm-count" id="hmCount">${countdown(nx.t - Date.now())}</div>
        <div class="muted">${esc(when(nx.t))}</div>
        <div class="hm-actions"><a class="btn small" href="/api/calendar.ics?year=${nx.year}&round=${nx.round}${EN ? '&lang=en' : ''}" download title="Séances de ce week-end dans votre agenda (Google, Apple, Outlook), avec une alarme 15 min avant">${icon('calendar')} Ajouter ce week-end à mon agenda</a></div>`
          : `<div class="hm-title">${schedule ? 'Saison terminée' : 'Calendrier en chargement…'}</div>`}</section>`;
  const ls = live ? null : lastSession();
  const last = ls
    ? `<section class="hm-card"><div class="hm-kicker">Dernière séance</div>
        <div class="hm-title">${esc(gp(ls.meeting))} : ${esc(sessionName(ls.name))}</div>
        <div class="muted">${esc(ago(ls.t))} · résultat masqué</div>
        <div class="hm-actions"><button class="btn btn-accent" data-home="replay">${icon('play')} Revoir en replay</button>
          <button class="btn" data-home="results" title="Ouvre le tableau de bord avec l'état final de la séance (résultat visible)">${icon('checkered')} Voir les résultats</button></div></section>`
    : '';
  view.querySelector('.hm-main').innerHTML = `<h1 class="hm-hello">Paddock Live</h1>
    <div class="hm-grid">${card}${last}</div>
    <section class="hm-card hm-news"><div class="hm-kicker">Dernières actus <button class="btn small" data-home="news">Toute l'actu ${icon('arrow-right', 'ic-s')}</button></div><div id="hmNews" class="hm-list"><div class="muted small">Chargement…</div></div></section>
    <nav class="hm-go">
      <button data-home="live">${icon('signal')}<b>Direct</b><small>Tableau de bord</small></button>
      <button data-home="season">${icon('trophy')}<b>Saison</b><small>Calendrier, classements</small></button>
      <button data-home="news">${icon('news')}<b>Actu</b><small>Toute l'actualité</small></button>
      <button data-home="replays">${icon('history')}<b>Replays</b><small>Rejouer une séance</small></button>
    </nav>`;
  news();
}

async function news() {
  const box = $('#hmNews');
  if (!box) return;
  try {
    const list = await (await import('./news.js')).latestNews(4);
    box.innerHTML = list.length ? list.map((n) => `<button class="hm-news-item" data-home="news"><span class="hm-news-t" data-no-i18n>${esc(n.title)}</span><span class="muted small"><span data-no-i18n>${esc(n.src)}</span> · <span>${esc(n.when)}</span></span></button>`).join('') : '<div class="muted small">Aucune actualité pour le moment.</div>';
  } catch { box.innerHTML = '<div class="muted small">Actualités indisponibles.</div>'; }
}

// Entre la barre du haut et, sur téléphone, la barre de navigation du bas
function place() {
  const view = $('#homeView');
  const nav = $('#mobNav');
  view.style.top = `${Math.round(document.querySelector('.topbar').getBoundingClientRect().bottom)}px`;
  view.style.bottom = nav && !nav.hidden ? `${nav.offsetHeight}px` : '';
}

// Téléphone : « Accueil » allumé dans la barre du bas tant que l'accueil est affiché
let mobPrev = null;
function markMob(open) {
  const btns = $$('#mobNav [data-mob]');
  if (open) mobPrev = btns.find((b) => b.classList.contains('active') && b.dataset.mob !== 'home')?.dataset.mob || mobPrev;
  for (const b of btns) b.classList.toggle('active', open ? b.dataset.mob === 'home' : b.dataset.mob === mobPrev);
}

export function openHome() {
  const view = $('#homeView');
  if (!view) return;
  import('./season.js').then((m) => m.closeSeason());
  import('./news.js').then((m) => m.closeNews());
  place();
  view.hidden = false;
  markMob(true);
  render();
  clearInterval(timer);
  timer = setInterval(() => {
    const nx = nextSession();
    if ($('#hmCount') && nx) $('#hmCount').textContent = countdown(nx.t - Date.now());
    // Séance qui commence pendant que l'accueil est affiché : carte « en cours »
    if (!!liveNow() !== !!$('#homeView .hm-live')) render();
  }, 30e3);
  document.dispatchEvent(new Event('viewchange'));
}

// Appli de bureau : fenêtres du second écran rouvertes au premier passage au tableau de bord
export function startWindows() {
  try { window.f1desktop?.openStartupWindows?.(); } catch { /* navigateur */ }
}

export function closeHome() {
  const view = $('#homeView');
  if (!view || view.hidden) return;
  view.hidden = true;
  markMob(false);
  clearInterval(timer);
  document.dispatchEvent(new Event('viewchange'));
}

export const isHomeOpen = () => !$('#homeView')?.hidden;

async function act(k) {
  touched = true;
  if (k === 'live' || k === 'results') { closeHome(); return; }
  // Saison et Actu ferment l'accueil elles-mêmes ; Replays : l'accueil reste derrière les réglages
  // jusqu'au lancement du replay
  if (k === 'season') { (await import('./season.js')).openSeason(); return; }
  if (k === 'news') { (await import('./news.js')).openNews(); return; }
  if (k === 'replays') { $('#settingsBtn').click(); $('#setNav [data-sgroup="source"]')?.click(); return; }
  if (k === 'replay') {
    const ls = lastSession();
    // Séance absente des archives (compte F1 TV non connecté) : choix du replay dans les réglages
    if (!ls?.path) { act('replays'); return; }
    try {
      await api('/api/replay', { method: 'POST', body: { path: ls.path, startOffsetMs: 0 } });
      closeHome();
      toast(`Chargement du replay : ${ls.meeting} — ${sessionName(ls.name)}`, 4000);
    } catch (err) { toast(err.message, 5000); }
  }
}

export function initHome() {
  const view = $('#homeView');
  // Fenêtres détachées (second écran) : pas d'accueil
  if (!view || new URLSearchParams(location.search).has('win')) return;
  addEventListener('resize', () => { if (isHomeOpen()) place(); });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-home]');
    if (b) act(b.dataset.home);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isHomeOpen() && !document.querySelector('dialog[open]')) { touched = true; closeHome(); } });
  // Au lancement : accueil, sauf replay déjà en cours (page rechargée) ou séance en direct
  if (store.status?.mode !== 'replay') openHome();
  // Replay lancé (ici ou depuis un autre écran) : place au tableau de bord
  let mode = store.status?.mode;
  on('status', (s) => {
    if (s?.mode === 'replay' && mode !== 'replay') closeHome();
    mode = s?.mode;
  });
  Promise.all([loadSchedule(), loadArchive()]).then(() => {
    if (!touched && liveNow() && isHomeOpen()) { closeHome(); return; }
    render();
  });
}

// Navigation ailleurs (Direct, Saison, Actu…) : l'accueil ne se rouvre ni ne se ferme plus tout seul
export function homeTouched() { touched = true; }
