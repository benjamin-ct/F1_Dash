// Copie le serveur et l'interface dans desktop/app/ avant l'empaquetage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'bundle');
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['server', 'public', 'shared']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
}
// Journal des modifications, affiché dans les réglages
fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(out, 'CHANGELOG.md'));
// Le serveur est un module ES : il a besoin de son package.json ("type": "module").
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));
console.log('Application copiée dans desktop/bundle');
