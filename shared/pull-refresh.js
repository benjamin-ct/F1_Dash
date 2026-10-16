// « Tirer pour actualiser » sur téléphone : glisser vers le bas en haut de la page. Utile surtout
// quand la page est ouverte depuis l'écran d'accueil (sans la barre du navigateur).
// Fonction autonome (ni import ni variable extérieure) : la page des statistiques la recopie telle
// quelle dans son script. onRefresh : fonction (éventuellement asynchrone) ; enabled : condition.
export function pullToRefresh(onRefresh, { enabled = () => true, threshold = 80 } = {}) {
  const css = document.createElement('style');
  css.textContent = 'html,body{overscroll-behavior-y:contain}'
    + '.ptr{position:fixed;left:50%;top:0;z-index:99;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;'
    + 'background:#1b1f27;color:#e9edf3;font:600 14px/1 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);'
    + 'transform:translate(-50%,-60px);opacity:0;pointer-events:none;transition:transform .2s,opacity .2s}'
    + '.ptr span{font:600 14px/1.2 system-ui,-apple-system,sans-serif!important;white-space:nowrap}.ptr.drag{transition:none}.ptr i{width:14px;height:14px;border:2px solid #e10600;border-top-color:transparent;border-radius:50%;display:inline-block}'
    + '.ptr i{flex:none}.ptr.busy i{animation:ptr .7s linear infinite}@keyframes ptr{to{transform:rotate(360deg)}}';
  document.head.appendChild(css);
  const bar = document.createElement('div');
  bar.className = 'ptr';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<i></i><span>Tirer pour actualiser</span>';
  document.body.appendChild(bar);
  const label = bar.querySelector('span');
  const icon = bar.querySelector('i');
  let y0 = null;
  let dist = 0;
  let busy = false;
  const top = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || !top() || !enabled()) { y0 = null; return; }
    y0 = e.touches[0].clientY;
    dist = 0;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dist = Math.max(0, e.touches[0].clientY - y0);
    if (!dist || !top()) return;
    const pull = Math.min(dist * 0.5, threshold);
    bar.classList.add('drag');
    bar.style.transform = `translate(-50%, ${pull - 40}px)`;
    bar.style.opacity = String(Math.min(1, dist / threshold));
    icon.style.transform = `rotate(${dist * 3}deg)`;
    label.textContent = dist >= threshold * 1.6 ? 'Relâcher pour actualiser' : 'Tirer pour actualiser';
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return;
    const go = dist >= threshold * 1.6;
    y0 = null;
    bar.classList.remove('drag');
    if (!go) { bar.style.transform = ''; bar.style.opacity = '0'; return; }
    busy = true;
    bar.classList.add('busy');
    label.textContent = 'Actualisation…';
    bar.style.transform = `translate(-50%, ${threshold * 0.4}px)`;
    try { await onRefresh(); } finally {
      busy = false;
      bar.classList.remove('busy');
      bar.style.transform = '';
      bar.style.opacity = '0';
    }
  });
}
