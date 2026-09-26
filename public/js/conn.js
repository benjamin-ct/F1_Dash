// Connexion WebSocket au serveur local.
import { store, handleReset, handleBatch, emit, on } from './store.js';

let ws = null;
let pingTimer = null;
let pingId = 0;
const pending = new Map();

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    store.connected = true;
    emit('connection', true);
    send({ type: 'delay', ms: store.delay });
    ping();
    clearInterval(pingTimer);
    pingTimer = setInterval(ping, 5000);
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case 'reset': handleReset(msg); break;
      case 'batch': handleBatch(msg); break;
      case 'status':
        store.status = msg;
        emit('status', msg);
        break;
      case 'pong': {
        const sent = pending.get(msg.id);
        pending.delete(msg.id);
        if (sent) {
          const now = Date.now();
          const skew = msg.serverNow - (sent + now) / 2;
          // Lissage léger de l'écart d'horloge navigateur/serveur.
          store.skew = store.skew === 0 ? skew : store.skew * 0.8 + skew * 0.2;
        }
        break;
      }
    }
  };

  ws.onclose = () => {
    store.connected = false;
    emit('connection', false);
    clearInterval(pingTimer);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

function ping() {
  const id = ++pingId;
  pending.set(id, Date.now());
  if (pending.size > 20) pending.delete(pending.keys().next().value);
  send({ type: 'ping', id });
}

on('delay', (ms) => send({ type: 'delay', ms }));
