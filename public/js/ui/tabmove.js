// Onglets déplaçables : chaque onglet d'un panneau (avec son contenu) peut être glissé vers un
// autre panneau à onglets, ou à une autre place dans le sien. La disposition des onglets est
// mémorisée et suivie par toutes les fenêtres (préférence tabLayout).
import { prefs, setPref } from '../prefs.js';
import { on, emit } from '../store.js';
import { $ } from '../util.js';
import { toast } from './delay.js';

const HOSTS = ['feed', 'radio', 'analysis', 'extra'];   // panneaux à onglets
const origin = {};                                      // onglet -> panneau d'origine
const defaults = {};                                    // panneau -> onglets d'origine (ordre)

const panel = (id) => document.querySelector(`.panel.p-${id}`);
const head = (id) => panel(id)?.querySelector('.panel-head[data-tabs]');
const body = (id) => panel(id)?.querySelector('.panel-body');
const tabBtn = (t) => document.querySelector(`[data-tabs] [data-tab="${t}"]`);
const pane = (t) => document.querySelector(`.panel-body > [data-pane="${t}"]`);
const tabsOf = (id) => [...(head(id)?.querySelectorAll(':scope > [data-tab]') || [])].map((b) => b.dataset.tab);

// Panneau d'origine d'un onglet (légendes, mémoire de l'onglet ouvert…)
export const tabOrigin = (t) => origin[t] || null;

function activate(id, t) {
  const h = head(id), b = body(id);
  if (!h || !b) return;
  for (const x of h.querySelectorAll(':scope > [data-tab]')) x.classList.toggle('active', x.dataset.tab === t);
  for (const p of b.querySelectorAll(':scope > [data-pane]')) p.classList.toggle('active', p.dataset.pane === t);
}

// Après un déplacement : un seul onglet ouvert par panneau, panneau vide signalé
function tidy(id, prefer = null) {
  const h = head(id), b = body(id);
  if (!h || !b) return;
  const tabs = tabsOf(id);
  const active = tabs.filter((t) => tabBtn(t).classList.contains('active'));
  if (prefer && tabs.includes(prefer)) activate(id, prefer);
  else if (active.length !== 1 && tabs.length) activate(id, active[0] || tabs[0]);
  h.classList.toggle('many', tabs.length > 4);
  let empty = b.querySelector(':scope > .tab-empty');
  if (!tabs.length && !empty) {
    empty = document.createElement('div');
    empty.className = 'tab-empty note';
    empty.textContent = 'Panneau vide : glissez ici un onglet d\'un autre panneau (ou masquez ce panneau).';
    // Bouton pour masquer le panneau directement (fenêtre principale seulement : voir le CSS)
    const hide = document.createElement('button');
    hide.className = 'btn small';
    hide.textContent = 'Masquer ce panneau';
    hide.addEventListener('click', () => panel(id)?.querySelector('.panel-ctrl [data-act="hide"]')?.click());
    empty.append(document.createElement('br'), hide);
    b.appendChild(empty);
  }
  if (tabs.length) empty?.remove();
}

function place(t, id, before = null) {
  const btn = tabBtn(t), p = pane(t), h = head(id), b = body(id);
  if (!btn || !p || !h || !b) return;
  const ref = before && before !== t ? tabBtn(before) : null;
  h.insertBefore(btn, ref && ref.parentElement === h ? ref : h.querySelector(':scope > .panel-ctrl'));
  b.appendChild(p);
}

function apply(layout) {
  const want = {};
  for (const id of HOSTS) want[id] = [];
  const used = new Set();
  for (const id of HOSTS) {
    for (const t of layout?.[id] || []) if (origin[t] && !used.has(t)) { want[id].push(t); used.add(t); }
  }
  // Onglets absents de la disposition (nouveaux) : à leur place d'origine
  for (const id of HOSTS) for (const t of defaults[id]) if (!used.has(t)) want[id].push(t);
  for (const id of HOSTS) for (const t of want[id]) place(t, id);
  for (const id of HOSTS) tidy(id);
  emit('tabsMoved');
}

function current() {
  const out = {};
  for (const id of HOSTS) out[id] = tabsOf(id);
  return out;
}

