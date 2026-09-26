// Disposition libre : colonnes et panneaux redimensionnables, panneaux déplaçables par glisser-déposer,
// fenêtres secondaires (second écran) pouvant regrouper plusieurs panneaux, colonnes du classement.
import { $, $$, esc, storageGet, storageSet } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { on } from '../store.js';

export const PANELS = [
  { id: 'tower', cls: 'p-tower', name: 'Classement' },
  { id: 'map', cls: 'p-map', name: 'Circuit' },
  { id: 'feed', cls: 'p-feed', name: 'Direction de course / radios / arrêts' },
  { id: 'duel', cls: 'p-duel', name: 'Duel' },
  { id: 'extra', cls: 'p-extra', name: 'Télémétrie / stratégie / pneus…' },
];
const SHORT = { tower: 'Classement', map: 'Circuit', feed: 'Direction de course', duel: 'Duel', extra: 'Télémétrie' };

export const COLUMNS = [
  ['int', 'Intervalle'], ['last', 'Dernier tour'], ['best', 'Meilleur tour'], ['sec', 'Secteurs'], ['pred', 'Tour en cours (qualifs)'],
  ['q', 'Q1/Q2/Q3'], ['tyre', 'Pneus'], ['pits', 'Arrêts / tours'], ['speed', 'Speed trap'], ['duel', 'Boutons duel'],
];

// Fenêtre courante : « main » ou une fenêtre secondaire (?win=…). « ?panel=x » : ancien lien d'un panneau seul.
const params = new URLSearchParams(location.search);
const legacyPanel = PANELS.some((p) => p.id === params.get('panel')) ? params.get('panel') : null;
export const WIN = params.get('win') || (legacyPanel ? `solo-${legacyPanel}` : 'main');
const isMain = WIN === 'main';
const LAYOUTS_KEY = 'f1dash.layouts';
const MIN_W = 220, MIN_H = 110;

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('f1dash-panels') : null;
const others = new Map(); // fenêtres secondaires ouvertes : win -> {panels, last, title}

function panelEl(id) {
  return $(`.${PANELS.find((p) => p.id === id).cls}`);
}

// ---------------- Modèle de disposition ----------------
// {cols: [{w, items: [{id, h}]}]} ; w et h sont des proportions (flex-grow).
function defaultLayout() {
  if (!isMain) return { cols: [] };
  if (window.innerWidth <= 1500) {
    return { cols: [
      { w: 1.2, items: [{ id: 'tower', h: 1.3 }, { id: 'feed', h: 0.8 }] },
      { w: 1, items: [{ id: 'map', h: 1.1 }, { id: 'duel', h: 1 }, { id: 'extra', h: 0.9 }] },
    ] };
  }
  return { cols: [
    { w: 1.6, items: [{ id: 'tower', h: 1 }] },
    { w: 1, items: [{ id: 'map', h: 1.15 }, { id: 'feed', h: 1 }] },
    { w: 0.95, items: [{ id: 'duel', h: 1.15 }, { id: 'extra', h: 1 }] },
  ] };
}

