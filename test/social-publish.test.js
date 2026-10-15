import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PADDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-social-'));
const { oauth1, accountsInfo, saveAccount } = await import('../server/social-publish.js');
const { saveConfig } = await import('../server/config.js');

test('X : signature OAuth 1.0a (exemple de la documentation de X)', () => {
  const k = { apiKey: 'xvz1evFS4wEEPTGEFPHBog', apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', accessSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' };
  const h = oauth1('POST', 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true', k, {
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958,
    params: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  assert.match(h, /^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
});

test('comptes : jamais de clé ni de jeton renvoyé à l\'interface', async () => {
  saveConfig({ social: { x: { apiKey: 'k', apiSecret: 'secret-x', accessToken: 't', accessSecret: 's', username: '@moi' }, meta: { pageToken: 'jeton-page', pageName: 'Ma page', igId: '1', igUsername: 'moi' } } });
  const info = accountsInfo();
  assert.deepEqual(info.x, { connected: true, name: '@moi' });
  assert.equal(info.instagram.name, '@moi');
  const text = JSON.stringify(info);
  for (const s of ['secret-x', 'jeton-page']) assert.ok(!text.includes(s));
  await saveAccount('x', { remove: true });
  assert.equal(accountsInfo().x.connected, false);
  await assert.rejects(saveAccount('x', { apiKey: 'a' }), /4 clés/);
});
