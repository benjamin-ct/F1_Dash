// Journal des publications sur cet ordinateur (config.json), complété par celui de la page web du
// créateur quand elle est activée (publications faites depuis le téléphone).
import { getConfig, saveConfig } from './config.js';
import { addEntry, mergeHistory } from '../shared/post-history.js';
import { studioCall } from './studio-sync.js';
import { postStats } from '../shared/post-stats.js';

export async function postHistory({ fetchFn } = {}) {
  const local = getConfig().postsHistory || [];
  const remote = await studioCall('history', { fetchFn });
  return mergeHistory(local, remote?.items || []);
}

export async function recordPost(entry, { fetchFn } = {}) {
  const list = addEntry(getConfig().postsHistory || [], entry);
  saveConfig({ postsHistory: list });
  await studioCall('history', { body: { entry }, fetchFn });
  return list;
}

// Statistiques des posts avec les comptes de cet ordinateur
export async function statsOfPosts() {
  const s = getConfig().social || {};
  return postStats(await postHistory(), { meta: s.meta, threads: s.threads, bluesky: s.bluesky });
}