const isDefault = (l) => HOSTS.every((id) => (l[id] || []).join() === defaults[id].join());

function save() {
  const l = current();
  setPref('tabLayout', isDefault(l) ? null : l);
}

// ---------- Glisser-déposer ----------
let drag = null;

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const pnl = el?.closest('.panel');
  const id = HOSTS.find((h) => pnl?.classList.contains(`p-${h}`));
  if (!id || !head(id)) return null;
  // Place : avant le premier onglet dont le milieu est à droite du pointeur (même ligne)
  const tabs = [...head(id).querySelectorAll(':scope > [data-tab]')].filter((b) => b !== drag.btn);
  let before = null;
  for (const b of tabs) {
    const r = b.getBoundingClientRect();
    if (y < r.bottom && (y < r.top || x < r.left + r.width / 2)) { before = b; break; }
  }
  return { id, before };
}

function showMarker(t) {
  let m = drag.marker;
  if (!t) { m.hidden = true; return; }
  const h = head(t.id);
  const ref = t.before?.getBoundingClientRect();
  const tabs = [...h.querySelectorAll(':scope > [data-tab]')].filter((b) => b !== drag.btn);
  const last = tabs.at(-1)?.getBoundingClientRect();
  const hr = h.getBoundingClientRect();
  const x = ref ? ref.left - 3 : last ? last.right + 3 : hr.left + 12;
  const r = ref || last || { top: hr.top + 8, height: hr.height - 16 };
  Object.assign(m.style, { left: `${x - 1}px`, top: `${r.top}px`, height: `${r.height}px` });
  m.hidden = false;
  for (const id of HOSTS) panel(id)?.classList.toggle('tab-drop', id === t.id);
}

function endDrag(commit) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost?.remove();
  d.marker?.remove();
  document.body.classList.remove('tab-dragging');
  for (const id of HOSTS) panel(id)?.classList.remove('tab-drop');
  if (!commit || !d.target) return;
  const t = d.btn.dataset.tab;
  const from = HOSTS.find((h) => head(h)?.contains(d.btn));
  place(t, d.target.id, d.target.before?.dataset.tab || null);
  tidy(d.target.id, t);
  if (from && from !== d.target.id) tidy(from);
  save();
  emit('tabsMoved');
  if (from !== d.target.id) toast(`Onglet « ${d.btn.textContent.trim()} » déplacé. Pour tout remettre en place : Réglages → Disposition.`, 3500, 'move');
}

function onDown(e) {
  const btn = e.target.closest('.panel-head[data-tabs] > [data-tab]');
  if (!btn || e.button !== 0 || window.innerWidth <= 900) return;
  const sx = e.clientX, sy = e.clientY;
  const move = (ev) => {
    if (!drag) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      drag = { btn, target: null };
      drag.ghost = btn.cloneNode(true);
      drag.ghost.className = 'tab active tab-ghost';
      drag.marker = document.createElement('div');
      drag.marker.className = 'tab-marker';
      drag.marker.hidden = true;
      document.body.append(drag.ghost, drag.marker);
      document.body.classList.add('tab-dragging');
    }
    drag.ghost.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 8}px)`;
    drag.target = dropTarget(ev.clientX, ev.clientY);
    showMarker(drag.target);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', esc);
    if (!drag) return;
    // Le clic qui suit le relâchement ne doit pas ouvrir l'onglet de départ
    window.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    endDrag(true);
  };
  const esc = (ev) => { if (ev.key === 'Escape') endDrag(false); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', esc);
}

export function resetTabs() {
  setPref('tabLayout', null);
}

export function initTabMove() {
  for (const id of HOSTS) {
    defaults[id] = tabsOf(id);
    for (const t of defaults[id]) origin[t] = id;
  }
  if (prefs.tabLayout) apply(prefs.tabLayout);
  else for (const id of HOSTS) tidy(id);
  on('prefs', (k) => { if (k === 'tabLayout') apply(prefs.tabLayout); });
  document.addEventListener('pointerdown', onDown);
  $('#tabsReset')?.addEventListener('click', () => { resetTabs(); toast('Onglets remis à leur place d\'origine', 2500, 'check'); });
}
