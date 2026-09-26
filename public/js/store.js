// État côté navigateur : état F1 fusionné (retardé), données dérivées, positions et horloge.
import { applyEvent, createDerived } from '/shared/derive.js';
import { Positions } from './positions.js';
import { storageGet, storageSet } from './util.js';

export const store = {
  state: {},
  derived: createDerived(),
  ver: { __any: 0 },
  status: null,
  skew: 0,
  delay: storageGet('f1dash.delayMs', 0),
  connected: false,
  positions: new Positions(() => store.derived.clockOffset),
  duel: storageGet('f1dash.duel', { a: null, b: null }),
  focus: storageGet('f1dash.focus', null),
};

const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
}

export function emit(evt, payload) {
  for (const fn of listeners.get(evt) || []) fn(payload);
}

export function serverNow() {
  if (store.status?.paused) return store.status.clock;
  return Date.now() + store.skew;
}

// Heure (locale) correspondant à ce qui est affiché : maintenant - délai.
export function displayNow() {
  return serverNow() - store.delay;
}

// Heure F1 (UTC) correspondant à l'affichage (utile pour le replay).
export function f1Now() {
  return displayNow() - (store.derived.clockOffset ?? 0);
}

function bump(topic) {
  store.ver[topic] = (store.ver[topic] || 0) + 1;
  store.ver.__any++;
}

export function versionOf(topics) {
  let v = 0;
  for (const t of topics) v += store.ver[t] || 0;
  return v;
}

function ingestStream(items) {
  for (const [topic, data, t] of items) {
    if (topic === 'Position') store.positions.ingestPosition(data, t);
    else if (topic === 'CarData') store.positions.ingestCarData(data, t);
  }
  if (items.length) { bump('Position'); bump('CarData'); }
}

export function handleReset(msg) {
  store.state = msg.state || {};
  store.derived = msg.derived || createDerived();
  store.positions.reset();
  ingestStream(msg.stream || []);
  for (const k of Object.keys(store.state)) bump(k);
  bump('__reset');
  emit('reset');
}

export function handleBatch(msg) {
  const topics = new Set();
  for (const [topic, data, t] of msg.events) {
    applyEvent(store.state, store.derived, topic, data, t);
    if (topic === 'TimingData') store.positions.onTiming(store.state, data, t);
    if (topic === '__snapshot') Object.keys(data).forEach((k) => topics.add(k));
    else topics.add(topic);
  }
  for (const t of topics) bump(t);
  ingestStream(msg.stream || []);
}

export function setDelay(ms) {
  const max = store.status?.maxDelayMs ?? 600000;
  store.delay = Math.round(Math.max(0, Math.min(max, ms)) / 100) * 100;
  storageSet('f1dash.delayMs', store.delay);
  emit('delay', store.delay);
}

export function setDuel(slot, num) {
  store.duel = { ...store.duel, [slot]: num };
  if (slot === 'a' && store.duel.b === num) store.duel.b = null;
  if (slot === 'b' && store.duel.a === num) store.duel.a = null;
  storageSet('f1dash.duel', store.duel);
  emit('duel', store.duel);
}

export function setFocus(num) {
  store.focus = num;
  storageSet('f1dash.focus', num);
  emit('focus', num);
}
