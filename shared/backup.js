// Fichier de sauvegarde des réglages : réglages de l'interface (gardés par le navigateur) et
// réglages gardés par le serveur. Les caches (radios écoutées, transcriptions, actus vues…) et
// l'état d'une séance (pilote suivi, duel) n'y sont pas.
export const UI_KEYS = [
  'prefs', 'delayMs', 'presets', 'followHost',
  'layouts', 'layoutProfiles', 'profileTabs', 'lastProfile', 'savedWindows', 'mobileTab',
  'mapOpts', 'analysis', 'compare', 'miniMode', 'techOriginal', 'player',
];
export const PREFIX = 'paddock.';

export function makeBackup(ui, server, date = new Date()) {
  const out = { app: 'paddock-live', type: 'reglages', version: 1, date: date.toISOString(), interface: {} };
  for (const k of UI_KEYS) if (ui[k] !== undefined) out.interface[k] = ui[k];
  if (server) out.serveur = server;
  return out;
}

// Contenu d'un fichier choisi par l'utilisateur : erreur claire si ce n'est pas une sauvegarde
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Fichier illisible (JSON attendu)'); }
  if (!data || data.app !== 'paddock-live' || data.type !== 'reglages') throw new Error('Ce fichier n\'est pas une sauvegarde des réglages de Paddock Live');
  if (data.version > 1) throw new Error('Sauvegarde faite par une version plus récente : mettez l\'application à jour');
  const ui = {};
  const src = data.interface && typeof data.interface === 'object' ? data.interface : {};
  for (const k of UI_KEYS) if (src[k] !== undefined && src[k] !== null) ui[k] = src[k];
  if (ui.prefs !== undefined && (typeof ui.prefs !== 'object' || Array.isArray(ui.prefs))) delete ui.prefs;
  return { ui, server: data.serveur && typeof data.serveur === 'object' ? data.serveur : null, date: data.date || null };
}
