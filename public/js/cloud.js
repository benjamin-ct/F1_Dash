// Traduction par le serveur Paddock Live (Workers AI), via le serveur de l'appli : actualités, radios,
// documents FIA. Rien n'est calculé sur l'ordinateur ; chaque texte est traduit une fois pour tous.
// Désactivable dans Réglages → Application. Serveur injoignable : pause de 10 minutes, l'appli
// traduit alors sur l'ordinateur comme avant.
import { prefs, setPref } from './prefs.js';
import { on } from './store.js';

const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
let pending = [];
let timer = 0;
let offUntil = 0;

export const cloudOn = () => prefs.cloudTranslate !== false && Date.now() >= offUntil;

async function flush() {
  timer = 0;
  const list = pending;
  pending = [];
  const byLang = new Map();
  for (const p of list) byLang.set(p.to, [...(byLang.get(p.to) || []), p]);
  for (const [to, part] of byLang) {
    let out = [];
    try {
      const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, items: part.map(({ text, from }) => ({ text, from })) }) });
      if (res.ok) out = (await res.json()).out || [];
      else offUntil = Date.now() + 10 * 60e3;
    } catch { offUntil = Date.now() + 10 * 60e3; }
    part.forEach((p, i) => p.resolve(typeof out[i] === 'string' && out[i].trim() ? out[i] : null));
  }
}

// Traduction d'un texte, ou null (désactivé, indisponible, langue non prise en charge)
export function cloudTranslate(text, from, to) {
  if (!text || !cloudOn() || !LANGS.includes(to)) return Promise.resolve(null);
  return new Promise((resolve) => {
    pending.push({ text, from: LANGS.includes(from) ? from : 'en', to, resolve });
    if (pending.length >= 40) { clearTimeout(timer); flush(); } else timer ||= setTimeout(flush, 60);
  });
}

// Case « Traduire avec le serveur Paddock Live » (Réglages → Application)
export function initCloud() {
  const box = document.querySelector('#cloudTranslate');
  if (!box) return;
  box.checked = prefs.cloudTranslate !== false;
  box.addEventListener('change', (e) => { offUntil = 0; setPref('cloudTranslate', e.target.checked); });
  on('prefs', (k) => { if (k === 'cloudTranslate') box.checked = prefs.cloudTranslate !== false; });
}
