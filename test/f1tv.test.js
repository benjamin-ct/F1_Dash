import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../server/f1tv.js';

test('F1 TV : lecture des résultats de recherche', () => {
  const page = { resultObj: { containers: [
    { metadata: { contentId: 1, title: 'Rencontre', emfAttributes: {} } },
    { retrieveItems: { resultObj: { containers: [
      { metadata: { contentId: 1000010385, title: '2026 Azerbaijan Grand Prix', contentSubtype: 'REPLAY', emfAttributes: { MeetingSessionKey: '11377' } } },
      { metadata: { contentId: 42, title: 'Sans attributs' } },
    ] } } },
  ] } };
  assert.deepEqual(_test.containersOf(page).map((c) => c.metadata.contentId), [1, 1000010385]);
});

test('F1 TV : le relais n\'accepte que les hôtes vidéo connus', () => {
  assert.equal(_test.hostAllowed('f1tv.formula1.com'), true);
  assert.equal(_test.hostAllowed('f1prodlive.akamaized.net'), true);
  assert.equal(_test.hostAllowed('example.com'), false);
  assert.equal(_test.hostAllowed('formula1.com.evil.net'), false);
});

test('radio : lecture des listes de lecture .pls / .m3u', async () => {
  const http = await import('node:http');
  const { resolvePlaylist } = await import('../server/f1tv.js');
  const srv = http.createServer((req, res) => {
    res.end(req.url.endsWith('.pls')
      ? '[playlist]\nNumberOfEntries=1\nFile1=https://radio.example/live.mp3\nTitle1=Radio\n'
      : '#EXTM3U\n#EXTINF:-1,Radio\nhttp://radio.example:8000/stream.aac\n');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal(await resolvePlaylist(`${base}/a.pls`), 'https://radio.example/live.mp3');
    assert.equal(await resolvePlaylist(`${base}/b.m3u`), 'http://radio.example:8000/stream.aac');
  } finally {
    srv.close();
  }
});
