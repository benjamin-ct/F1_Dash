import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lightState } from '../shared/lights-state.js';

// Réglages écrits dans un dossier temporaire (pas dans le config.json du projet)
process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-lights-'));
const L = await import('../server/lights.js');
const { saveConfig } = await import('../server/config.js');

test('lumières : couleur selon la séance affichée', () => {
  assert.equal(lightState('1', 'Inactive', 0), 'normal', 'avant la séance');
  assert.equal(lightState('1', 'Started', 2000), 'green', 'feu vert');
  assert.equal(lightState('1', 'Started', 15000), 'normal', 'puis lumière normale');
  assert.equal(lightState('1', 'Started', 15000, 'keep'), 'green');
  assert.equal(lightState('1', 'Started', 15000, 'off'), 'off');
  assert.equal(lightState('2', 'Started', 1), 'yellow');
  assert.equal(lightState('4', 'Started', 1), 'sc');
  assert.equal(lightState('6', 'Started', 1), 'vsc');
  assert.equal(lightState('5', 'Started', 1), 'red');
  assert.equal(lightState('1', 'Aborted', 1), 'red', 'séance arrêtée');
  assert.equal(lightState('1', 'Finished', 5000), 'chequered');
  assert.equal(lightState('1', 'Finished', 60000), 'normal');
});

test('lumières : conversion des couleurs (Hue xy, Home Assistant)', () => {
  const red = L.rgbToXy([255, 0, 0]);
  assert.ok(red.xy[0] > 0.65 && red.xy[1] < 0.32, `rouge ${red.xy}`);
  const green = L.rgbToXy([0, 220, 70]);
  assert.ok(green.xy[1] > 0.6, `vert ${green.xy}`);
  assert.deepEqual(L.hueBody('off'), { on: false, transitiontime: 2 });
  assert.equal(L.hueBody('sc').alert, 'lselect', 'clignote sous voiture de sécurité');
  assert.equal(L.hueBody('yellow').alert, 'none');
  assert.deepEqual(L.haCall('red', ['light.salon']), ['light/turn_on', { entity_id: ['light.salon'], rgb_color: [255, 0, 0], brightness: 255, flash: 'long' }]);
  assert.deepEqual(L.haCall('off', ['light.salon']), ['light/turn_off', { entity_id: ['light.salon'] }]);
});

// Faux appareil : enregistre les requêtes reçues
function fakeDevice(handler) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const call = { method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null };
      calls.push(call);
      const out = handler(call);
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.json ?? {}));
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('lumières : pont Philips Hue simulé (association, lampes, couleurs)', async () => {
  let pressed = false;
  const hue = await fakeDevice((c) => {
    if (c.method === 'POST' && c.url === '/api') return { json: pressed ? [{ success: { username: 'clef123' } }] : [{ error: { type: 101, description: 'link button not pressed' } }] };
    if (c.url === '/api/clef123/lights') return { json: { 1: { name: 'Salon' }, 2: { name: 'Bandeau télé' } } };
    return { json: [{ success: {} }] };
  });
  try {
    await assert.rejects(L.huePair('127.0.0.1', hue.base), /bouton du pont/);
    pressed = true;
    const info = await L.huePair('127.0.0.1', hue.base);
    assert.equal(info.hue.paired, true);
    const { getConfig } = await import('../server/config.js');
    saveConfig({ lights: { ...getConfig().lights, provider: 'hue', hue: { ...getConfig().lights.hue, base: hue.base, lights: ['1', '2'] } } });
    assert.deepEqual(await L.lightDevices(), [{ id: '1', name: 'Salon' }, { id: '2', name: 'Bandeau télé' }]);
    hue.calls.length = 0;
    await L.setLights('red');
    assert.equal(hue.calls.length, 2, 'les deux lampes');
    assert.equal(hue.calls[0].method, 'PUT');
    assert.match(hue.calls[0].url, /^\/api\/clef123\/lights\/[12]\/state$/);
    assert.equal(hue.calls[0].body.on, true);
    assert.equal(hue.calls[0].body.alert, 'lselect');
    await L.setLights('red');
    assert.equal(hue.calls.length, 2, 'même état : pas de nouvelle commande');
    assert.equal(L.lightsInfo().hue.paired, true);
    assert.equal(JSON.stringify(L.lightsInfo()).includes('clef123'), false, 'la clé du pont n\'est pas renvoyée à l\'interface');
  } finally { hue.srv.close(); }
});

test('lumières : Home Assistant simulé (jeton, lampes, service)', async () => {
  const ha = await fakeDevice((c) => {
    if (c.auth !== 'Bearer jeton-secret') return { status: 401 };
    if (c.url === '/api/states') return { json: [{ entity_id: 'light.salon', attributes: { friendly_name: 'Salon' } }, { entity_id: 'switch.prise' }] };
    return { json: [] };
  });
  try {
    L.saveLights({ provider: 'ha', ha: { url: `${ha.base}/`, token: 'jeton-secret', entities: ['light.salon', 'pas une lampe'] } });
    assert.deepEqual(L.lightsInfo().ha, { url: ha.base, hasToken: true, entities: ['light.salon'] });
    assert.deepEqual(await L.lightDevices(), [{ id: 'light.salon', name: 'Salon' }]);
    await L.setLights('yellow', { force: true });
    const last = ha.calls.at(-1);
    assert.equal(last.url, '/api/services/light/turn_on');
    assert.deepEqual(last.body, { entity_id: ['light.salon'], rgb_color: [255, 200, 0], brightness: 255 });
    L.saveLights({ ha: { token: 'mauvais' } });
    await assert.rejects(L.lightDevices(), /HTTP 401/);
  } finally { ha.srv.close(); }
});
