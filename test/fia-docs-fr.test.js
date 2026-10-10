import test from 'node:test';
import assert from 'node:assert/strict';
import { docSummaryFr } from '../shared/fia-docs-fr.js';

test('résumé en français des documents FIA', () => {
  const s = (t) => docSummaryFr(t).text;
  assert.equal(s('Doc 70 - Infringement - Car 55 - Failing to follow Race Directors Instructions - Practice Start'),
    'Infraction · Voiture 55 · Non-respect des instructions du directeur de course · essai de départ');
  assert.equal(s('Doc 66 - Infringement - Car 43 - Collision with Car 10 in Turn 1'), 'Infraction · Voiture 43 · Accrochage avec la voiture 10 au virage 1');
  assert.equal(s('Doc 42 - Summons - Car 81 - Alleged impeding by car 11'), 'Convocation · Voiture 81 · Gêne présumée par la voiture 11');
  assert.equal(s('Doc 71 - Final Race Classification'), 'Classement final de la course');
  assert.equal(s('Doc 43 - Provisional Qualifying Classification'), 'Classement provisoire des qualifications');
  assert.equal(s('Doc 36 - Free Practice 3 Classification'), 'Classement des essais libres 3');
  assert.equal(s('Doc 52 - Provisional Starting Grid'), 'Grille de départ provisoire');
  assert.equal(s('Doc 38 - Infringement - Free Practice 3 Deleted Lap Times - Double Yellow Flags'), 'Infraction · Temps au tour supprimés des essais libres 3 · double drapeau jaune');
  assert.equal(s('Doc 56 - Race Director\'s Competition Notes V3'), 'Notes du directeur de course (version 3)');
  assert.equal(s('Doc 8 - Competition Notes - Circuit Map, Pit Lane Drawing, Emergency Exits Map and Red Zone'), 'Plan du circuit, voie des stands et sorties de secours');
  assert.equal(docSummaryFr('Doc 67 - Decision - Car 77 - Turn 15 Incident').num, 67);
  // Partie inconnue : laissée telle quelle
  assert.equal(s('Doc 99 - Something New'), 'Something New');
  assert.equal(docSummaryFr('Doc 99 - Something New').translated, false);
});
