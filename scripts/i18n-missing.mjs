// Version anglaise : liste les textes de l'interface (code et HTML) qui n'ont pas encore de
// traduction dans public/js/i18n-en.js. À lancer après avoir ajouté des textes :
//   node scripts/i18n-missing.mjs
// Les valeurs dynamiques des gabarits (`${…}`) apparaissent comme {} : c'est la forme attendue
// dans le dictionnaire. Les fragments de code ou noms propres listés peuvent être ignorés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = (await import(path.join(ROOT, 'public/js/i18n-en.js'))).default;
const FR = /[éèàêçùôîâûœÉÈÀ]|\b(le|la|les|des|du|de|un|une|et|ou|pour|avec|sans|dans|sur|par|au|aux|est|pas|plus|tour|tours|pilote|pilotes|séance|course|délai)\b/i;
const keys = new Map();

function add(k, f) {
  k = k.replace(/\s+/g, ' ').trim();
  const html = f.endsWith('.html');
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(k)) return;
  if (!html && !FR.test(k) && !/^[A-ZÀ-Ý][a-zà-ÿ]+(\s|$|[.:…])/.test(k)) return;
  if (!html && /^[\w./#:-]+$/.test(k) && !/^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(k) && !/[éèàêç]/.test(k)) return;
  if (/^(https?:|\/api\/|#|\.|[a-z]+[A-Z])/.test(k) || /[{};]\s*$|=>|\(\)|^[a-z-]+:\s/.test(k.replace(/\{\}/g, ''))) return;
  if (!keys.has(k)) keys.set(k, f);
}
function segments(s, f) {
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ');
  for (const m of s.matchAll(/\b(title|placeholder|aria-label|alt)="([^"]*)"/g)) add(m[2], f);
  for (const part of s.split(/<[^>]*>/)) for (const p of part.split(/&nbsp;|\n/)) add(p.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), f);
}
function literals(src, f) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.|\$\{(?:[^{}]|\{[^{}]*\})*\})*)`/g;
  for (const m of src.matchAll(re)) {
    let s = m[1] ?? m[2] ?? m[3];
    if (s === undefined) continue;
    s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
    if (m[3] !== undefined) {
      for (const inner of s.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) literals(inner[1], f);
      s = s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '{}');
    }
    segments(s, f);
  }
}
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
walk(path.join(ROOT, 'public/js'));
// Hors interface : moteurs (radios, son), dictionnaires, textes rédigés directement en anglais
const SKIP = /workers\/|icons\.js|i18n|fia-docs-fr|audio-sync|calibrate/;
for (const f of files.filter((x) => x.endsWith('.js') && !SKIP.test(x))) literals(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f));
for (const f of ['public/index.html', 'public/mini.html']) segments(fs.readFileSync(path.join(ROOT, f), 'utf8'), f);

// Fragments de gabarits imbriqués (code) et textes déjà en anglais ou noms propres : ignorés
const CODE = /\$\{|card\(|const |\? '|: ''|\)\.join|=>/;
const missing = [...keys].filter(([k]) => dict[k] === undefined && dict[k.replace(/^\{\} /, '')] === undefined && !CODE.test(k) && FR.test(k));
for (const [k, f] of missing) console.log(`${f}\t${k}`);
console.log(`\n${missing.length} texte(s) sans traduction anglaise sur ${keys.size}.`);