function normalize(l) {
  const seen = new Set();
  const cols = (Array.isArray(l?.cols) ? l.cols : []).map((c) => ({
    w: Number(c?.w) > 0 ? Number(c.w) : 1,
    items: (Array.isArray(c?.items) ? c.items : []).filter((it) => {
      if (!PANELS.some((p) => p.id === it?.id) || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    }).map((it) => ({ id: it.id, h: Number(it.h) > 0 ? Number(it.h) : 1 })),
  })).filter((c) => c.items.length);
  // La fenêtre principale contient toujours tous les panneaux (ceux détachés y sont simplement cachés).
  if (isMain) {
    for (const p of PANELS) {
      if (seen.has(p.id)) continue;
      if (!cols.length) cols.push({ w: 1, items: [] });
      cols[cols.length - 1].items.push({ id: p.id, h: 1 });
    }
  }
  return { cols };
}

function allLayouts() {
  const all = storageGet(LAYOUTS_KEY, {});
  return all && typeof all === 'object' ? all : {};
}

function storeLayout(win, l) {
  const all = allLayouts();
  if (l) all[win] = l; else delete all[win];
  storageSet(LAYOUTS_KEY, all);
}

let layout = normalize(allLayouts()[WIN] || (legacyPanel ? { cols: [{ w: 1, items: [{ id: legacyPanel, h: 1 }] }] } : defaultLayout()));

function save() {
  storeLayout(WIN, layout);
  announce();
}

function locate(id) {
  for (const [ci, c] of layout.cols.entries()) {
    const ii = c.items.findIndex((it) => it.id === id);
    if (ii >= 0) return { ci, ii, col: c, item: c.items[ii] };
  }
  return null;
}

function removeItem(id) {
  const loc = locate(id);
  if (!loc) return null;
  loc.col.items.splice(loc.ii, 1);
  if (!loc.col.items.length) layout.cols.splice(loc.ci, 1);
  return loc.item;
}

function addAsColumn(id) {
  const w = layout.cols.length ? layout.cols.reduce((s, c) => s + c.w, 0) / layout.cols.length : 1;
  layout.cols.push({ w, items: [{ id, h: 1 }] });
}

// Déplace `id` par rapport à `target` : left/right = nouvelle colonne, top/bottom = même colonne, center = échange.
function movePanel(id, target, zone) {
  if (id === target) return;
  if (zone === 'center') {
    const a = locate(id), b = locate(target);
    if (!a || !b) return;
    [a.item.id, b.item.id] = [b.item.id, a.item.id];
    return;
  }
  const moved = removeItem(id);
  const t = locate(target);
  if (!moved || !t) return;
  if (zone === 'top' || zone === 'bottom') {
    const h = t.item.h / 2;
    t.item.h = h;
    t.col.items.splice(t.ii + (zone === 'bottom' ? 1 : 0), 0, { id, h });
  } else {
    const w = t.col.w / 2;
    t.col.w = w;
    layout.cols.splice(t.ci + (zone === 'right' ? 1 : 0), 0, { w, items: [{ id, h: 1 }] });
  }
}

// ---------------- Visibilité ----------------
function detachedElsewhere(id) {
  for (const o of others.values()) if (o.panels.includes(id)) return true;
  return false;
}

function isVisible(id) {
  if (!isMain) return true;
  return !prefs.hiddenPanels.includes(id) && !detachedElsewhere(id);
}

// ---------------- Rendu ----------------
let renderKey = '';

function narrow() {
  return isMain && window.innerWidth <= 1000;
}

function render(force = false) {
  const grid = $('.grid');
  const key = `${narrow()}|${JSON.stringify(layout)}|${PANELS.map((p) => isVisible(p.id)).join()}`;
  if (key === renderKey && !force) return;
  renderKey = key;
  const stash = grid.querySelector('.lstash') || Object.assign(document.createElement('div'), { className: 'lstash', hidden: true });
  if (narrow()) {
    // Petit écran : empilement vertical classique
    grid.classList.remove('custom');
    for (const p of PANELS) {
      const el = panelEl(p.id);
      el.style.flex = '';
      el.classList.toggle('hidden-panel', !isVisible(p.id));
      grid.appendChild(el);
    }
    for (const el of grid.querySelectorAll('.lcol, .lsplit-v')) el.remove();
    return;
  }
  grid.classList.add('custom');
  grid.appendChild(stash);
  for (const p of PANELS) { const el = panelEl(p.id); el.classList.remove('hidden-panel'); stash.appendChild(el); }
  for (const el of grid.querySelectorAll('.lcol, .lsplit-v')) el.remove();
  const cols = layout.cols.map((c) => ({ c, items: c.items.filter((it) => isVisible(it.id)) })).filter((x) => x.items.length);
  cols.forEach(({ c, items }, i) => {
    if (i) {
      const sv = document.createElement('div');
      sv.className = 'lsplit-v';
      sv.title = 'Glisser pour redimensionner les colonnes';
      splitter(sv, 'x', cols[i - 1].c, c);
      grid.insertBefore(sv, stash);
    }
    const col = document.createElement('div');
    col.className = 'lcol';
    col.style.flex = `${c.w} 1 0`;
    col._model = c;
    items.forEach((it, j) => {
      if (j) {
        const sh = document.createElement('div');
        sh.className = 'lsplit-h';
        sh.title = 'Glisser pour redimensionner les panneaux';
        splitter(sh, 'y', items[j - 1], it);
        col.appendChild(sh);
      }
      const el = panelEl(it.id);
      el.style.flex = `${it.h} 1 0`;
      el._model = it;
      col.appendChild(el);
    });
    grid.insertBefore(col, stash);
  });
  if (!cols.length) {
    const note = document.createElement('div');
    note.className = 'lcol note';
    note.textContent = isMain ? 'Tous les panneaux sont masqués ou ouverts dans une autre fenêtre.' : 'Fenêtre vide.';
    grid.insertBefore(note, stash);
  }
}

// Séparateur : redistribue la place entre les deux voisins (a avant, b après) en gardant leur total.
function splitter(el, axis, a, b) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const prev = el.previousElementSibling, next = el.nextElementSibling;
    const size = (x) => (axis === 'x' ? x.getBoundingClientRect().width : x.getBoundingClientRect().height);
    const pa = size(prev), pb = size(next);
    const key = axis === 'x' ? 'w' : 'h';
    const total = a[key] + b[key];
    const min = axis === 'x' ? MIN_W : MIN_H;
    const start = axis === 'x' ? e.clientX : e.clientY;
    el.setPointerCapture(e.pointerId);
    el.classList.add('active');
    document.body.classList.add(axis === 'x' ? 'resizing-x' : 'resizing-y');
    const move = (ev) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const na = Math.max(min, Math.min(pa + pb - min, pa + d));
      a[key] = (total * na) / (pa + pb);
      b[key] = total - a[key];
      prev.style.flex = `${a[key]} 1 0`;
      next.style.flex = `${b[key]} 1 0`;
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.classList.remove('active');
      document.body.classList.remove('resizing-x', 'resizing-y');
      renderKey = '';
      save();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  });
  // Double-clic : partage égal
  el.addEventListener('dblclick', () => {
    const key = axis === 'x' ? 'w' : 'h';
    const avg = (a[key] + b[key]) / 2;
    a[key] = b[key] = avg;
    render(true);
    save();
  });
}

