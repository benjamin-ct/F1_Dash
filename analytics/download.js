// Téléchargement de l'appli depuis le site : /download/<système> renvoie vers le fichier de la
// dernière version publiée sur GitHub (le nom des fichiers change à chaque version) ;
// /download/latest.json donne le numéro de version au site. Dernière version gardée 10 minutes.
const REPO = 'benjamin-ct/paddock-live';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
export const FILES = {
  windows: /-x64-win\.exe$/,
  'windows-portable': /-portable\.exe$/,
  'mac-arm': /-mac-arm64\.dmg$/,
  'mac-intel': /-mac-x64\.dmg$/,
  linux: /-linux-x86_64\.AppImage$/,
  'linux-arm': /-linux-arm64\.AppImage$/,
  deb: /-linux-amd64\.deb$/,
};
const KEEP = 10 * 60e3;
let memo = null;

export async function latestRelease({ fetchFn = fetch, now = Date.now() } = {}) {
  if (memo && now - memo.at < KEEP) return memo.v;
  const r = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'paddock-live-site', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const d = await r.json();
  const v = { version: String(d.tag_name || '').replace(/^v/, ''), assets: (d.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url })) };
  memo = { at: now, v };
  return v;
}

export async function download(path, opts) {
  const what = path.replace(/^\/download\/?/, '');
  const cache = { 'Cache-Control': 'public, max-age=300' };
  let rel = null;
  try { rel = await latestRelease(opts); } catch { /* GitHub injoignable : page des versions */ }
  if (what === 'latest.json') {
    return new Response(JSON.stringify({ version: rel?.version || null, files: Object.fromEntries(Object.entries(FILES).map(([k, re]) => [k, rel?.assets.find((a) => re.test(a.name))?.name || null])) }), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...cache } });
  }
  const re = FILES[what];
  const asset = re && rel?.assets.find((a) => re.test(a.name));
  return new Response(null, { status: 302, headers: { Location: asset?.url || RELEASES, ...cache } });
}
