// Chargement des tracés (via le serveur, qui met en cache l'API MultiViewer).
import { api } from './util.js';
import { Track } from '/shared/track.js';

export { Track };

const cache = new Map();

export async function loadTrack(circuitKey, year) {
  const k = `${circuitKey}-${year}`;
  if (!cache.has(k)) {
    cache.set(k, api(`/api/circuit?key=${circuitKey}&year=${year}`).then((d) => new Track(d)).catch((err) => {
      cache.delete(k);
      throw err;
    }));
  }
  return cache.get(k);
}
