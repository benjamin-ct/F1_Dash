import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onLight } from '../shared/colors.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (hex) => 1.05 / (lum(hex) + 0.05);

test('thème clair : couleurs d\'équipe pâles assombries jusqu\'à un contraste de 3:1', () => {
  for (const c of ['#27F4D2', '#64C4FF', '#52E252', '#FFFFFF', '#B6BABD', '#FFD12E']) {
    const out = onLight(c);
    assert.ok(contrast(out) >= 3, `${c} -> ${out} (${contrast(out).toFixed(2)})`);
  }
  assert.equal(onLight('#E8002D'), '#e8002d', 'couleur déjà lisible inchangée');
  assert.equal(onLight('#4781D7'), '#4781d7');
  assert.equal(onLight('var(--muted)'), 'var(--muted)', 'valeur non hexadécimale laissée telle quelle');
});
