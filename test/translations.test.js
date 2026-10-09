import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dossier de données temporaire : le test ne touche pas au cache de l'utilisateur
process.env.F1DASH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'f1dash-test-'));
const { getTranslations, addTranslations } = await import('../server/translations.js');

test('traductions FIA : ajout, priorité au modèle de langage, entrées invalides', () => {
  const en = `Revised front wing flap ${Date.now()}`;
  assert.equal(addTranslations('fr', [{ en, t: 'Volet révisé (léger)', q: 'light' }]), 1);
  assert.equal(addTranslations('fr', [{ en, t: 'Autre version légère', q: 'light' }]), 0, 'une traduction légère ne remplace pas une autre');
  assert.equal(addTranslations('fr', [{ en, t: 'Volet d\'aileron avant révisé', q: 'high' }]), 1);
  assert.equal(addTranslations('fr', [{ en, t: 'Encore légère', q: 'light' }]), 0, 'la haute qualité est conservée');
  assert.equal(getTranslations('fr')[en].t, 'Volet d\'aileron avant révisé');
  assert.equal(addTranslations('fr', [{ en: '', t: 'x' }, { en: 'a', t: 42 }, null]), 0);
  assert.equal(addTranslations('xx', [{ en: 'a', t: 'b' }]), 0);
  assert.deepEqual(getTranslations('xx'), {});
});
