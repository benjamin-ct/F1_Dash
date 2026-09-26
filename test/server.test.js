import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { Hub } from '../server/hub.js';
import { parseF1tvToken, tokenInfo } from '../server/config.js';

class FakeWs extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; }
  send(s) { this.sent.push(JSON.parse(s)); }
}

function jwt(payload) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b(payload)}.sig`;
}

test('jeton F1 TV : JWT brut, cookie login-session encodé, JSON', () => {
  const t = jwt({ exp: Math.floor(Date.now() / 1000) + 3600, SubscriptionStatus: 'active' });
  assert.equal(parseF1tvToken(t), t);
  assert.equal(parseF1tvToken(`Bearer ${t}`), t);
  const cookie = encodeURIComponent(JSON.stringify({ data: { subscriptionStatus: 'active', subscriptionToken: t } }));
  assert.equal(parseF1tvToken(cookie), t);
  assert.equal(parseF1tvToken('pas un jeton'), null);
  const info = tokenInfo(t);
  assert.equal(info.hasToken, true);
  assert.equal(info.expired, false);
  assert.equal(tokenInfo(jwt({ exp: 1 })).expired, true);
});

test('hub : chaque client reçoit l\'état à (maintenant - délai) et reconstruit quand le délai augmente', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  const now = Date.now();
  hub.reset({ mode: 'test' });
  hub.addEvent('__snapshot', { LapCount: { CurrentLap: 1 } }, now - 60000);
  hub.addEvent('LapCount', { CurrentLap: 2 }, now - 40000);
  hub.addEvent('LapCount', { CurrentLap: 3 }, now - 10000);

  const ws = new FakeWs();
  const c = hub.addClient(ws);
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 30000 })));
  hub.tick();
  let reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.state.LapCount.CurrentLap, 2, 'délai 30 s -> tour 2');

  // Réduction du délai : simple avance, sans reconstruction
  ws.sent = [];
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 0 })));
  hub.tick();
  assert.equal(ws.sent[0].type, 'batch');
  assert.deepEqual(ws.sent[0].events.map((e) => e[1].CurrentLap), [3]);

  // Augmentation du délai : reconstruction de l'état passé
  ws.sent = [];
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 50000 })));
  hub.tick();
  reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.state.LapCount.CurrentLap, 1);
  assert.equal(c.delay, 50000);
  hub.close();
});

test('hub : GPS décompressé et envoyé avec avance, synchro TV non retardée', () => {
  const hub = new Hub({ maxDelayMs: 600000 });
  const now = Date.now();
  hub.reset({ mode: 'test' });
  const raw = zlib.deflateRawSync(Buffer.from(JSON.stringify({ Position: [{ Timestamp: new Date(now).toISOString(), Entries: {} }] }))).toString('base64');
  hub.addStream('Position', raw, now - 8000);
  hub.addEvent('LapCount', { CurrentLap: 5 }, now - 5000);
  const ws = new FakeWs();
  hub.addClient(ws);
  ws.emit('message', Buffer.from(JSON.stringify({ type: 'delay', ms: 10000 })));
  hub.tick();
  const reset = ws.sent.find((m) => m.type === 'reset');
  assert.equal(reset.stream.length, 1, 'le GPS de t-8 s est envoyé en avance à un client retardé de 10 s');
  assert.equal(reset.stream[0][0], 'Position');
  assert.equal(reset.state.LapCount, undefined, 'le tour 5 (t-5 s) n\'est pas encore visible');
  const status = hub.statusPayload();
  assert.equal(status.sync.at(-1).text, 'Tour 5', 'les repères de synchro sont en temps réel');
  assert.equal(hub.hasPositions, true);
  hub.close();
});
