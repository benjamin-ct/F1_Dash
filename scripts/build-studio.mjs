// Fichiers statiques du serveur Paddock Live (dossier analytics/site, servi par le Worker) : page web
// du créateur (/studio/), code partagé (/shared/) et polices (/fonts/). Lancé par le workflow
// « Statistiques » avant le déploiement (et à la main pour un essai local).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'analytics', 'site');
const copy = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) if (filter(f)) fs.copyFileSync(path.join(from, f), path.join(to, f));
};

fs.rmSync(OUT, { recursive: true, force: true });
copy(path.join(ROOT, 'analytics', 'studio-page'), path.join(OUT, 'studio'));
copy(path.join(ROOT, 'shared'), path.join(OUT, 'shared'), (f) => f.endsWith('.js'));
copy(path.join(ROOT, 'public', 'fonts'), path.join(OUT, 'fonts'), (f) => /^(titillium|sairacondensed|jetbrainsmono).*\.woff2$|^OFL/.test(f));
// En-têtes : la page et l'API ne doivent pas être indexées ni mises en cache trop longtemps
fs.writeFileSync(path.join(OUT, '_headers'), `/studio/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/shared/*
  Cache-Control: no-cache
`);
const n = (d) => fs.readdirSync(path.join(OUT, d)).length;
console.log(`Site prêt : ${n('studio')} fichiers studio, ${n('shared')} modules partagés, ${n('fonts')} polices`);
