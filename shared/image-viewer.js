// Visionneuse d'images des posts (appli de bureau et page web du créateur) : une image en grand
// au-dessus de tout (même d'une fenêtre déjà ouverte), flèches et clavier pour passer d'une image
// à l'autre, clic sur l'image pour la voir en taille réelle, Échap / clic à côté / glisser vers le
// bas pour fermer. Styles inclus : rien à ajouter dans les feuilles de style.
const CSS = `
dialog.imgview { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: rgba(5, 6, 8, .92); color: #f2f3f5; font: 600 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; overflow: hidden; }
dialog.imgview::backdrop { background: transparent; }
dialog.imgview[open] { display: flex; flex-direction: column; animation: imgview-in .18s ease-out; }
@keyframes imgview-in { from { opacity: 0; } }
.imgview-bar { display: flex; align-items: center; gap: 10px; padding: max(12px, env(safe-area-inset-top)) 14px 10px 18px; }
.imgview-bar span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.imgview-bar small { margin-left: 8px; color: #9aa0ab; font-weight: 500; }
.imgview-stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; padding: 0 64px max(18px, env(safe-area-inset-bottom)); overflow: auto; touch-action: pan-y pinch-zoom; }
.imgview-stage img { display: block; max-width: calc(100vw - 140px); max-height: calc(100vh - 90px); max-height: calc(100dvh - 90px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); object-fit: contain; border-radius: 10px; box-shadow: 0 20px 60px rgba(0, 0, 0, .6); cursor: zoom-in; user-select: none; -webkit-user-select: none; transition: transform .2s; }
.imgview-stage.full { place-items: start center; }
.imgview-stage.full img { max-width: none; max-height: none; cursor: zoom-out; border-radius: 0; }
.imgview-stage.off img { opacity: .55; filter: grayscale(1); }
.imgview button { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border: 1px solid rgba(255, 255, 255, .14); border-radius: 50%; background: rgba(255, 255, 255, .08); color: inherit; cursor: pointer; }
.imgview button:hover { background: rgba(255, 255, 255, .16); }
.imgview button:disabled { opacity: .25; cursor: default; }
.imgview button svg { width: 22px; height: 22px; }
.imgview-nav { position: fixed; top: 50%; margin-top: -22px; z-index: 1; }
.imgview-nav.prev { left: 12px; }
.imgview-nav.next { right: 12px; }
@media (max-width: 600px) { .imgview-stage { padding-inline: 10px; } .imgview-stage img { max-width: calc(100vw - 20px); } .imgview-nav { display: none !important; } }
`;
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = { prev: svg('<path d="M15 5l-7 7 7 7"/>'), next: svg('<path d="M9 5l7 7-7 7"/>'), close: svg('<path d="M6 6l12 12M18 6L6 18"/>') };

let styled = false;
// items : [{ canvas | src, label, off }] ; start : image affichée d'abord ; t : traduction des libellés
export function openImageViewer(items, start = 0, { t = (s) => s } = {}) {
  if (!items?.length) return null;
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const dlg = document.createElement('dialog');
  dlg.className = 'imgview';
  dlg.innerHTML = `<div class="imgview-bar"><span></span><button data-act="close" aria-label="${t('Fermer')}" title="${t('Fermer')} (Échap)">${ICONS.close}</button></div>
    <div class="imgview-stage"><img alt=""></div>
    <button class="imgview-nav prev" data-act="prev" aria-label="${t('Image précédente')}">${ICONS.prev}</button>
    <button class="imgview-nav next" data-act="next" aria-label="${t('Image suivante')}">${ICONS.next}</button>`;
  const stage = dlg.querySelector('.imgview-stage');
  const img = dlg.querySelector('img');
  const label = dlg.querySelector('.imgview-bar span');
  let i = Math.min(Math.max(0, start), items.length - 1);
  const show = () => {
    const it = items[i];
    img.src = it.src || it.canvas.toDataURL('image/png');
    stage.classList.remove('full');
    stage.classList.toggle('off', !!it.off);
    label.textContent = `${i + 1} / ${items.length}${it.label ? ` · ${it.label}` : ''}`;
    if (it.off) label.insertAdjacentHTML('beforeend', `<small>${t('non publiée')}</small>`);
    dlg.querySelector('.prev').disabled = i === 0;
    dlg.querySelector('.next').disabled = i === items.length - 1;
    for (const b of dlg.querySelectorAll('.imgview-nav')) b.hidden = items.length < 2;
  };
  const go = (n) => { if (n >= 0 && n < items.length && n !== i) { i = n; show(); } };
  const close = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'prev') go(i - 1);
    else if (act === 'next') go(i + 1);
    else if (e.target === img) {
      // Taille réelle (texte fin, grille…), centrée sur l'endroit cliqué
      const r = img.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      stage.classList.toggle('full');
      if (stage.classList.contains('full')) {
        stage.scrollLeft = fx * img.naturalWidth - stage.clientWidth / 2;
        stage.scrollTop = fy * img.naturalHeight - stage.clientHeight / 2;
      }
    } else if (e.target === stage || e.target === dlg) close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
  });
  // Téléphone : glisser à gauche / à droite pour changer d'image, vers le bas pour fermer
  let touch = null;
  stage.addEventListener('touchstart', (e) => { touch = e.touches.length === 1 && !stage.classList.contains('full') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1));
    else if (dy > 90 && dy > Math.abs(dx)) close();
  });
  document.body.appendChild(dlg);
  show();
  dlg.showModal();
  dlg.querySelector('[data-act="close"]').focus({ preventScroll: true });
  return dlg;
}
