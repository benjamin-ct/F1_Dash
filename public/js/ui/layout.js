// Disposition : agrandir / masquer / détacher un panneau (mode deux écrans), colonnes du classement.
import { $, $$, esc } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { on } from '../store.js';

export const PANELS = [
  { id: 'tower', cls: 'p-tower', name: 'Classement' },
  { id: 'map', cls: 'p-map', name: 'Circuit' },
  { id: 'feed', cls: 'p-feed', name: 'Direction de course / radios / arrêts' },
  { id: 'duel', cls: 'p-duel', name: 'Duel' },
  { id: 'extra', cls: 'p-extra', name: 'Télémétrie / stratégie / pneus…' },
];

export const COLUMNS = [
  ['int', 'Intervalle'], ['last', 'Dernier tour'], ['best', 'Meilleur tour'], ['sec', 'Secteurs'], ['pred', 'Tour en cours (qualifs)'],
  ['q', 'Q1/Q2/Q3'], ['tyre', 'Pneus'], ['pits', 'Arrêts / tours'], ['speed', 'Speed trap'], ['duel', 'Boutons duel'],
];

const solo = new URLSearchParams(location.search).get('panel');

// Panneaux ouverts dans une autre fenêtre (second écran) : retirés de la fenêtre principale
// tant que leur fenêtre est ouverte. Les fenêtres se signalent via un BroadcastChannel.
const detached = new Map(); // id -> dernier signe de vie
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('f1dash-panels') : null;

function isHidden(id) {
  return prefs.hiddenPanels.includes(id) || detached.has(id);
}

function panelEl(id) {
  return $(`.${PANELS.find((p) => p.id === id).cls}`);
}

function applyVisibility() {
  const grid = $('.grid');
  for (const p of PANELS) panelEl(p.id).classList.toggle('hidden-panel', !solo && isHidden(p.id));
  // Recompose la grille (grand écran) pour que les panneaux restants occupent la place libérée.
  const vis = (id) => !isHidden(id);
  if (solo || !PANELS.some((p) => isHidden(p.id)) || window.innerWidth <= 1500) {
    grid.style.gridTemplateColumns = grid.style.gridTemplateAreas = grid.style.gridTemplateRows = '';
    return;
  }
  const cols = [];
  if (vis('tower')) cols.push({ w: '1.6fr', top: 'tower', bottom: 'tower' });
  const col = (a, b, w) => {
    if (vis(a) && vis(b)) cols.push({ w, top: a, bottom: b });
    else if (vis(a)) cols.push({ w, top: a, bottom: a });
    else if (vis(b)) cols.push({ w, top: b, bottom: b });
  };
  col('map', 'feed', '1fr');
  col('duel', 'extra', '.95fr');
  if (!cols.length) return;
  grid.style.gridTemplateColumns = cols.map((c) => `minmax(0, ${c.w})`).join(' ');
  grid.style.gridTemplateAreas = `"${cols.map((c) => c.top).join(' ')}" "${cols.map((c) => c.bottom).join(' ')}"`;
}

function maximize(id) {
  const grid = $('.grid');
  const el = panelEl(id);
  const on_ = !el.classList.contains('maximized');
  for (const p of $$('.grid > .panel')) p.classList.remove('maximized');
  el.classList.toggle('maximized', on_);
  grid.classList.toggle('has-max', on_);
}

export function initLayout() {
  if (solo && PANELS.some((p) => p.id === solo)) {
    document.body.classList.add('solo');
    panelEl(solo).classList.add('solo-panel');
    document.title = `F1 Dash · ${PANELS.find((p) => p.id === solo).name}`;
    const alive = () => channel?.postMessage({ type: 'alive', panel: solo });
    alive();
    setInterval(alive, 1000);
    window.addEventListener('pagehide', () => channel?.postMessage({ type: 'closed', panel: solo }));
  } else if (channel) {
    channel.onmessage = (e) => {
      const { type, panel } = e.data || {};
      if (!PANELS.some((p) => p.id === panel)) return;
      const was = detached.has(panel);
      if (type === 'alive') detached.set(panel, Math.max(Date.now(), detached.get(panel) || 0));
      if (type === 'closed') detached.delete(panel);
      if (was !== detached.has(panel)) applyVisibility();
    };
    // Fenêtre fermée brutalement : plus de signe de vie depuis 3,5 s -> le panneau revient.
    setInterval(() => {
      let changed = false;
      for (const [id, t] of detached) if (Date.now() - t > 3500) { detached.delete(id); changed = true; }
      if (changed) applyVisibility();
    }, 1000);
  }
  for (const p of PANELS) {
    const head = panelEl(p.id).querySelector('.panel-head');
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-ctrl';
    ctrl.innerHTML = solo ? `<button data-act="back" title="Remettre ce panneau dans la fenêtre principale">↙ Remettre</button>` : `<button data-act="max" title="Agrandir / réduire (Échap)">⤢</button><button data-act="pop" title="Ouvrir dans une nouvelle fenêtre (second écran)">↗</button><button data-act="hide" title="Masquer ce panneau (réaffichable dans ⚙ Réglages)">✕</button>`;
    head.appendChild(ctrl);
    ctrl.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'max') maximize(p.id);
      if (act === 'back') window.close();
      if (act === 'pop') {
        const w = window.open(`/?panel=${p.id}`, `f1dash-${p.id}`, 'width=1000,height=750');
        if (w) {
          if (panelEl(p.id).classList.contains('maximized')) maximize(p.id);
          detached.set(p.id, Date.now() + 5000); // délai de chargement de la nouvelle fenêtre
          applyVisibility();
          // Filet de sécurité si le BroadcastChannel n'est pas disponible
          const timer = setInterval(() => {
            if (w.closed) { clearInterval(timer); detached.delete(p.id); applyVisibility(); }
          }, 700);
        }
      }
      if (act === 'hide') setPref('hiddenPanels', [...new Set([...prefs.hiddenPanels, p.id])]);
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('.grid').classList.contains('has-max') && !document.querySelector('dialog[open]')) maximize($('.panel.maximized') ? PANELS.find((p) => panelEl(p.id).classList.contains('maximized')).id : 'map');
  });
  window.addEventListener('resize', applyVisibility);
  on('prefs', (k) => { if (k === 'hiddenPanels') { applyVisibility(); renderLayoutOptions(); } });
  applyVisibility();
  renderLayoutOptions();
}

export function renderLayoutOptions() {
  $('#panelOpts').innerHTML = PANELS.map((p) => `<label class="toggle small"><input type="checkbox" data-panel="${p.id}" ${prefs.hiddenPanels.includes(p.id) ? '' : 'checked'}> ${esc(p.name)}</label>`).join('');
  $('#panelOpts').onchange = (e) => {
    const id = e.target.dataset.panel;
    if (!id) return;
    setPref('hiddenPanels', e.target.checked ? prefs.hiddenPanels.filter((x) => x !== id) : [...prefs.hiddenPanels, id]);
  };
  $('#colOpts').innerHTML = COLUMNS.map(([k, name]) => `<label class="toggle small"><input type="checkbox" data-col="${k}" ${prefs.hiddenCols.includes(k) ? '' : 'checked'}> ${esc(name)}</label>`).join('');
  $('#colOpts').onchange = (e) => {
    const k = e.target.dataset.col;
    if (!k) return;
    setPref('hiddenCols', e.target.checked ? prefs.hiddenCols.filter((x) => x !== k) : [...prefs.hiddenCols, k]);
  };
}
