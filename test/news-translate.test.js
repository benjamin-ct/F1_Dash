import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewsTranslator } from '../server/news-translate.js';

const NOW = Date.UTC(2026, 9, 15, 12);
const H = 3600e3;

function setup({ lang = 'fr', available = true, refuse = [] } = {}) {
  const stored = {};
  const asked = [];
  const items = [
    { title: 'Verstappen on pole', summary: 'A great lap.', lang: 'en', t: NOW - H },
    { title: 'Doublé Ferrari', summary: 'Résumé', lang: 'fr', t: NOW - 2 * H },
    { title: 'Old news', summary: 'Old summary', lang: 'en', t: NOW - 4 * 24 * H },
    { title: 'Norris wins', summary: 'Three days ago.', lang: 'en', t: NOW - 2.5 * 24 * H },
    { title: 'Bad text', summary: '', lang: 'en', t: NOW - 3 * H },
  ];
  const state = { available };
  const t = createNewsTranslator({
    cloud: {
      available: () => state.available,
      async translate(text, from, to) { asked.push([text, from, to]); return refuse.includes(text) ? null : `[${to}] ${text}`; },
    },
    snapshot: () => items,
    known: (l) => stored[l] || {},
    store: (l, list) => { stored[l] ||= {}; for (const it of list) stored[l][it.en] = { t: it.t, q: it.q }; return list.length; },
    lang: () => lang,
    now: () => NOW,
  });
  return { t, stored, asked, state };
}

test('actualités traduites d\'avance : titres des 3 derniers jours, résumés des 2 derniers', async () => {
  const { t, stored, asked } = setup({ refuse: ['Bad text'] });
  await t.sweep();
  assert.deepEqual(Object.keys(stored.fr).sort(), ['A great lap.', 'Norris wins', 'Verstappen on pole']);
  assert.equal(stored.fr['Verstappen on pole'].t, '[fr] Verstappen on pole');
  // Déjà en français, trop ancien, résumé de plus de 2 jours : rien demandé
  assert.ok(!asked.some(([text]) => ['Doublé Ferrari', 'Old news', 'Three days ago.'].includes(text)));
  // Deuxième passage : rien à refaire (texte refusé non redemandé)
  const before = asked.length;
  await t.sweep();
  assert.equal(asked.length, before);
});

test('actualités traduites d\'avance : désactivé ou serveur indisponible', async () => {
  const off = setup({ lang: null });
  await off.t.sweep();
  assert.equal(off.asked.length, 0);
  const down = setup({ available: false });
  await down.t.sweep();
  assert.equal(down.asked.length, 0);
  // Serveur revenu : tout est traduit au passage suivant
  down.state.available = true;
  await down.t.sweep();
  assert.equal(Object.keys(down.stored.fr).length, 4);
});

test('actualités traduites d\'avance : un seul passage à la fois', async () => {
  const { t, asked } = setup();
  await Promise.all([t.sweep(), t.sweep(), t.sweep()]);
  const texts = asked.map(([text]) => text);
  assert.equal(texts.length, new Set(texts).size);
});
