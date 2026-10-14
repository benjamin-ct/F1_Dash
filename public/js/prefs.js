// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet, setVividTeams, setTeamLogos, setLogoColor } from './util.js';
import { emit, touch } from './store.js';

const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  alerts: { sound: true, vibrate: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true },
  hiddenPanels: [],
  hiddenCols: [],
  extraCols: [],          // colonnes facultatives ajoutées au classement (voir EXTRA_COLUMNS)
  towerFit: true,         // classement agrandi pour remplir la hauteur disponible
  theme: 'pitwall',       // thème unique de l'application
  scheme: 'dark',         // apparence : 'dark' (sombre) | 'light' (clair) | 'auto' (comme le système)
  vividTeams: false,      // couleurs d'équipe contrastées plutôt qu'officielles
  teamLogos: true,        // logos des écuries (classement, championnat) plutôt que barres de couleur
  logoColor: true,        // logos dans leurs couleurs officielles (sinon logo blanc sur la couleur d'équipe)
  keepAwake: true,
  motion: true,           // animations de l'interface (désactivées aussi si le système le demande)        // écran toujours allumé pendant une séance
  legends: true,          // légendes sous les panneaux (couleurs, colonnes, graphiques)
  replayMarks: true,
  hotLapDim: false,       // essais / qualifs : voitures hors tour lancé estompées (carte, classement)      // replay : périodes de safety car / VSC sur la barre de lecture
  layoutMode: 'auto',     // disposition : 'auto' (selon la séance) | 'race' | 'quali'
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
  rcmType: 'all',         // direction de course : type de messages affichés
  spoilers: false,
  newsAlerts: 'important', // actualités : 'important' | 'favs' | 'all' | 'off'
  newsTranslate: true,     // actualités traduites en français (sur l'ordinateur)
  newsSpoilers: true,      // actualités : titres masqués et alertes suspendues pendant une séance / un replay
  mapFollow: false,
  muted: false,
};

const saved = storageGet('f1dash.prefs', {});
export const prefs = { ...DEFAULTS, ...saved, alerts: { ...DEFAULTS.alerts, ...(saved.alerts || {}) } };
// Un seul thème depuis la v1.20 : Pitwall, en mode sombre ou clair. Les anciens thèmes (F1 Pro,
// F1 sobre, Classique, Bleu nuit) passent sur Pitwall, en mode sombre.
prefs.theme = 'pitwall';
if ((saved.themeV || 0) < 5) storageSet('f1dash.prefs', { ...storageGet('f1dash.prefs', {}), theme: 'pitwall', themeV: 5 });
prefs.themeV = 5;   // gardé dans chaque enregistrement des préférences
document.documentElement.dataset.motion = prefs.motion === false ? 'off' : 'on';
setVividTeams(prefs.vividTeams);
setTeamLogos(prefs.teamLogos);
setLogoColor(prefs.logoColor);

// Apparence : sombre, clair ou comme le système (data-scheme sur <html>, lu par le CSS et la carte)
const systemLight = window.matchMedia?.('(prefers-color-scheme: light)');
export function resolvedScheme() {
  return prefs.scheme === 'light' || (prefs.scheme === 'auto' && systemLight?.matches) ? 'light' : 'dark';
}
function applyScheme() {
  const v = resolvedScheme();
  if (document.documentElement.dataset.scheme !== v) {
    document.documentElement.dataset.scheme = v;
    emit('scheme', v);
    touch('DriverList');   // panneaux redessinés avec les couleurs de l'apparence (pneus, carte…)
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 'light' ? '#F4F5F7' : '#07080A');
}
document.documentElement.dataset.theme = 'pitwall';
applyScheme();
systemLight?.addEventListener?.('change', () => { if (prefs.scheme === 'auto') applyScheme(); });

// Couleurs d'équipe changées : les panneaux qui affichent les pilotes se redessinent.
function applyTeamColors() {
  setVividTeams(prefs.vividTeams);
  setTeamLogos(prefs.teamLogos);
  setLogoColor(prefs.logoColor);
  touch('DriverList');
}

export function setPref(key, value) {
  prefs[key] = value;
  if (['vividTeams', 'teamLogos', 'logoColor'].includes(key)) applyTeamColors();
  if (key === 'scheme') applyScheme();
  if (key === 'motion') document.documentElement.dataset.motion = value ? 'on' : 'off';
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
    if (['vividTeams', 'teamLogos', 'logoColor'].includes(key)) applyTeamColors();
    if (key === 'scheme') applyScheme();
    emit('prefs', key);
  }
});
