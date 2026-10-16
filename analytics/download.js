// Téléchargement de l'appli depuis le site : /download/<système> renvoie vers le fichier de la
// dernière version publiée sur GitHub (le nom des fichiers change à chaque version) ;
// /download/latest.json donne le numéro de version au site. La version est lue sur la redirection
// publique de GitHub (/releases/latest -> /releases/tag/vX.Y.Z) : l'API de GitHub limite les
// requêtes venant des adresses partagées de Cloudflare. Gardée 10 minutes.
const REPO = 'benjamin-ct/paddock-live';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
// Fichiers publiés par le workflow « Application de bureau » (v = numéro de version sans « v »)
export const FILES = {
  windows: (v) => `Paddock-Live-${v}-x64-win.exe`,
  'windows-portable': (v) => `Paddock-Live-${v}-portable.exe`,
  'mac-arm': (v) => `Paddock-Live-${v}-mac-arm64.dmg`,
  'mac-intel': (v) => `Paddock-Live-${v}-mac-x64.dmg`,
  linux: (v) => `Paddock-Live-${v}-linux-x86_64.AppImage`,
  'linux-arm': (v) => `Paddock-Live-${v}-linux-arm64.AppImage`,
  deb: (v) => `Paddock-Live-${v}-linux-amd64.deb`,
};
const KEEP = 10 * 60e3;
let memo = null;

export async function latestVersion({ fetchFn = fetch, now = Date.now() } = {}) {
  if (memo && now - memo.at < KEEP) return memo.v;
  const r = await fetchFn(RELEASES, { redirect: 'manual', headers: { 'User-Agent': 'paddock-live-site' } });
  const v = (r.headers.get('Location') || '').match(/\/releases\/tag\/v?(\d+\.\d+\.\d+)$/)?.[1];
  if (!v) throw new Error(`GitHub ${r.status}`);
  memo = { at: now, v };
  return v;
}

export async function download(path, opts) {
  const what = path.replace(/^\/download\/?/, '');
  const cache = { 'Cache-Control': 'public, max-age=300' };
  let v = null;
  try { v = await latestVersion(opts); } catch { /* GitHub injoignable : page des versions */ }
  if (what === 'latest.json') {
    return new Response(JSON.stringify({ version: v, files: Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, v ? f(v) : null])) }), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...cache } });
  }
  const file = FILES[what] && v ? FILES[what](v) : null;
  return new Response(null, { status: 302, headers: { Location: file ? `https://github.com/${REPO}/releases/download/v${v}/${file}` : RELEASES, ...cache } });
}
