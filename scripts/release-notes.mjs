// Texte de la page d'une version publiée : nouveautés de cette version (CHANGELOG.md), puis
// les instructions d'installation (.github/release-footer.md).
// Usage : node scripts/release-notes.mjs v1.15.0 > notes.md — échoue si la version n'a pas
// sa section dans CHANGELOG.md (chaque version publiée doit avoir son journal).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogFor } from '../shared/changelog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const entry = changelogFor(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), tag);
if (!entry || !entry.body) {
  console.error(`CHANGELOG.md : pas de section « ## ${tag} » — ajoutez les nouveautés de cette version avant de la publier.`);
  process.exit(1);
}
const footer = fs.readFileSync(path.join(root, '.github', 'release-footer.md'), 'utf8').trim();
process.stdout.write(`## Nouveautés de la version ${entry.version}\n\n${entry.body}\n\n---\n\n${footer}\n`);
