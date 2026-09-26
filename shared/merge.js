// Fusion des mises à jour partielles du flux F1 Live Timing.
// Le flux envoie des deltas : les tableaux de l'état initial sont mis à jour
// via des objets indexés ({"3": {...}}) et certaines clés sont supprimées via "_deleted".
export function merge(target, update) {
  if (update === null || typeof update !== 'object') return update;

  if (Array.isArray(update)) {
    const out = Array.isArray(target) ? target : [];
    for (let i = 0; i < update.length; i++) out[i] = merge(out[i], update[i]);
    return out;
  }

  if (target === null || typeof target !== 'object') target = {};

  if (Array.isArray(update._deleted)) {
    for (const key of update._deleted) {
      if (Array.isArray(target)) target[+key] = undefined;
      else delete target[key];
    }
  }

  for (const key of Object.keys(update)) {
    if (key === '_deleted') continue;
    if (Array.isArray(target)) {
      const i = Number(key);
      if (Number.isInteger(i)) target[i] = merge(target[i], update[key]);
    } else {
      target[key] = merge(target[key], update[key]);
    }
  }
  return target;
}
