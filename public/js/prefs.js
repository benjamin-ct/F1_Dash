// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet } from './util.js';
import { emit } from './store.js';

const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  alerts: { sound: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true },
  hiddenPanels: [],
  hiddenCols: [],
  towerFit: true,         // classement agrandi pour remplir la hauteur disponible
  radioAuto: false,
  radioFilter: 'all',
  pitView: 'chrono',      // onglet Arrêts : 'chrono' ou 'driver'
  rcmBlue: true,          // direction de course : drapeaux bleus affichés
  rcmDeleted: true,       // direction de course : temps supprimés affichés
  spoilers: false,
  mapFollow: false,
  muted: false,
};

const saved = storageGet('f1dash.prefs', {});
export const prefs = { ...DEFAULTS, ...saved, alerts: { ...DEFAULTS.alerts, ...(saved.alerts || {}) } };

export function setPref(key, value) {
  prefs[key] = value;
  storageSet('f1dash.prefs', prefs);
  emit('prefs', key);
}

export function isFav(num) {
  return prefs.favs.includes(String(num));
}

export function toggleFav(num) {
  num = String(num);
  setPref('favs', isFav(num) ? prefs.favs.filter((n) => n !== num) : [...prefs.favs, num]);
}

// Préférences modifiées dans une autre fenêtre (favoris, colonnes, filtres…).
window.addEventListener('storage', (e) => {
  if (e.key !== 'f1dash.prefs' || e.newValue === null) return;
  let next;
  try { next = JSON.parse(e.newValue); } catch { return; }
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in next) || JSON.stringify(next[key]) === JSON.stringify(prefs[key])) continue;
    prefs[key] = key === 'alerts' ? { ...DEFAULTS.alerts, ...next.alerts } : next[key];
    emit('prefs', key);
  }
});
