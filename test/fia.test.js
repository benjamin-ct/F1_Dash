import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentList, parsePublished, pickEvent } from '../server/fia.js';
import { analyzeStewards, linkFiaDocs, deletedLapsDoc, parseFiaDoc } from '../shared/stewards.js';

const row = (n, title, file, date) => `<li class="document-row key-${n}">  <a href="/system/files/decision-document/${file}.pdf" download target="_blank">
  <div class="file-type"><div class="pdf"></div></div>
  <div class="title">
  ${title}
  </div>
  <div class="published">
  Published on <span  class="date-display-single">${date}</span> CET  </div></a></li>`;

const HTML = [
  row(68, 'Doc 68 - Infringement - Car 5 - Overtaking under yellow flags', '2026_x_-_infringement_-_car_5', '26.09.26 17:52'),
  row(66, 'Doc 66 - Infringement - Car 43 - Collision with Car 10 in Turn 1', '2026_x_-_infringement_-_car_43', '26.09.26 16:55'),
  row(65, 'Doc 65 - Decision - Car 41 - Collision with Car 30 in turn 1', '2026_x_-_decision_-_car_41', '26.09.26 16:50'),
  row(64, 'Doc 64 - Race Deleted Lap Times', '2026_x_-_race_deleted', '26.09.26 16:40'),
  row(60, 'Doc 60 - Summons - Car 5  - Overtaking under yellow flags', '2026_x_-_summons_-_car_5', '26.09.26 16:30'),
  row(59, 'Doc 59 - Driver&#039;s Briefing', '2026_x_-_briefing', '26.09.26 12:00'),
].join('\n');

test('documents FIA : lecture de la liste et heure de Paris', () => {
  const docs = parseDocumentList(HTML);
  assert.equal(docs.length, 6);
  assert.equal(docs[1].title, 'Doc 66 - Infringement - Car 43 - Collision with Car 10 in Turn 1');
  assert.ok(docs[1].url.startsWith('https://www.fia.com/system/files/decision-document/'));
  assert.equal(docs[5].title, 'Doc 59 - Driver\'s Briefing');
  // Heure d'été : UTC+2 ; heure d'hiver : UTC+1
  assert.equal(new Date(parsePublished('26.09.26 16:55')).toISOString(), '2026-09-26T14:55:00.000Z');
  assert.equal(new Date(parsePublished('06.12.26 17:00')).toISOString(), '2026-12-06T16:00:00.000Z');
  assert.deepEqual(parseFiaDoc(docs[1]), { num: 66, type: 'infringement', cars: ['43', '10'], subject: 'Car 43 - Collision with Car 10 in Turn 1' });
});

test('documents FIA : mise en page 2026 (lien et titre dans des blocs imbriqués)', () => {
  const html = `<li class="document-row key-72">
<div class="panelizer-view-mode node node-teaser node-decision-document node-64521">
          <a href="/system/files/decision-document/2026_x_-_championship_points.pdf" download target="_blank">
  <div class="file-type"><div class="field"><div class="field-items"><div class="field-item even"><div class="pdf"></div>
</div></div></div>
  </div>
<div class="panel-separator"></div>  <div class="title">
  <div class="field field-name-title-field"><div class="field-items"><div class="field-item even">Doc 72 - Championship Points</div></div></div>
  </div>
<div class="panel-separator"></div>
  <div class="published">
  <div class="field"><div class="field-items"><div class="field-item even">Published on <span  class="date-display-single">26.09.26 18:20</span> CET</div></div></div>  </div>
</a></div></li>
<li class="document-row key-71">
<div class="panelizer-view-mode"><a href="/system/files/decision-document/2026_x_-_final_race_classification.pdf" download>
<div class="title"><div class="field-item even">Doc 71 - Final Race Classification</div></div>
<div class="published"><span  class="date-display-single">26.09.26 18:11</span></div></a></div></li>`;
  const docs = parseDocumentList(html);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].title, 'Doc 72 - Championship Points');
  assert.match(docs[0].url, /championship_points\.pdf$/);
  assert.equal(new Date(docs[0].published).toISOString(), '2026-09-26T16:20:00.000Z');
  assert.equal(docs[1].title, 'Doc 71 - Final Race Classification');
});

test('documents FIA : choix de l\'épreuve', () => {
  const events = ['Italian Grand Prix', 'Grand Prix of Japan', 'Mexico City Grand Prix', 'Barcelona-Catalunya Grand Prix', 'Spanish Grand Prix'];
  assert.equal(pickEvent(events, { name: 'Italian Grand Prix' }), 'Italian Grand Prix');
  assert.equal(pickEvent(events, { name: 'Japanese Grand Prix', country: 'Japan', location: 'Suzuka' }), 'Grand Prix of Japan');
  assert.equal(pickEvent(events, { name: 'Spanish Grand Prix', country: 'Spain', location: 'Madrid' }), 'Spanish Grand Prix');
});

test('documents FIA : rattachement aux décisions et enquêtes, sans divulgation', () => {
  const at = (hh, mm) => `2026-09-26T${hh}:${mm}:00`;
  const msgs = [
    { Utc: at(14, 20), Lap: 38, Message: 'TURN 1 INCIDENT INVOLVING CARS 1 (NOR), 10 (GAS) AND 43 (COL) NOTED - CAUSING A COLLISION' },
    { Utc: at(14, 50), Lap: 51, Message: 'FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 43 (COL) - CAUSING A COLLISION' },
    { Utc: at(14, 21), Lap: 38, Message: 'TURN 1 INCIDENT INVOLVING CARS 41 (LIN) AND 30 (LAW) NOTED' },
    { Utc: at(14, 25), Lap: 40, Message: 'FIA STEWARDS: TURN 7 INCIDENT INVOLVING CAR 5 (BOR) WILL BE INVESTIGATED AFTER THE RACE - YELLOW FLAG INFRINGEMENT' },
  ];
  const docs = parseDocumentList(HTML);
  const data = linkFiaDocs(analyzeStewards(msgs), docs);
  const col = data.decisions.find((d) => d.cars[0].tla === 'COL');
  assert.match(col.doc.title, /Car 43/);
  const bor = data.incidents.find((i) => i.cars[0].tla === 'BOR');
  assert.deepEqual(bor.docs.map((d) => d.kind), ['summons', 'decision']);
  const lin = data.incidents.find((i) => i.cars[0].tla === 'LIN');
  assert.match(lin.docs[0].title, /Car 41/);
  // En rediffusion : la décision déjà annoncée garde son document, mais l'issue d'une enquête
  // encore ouverte n'est pas dévoilée avant la publication du document.
  const early = linkFiaDocs(analyzeStewards(msgs), docs, Date.parse('2026-09-26T14:52:00Z'));
  assert.match(early.decisions.find((d) => d.cars[0].tla === 'COL').doc.title, /Car 43/);
  assert.deepEqual(early.incidents.find((i) => i.cars[0].tla === 'BOR').docs.map((d) => d.kind), ['summons']);
  assert.equal(deletedLapsDoc(docs, 'Race').title, 'Doc 64 - Race Deleted Lap Times');
  assert.equal(deletedLapsDoc(docs, 'Qualifying'), null);
});
