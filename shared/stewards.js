// Analyse des messages de la direction de course :
// - suivi des enquêtes des commissaires (notée → sous enquête → après la course → décision),
// - suivi des limites de piste (tours / temps supprimés, drapeau noir et blanc, pénalités).
// Fonctions pures, partagées (tests côté serveur, affichage côté navigateur).
import { parseUtc } from './f1.js';

const CAR_RE = /(\d{1,2}) \(([A-Z]{3})\)/g;

function carsIn(text) {
  const out = [];
  for (const m of text.matchAll(CAR_RE)) if (!out.some((c) => c.num === m[1])) out.push({ num: m[1], tla: m[2] });
  return out;
}

// "(15:12::25)" -> "15:12:25"
function incidentTime(text) {
  const m = /\((\d{1,2}):+(\d{2}):+(\d{2})\)\s*$/.exec(text);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}` : null;
}

const STATUS_RULES = [
  [/NO FURTHER (?:INVESTIGATION|ACTION)/, 'nfa'],
  [/WILL BE INVESTIGATED AFTER THE (?:RACE|SESSION)/, 'after'],
  [/UNDER INVESTIGATION/, 'investigating'],
  [/\bNOTED\b/, 'noted'],
];

export const STATUS_LABEL = {
  noted: 'Incident noté',
  investigating: 'Sous enquête',
  after: 'Enquête après la course',
  nfa: 'Pas d\'action',
  penalty: 'Pénalité',
  warning: 'Avertissement',
  reprimand: 'Réprimande',
};

function decisionOf(text) {
  let m;
  if ((m = /(\d+) SECOND TIME PENALTY/.exec(text))) return { kind: 'penalty', label: `${m[1]} s de pénalité` };
  if (/DRIVE THROUGH/.test(text)) return { kind: 'penalty', label: 'Drive-through' };
  if (/STOP[\s/-]*(?:AND[\s-]*)?GO/.test(text)) return { kind: 'penalty', label: 'Stop & go' };
  if ((m = /(\d+) PLACE GRID PENALTY/.exec(text))) return { kind: 'penalty', label: `${m[1]} places de pénalité sur la grille` };
  if (/DISQUALIF/.test(text)) return { kind: 'penalty', label: 'Disqualification' };
  if (/BLACK AND WHITE FLAG/.test(text)) return { kind: 'warning', label: 'Drapeau noir et blanc' };
  if (/REPRIMAND/.test(text)) return { kind: 'reprimand', label: 'Réprimande' };
  if (/\bWARNING FOR\b/.test(text)) return { kind: 'warning', label: 'Avertissement' };
  if (/\bPENALTY\b/.test(text)) return { kind: 'penalty', label: 'Pénalité' };
  return null;
}

function reasonOf(text) {
  // Motif après le tiret : "… NOTED - CAUSING A COLLISION (16:11:31)"
  const m = /\s[-–]\s(.+?)(?:\s*\(\d{1,2}:+\d{2}:+\d{2}\))?\s*$/.exec(text);
  if (!m) return null;
  const r = m[1].trim();
  return /^\d/.test(r) ? null : r;
}

function locationOf(text) {
  const m = /^(?:TURN (\d+)|(Q\d|SQ\d))\s+INCIDENT/.exec(text);
  if (!m) return null;
  return m[1] ? `Virage ${m[1]}` : m[2];
}

function sameCars(a, b) {
  return a.length === b.length && a.every((c) => b.some((d) => d.num === c.num));
}

function overlap(a, b) {
  return a.some((c) => b.some((d) => d.num === c.num));
}

/**
 * @param messages liste des messages RaceControlMessages (ordre chronologique)
 * @returns {{incidents: object[], trackLimits: object[], decisions: object[]}}
 */
export function analyzeStewards(messages) {
  const incidents = [];
  const tl = new Map(); // num -> suivi limites de piste
  const decisions = [];

  const tlOf = (num, tla) => {
    if (!tl.has(num)) tl.set(num, { num, tla, deletions: [], otherDeletions: [], blackWhite: null, penalties: [] });
    return tl.get(num);
  };

  for (const msg of messages) {
    if (!msg || !msg.Message) continue;
    const raw = String(msg.Message).trim();
    const text = raw.replace(/^(?:FIA STEWARDS:|UPDATE:)\s*/g, '').replace(/^(?:FIA STEWARDS:|UPDATE:)\s*/, '');
    const t = parseUtc(msg.Utc);
    const lap = msg.Lap ?? null;
    let m;

    // Tour / temps supprimé
    if ((m = /^CAR (\d+) \(([A-Z]{3})\) (?:TIME ([\d:.]+)|LAP) DELETED - (.+?) AT TURN (\d+) LAP (\d+)(.*)$/.exec(text))) {
      const entry = { t, lap: Number(m[6]), turn: Number(m[5]), time: m[3] || null, reason: m[4], pit: /\(PIT\)/.test(m[7]) };
      const d = tlOf(m[1], m[2]);
      if (/TRACK LIMITS/.test(m[4])) d.deletions.push(entry);
      else d.otherDeletions.push(entry);
      continue;
    }

    // Drapeau noir et blanc pour limites de piste (l'autre, disciplinaire, est traité comme une décision)
    if ((m = /BLACK AND WHITE FLAG FOR CAR (\d+) \(([A-Z]{3})\)/.exec(text)) && (/TRACK LIMITS/.test(text) || !incidentTime(text))) {
      tlOf(m[1], m[2]).blackWhite = { t, lap };
      continue;
    }

    // Décision des commissaires (pénalité, avertissement, réprimande)
    const dec = /INCIDENT INVOLVING/.test(text) ? null : decisionOf(text);
    if (dec) {
      const cars = carsIn(text);
      const served = /PENALTY SERVED/.test(text);
      const time = incidentTime(text);
      const reason = reasonOf(text);
      const d = { t, lap, cars, ...dec, served, reason, time, text: raw };
      if (served) {
        const prev = [...decisions].reverse().find((x) => !x.served && overlap(x.cars, cars) && x.label === dec.label);
        if (prev) { prev.servedAt = t; continue; }
      }
      decisions.push(d);
      if (reason && /TRACK LIMITS/.test(reason)) for (const c of cars) tlOf(c.num, c.tla).penalties.push(d);
      // Rattachement à l'enquête correspondante
      const inc = [...incidents].reverse().find((i) => overlap(i.cars, cars) && (time ? i.time === time : !['nfa'].includes(i.status)));
      if (inc) {
        inc.decisions.push(d);
        inc.status = dec.kind;
        inc.updated = t;
        inc.history.push({ t, lap, status: dec.kind, label: dec.label + (served ? ' (purgée)' : ''), text: raw });
        d.incident = inc.id;
      }
      continue;
    }

    // Enquêtes
    if (/INCIDENT INVOLVING/.test(text)) {
      const rule = STATUS_RULES.find(([re]) => re.test(text));
      if (!rule) continue;
      const status = rule[1];
      const cars = carsIn(text);
      const time = incidentTime(text);
      const reason = reasonOf(text);
      const location = locationOf(text);
      const compatible = (a, b) => a === null || b === null || a === b;
      let inc = [...incidents].reverse().find((i) => {
        if (time && i.time) return i.time === time && overlap(i.cars, cars);
        // Sans heure de référence : même pilotes, même lieu, même motif, et enquête encore ouverte.
        // Un nouveau « NOTED » ne complète qu'un incident lui-même seulement noté (message « UPDATE »).
        if (!sameCars(i.cars, cars) || !compatible(location, i.location) || !compatible(reason, i.reason)) return false;
        return status === 'noted' ? i.status === 'noted' : isOpen(i);
      });
      if (!inc) {
        inc = { id: incidents.length + 1, cars, time, reason, location, status, history: [], decisions: [], created: t, updated: t, lap };
        incidents.push(inc);
      }
      if (cars.length >= inc.cars.length) inc.cars = cars; // les mises à jour peuvent ajouter des pilotes
      inc.time ||= time;
      inc.reason ||= reason;
      inc.location ||= location;
      // Une décision déjà rendue n'est pas écrasée par un message plus ancien.
      if (!['penalty', 'warning', 'reprimand'].includes(inc.status) || status === 'nfa') inc.status = status;
      inc.updated = t;
      inc.history.push({ t, lap, status, label: STATUS_LABEL[status], text: raw });
    }
  }

  const trackLimits = [...tl.values()].sort((a, b) => b.deletions.length - a.deletions.length || a.num - b.num);
  return { incidents, trackLimits, decisions };
}

export function isOpen(incident) {
  return incident.status === 'noted' || incident.status === 'investigating' || incident.status === 'after';
}