// ---------------- Glisser-déposer des panneaux ----------------
function startDrag(id, e) {
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'ldrag-ghost';
  ghost.textContent = SHORT[id];
  const hint = document.createElement('div');
  hint.className = 'ldrop';
  document.body.append(ghost, hint);
  document.body.classList.add('dragging-panel');
  let drop = null;
  const move = (ev) => {
    ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
    const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList?.contains('panel') && n.closest('.lcol'));
    const tid = under && PANELS.find((p) => under.classList.contains(p.cls))?.id;
    if (!tid || tid === id) { drop = null; hint.hidden = true; return; }
    const r = under.getBoundingClientRect();
    const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
    const zone = fx < 0.25 ? 'left' : fx > 0.75 ? 'right' : fy < 0.3 ? 'top' : fy > 0.7 ? 'bottom' : 'center';
    drop = { tid, zone };
    const z = {
      left: [r.left, r.top, r.width / 2, r.height], right: [r.left + r.width / 2, r.top, r.width / 2, r.height],
      top: [r.left, r.top, r.width, r.height / 2], bottom: [r.left, r.top + r.height / 2, r.width, r.height / 2],
      center: [r.left + r.width * 0.1, r.top + r.height * 0.1, r.width * 0.8, r.height * 0.8],
    }[zone];
    hint.hidden = false;
    Object.assign(hint.style, { left: `${z[0]}px`, top: `${z[1]}px`, width: `${z[2]}px`, height: `${z[3]}px` });
    hint.textContent = zone === 'center' ? `Échanger avec ${SHORT[tid]}` : { left: 'Nouvelle colonne à gauche', right: 'Nouvelle colonne à droite', top: 'Au-dessus', bottom: 'En dessous' }[zone];
  };
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    ghost.remove();
    hint.remove();
    document.body.classList.remove('dragging-panel');
    if (drop) {
      movePanel(id, drop.tid, drop.zone);
      render();
      save();
    }
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ---------------- Fenêtres secondaires ----------------
function winTitle(panels) {
  return panels.map((p) => SHORT[p]).join(' + ') || 'Fenêtre';
}

