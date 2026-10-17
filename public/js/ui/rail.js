// Barre de navigation latérale (Accueil, Direct, Analyse, Saison, Replays, Radios,
// Réglages). Elle reprend les actions des boutons du haut, masqués.
import { $, $$ } from '../util.js';
import { openSeason, closeSeason } from './season.js';
import { openNews, closeNews } from './news.js';
import { openHome, closeHome, homeTouched } from './home.js';
import { unmaximize, showPanelLarge, setFreeLayout, isFreeLayout, saveWindowsSnapshot, restoreWindowsSnapshot, hasWindowsSnapshot } from './layout.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';

function openSettings(group) {
  $('#settingsBtn').click();
  if (group) $(`#setNav [data-sgroup="${group}"]`)?.click();
}

const ACTIONS = {
  home: () => openHome(),
  live: () => { homeTouched(); closeHome(); closeSeason(); closeNews(); unmaximize(); },
  ana: () => {
    homeTouched();
    closeHome();
    closeSeason();
    closeNews();
    if (showPanelLarge('analysis') === 'elsewhere') toast('Analyse affichée en grand dans l\'autre fenêtre (second écran)');
  },
  season: () => { closeNews(); if ($('#seasonView').hidden) openSeason(); else closeSeason(); },
  news: () => ($('#newsView').hidden ? openNews() : closeNews()),
  replay: () => openSettings('source'),
  radio: () => $('#commBtn').click(),
  reset: (btn) => layoutMenu(btn),
  settings: () => openSettings(),
};

// Menu « Dispo. » : panneaux rangés en colonnes ou placés librement, réinitialisation
function layoutMenu(btn) {
  document.querySelector('.lpop-menu')?.remove();
  const free = isFreeLayout();
  const menu = document.createElement('div');
  menu.className = 'lpop-menu rail-menu';
  menu.innerHTML = `<button data-l="cols">${icon('columns')} Panneaux rangés en colonnes${free ? '' : icon('check', 'ic-on')}</button>
    <button data-l="free">${icon('move')} Disposition libre : panneaux n'importe où (poignée pour déplacer, coin pour redimensionner)${free ? icon('check', 'ic-on') : ''}</button>
    <div class="rail-sep"></div>
    <button data-l="save">${icon('save')} Enregistrer l'emplacement des fenêtres (panneaux, tailles, second écran)</button>
    <button data-l="restore" ${hasWindowsSnapshot() ? '' : 'disabled'}>${icon('undo')} Revenir à l'emplacement enregistré</button>
    <div class="rail-sep"></div>
    <button data-l="reset">${icon('refresh')} Réinitialiser l'interface</button>`;
  const r = btn.getBoundingClientRect();
  menu.style.left = `${r.right + 8}px`;
  document.body.appendChild(menu);
  menu.style.top = `${Math.max(8, Math.min(r.top - 40, innerHeight - menu.offsetHeight - 8))}px`;
  menu.addEventListener('click', (e) => {
    const k = e.target.closest('[data-l]')?.dataset.l;
    if (!k) return;
    menu.remove();
    if (k === 'reset') $('#resetUiBtn').click();
    else if (k === 'save') saveWindowsSnapshot();
    else if (k === 'restore') restoreWindowsSnapshot();
    else {
      unmaximize();
      setFreeLayout(k === 'free');
      toast(k === 'free' ? 'Disposition libre : glissez la poignée pour déplacer un panneau, son coin pour le redimensionner' : 'Panneaux rangés en colonnes', 2500, k === 'free' ? 'move' : 'columns');
    }
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}

// Élément actif : Saison ouverte, Analyse en grand, sinon Direct
function sync() {
  const season = !$('#seasonView').hidden;
  const news = !$('#newsView').hidden;
  const home = !$('#homeView')?.hidden;
  const ana = $('.p-analysis')?.classList.contains('maximized');
  const cur = home ? 'home' : news ? 'news' : season ? 'season' : ana ? 'ana' : 'live';
  for (const b of $$('#rail [data-rail]')) {
    const k = b.dataset.rail;
    b.classList.toggle('on', k === cur);
    if (k === 'radio') b.classList.toggle('playing', $('#commBtn').classList.contains('on'));
  }
}

export function initRail() {
  const rail = $('#rail');
  if (!rail) return;
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rail]');
    if (!b) return;
    ACTIONS[b.dataset.rail]?.(b);
    sync();
  });
  const mo = new MutationObserver(sync);
  mo.observe($('#seasonView'), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('#newsView'), { attributes: true, attributeFilter: ['hidden'] });
  if ($('#homeView')) mo.observe($('#homeView'), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('.grid'), { attributes: true, attributeFilter: ['class'] });
  mo.observe($('#commBtn'), { attributes: true, attributeFilter: ['class'] });
  sync();
}
