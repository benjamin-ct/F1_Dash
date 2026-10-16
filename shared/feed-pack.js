// Flux d'actu de toutes les sources en une seule réponse (page web du créateur) : réponses brutes
// mises bout à bout, chacune précédée de trois lignes (identifiant de la source, type, taille en
// octets). Les octets sont gardés tels quels : l'encodage de chaque flux est lu dans le navigateur.
const enc = new TextEncoder();

// parts : [{ id, type, body: Uint8Array }] -> Uint8Array
export function packFeeds(parts) {
  const chunks = [];
  for (const p of parts) {
    if (!p?.body) continue;
    chunks.push(enc.encode(`${String(p.id).replace(/\s/g, '')}\n${String(p.type || '').replace(/[\r\n]/g, ' ')}\n${p.body.length}\n`), p.body);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Uint8Array -> [{ id, type, body: Uint8Array }] (lecture arrêtée à la première entrée abîmée)
export function unpackFeeds(buf) {
  const dec = new TextDecoder();
  const out = [];
  let i = 0;
  const line = () => {
    const nl = buf.indexOf(10, i);
    if (nl < 0) return null;
    const s = dec.decode(buf.subarray(i, nl));
    i = nl + 1;
    return s;
  };
  while (i < buf.length) {
    const id = line();
    const type = line();
    const size = Number(line());
    if (id === null || type === null || !Number.isInteger(size) || size < 0 || i + size > buf.length) break;
    out.push({ id, type, body: buf.subarray(i, i + size) });
    i += size;
  }
  return out;
}