function announce() {
  if (isMain || !channel) return;
  const panels = layout.cols.flatMap((c) => c.items.map((it) => it.id));
  channel.postMessage({ type: 'alive', win: WIN, panels });
  document.title = `F1 Dash · ${winTitle(panels)}`;
}

function openWindow(win) {
  return window.open(`/?win=${encodeURIComponent(win)}`, `f1dash-${win}`, 'width=1200,height=800');
}

// Envoie un panneau vers une autre fenêtre (existante : il s'y ajoute ; sinon nouvelle fenêtre).
function sendTo(id, target) {
  if (target === 'main') {
    // Retour dans la fenêtre principale : il suffit de le retirer d'ici.
    removeItem(id);
    save();
    if (!layout.cols.length) window.close();
    else render();
    return;
  }
  if (target === 'new') {
    // Nettoie les dispositions de fenêtres fermées
    const all = allLayouts();
    for (const k of Object.keys(all)) if (k !== 'main' && k !== WIN && !others.has(k)) delete all[k];
    target = `w${Date.now().toString(36)}`;
    all[target] = { cols: [{ w: 1, items: [{ id, h: 1 }] }] };
    storageSet(LAYOUTS_KEY, all);
    const w = openWindow(target);
    if (!w) return;
  } else {
    channel?.postMessage({ type: 'add', win: target, panel: id });
  }
  others.set(target, { panels: [...(others.get(target)?.panels || []), id], last: Date.now() + 5000 });
  if (isMain) {
    if ($('.grid').classList.contains('has-max')) unmaximize();
    render();
  } else {
    removeItem(id);
    save();
    if (!layout.cols.length) setTimeout(() => window.close(), 200);
    else render();
  }
}

function popMenu(id, anchor) {
  const targets = [...others.entries()].filter(([w, o]) => w !== WIN && Date.now() - o.last < 3500 + 5000);
  if (!targets.length) { sendTo(id, 'new'); return; }
  document.querySelector('.lpop-menu')?.remove();
  const m = document.createElement('div');
  m.className = 'lpop-menu';
  m.innerHTML = `<div class="muted small">Envoyer « ${esc(SHORT[id])} » vers…</div>
    ${targets.map(([w, o], i) => `<button data-to="${esc(w)}">🗗 Fenêtre ${i + 1} : ${esc(winTitle(o.panels))} <span class="muted small">(ajouter)</span></button>`).join('')}
    <button data-to="new">＋ Nouvelle fenêtre</button>`;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  m.style.top = `${r.bottom + 4}px`;
  m.onclick = (e) => {
    const b = e.target.closest('[data-to]');
    if (!b) return;
    m.remove();
    sendTo(id, b.dataset.to);
  };
  setTimeout(() => document.addEventListener('pointerdown', function close(ev) {
    if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', close); }
  }), 0);
}

function initChannel() {
  if (!channel) return;
  channel.onmessage = (e) => {
    const { type, win, panels, panel } = e.data || {};
    if (!win || win === WIN) {
      if (type === 'add' && win === WIN && PANELS.some((p) => p.id === panel) && !locate(panel)) {
        addAsColumn(panel);
        render();
        save();
        window.focus();
      }
      return;
    }
    if (type === 'alive') others.set(win, { panels: (panels || []).filter((p) => PANELS.some((x) => x.id === p)), last: Date.now() });
    if (type === 'closed') others.delete(win);
    if (type === 'hello' && !isMain) announce();
    if (isMain) render();
  };
  if (isMain) {
    channel.postMessage({ type: 'hello', win: WIN });
    // Fenêtre fermée brutalement : plus de signe de vie depuis 3,5 s -> ses panneaux reviennent.
    setInterval(() => {
      let changed = false;
      for (const [w, o] of others) if (Date.now() - o.last > 3500) { others.delete(w); changed = true; }
      if (changed) render();
    }, 1000);
  } else {
    announce();
    setInterval(announce, 1000);
    // Les autres fenêtres secondaires se signalent aussi (pour le menu « envoyer vers »).
    setInterval(() => { for (const [w, o] of others) if (Date.now() - o.last > 3500) others.delete(w); }, 1000);
    window.addEventListener('pagehide', () => channel.postMessage({ type: 'closed', win: WIN }));
  }
}

