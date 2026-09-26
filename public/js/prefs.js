// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet } from './util.js';
import { emit } from './store.js';

const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  alerts: { sound: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true },
  hiddenPanels: [],
  hiddenCols: [],
  radioAuto: false,
  radioFilter: 'all',
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
