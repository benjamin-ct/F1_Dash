// Design « F1 Pro » : barre de navigation latérale (Direct, Analyse, Saison, Replays, Radios,
// Réglages). Elle reprend les actions des boutons du haut, masqués dans ce design.
import { $, $$ } from '../util.js';
import { openSeason, closeSeason } from './season.js';
import { unmaximize, showPanelLarge } from './layout.js';
import { toast } from './delay.js';

function openSettings(group) {
  $('#settingsBtn').click();
  if (group) $(`#setNav [data-sgroup="${group}"]`)?.click();
}

const ACTIONS = {
  live: () => { closeSeason(); unmaximize(); },
  ana: () => {
    closeSeason();
    if (!showPanelLarge('analysis')) toast('Le panneau Analyse est ouvert dans une autre fenêtre');
  },
  season: () => ($('#seasonView').hidden ? openSeason() : closeSeason()),
  replay: () => openSettings('source'),
  radio: () => $('#commBtn').click(),
  reset: () => $('#resetUiBtn').click(),
  settings: () => openSettings(),
};

// Élément actif : Saison ouverte, Analyse en grand, sinon Direct
function sync() {
  const season = !$('#seasonView').hidden;
  const ana = $('.p-analysis')?.classList.contains('maximized');
  const cur = season ? 'season' : ana ? 'ana' : 'live';
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
    ACTIONS[b.dataset.rail]?.();
    sync();
  });
  const mo = new MutationObserver(sync);
  mo.observe($('#seasonView'), { attributes: true, attributeFilter: ['hidden'] });
  mo.observe($('.grid'), { attributes: true, attributeFilter: ['class'] });
  mo.observe($('#commBtn'), { attributes: true, attributeFilter: ['class'] });
  sync();
}
