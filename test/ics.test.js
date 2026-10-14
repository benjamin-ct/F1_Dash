import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, sessionMinutes, dueReminders } from '../shared/ics.js';

const races = [
  { round: 1, name: 'Australian Grand Prix', circuit: 'Albert Park', locality: 'Melbourne', country: 'Australia', sessions: [{ label: 'EL1', t: '2026-03-06T01:30:00Z' }, { label: 'Course', t: '2026-03-08T04:00:00Z' }] },
  { round: 2, name: 'Chinese Grand Prix', circuit: 'Shanghai', locality: 'Shanghai', country: 'China', sessions: [{ label: 'Qualif. sprint', t: '2026-03-13T07:30:00Z' }, { label: 'Sprint', t: '2026-03-14T03:00:00Z' }] },
];

test('calendrier : fichier iCalendar valide (séances, durée, alarme, échappement)', () => {
  const ics = buildIcs(races, { year: 2026, now: 0 });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 4);
  assert.match(ics, /DTSTART:20260308T040000Z\r\nDTEND:20260308T060000Z/, 'course : 2 h');
  assert.match(ics, /SUMMARY:F1 Australian GP — Course/);
  assert.match(ics, /LOCATION:Albert Park\\, Melbourne\\, Australia/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lignes repliées à 75 octets');
  assert.equal(buildIcs(races, { year: 2026, round: 2 }).match(/BEGIN:VEVENT/g).length, 2, 'un seul week-end');
  assert.doesNotMatch(buildIcs(races, { year: 2026, alarmMin: 0 }), /VALARM/);
});

test('calendrier : durée des séances', () => {
  assert.equal(sessionMinutes('EL2'), 60);
  assert.equal(sessionMinutes('Qualif. sprint'), 45);
  assert.equal(sessionMinutes('Sprint'), 45);
  assert.equal(sessionMinutes('Qualifications'), 60);
  assert.equal(sessionMinutes('Course'), 120);
});

test('rappels : séances à venir dans le délai choisi, une seule fois', () => {
  const t = Date.parse('2026-03-08T04:00:00Z');
  const list = [{ label: 'Course', t }, { label: 'EL1', t: t + 86400e3 }];
  assert.deepEqual(dueReminders(list, t - 10 * 60e3, 15, []).map((s) => s.label), ['Course']);
  assert.deepEqual(dueReminders(list, t - 20 * 60e3, 15, []), [], 'trop tôt');
  assert.deepEqual(dueReminders(list, t + 1000, 15, []), [], 'déjà commencée');
  assert.deepEqual(dueReminders(list, t - 10 * 60e3, 15, [`${t}|Course`]), [], 'déjà rappelée');
  assert.deepEqual(dueReminders(list, t - 10 * 60e3, 0, []), [], 'rappels désactivés');
});
