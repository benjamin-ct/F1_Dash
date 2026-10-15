// Langue de l'interface. Le texte d'origine (dans le code et le HTML) est en français ; en anglais,
// chaque texte affiché est remplacé à la volée d'après le dictionnaire i18n-en.js :
// - t('Texte', valeurs…) dans le code (dessins sur canvas, messages, attributs) ;
// - traduction automatique de la page (textes et infobulles), y compris de ce qui s'affiche ensuite.
// Les valeurs dynamiques s'écrivent {} dans le dictionnaire (dans l'ordre), ou {0}, {1}… pour les
// remettre dans un autre ordre en anglais.

function storedLang() {
  try {
    const p = JSON.parse(localStorage.getItem('paddock.prefs') || 'null');
    if (p === null) return null;            // première ouverture
    return p.lang === 'en' ? 'en' : 'fr';   // installations existantes : français, sauf choix contraire
  } catch { return null; }
}

// Première ouverture : la langue du système (français, sinon anglais)
export const LANG = storedLang() ?? ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
export const EN = LANG === 'en';
export const LOCALE = EN ? 'en-GB' : 'fr-FR';
export const DEC = EN ? '.' : ',';          // séparateur décimal

// Appli de bureau : l'écran de démarrage suit la langue choisie
try { window.f1desktop?.setLang?.(LANG); } catch { /* navigateur */ }

const DICT = EN ? new Map(Object.entries((await import('./i18n-en.js')).default)) : null;

// Gabarits (textes avec {}) : expression régulière + traduction
const PATTERNS = [];
if (EN) {
  for (const [fr, en] of DICT) {
    if (!fr.includes('{}')) continue;
    const parts = fr.split('{}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    PATTERNS.push({ re: new RegExp(`^${parts.join('(.*?)')}$`), en, head: fr.split('{}')[0] });
  }
  // Les gabarits les plus précis (texte fixe le plus long) d'abord
  PATTERNS.sort((a, b) => b.re.source.length - a.re.source.length);
}

function fill(en, vals) {
  let i = 0;
  return en.replace(/\{(\d*)\}/g, (_, n) => String(vals[n === '' ? i++ : Number(n)] ?? ''));
}

const misses = new Set();

// Traduction d'un texte déjà composé (valeurs comprises) ; null si inconnu
export function translate(text) {
  if (!EN) return null;
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const hit = DICT.get(key);
  if (hit !== undefined) return hit;
  if (misses.has(key)) return null;
  for (const p of PATTERNS) {
    if (p.head && !key.startsWith(p.head)) continue;
    const m = key.match(p.re);
    if (m) {
      // Les valeurs elles-mêmes peuvent être des textes à traduire (« Tour {} » dans un gabarit)
      return fill(p.en, m.slice(1).map((v) => { const tr = translate(v); return tr === null ? v : v.match(/^\s*/)[0] + tr + v.match(/\s*$/)[0]; }));
    }
  }
  if (misses.size > 20000) misses.clear();
  misses.add(key);
  return null;
}

// Texte dessiné (canvas) : traduit s'il est connu, tel quel sinon (rapide en français)
export function tx(s) {
  if (!EN || typeof s !== 'string') return s;
  const hit = DICT.get(s);
  if (hit !== undefined) return hit;
  if (misses.has(s)) return s;
  const en = translate(s);
  if (en === null) { misses.add(s); return s; }
  return en;
}

// Dans le code : t('Il y a {} s', n) -> « Il y a 3 s » ou « 3 s ago »
export function t(fr, ...vals) {
  const en = EN ? DICT.get(fr) : undefined;
  return vals.length ? fill(en ?? fr, vals) : (en ?? fr);
}

// Nombre décimal à la française ou à l'anglaise
export const dec = (s) => (EN ? String(s) : String(s).replace('.', ','));

// ---------- Traduction de la page ----------
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

function textNode(n) {
  const v = n.nodeValue;
  if (!v || !/[A-Za-zÀ-ÿ]{2}/.test(v)) return;
  const p = n.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('[data-no-i18n]')) return;
  const en = translate(v);
  if (en === null) return;
  const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
  const next = lead + en + trail;
  if (next !== v) n.nodeValue = next;
}

function element(el) {
  if (el.closest?.('[data-no-i18n]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v) { const en = translate(v); if (en !== null && en !== v) el.setAttribute(a, en); }
  }
}

function walk(root) {
  if (root.nodeType === 3) { textNode(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
  element(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) textNode(n);
    else element(n);
  }
}

export function translatePage() {
  if (!EN) return;
  document.documentElement.lang = 'en';
  const title = translate(document.title);
  if (title) document.title = title;
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') element(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
