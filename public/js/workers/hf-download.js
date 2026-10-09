// Téléchargement fiable des gros fichiers de modèles (jusqu'à plus de 2 Go). Sans cela,
// transformers.js lit chaque fichier d'un seul bloc : si la connexion se fige en cours de
// route, le téléchargement reste bloqué indéfiniment. Ici, le fichier arrive par morceaux
// (requêtes « Range ») : un morceau sans données pendant 45 s est relancé, jusqu'à 8 fois.
// Le fichier est ensuite rangé dans le cache de transformers.js (même clé), qui le relit
// sans rien retélécharger.
const HF = 'https://huggingface.co/';
const CACHE = 'transformers-cache';
const CHUNK = 32 * 1024 * 1024;
const STALL_MS = 45000;
const TRIES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Lit une réponse en surveillant les blocages ; renvoie un Blob (gardé sur disque si gros)
async function readWatched(res, ctrl, onBytes) {
  const reader = res.body.getReader();
  const parts = [];
  let timer = setTimeout(() => ctrl.abort(), STALL_MS);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), STALL_MS);
      parts.push(value);
      onBytes(value.length);
    }
  } finally {
    clearTimeout(timer);
  }
  return new Blob(parts);
}

async function fetchRange(url, start, end, onBytes) {
  const ctrl = new AbortController();
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: ctrl.signal });
  if (res.status === 404) return { missing: true };
  if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const total = Number((/\/(\d+)$/.exec(res.headers.get('Content-Range') || '') || [])[1]) || Number(res.headers.get('Content-Length')) || 0;
  return { ranged: res.status === 206, total, blob: await readWatched(res, ctrl, onBytes) };
}

// onProgress(loaded, total)
export async function download(url, onProgress = () => {}) {
  const parts = [];
  let loaded = 0;
  let total = 0;
  for (let start = 0; !total || start < total;) {
    const end = start + CHUNK - 1;
    let got = null;
    for (let i = 1; i <= TRIES && !got; i++) {
      let partial = 0;
      try {
        got = await fetchRange(url, start, end, (n) => { partial += n; onProgress(loaded + partial, total); });
      } catch (err) {
        if (i === TRIES) throw new Error(`téléchargement interrompu (${err.name === 'AbortError' ? 'connexion figée' : err.message})`);
        await sleep(Math.min(30000, 1000 * 2 ** i));
      }
    }
    if (got.missing) return null;
    if (!got.ranged) {
      // Serveur sans « Range » : le fichier entier est arrivé d'un coup
      onProgress(got.blob.size, got.blob.size);
      return got.blob;
    }
    total = got.total;
    parts.push(got.blob);
    loaded += got.blob.size;
    start += got.blob.size;
    onProgress(loaded, total);
    if (!got.blob.size) throw new Error('réponse vide');
  }
  return new Blob(parts);
}

// Met en cache les fichiers d'un modèle s'ils n'y sont pas déjà. Un fichier absent du dépôt
// est ignoré (transformers.js téléchargera lui-même ce dont il a besoin).
export async function prefetch(model, files, onProgress) {
  const cache = await caches.open(CACHE);
  for (const file of files) {
    const url = `${HF}${model}/resolve/main/${file}`;
    if (await cache.match(url)) continue;
    const blob = await download(url, (loaded, total) => onProgress?.(file, loaded, total));
    if (!blob) continue;
    await cache.put(url, new Response(blob, { headers: { 'Content-Length': String(blob.size), 'Content-Type': 'application/octet-stream' } }));
    onProgress?.(file, null, null);
  }
}
