// Statistiques d'utilisation anonymes, envoyées seulement si l'utilisateur a accepté (question au
// premier lancement, puis Réglages → Application). Les fenêtres (ordinateur, téléphone) signalent les
// fonctions utilisées ; le serveur les additionne et envoie les totaux toutes les 15 minutes au
// petit serveur des statistiques (analytics/worker.js). Rien d'autre : ni compte F1 TV, ni
// identifiant, ni contenu (l'adresse IP n'est pas conservée là-bas).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getConfig, saveConfig } from './config.js';
import { request } from './net.js';
import { cleanBatch, EVENT_RE, DEVICES, MAX_COUNT } from '../shared/stats.js';

// Adresse du serveur des statistiques ; PADDOCK_STATS_URL vide = fonction désactivée (aucune question)
export const STATS_URL = process.env.PADDOCK_STATS_URL ?? 'https://paddock-live-stats.creusatbenjamin.workers.dev/e';
const VERSION = process.env.PADDOCK_VERSION || 'dev';
const OS = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] || 'other';
const FLUSH_MS = 15 * 60e3;
const PENDING_FILE = path.join(DATA_DIR, 'stats-pending.json');

// Compteurs pas encore envoyés, gardés sur le disque : rien de perdu si l'appli se ferme avant l'envoi
const diskStore = {
  load() { try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; } },
  save(items) {
    try {
      if (items.length) fs.writeFileSync(PENDING_FILE, JSON.stringify(items));
      else fs.rmSync(PENDING_FILE, { force: true });
    } catch { /* disque indisponible : tant pis */ }
  },
};

// Compteur indépendant du serveur HTTP (testable) : config, envoi et stockage injectés
export function createStats({
  config = { get: getConfig, save: saveConfig }, post = postBatch, store = diskStore,
  url = STATS_URL, version = VERSION, os = OS, today = () => new Date().toISOString().slice(0, 10),
} = {}) {
  const counts = new Map();
  const enabled = () => !!url && config.get().stats === true;
  let saveTimer = null;
  const items = () => [...counts].map(([k, n]) => [...k.split('|'), n]);
  const persist = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; store.save(items()); }, 5000);
    saveTimer.unref?.();
  };
  const add = (event, device, n) => {
    const k = `${event}|${device}`;
    counts.set(k, Math.min(MAX_COUNT, (counts.get(k) || 0) + n));
    persist();
  };
  if (enabled()) for (const [ev, dev, n] of store.load()) if (EVENT_RE.test(ev) && DEVICES.includes(dev) && Number.isInteger(n) && n > 0) add(ev, dev, n);

  // Installation active aujourd'hui (une fois par jour), nouvelle installation (une seule fois)
  const markActive = () => {
    if (!enabled()) return;
    const c = config.get();
    const day = today();
    if (c.statsDay === day) return;
    add('app.active', '-', 1);
    if (!c.statsInstalled) add('app.install', '-', 1);
    config.save({ statsDay: day, statsInstalled: true });
  };

  return {
    state: () => ({ available: !!url, enabled: enabled(), asked: typeof config.get().stats === 'boolean' }),
    set(on) {
      config.save({ stats: !!on });
      if (on) markActive();
      else { counts.clear(); clearTimeout(saveTimer); saveTimer = null; store.save([]); }
    },
    // Événement venu du serveur lui-même (séances, erreurs)
    record(event, n = 1) {
      if (enabled() && EVENT_RE.test(event)) add(event, '-', n);
    },
    // Événements d'une fenêtre : { nom: nombre }. Les compteurs « app. » (sauf les ouvertures) et
    // « session. » sont réservés au serveur.
    fromClient(events, device) {
      if (!enabled() || !events || typeof events !== 'object' || Array.isArray(events)) return 0;
      const dev = DEVICES.includes(device) && device !== '-' ? device : 'browser';
      let added = 0;
      for (const [ev, n] of Object.entries(events).slice(0, 100)) {
        if (!EVENT_RE.test(ev) || (ev.startsWith('app.') && ev !== 'app.open') || ev.startsWith('session.')) continue;
        if (!Number.isInteger(n) || n < 1) continue;
        add(ev, dev, Math.min(n, 500));
        added++;
      }
      return added;
    },
    markActive,
    pending: items,
    async flush() {
      markActive();
      if (!enabled() || !counts.size) return false;
      const batch = cleanBatch({ v: version, os, items: items() });
      counts.clear();
      if (!batch) { store.save([]); return false; }
      try {
        await post(url, { v: batch.version, os: batch.os, items: batch.items });
        store.save(items());   // ce qui a pu arriver pendant l'envoi
        return true;
      } catch {
        // Hors ligne : les compteurs reviennent pour le prochain envoi
        for (const [ev, dev, n] of batch.items) add(ev, dev, n);
        return false;
      }
    },
  };
}

async function postBatch(url, body) {
  const data = JSON.stringify(body);
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, body: data, timeout: 10000 });
  if (r.status >= 300) throw new Error(`HTTP ${r.status}`);
}

export const stats = createStats();

// Envoi régulier + séances suivies en direct (une fois par séance, quand les chronos arrivent)
export function startStats(hub, live) {
  if (!STATS_URL) return;
  let lastLive = null;
  const tick = () => {
    const running = Date.now() - (live.lastTimingAt || 0) < 120e3;
    if (hub.source?.mode === 'live' && running && hub.sessionKey && hub.sessionKey !== lastLive) {
      lastLive = hub.sessionKey;
      stats.record('session.live');
    }
  };
  setInterval(tick, 60e3).unref();
  setInterval(() => stats.flush(), FLUSH_MS).unref();
  setTimeout(() => stats.flush(), 60e3).unref();
}
