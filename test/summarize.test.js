import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSummaryRequest, copiedFrom, parsePoints, summarizeArticle } from '../analytics/summarize.js';
import { MODEL } from '../analytics/translate.js';
import { createNewsSummarizer, articleText } from '../server/news-summary.js';
import worker from '../analytics/worker.js';

const ARTICLE = `Ferrari has confirmed that Lewis Hamilton will remain with the Scuderia until the end of the 2028 season. The seven-time world champion joined the team at the start of 2025. Team principal Fred Vasseur said the experience of the British driver was a key asset for the development of the car. ${'More details about the contract were not disclosed by the team. '.repeat(4)}`;
const POINTS = [
  'Ferrari garde Lewis Hamilton deux saisons de plus, jusqu’à la fin de l’année 2028.',
  'Le septuple champion du monde avait rejoint l’écurie italienne au début de 2025.',
  'Pour Fred Vasseur, l’expérience du Britannique pèse dans le développement de la voiture.',
];

function fakeEnv({ limit = 100, replies = [] } = {}) {
  const tr = new Map();
  const usage = new Map();
  const calls = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() {
      if (/FROM translations/.test(sql)) return tr.has(args[0]) ? { out: tr.get(args[0]) } : null;
      return usage.has(args[0]) ? { n: usage.get(args[0]) } : null;
    },
    async run() {
      if (/INTO translations/.test(sql)) tr.set(args[0], args[1]);
      else usage.set(args[0], (usage.get(args[0]) || 0) + args[1]);
    },
  });
  return {
    tr, usage, calls,
    env: {
      AI_DAILY_LIMIT: String(limit),
      DB: { prepare: (sql) => stmt(sql) },
      AI: { async run(model, input) { calls.push({ model, input }); return { response: replies.shift() ?? '' }; } },
    },
  };
}

test('résumé détaillé : requête nettoyée', () => {
  assert.deepEqual(cleanSummaryRequest({ title: '  Titre ', text: ARTICLE }), { title: 'Titre', text: ARTICLE.trim().replace(/[ \t]+/g, ' ') });
  assert.equal(cleanSummaryRequest({ title: '', text: ARTICLE }), null);
  assert.equal(cleanSummaryRequest({ title: 'T', text: 'trop court' }), null);
  assert.ok(cleanSummaryRequest({ title: 'T', text: 'x '.repeat(20000) }).text.length <= 12000);
});

test('résumé détaillé : phrases recopiées de l\'article refusées', () => {
  const fr = 'Le pilote a confirmé ce matin qu’il resterait dans l’équipe pendant encore deux saisons complètes au minimum.';
  assert.ok(copiedFrom('Il a dit : le pilote a confirmé ce matin qu’il resterait dans l’équipe pendant encore deux saisons.', fr));
  assert.ok(!copiedFrom('Le pilote reste deux saisons de plus dans son équipe actuelle, a-t-il annoncé.', fr));
  assert.deepEqual(parsePoints(`Voici :\n${JSON.stringify(['- ' + POINTS[0], POINTS[1]])}`, ARTICLE), POINTS.slice(0, 2));
  assert.equal(parsePoints('Désolé, je ne peux pas.', ARTICLE), null);
  assert.equal(parsePoints(JSON.stringify([POINTS[0], 'trop court']), ARTICLE), null);   // un seul point valable
  assert.equal(parsePoints(JSON.stringify([POINTS[0], '这是一个中文句子，不应该出现在法语摘要中。好的。']), ARTICLE), null);
});

test('résumé détaillé : une fois par article, plafond du jour, nouvel essai si réponse mal formée', async () => {
  const f = fakeEnv({ replies: ['pas de liste', JSON.stringify(POINTS)] });
  const req = cleanSummaryRequest({ title: 'Hamilton extends Ferrari deal', text: ARTICLE });
  assert.deepEqual(await summarizeArticle(f.env, req, '2026-10-16'), { points: POINTS });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].model, MODEL);
  assert.match(f.calls[0].input.messages[0].content, /never copy a sentence/);
  assert.equal(f.usage.get('2026-10-16'), 5);
  assert.deepEqual(await summarizeArticle(f.env, req, '2026-10-16'), { points: POINTS, cached: true });
  assert.equal(f.calls.length, 2);
  const g = fakeEnv({ limit: 3 });
  assert.deepEqual(await summarizeArticle(g.env, req, '2026-10-16'), { limited: true });
  assert.equal(g.calls.length, 0);
  const h = fakeEnv({ replies: ['x', 'y'] });
  assert.deepEqual(await summarizeArticle(h.env, req, '2026-10-16'), { points: null });
});

test("résumé détaillé dans l'appli : article lu en mode lecture, points demandés au serveur", async () => {
  const reads = [];
  const articles = { async get(u) { reads.push(u); return u.endsWith('/video') ? { readable: false, reason: 'vidéo', blocks: [] } : { readable: true, title: 'Hamilton', blocks: [{ h: 'Contrat' }, { p: ARTICLE }] }; } };
  const posted = [];
  const summarize = createNewsSummarizer({ articles, url: 'https://s.test/s', post: async (url, body) => { posted.push({ url, body }); return { status: 200, json: { points: POINTS } }; } });
  assert.deepEqual(await summarize('https://www.formula1.com/a'), POINTS);
  assert.deepEqual(await summarize('https://www.formula1.com/a'), POINTS);   // gardé en mémoire
  assert.equal(posted.length, 1);
  assert.equal(posted[0].body.title, 'Hamilton');
  assert.equal(posted[0].body.text, `Contrat\n\n${ARTICLE}`.slice(0, 12000));
  assert.equal(articleText({ blocks: [{ p: 'a' }, { h: 'b' }] }), 'a\n\nb');
  await assert.rejects(summarize('https://www.formula1.com/video'), /illisible ici : vidéo/);
  const limited = createNewsSummarizer({ articles, post: async () => ({ status: 429, json: { limited: true } }) });
  await assert.rejects(limited('https://www.formula1.com/b'), /Plafond/);
});

test('résumé détaillé : adresse /s du serveur', async () => {
  const post = (env, body) => worker.fetch(new Request('https://s.test/s', { method: 'POST', body }), env);
  assert.equal((await post({}, '{}')).status, 503);   // sans Workers AI
  const f = fakeEnv({ replies: [JSON.stringify(POINTS)] });
  assert.equal((await post(f.env, '{')).status, 400);
  assert.equal((await post(f.env, JSON.stringify({ title: 'T', text: 'court' }))).status, 400);
  const r = await post(f.env, JSON.stringify({ title: 'Hamilton extends Ferrari deal', text: ARTICLE }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).points, POINTS);
});
