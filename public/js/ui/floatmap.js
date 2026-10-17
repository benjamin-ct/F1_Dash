// Carte flottante (application de bureau) : la carte seule dans une fenêtre transparente, sans cadre
// ni fond, au-dessus de tout. Glisser la carte déplace la fenêtre ; barre d'outils au survol pour la
// taille, le retour dans la fenêtre principale et la fermeture ; coin pour redimensionner.
import { $ } from '../util.js';
import { icon } from '../icons.js';
import { floatMap } from './layout.js';

const FLOAT = /[?&]float=1(&|$)/.test(location.search);
const desk = window.f1desktop;

async function bounds() {
  if (desk?.floatGetBounds) return desk.floatGetBounds();
  return { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight };
}
function setBounds(b) {
  if (desk?.floatBounds) desk.floatBounds(b);
  else {
    if (b.width) window.resizeTo(b.width, b.height);
    if (b.x != null) window.moveTo(b.x, b.y);
  }
}

// Taille ×k autour du centre de la fenêtre
async function scale(k) {
  const b = await bounds();
  const width = Math.max(160, Math.round(b.width * k)), height = Math.max(120, Math.round(b.height * k));
  setBounds({ x: Math.round(b.x - (width - b.width) / 2), y: Math.round(b.y - (height - b.height) / 2), width, height });
}

// Suivi d'un glisser (déplacement de la fenêtre ou coin de redimensionnement)
function drag(e, fn) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.screenX, sy = e.screenY;
  let b0 = null;
  bounds().then((b) => { b0 = b; });
  const move = (ev) => { if (b0) fn(b0, ev.screenX - sx, ev.screenY - sy); };
  const up = () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    document.documentElement.classList.remove('float-moving');
  };
  document.documentElement.classList.add('float-moving');
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}

export function initFloatMap() {
  // Fenêtre principale : bouton « Flottante » du panneau Carte (application de bureau seulement)
  if (!FLOAT) {
    const b = $('#mapFloatBtn');
    if (b && desk && !new URLSearchParams(location.search).has('win')) {
      b.hidden = false;
      b.addEventListener('click', () => floatMap());
    }
    return;
  }
  document.title = 'Paddock Live · Carte';
  const wrap = $('.p-map .map-wrap');
  if (!wrap) return;
  const bar = document.createElement('div');
  bar.className = 'float-bar';
  bar.innerHTML = `<span class="float-grip" title="Glisser pour déplacer">${icon('move')}</span>
    <button data-fl="smaller" title="Plus petite">−</button><button data-fl="bigger" title="Plus grande">+</button>
    <button data-fl="fit" title="Vue d'ensemble du circuit">⤢</button>
    <button data-fl="back" title="Remettre la carte dans la fenêtre principale">${icon('window-in')}</button>
    <button data-fl="close" title="Fermer la carte flottante">${icon('close')}</button>`;
  const grip = document.createElement('div');
  grip.className = 'float-resize';
  grip.title = 'Glisser pour changer la taille';
  document.body.append(bar, grip);
  bar.addEventListener('click', (e) => {
    const k = e.target.closest('[data-fl]')?.dataset.fl;
    if (k === 'smaller') scale(1 / 1.15);
    else if (k === 'bigger') scale(1.15);
    else if (k === 'fit') $('#mapReset')?.click();
    else if (k === 'back') $('.p-map .panel-ctrl [data-act="back"]')?.click();
    else if (k === 'close') window.close();
  });
  // Glisser la carte (ou la poignée) : la fenêtre suit
  const moveWin = (e) => {
    if (e.button !== 0 || e.target.closest('.float-bar button, .float-resize')) return;
    drag(e, (b, dx, dy) => setBounds({ x: b.x + dx, y: b.y + dy }));
  };
  wrap.addEventListener('pointerdown', moveWin, true);
  bar.querySelector('.float-grip').addEventListener('pointerdown', moveWin);
  // Coin : nouvelle taille
  grip.addEventListener('pointerdown', (e) => drag(e, (b, dx, dy) => setBounds({ x: b.x, y: b.y, width: Math.max(160, b.width + dx), height: Math.max(120, b.height + dy) })));
  // Ctrl + molette : taille (la molette seule zoome la carte)
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    scale(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  }, { capture: true, passive: false });
}
