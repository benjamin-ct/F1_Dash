// Synchro TV par le son : recherche d'une radio dans le son du micro (calcul lourd, hors de la
// page pour ne pas la ralentir).
import { matchClip } from '/shared/audio-sync.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...matchClip(data.mic, data.clip) });
  } catch (err) {
    self.postMessage({ id: data.id, error: err.message });
  }
};
