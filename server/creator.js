// Mode créateur : outils réservés au propriétaire de l'application (générateur de posts pour les
// réseaux sociaux). Caché par défaut, activé sur l'ordinateur avec un code dont seule l'empreinte
// est ici. Les images des posts sont enregistrées dans Téléchargements/Paddock Live.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getConfig, saveConfig, DATA_DIR } from './config.js';

const HASH = '821f51db5c6d39c7ae10873a31723f8d4748fc2a925c6736f4a57afa7d2dacc0';
const sha = (s) => crypto.createHash('sha256').update(s).digest();

export const creatorEnabled = () => getConfig().creator === true;

export function setCreator(code, on = true) {
  if (!on) { saveConfig({ creator: false }); return false; }
  const ok = crypto.timingSafeEqual(sha(`paddock-live:${String(code || '').trim().toUpperCase()}`), Buffer.from(HASH, 'hex'));
  if (ok) saveConfig({ creator: true });
  return ok;
}

// Dossier des posts : Téléchargements/Paddock Live/<séance> (sinon dans le dossier des données)
const clean = (s, max = 80) => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').slice(0, max);

export function postsDir(folder) {
  const dl = path.join(os.homedir(), 'Downloads');
  const base = fs.existsSync(dl) ? path.join(dl, 'Paddock Live') : path.join(DATA_DIR, 'posts');
  return path.join(base, clean(folder) || 'Posts');
}

export function savePostImage(folder, name, base64) {
  const file = clean(name, 100).replace(/\.png$/i, '');
  if (!file || typeof base64 !== 'string') throw new Error('Image invalide');
  const data = Buffer.from(base64, 'base64');
  if (data.length < 8 || data.readUInt32BE(0) !== 0x89504e47) throw new Error('Image PNG attendue');
  const dir = postsDir(folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${file}.png`), data);
  return dir;
}

export function openPostsDir(folder) {
  const dir = postsDir(folder);
  if (!fs.existsSync(dir)) throw new Error('Dossier introuvable');
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return dir;
}
