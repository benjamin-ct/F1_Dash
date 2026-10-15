// Photos des pilotes (DriverList.HeadshotUrl) relayées par le serveur et gardées sur le disque
// (30 jours) : elles s'affichent même quand le site de la F1 refuse les images appelées depuis
// l'application, sur le téléphone (réseau local) et hors connexion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { request } from './net.js';
import { CACHE_DIR } from './circuits.js';

const DIR = path.join(CACHE_DIR, 'headshots');
const KEEP_MS = 30 * 24 * 3600e3;
const HOSTS = new Set(['media.formula1.com', 'www.formula1.com']);

// Seules les images du site de la F1 sont relayées
export function validHeadshot(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && /\.(png|jpe?g|webp)(\/|$|\?)|\/image\.png$/i.test(url.pathname);
  } catch { return false; }
}

export async function headshot(u) {
  if (!validHeadshot(u)) throw new Error('Photo invalide');
  const file = path.join(DIR, `${crypto.createHash('sha1').update(u).digest('hex')}.img`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < KEEP_MS) { const body = fs.readFileSync(file); return { body, type: sniff(body) }; }
  } catch { /* pas encore en cache */ }
  const r = await request(u, { timeout: 15000 });
  if (r.status !== 200) throw new Error(`Photo indisponible (HTTP ${r.status})`);
  const type = sniff(r.body);
  if (!type) throw new Error('Réponse qui n\'est pas une image');
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, r.body); } catch { /* cache facultatif */ }
  return { body: r.body, type };
}

// Type d'image d'après ses premiers octets
function sniff(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  return null;
}
