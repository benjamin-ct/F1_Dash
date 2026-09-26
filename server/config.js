// Configuration locale persistée dans config.json (non versionné).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'config.json');

const defaults = {
  f1tvToken: null,
};

let current = { ...defaults };
try {
  current = { ...defaults, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch { /* pas encore de config */ }

if (process.env.F1TV_TOKEN) current.f1tvToken = process.env.F1TV_TOKEN;

export const settings = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  maxDelayMs: (Number(process.env.MAX_DELAY_SECONDS) || 600) * 1000,
};

export function getConfig() {
  return current;
}

export function saveConfig(patch) {
  current = { ...current, ...patch };
  fs.writeFileSync(FILE, JSON.stringify(current, null, 2));
  return current;
}

// Accepte : le JWT brut, la valeur (encodée ou non) du cookie "login-session" de formula1.com,
// ou un JSON contenant "subscriptionToken".
export function parseF1tvToken(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim().replace(/^["']|["']$/g, '');
  if (s.startsWith('%7B') || s.startsWith('%7b')) {
    try { s = decodeURIComponent(s); } catch { /* ignore */ }
  }
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      s = obj?.data?.subscriptionToken || obj?.subscriptionToken || '';
    } catch { return null; }
  }
  s = s.replace(/^Bearer\s+/i, '');
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(s) ? s : null;
}

export function tokenInfo(token) {
  if (!token) return { hasToken: false };
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const exp = payload.exp ? payload.exp * 1000 : null;
    return {
      hasToken: true,
      expiresAt: exp,
      expired: exp ? exp < Date.now() : false,
      subscription: payload.SubscriptionStatus || payload.subscriptionStatus || null,
    };
  } catch {
    return { hasToken: true, expiresAt: null, expired: false };
  }
}
