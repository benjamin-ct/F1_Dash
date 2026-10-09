// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet, setVividTeams, setTeamLogos } from './util.js';
import { emit, touch } from './store.js';

const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  alerts: { sound: true, vibrate: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true },
  hiddenPanels: [],
  hiddenCols: [],
  towerFit: true,         // classement agrandi pour remplir la hauteur disponible
  theme: 'noir',          // 'noir' | 'bleu'
  vividTeams: true,       // couleurs d'équipe contrastées plutôt qu'officielles
  teamLogos: true,
  keepAwake: true,        // écran toujours allumé pendant une séance
  legends: true,          // légendes sous les panneaux (couleurs, colonnes, graphiques)
  layoutMode: 'auto',     // disposition : 'auto' (selon la séance) | 'race' | 'quali'        // logos des écuries (classement, championnat) plutôt que barres de couleur
  radioAuto: false,
  radioText: false,       // transcription des radios en texte (Whisper local)
  radioLang: 'fr',        // langue de traduction des transcriptions ('none' : anglais)
  radioQuality: 'auto',   // modèles de transcription : 'auto' | 'high' (carte graphique) | 'light'
  radioFilter: 'all',
  pitView: 'chrono',      // onglet Arrêts : 'chrono' ou 'driver'
  commLang: 'FRA',        // commentaires F1 TV : langue
  commVolume: 0.8,
  commMuted: false,
  commSync: true,         // caler le son sur le délai du dashboard
  commOffset: 0,          // décalage manuel du son (s)
  commChannel: null,
  commSource: 'f1tv',     // 'f1tv' ou 'radio'
  radioStations: [],      // [{id, name, lang, url}]
  radioStation: null,
  rcmBlue: true,          // direction de course : drapeaux bleus affichés
  rcmDeleted: true,       // direction de course : temps supprimés affichés
  spoilers: false,
  mapFollow: false,
  muted: false,
};

const saved = storageGet('f1dash.prefs', {});
export const prefs = { ...DEFAULTS, ...saved, alerts: { ...DEFAULTS.alerts, ...(saved.alerts || {}) } };
setVividTeams(prefs.vividTeams);
setTeamLogos(prefs.teamLogos);

// Couleurs d'équipe changées : les panneaux qui affichent les pilotes se redessinent.
function applyTeamColors() {
  setVividTeams(prefs.vividTeams);
  setTeamLogos(prefs.teamLogos);
  touch('DriverList');
}

export function setPref(key, value) {
  prefs[key] = value;
  if (key === 'vividTeams' || key === 'teamLogos') applyTeamColors();
  if (key === 'theme') document.documentElement.dataset.theme = value;
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
    if (key === 'vividTeams' || key === 'teamLogos') applyTeamColors();
    if (key === 'theme') document.documentElement.dataset.theme = prefs[key];
    emit('prefs', key);
  }
});
