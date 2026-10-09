import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized, isLoopback, newKey, qrSvg } from '../server/lan.js';

const req = (remoteAddress, url = '/', cookie) => ({ socket: { remoteAddress }, url, headers: cookie ? { cookie } : {} });

test('Accès réseau : adresses de cet ordinateur', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopback(a), true, a);
  for (const a of ['192.168.1.20', '::ffff:192.168.1.20', '10.0.0.5', '', undefined]) assert.equal(isLoopback(a), false, String(a));
});

test('Accès réseau : clé secrète', () => {
  const k = newKey();
  assert.match(k, /^[a-hjkmnp-z2-9]{10}$/);
  assert.notEqual(newKey(), k);
});

test('Accès réseau : autorisation par clé (adresse ou cookie)', () => {
  const key = 'abcdefghjk';
  assert.equal(authorized(req('127.0.0.1'), key), true);
  assert.equal(authorized(req('192.168.1.20'), key), false);
  assert.equal(authorized(req('192.168.1.20', '/?k=mauvaise'), key), false);
  assert.equal(authorized(req('192.168.1.20', '/?k=abcdefghjk'), key), true);
  assert.equal(authorized(req('192.168.1.20', '/ws', 'theme=x; f1dash_key=abcdefghjk'), key), true);
  assert.equal(authorized(req('192.168.1.20', '/ws', 'f1dash_key=abcdefghj'), key), false);
  // Sans clé configurée, personne d'autre que cet ordinateur
  assert.equal(authorized(req('192.168.1.20', '/?k='), ''), false);
});

test('Accès réseau : QR code', () => {
  assert.match(qrSvg('http://192.168.1.20:3030/?k=abcdefghjk'), /^<svg[\s\S]*<\/svg>$/);
});
