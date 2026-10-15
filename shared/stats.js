// Statistiques d'utilisation anonymes : format des compteurs envoyés, commun à l'appli et au petit
// serveur qui les additionne (analytics/worker.js). Seulement des noms de fonctions et des nombres :
// ni identifiant, ni contenu, ni adresse.

export const DEVICES = ['desktop', 'phone', 'browser', '-'];
export const SYSTEMS = ['win', 'mac', 'linux', 'other'];
export const EVENT_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
export const VERSION_RE = /^(\d{1,4}\.\d{1,4}\.\d{1,4}|dev)$/;
export const MAX_ITEMS = 300;
export const MAX_COUNT = 5000;

// Lot reçu -> { version, os, items: [[événement, appareil, nombre]] }, ou null s'il est invalide.
// Les lignes mal formées sont ignorées ; les doublons sont additionnés.
export function cleanBatch(body) {
  if (!body || typeof body !== 'object') return null;
  const version = String(body.v || '');
  const os = String(body.os || '');
  if (!VERSION_RE.test(version) || !SYSTEMS.includes(os) || !Array.isArray(body.items)) return null;
  const sum = new Map();
  for (const it of body.items.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(it)) continue;
    const [event, device, n] = it;
    if (typeof event !== 'string' || !EVENT_RE.test(event) || !DEVICES.includes(device)) continue;
    if (!Number.isInteger(n) || n < 1) continue;
    const k = `${event}|${device}`;
    sum.set(k, Math.min(MAX_COUNT, (sum.get(k) || 0) + n));
  }
  if (!sum.size) return null;
  return { version, os, items: [...sum].map(([k, n]) => [...k.split('|'), n]) };
}

// Fonctions suivies, pour la page de stats : nom lisible et rubrique (les autres s'affichent telles quelles)
export const LABELS = {
  'app.active': 'Installations actives (par jour)',
  'app.install': 'Nouvelles installations',
  'app.open': 'Ouvertures de l\'interface',
  'session.live': 'Séances suivies en direct',
  'session.replay': 'Replays lancés',
  'lang.fr': 'Interface en français',
  'lang.en': 'Interface en anglais',
  'rail.live': 'Direct',
  'rail.ana': 'Analyse',
  'rail.season': 'Saison',
  'rail.news': 'Actu',
  'rail.replay': 'Replays (menu)',
  'rail.radio': 'Commentaires F1 TV / radio',
  'rail.summary': 'Résumé de la séance',
  'rail.mini': 'Mini-classement',
  'rail.reset': 'Disposition des panneaux',
  'rail.settings': 'Réglages',
  'feature.autosync': 'Synchro TV par le son',
  'feature.transcribe': 'Transcription des radios',
  'feature.radio-play': 'Écoute d\'une radio d\'équipe',
  'feature.predict': 'Pronostics',
  'feature.moments': 'Moments clés du replay',
  'feature.backup': 'Sauvegarde des réglages',
  'feature.lan': 'Accès depuis le téléphone',
  'feature.lights': 'Lumières connectées',
  'feature.reminders': 'Rappels / calendrier',
  'feature.popout': 'Panneau dans une autre fenêtre',
  'tab.rcm': 'Direction de course',
  'tab.stewards': 'Enquêtes des commissaires',
  'tab.tracklimits': 'Limites de piste',
  'tab.radios': 'Radios d\'équipe',
  'tab.trace': 'Analyse · Race trace',
  'tab.positions': 'Analyse · Positions',
  'tab.laptimes': 'Analyse · Temps au tour',
  'tab.pace': 'Analyse · Rythme',
  'tab.tyrehist': 'Analyse · Historique des pneus',
  'tab.sectors': 'Analyse · Secteurs',
  'tab.compare': 'Analyse · Comparaison',
  'tab.telemetry': 'Analyse · Télémétrie',
  'tab.pits': 'Arrêts aux stands',
  'tab.strategy': 'Stratégie',
  'tab.tyres': 'Jeux de pneus',
  'tab.pitsim': 'Simulateur d\'arrêt',
  'tab.battles': 'Bagarres',
  'tab.weather': 'Météo',
  'tab.champ': 'Projection du championnat',
  'season.home': 'Saison · Accueil',
  'season.calendar': 'Saison · Calendrier',
  'season.standings': 'Saison · Classements',
  'season.results': 'Saison · Résultats et records',
  'season.ratings': 'Saison · Notes des pilotes',
  'season.predict': 'Saison · Pronostics',
  'season.drivers': 'Saison · Pilotes',
  'season.consistency': 'Saison · Régularité',
  'season.pits': 'Saison · Arrêts aux stands',
  'season.speeds': 'Saison · Vitesses de pointe',
  'season.circuits': 'Saison · Profil des circuits',
  'season.tech': 'Saison · Évolutions techniques',
  'season.elements': 'Saison · Éléments moteur',
  'settings.source': 'Réglages · Source',
  'settings.f1tv': 'Réglages · Compte F1 TV',
  'settings.display': 'Réglages · Affichage',
  'settings.alerts': 'Réglages · Alertes et favoris',
  'settings.app': 'Réglages · Application',
};

// Rubriques des fonctions (page des stats) : préfixe du compteur -> nom
export const FEATURE_GROUPS = { rail: 'Navigation', tab: 'Onglets', season: 'Saison', feature: 'Fonctions', settings: 'Réglages' };
