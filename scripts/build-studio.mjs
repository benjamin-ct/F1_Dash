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
// Icônes de l'écran d'accueil du téléphone (dessins dans analytics/icons) : Studio en rouge, statistiques en bleu
const ICONS = path.join(ROOT, 'analytics', 'icons');
fs.copyFileSync(path.join(ICONS, 'studio-180.png'), path.join(OUT, 'studio', 'apple-touch-icon.png'));
fs.copyFileSync(path.join(ICONS, 'studio-512.png'), path.join(OUT, 'studio', 'icon-512.png'));
// Icône et manifeste de la page des statistiques (écran d'accueil du téléphone)
fs.copyFileSync(path.join(ICONS, 'stats-180.png'), path.join(OUT, 'apple-touch-icon.png'));
fs.copyFileSync(path.join(ICONS, 'stats-512.png'), path.join(OUT, 'stats-icon-512.png'));
fs.writeFileSync(path.join(OUT, 'stats.webmanifest'), JSON.stringify({
  name: 'Statistiques · Paddock Live', short_name: 'Statistiques', start_url: '/stats', scope: '/', display: 'standalone',
  background_color: '#07080A', theme_color: '#07080A', lang: 'fr', icons: [{ src: '/stats-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
}, null, 2));
// « Tirer pour actualiser » de la page des statistiques : script classique tiré du module partagé
const ptr = fs.readFileSync(path.join(ROOT, 'shared', 'pull-refresh.js'), 'utf8').replace(/^export function/m, 'function');
fs.writeFileSync(path.join(OUT, 'stats-refresh.js'), `${ptr}\npullToRefresh(() => { location.reload(); return new Promise(() => {}); });\n`);
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
