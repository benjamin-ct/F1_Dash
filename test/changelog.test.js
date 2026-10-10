import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseChangelog, changelogFor } from '../shared/changelog.js';

const text = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

test('journal : une section non vide par version, de la plus récente à la plus ancienne', () => {
  const v = parseChangelog(text);
  assert.ok(v.length > 10);
  assert.equal(new Set(v.map((x) => x.version)).size, v.length);
  for (let i = 1; i < v.length; i++) assert.ok(cmp(v[i - 1].version, v[i].version) > 0, `${v[i - 1].version} avant ${v[i].version}`);
  for (const x of v) assert.ok(x.body.includes('- '), `v${x.version} sans nouveautés`);
  // Toutes les versions publiées sauf éventuellement la première du fichier sont datées
  for (const x of v.slice(1)) assert.match(x.date || '', /^\d{4}-\d{2}-\d{2}$/);
});

test('journal : lecture d\'une section', () => {
  const md = '# Titre\n\n## v2.0.0 — à venir\n- B\n\n## v1.0.0 — 2026-01-02\n### Groupe\n- A\n';
  assert.deepEqual(parseChangelog(md).map((x) => [x.version, x.date]), [['2.0.0', null], ['1.0.0', '2026-01-02']]);
  assert.equal(changelogFor(md, 'v1.0.0').body, '### Groupe\n- A');
  assert.equal(changelogFor(md, '3.0.0'), null);
});

test('notes de version : refusées sans section dans le journal', () => {
  const script = new URL('../scripts/release-notes.mjs', import.meta.url).pathname;
  const top = parseChangelog(text)[0].version;
  const out = execFileSync(process.execPath, [script, `v${top}`], { encoding: 'utf8' });
  assert.match(out, new RegExp(`Nouveautés de la version ${top.replace(/\./g, '\\.')}`));
  assert.match(out, /Windows/);
  assert.throws(() => execFileSync(process.execPath, [script, 'v0.0.1'], { stdio: 'pipe' }));
});