// ---------------- Agrandir ----------------
function unmaximize() {
  for (const p of $$('.panel.maximized')) p.classList.remove('maximized');
  $('.grid').classList.remove('has-max');
}

function maximize(id) {
  const el = panelEl(id);
  const was = el.classList.contains('maximized');
  unmaximize();
  if (!was) {
    el.classList.add('maximized');
    $('.grid').classList.add('has-max');
  }
}

// ---------------- Initialisation ----------------
export function initLayout() {
  if (!isMain) {
    document.body.classList.add('solo');
    if (legacyPanel && !allLayouts()[WIN]) storeLayout(WIN, layout);
  }
  initChannel();
  for (const p of PANELS) {
    const head = panelEl(p.id).querySelector('.panel-head');
    const ctrl = document.createElement('div');
    ctrl.className = 'panel-ctrl';
    ctrl.innerHTML = `<button data-act="drag" class="lgrip" title="Glisser pour déplacer ce panneau (à côté, au-dessus, en dessous d'un autre, ou pour l'échanger)">⠿</button>`
      + '<button data-act="max" title="Agrandir / réduire (Échap)">⤢</button>'
      + '<button data-act="pop" title="Envoyer vers une autre fenêtre (second écran) : nouvelle fenêtre ou fenêtre déjà ouverte">↗</button>'
      + (isMain ? '<button data-act="hide" title="Masquer ce panneau (réaffichable dans ⚙ Réglages)">✕</button>'
        : '<button data-act="back" title="Remettre ce panneau dans la fenêtre principale">↙</button>');
    head.appendChild(ctrl);
    ctrl.querySelector('.lgrip').addEventListener('pointerdown', (e) => { if (!narrow()) startDrag(p.id, e); });
    ctrl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const act = b?.dataset.act;
      if (act === 'max') maximize(p.id);
      if (act === 'pop') popMenu(p.id, b);
      if (act === 'back') sendTo(p.id, 'main');
      if (act === 'hide') setPref('hiddenPanels', [...new Set([...prefs.hiddenPanels, p.id])]);
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('.grid').classList.contains('has-max') && !document.querySelector('dialog[open]')) unmaximize();
  });
  window.addEventListener('resize', () => render());
  // Disposition modifiée dans une autre instance de la même fenêtre (rechargement) : rien à faire ;
  // la fenêtre principale suit seulement les préférences.
  on('prefs', (k) => {
    if (k === 'hiddenPanels') render();
    if (['hiddenPanels', 'hiddenCols', 'towerFit'].includes(k)) renderLayoutOptions();
  });
  render(true);
  renderLayoutOptions();
}

export function resetLayout() {
  if (!isMain) return;
  layout = normalize(defaultLayout());
  render(true);
  save();
}

export function renderLayoutOptions() {
  $('#panelOpts').innerHTML = PANELS.map((p) => `<label class="toggle small"><input type="checkbox" data-panel="${p.id}" ${prefs.hiddenPanels.includes(p.id) ? '' : 'checked'}> ${esc(p.name)}</label>`).join('');
  $('#panelOpts').onchange = (e) => {
    const id = e.target.dataset.panel;
    if (!id) return;
    setPref('hiddenPanels', e.target.checked ? prefs.hiddenPanels.filter((x) => x !== id) : [...prefs.hiddenPanels, id]);
  };
  $('#towerFit').checked = prefs.towerFit;
  $('#towerFit').onchange = (e) => setPref('towerFit', e.target.checked);
  const reset = $('#layoutReset');
  if (reset) reset.onclick = () => resetLayout();
  $('#colOpts').innerHTML = COLUMNS.map(([k, name]) => `<label class="toggle small"><input type="checkbox" data-col="${k}" ${prefs.hiddenCols.includes(k) ? '' : 'checked'}> ${esc(name)}</label>`).join('');
  $('#colOpts').onchange = (e) => {
    const k = e.target.dataset.col;
    if (!k) return;
    setPref('hiddenCols', e.target.checked ? prefs.hiddenCols.filter((x) => x !== k) : [...prefs.hiddenCols, k]);
  };
}
