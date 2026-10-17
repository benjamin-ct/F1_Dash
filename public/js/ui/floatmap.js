// Carte flottante (application de bureau) : la carte seule dans une fenêtre transparente, sans cadre
// ni fond, au-dessus de tout (barre, déplacement et taille : floatwin.js).
import { $ } from '../util.js';
import { icon } from '../icons.js';
import { floatMap } from './layout.js';
import { FLOAT, floatChrome } from './floatwin.js';

export function initFloatMap() {
  // Fenêtre principale : bouton « Flottante » du panneau Carte (application de bureau seulement)
  if (!FLOAT) {
    const b = $('#mapFloatBtn');
    if (b && window.f1desktop && !new URLSearchParams(location.search).has('win')) {
      b.hidden = false;
      b.addEventListener('click', () => floatMap());
    }
    return;
  }
  document.title = 'Paddock Live · Carte';
  const wrap = $('.p-map .map-wrap');
  if (!wrap) return;
  const layers = $('#mapLayers');
  const bar = floatChrome({
    area: wrap,
    closeTitle: 'Fermer la carte flottante',
    extra: `<button data-fl="fit" title="Vue d'ensemble du circuit">⤢</button>
      <button data-fl="back" title="Remettre la carte dans la fenêtre principale">${icon('window-in')}</button>`,
    onAction: (k) => {
      if (k === 'fit') $('#mapReset')?.click();
      else if (k === 'back') $('.p-map .panel-ctrl [data-act="back"]')?.click();
    },
    onMove: () => { if (layers) layers.open = false; },
  });
  // Menu « Calques » du panneau, déplacé dans la barre (l'en-tête du panneau est masqué)
  if (layers) {
    const sum = layers.querySelector('summary');
    sum.className = '';   // bouton de la barre, pas du panneau (marges, bordure)
    sum.innerHTML = icon('sliders');
    bar.querySelector('[data-fl="back"]').before(layers);
  }
}
