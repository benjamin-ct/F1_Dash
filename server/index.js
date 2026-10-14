// Point d'entrée : serveur HTTP (interface + API) et WebSocket vers le navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { LiveSource } from './live.js';
import { ReplaySource, seasonIndex } from './replay.js';
import { HttpError } from './net.js';
import { circuit, loops, zones } from './circuits.js';
import { season } from './season.js';
import { seasonStats, archiveError } from './race-stats.js';
import { seasonTech } from './fia-tech.js';
import { fiaDocuments } from './fia.js';
import { findSessionContent, playback, proxy as f1tvProxy, allowHost, resolvePlaylist } from './f1tv.js';
import { Recorder, listRecordings, recordingPath } from './recorder.js';
import { ROOT, settings, getConfig, saveConfig, parseF1tvToken, tokenInfo } from './config.js';
import { createLan, isLoopback } from './lan.js';
import { getTranslations, addTranslations } from './translations.js';
import { compareLaps } from './compare.js';
import { weekendTyres } from './tyres.js';
import { circuitRecords } from './records.js';
import { startNews, refreshNews, newsSnapshot, onNews, addNewsSource, removeNewsSource, setNewsSourceEnabled } from './news.js';
import { parseChangelog } from '../shared/changelog.js';
import { buildIcs } from '../shared/ics.js';
import { osmTile } from './tiles.js';
import { predictionsView, savePrediction } from './predict.js';
import { lightsInfo, saveLights, hueDiscover, huePair, lightDevices, setLights } from './lights.js';
import { startAutoRenew, renew as renewF1tv, sessionOf, state as renewState, resetRenewState } from './f1tv-auth.js';
import { localHost, sameSiteRequest, decodePath } from './guard.js';

let lan = null;   // accès depuis un téléphone / une tablette du réseau local

// État de la connexion F1 TV : jeton (~4 jours) et session formula1.com (~30 jours), qui permet
// de renouveler le jeton automatiquement
function authInfo() {
  const token = getConfig().f1tvToken;
  const info = tokenInfo(token);
  if (!info.hasToken) return info;
  const ses = sessionOf(token);
  return {
    ...info,
    autoRenew: !!ses,
    sessionExpiresAt: ses?.expiresAt || null,
    lastRenewal: renewState.lastRenewal || null,
    renewError: renewState.lastError,
    renewRejected: renewState.rejected,
  };
}

const hub = new Hub({ maxDelayMs: settings.maxDelayMs });
const recorder = process.env.NO_RECORDING ? null : new Recorder();
const live = new LiveSource(hub, () => {
  const token = getConfig().f1tvToken;
  return token && !tokenInfo(token).expired ? token : null;
}, recorder);
const replay = new ReplaySource(hub);
for (const h of getConfig().radioHosts || []) allowHost(h);

// ---- HTTP ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error('Requête trop volumineuse')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let base = path.join(ROOT, 'public');
  let rel = pathname;
  if (pathname.startsWith('/shared/')) {
    base = path.join(ROOT, 'shared');
    rel = pathname.slice('/shared'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  // L'API ne répond qu'à l'interface elle-même : un autre site ouvert dans le navigateur ne peut
  // ni la lire ni déclencher d'action (relais F1 TV avec le jeton, réglages, enregistrements…)
  if (!sameSiteRequest(req.headers)) return sendJSON(res, 403, { error: 'Origine refusée' });

  switch (route) {
    case 'GET /api/lan':
    case 'POST /api/lan': {
      // Réglage de l'accès réseau : uniquement depuis cet ordinateur
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      if (req.method === 'GET') return sendJSON(res, 200, lan.info());
      const body = await readBody(req);
      return sendJSON(res, 200, await lan.set({ enabled: body.enabled, regenerate: !!body.regenerate, port: body.port }));
    }

    // Traductions des textes FIA (évolutions techniques), partagées entre appareils
    case 'GET /api/translations':
      return sendJSON(res, 200, getTranslations(url.searchParams.get('lang') || 'fr'));
    case 'POST /api/translations': {
      const body = await readBody(req);
      return sendJSON(res, 200, { added: addTranslations(body.lang, body.items) });
    }

    case 'GET /api/status':
      return sendJSON(res, 200, { ...hub.statusPayload(), auth: authInfo() });

    // Meilleurs tours de deux pilotes : secteurs et mini-secteurs (à la date du délai TV)
    case 'GET /api/compare': {
      const a = url.searchParams.get('a'), b = url.searchParams.get('b');
      const until = Number(url.searchParams.get('until')) || Date.now();
      if (!/^\d+$/.test(a || '') || !/^\d+$/.test(b || '')) return sendJSON(res, 400, { error: 'Pilotes manquants' });
      const lapNo = (k) => (/^\d{1,3}$/.test(url.searchParams.get(k) || '') ? Number(url.searchParams.get(k)) : null);
      return sendJSON(res, 200, await compareLaps(hub, { a, b, until: Math.min(until, hub.clock()), la: lapNo('la'), lb: lapNo('lb') }));
    }

    // Pneus du week-end : relais des séances précédentes, choix et communiqués de Pirelli
    case 'GET /api/tyres': {
      const p = url.searchParams.get('path') || '';
      if (!/^\d{4}\/[\w\-./]+\/$/.test(p)) return sendJSON(res, 400, { error: 'Séance invalide' });
      const until = Number(url.searchParams.get('until')) || Date.now();
      const hint = Object.fromEntries(['name', 'location', 'country', 'session'].map((k) => [k, (url.searchParams.get(k) || '').slice(0, 80)]));
      return sendJSON(res, 200, await weekendTyres(p, until, hint));
    }

    // Pole et meilleur tour en course des éditions précédentes sur ce circuit
    case 'GET /api/records': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      return sendJSON(res, 200, await circuitRecords(key, year));
    }

    case 'GET /api/circuit': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await circuit(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Tracé indisponible' });
    }

    case 'GET /api/zones': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await zones(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Zones indisponibles' });
    }

    case 'GET /api/loops': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await loops(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Calibration indisponible' });
    }

    case 'GET /api/changelog': {
      let text = '';
      try { text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { /* journal absent */ }
      return sendJSON(res, 200, { versions: parseChangelog(text) });
    }

    // Actualités : nouvelles de toutes les sources, gestion des sources
    case 'GET /api/news':
      return sendJSON(res, 200, newsSnapshot());
    case 'POST /api/news/refresh':
      refreshNews();
      return sendJSON(res, 200, { ok: true });
    case 'POST /api/news/sources': {
      const body = await readBody(req);
      try {
        if (body.add) return sendJSON(res, 200, { ok: true, source: await addNewsSource(body.add, body.cat, body.lang) });
        if (body.remove) { removeNewsSource(String(body.remove)); return sendJSON(res, 200, { ok: true }); }
        if (body.toggle) { setNewsSourceEnabled(String(body.toggle), !!body.on); return sendJSON(res, 200, { ok: true }); }
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
      return sendJSON(res, 400, { error: 'Requête invalide' });
    }

    case 'GET /api/season': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      return sendJSON(res, 200, await season(year));
    }

    // Horaires des séances (rappels de l'interface) et calendrier .ics à importer dans un agenda
    case 'GET /api/schedule': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      const d = await season(year);
      return sendJSON(res, 200, { year, races: d.races.map((r) => ({ round: r.round, name: r.name, locality: r.locality, lat: r.lat, lon: r.lon, sessions: r.sessions })) });
    }
    case 'GET /api/calendar.ics': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      const round = Number(url.searchParams.get('round')) || null;
      const alarm = Math.max(0, Math.min(120, Number(url.searchParams.get('alarm') ?? 15) || 0));
      const d = await season(year);
      const body = buildIcs(d.races, { year, round, alarmMin: alarm, lang: url.searchParams.get('lang') === 'en' ? 'en' : 'fr' });
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="f1-${year}${round ? `-manche-${round}` : ''}.ics"`,
        'Cache-Control': 'no-store',
      });
      return res.end(body);
    }

    // Lumières connectées (expérimental) : réglages et commandes depuis cet ordinateur uniquement
    case 'GET /api/lights':
    case 'POST /api/lights':
    case 'POST /api/lights/discover':
    case 'POST /api/lights/pair':
    case 'GET /api/lights/devices':
    case 'POST /api/lights/set': {
      if (!isLoopback(req.socket.remoteAddress)) return sendJSON(res, 403, { error: 'Réglage disponible uniquement sur l\'ordinateur' });
      try {
        if (route === 'GET /api/lights') return sendJSON(res, 200, lightsInfo());
        if (route === 'GET /api/lights/devices') return sendJSON(res, 200, { devices: await lightDevices() });
        if (route === 'POST /api/lights/discover') return sendJSON(res, 200, { bridges: await hueDiscover() });
        const body = await readBody(req);
        if (route === 'POST /api/lights') return sendJSON(res, 200, saveLights(body));
        if (route === 'POST /api/lights/pair') return sendJSON(res, 200, await huePair(String(body.ip || '').trim()));
        return sendJSON(res, 200, await setLights(String(body.state || ''), { force: !!body.force }));
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Pronostics entre amis (pole et podium de chaque Grand Prix)
    case 'GET /api/predictions': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      return sendJSON(res, 200, await predictionsView(year, url.searchParams.get('me') || ''));
    }
    case 'POST /api/predictions': {
      const body = await readBody(req);
      try {
        return sendJSON(res, 200, await savePrediction({ ...body, year: Number(body.year) || new Date().getFullYear() }));
      } catch (err) {
        return sendJSON(res, 400, { error: err.message });
      }
    }

    // Fond de carte du radar météo (OpenStreetMap, en cache)
    case 'GET /api/tile': {
      const [z, x, y] = ['z', 'x', 'y'].map((k) => Number(url.searchParams.get(k)));
      try {
        const png = await osmTile(z, x, y);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=604800' });
        return res.end(png);
      } catch (err) {
        return sendJSON(res, 404, { error: err.message });
      }
    }

    case 'GET /api/season/stats': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      return sendJSON(res, 200, await seasonStats(year));
    }

    case 'GET /api/season/fia': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      return sendJSON(res, 200, await seasonTech(year));
    }

    case 'GET /api/fia-docs': {
      const year = Number(url.searchParams.get('year'));
      const name = url.searchParams.get('name');
      if (!year || !name) return sendJSON(res, 400, { error: 'Paramètres year et name requis' });
      const meeting = { name, country: url.searchParams.get('country'), location: url.searchParams.get('location') };
      return sendJSON(res, 200, await fiaDocuments(year, meeting));
    }

    case 'GET /api/f1tv/content': {
      const meeting = url.searchParams.get('meeting'), session = url.searchParams.get('session');
      if (!meeting || !session) return sendJSON(res, 400, { error: 'Paramètres meeting et session requis' });
      return sendJSON(res, 200, await findSessionContent(meeting, session));
    }

    case 'GET /api/f1tv/play': {
      const token = getConfig().f1tvToken;
      const info = tokenInfo(token);
      if (!info.hasToken) return sendJSON(res, 401, { error: 'Aucun jeton F1 TV : connectez-vous dans Réglages.' });
      if (info.expired) return sendJSON(res, 401, { error: 'Jeton F1 TV expiré : reconnectez-vous dans Réglages.' });
      const contentId = url.searchParams.get('contentId');
      if (!contentId) return sendJSON(res, 400, { error: 'Paramètre contentId requis' });
      return sendJSON(res, 200, { ...(await playback(contentId, url.searchParams.get('channelId'), token)), account: { product: info.product, country: info.country } });
    }

    case 'POST /api/radio/allow': {
      // Station ajoutée par l'utilisateur : son hôte est autorisé dans le relais (et mémorisé).
      const body = await readBody(req);
      let host;
      try { host = new URL(body.url).host; } catch { return sendJSON(res, 400, { error: 'Adresse de flux invalide' }); }
      const hosts = [...new Set([...(getConfig().radioHosts || []), host])];
      saveConfig({ radioHosts: hosts });
      allowHost(host);
      return sendJSON(res, 200, { ok: true, host });
    }

    case 'GET /api/radio/resolve': {
      const target = url.searchParams.get('u') || '';
      const stream = await resolvePlaylist(target);
      allowHost(new URL(stream).host);
      return sendJSON(res, 200, { url: stream });
    }

    case 'GET /api/f1tv/proxy':
    case 'POST /api/f1tv/proxy':
      return f1tvProxy(req, res, url.searchParams.get('u') || '', getConfig().f1tvToken);

    case 'GET /api/recordings':
      return sendJSON(res, 200, listRecordings());

    case 'DELETE /api/recordings': {
      const file = recordingPath(url.searchParams.get('id') || '');
      if (!file) return sendJSON(res, 404, { error: 'Enregistrement introuvable' });
      if (recorder?.file === file) return sendJSON(res, 409, { error: 'Enregistrement en cours' });
      fs.unlinkSync(file);
      return sendJSON(res, 200, { ok: true });
    }

    case 'GET /api/archive': {
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      try {
        return sendJSON(res, 200, await seasonIndex(year));
      } catch (err) {
        return sendJSON(res, 502, { error: `Replays ${year} indisponibles : ${archiveError(year, err)}` });
      }
    }

    case 'POST /api/live':
      replay.stop();
      live.stop();
      live.start();
      return sendJSON(res, 200, { ok: true });

    case 'POST /api/replay': {
      const body = await readBody(req);
      let source;
      if (typeof body.local === 'string' && recordingPath(body.local)) source = { local: body.local };
      else if (typeof body.path === 'string' && /^\d{4}\/[\w\-./]+\/$/.test(body.path)) source = body.path;
      else return sendJSON(res, 400, { error: 'Session invalide' });
      live.stop();
      replay.start(source, body.startOffsetMs).catch((err) => console.warn('[replay]', err.message));
      return sendJSON(res, 202, { ok: true });
    }

    // Moments clés du replay en cours (départ, drapeaux, leaders, arrêts, incidents, pénalités…)
    case 'GET /api/sync/radios':
      return sendJSON(res, 200, hub.radioCaptures());

    case 'GET /api/replay/moments':
      return sendJSON(res, 200, { path: hub.source.path || null, moments: hub.source.mode === 'replay' ? (url.searchParams.get('lang') === 'en' ? replay.momentsEn : replay.moments) || [] : [] });

    case 'POST /api/replay/control': {
      const body = await readBody(req);
      if (body.action === 'pause') replay.pause();
      else if (body.action === 'resume') replay.resume();
      else if (body.action === 'seek' && Number.isFinite(body.toMs)) replay.seek(body.toMs);
      else if (body.action === 'skip' && Number.isFinite(body.deltaMs)) replay.seek(replay.position() + body.deltaMs);
      else if (body.action === 'speed' && Number.isFinite(body.speed)) replay.setSpeed(body.speed); else return sendJSON(res, 400, { error: 'Action inconnue' });
      return sendJSON(res, 200, { ok: true });
    }

    case 'GET /api/auth':
      return sendJSON(res, 200, authInfo());

    // Renouveler le jeton tout de suite (sinon fait automatiquement dans ses dernières 24 h)
    case 'POST /api/auth/renew':
      try {
        await renewF1tv({ force: true });
        return sendJSON(res, 200, authInfo());
      } catch (err) {
        renewState.lastError = err.message;
        return sendJSON(res, 502, { error: err.message });
      }

    case 'POST /api/auth': {
      const body = await readBody(req);
      const token = parseF1tvToken(body.token);
      if (!token) return sendJSON(res, 400, { error: 'Jeton non reconnu. Collez la valeur du cookie "login-session" ou le jeton "subscriptionToken".' });
      const info = tokenInfo(token);
      const expiredMsg = 'Ce jeton est expiré : reconnectez-vous sur F1 TV et recopiez-le.';
      if (info.expired) {
        // Jeton périmé mais session formula1.com encore valide : on le renouvelle aussitôt
        const ses = sessionOf(token);
        if (!ses || (ses.expiresAt && ses.expiresAt < Date.now())) return sendJSON(res, 400, { error: expiredMsg });
        const previous = getConfig().f1tvToken;
        saveConfig({ f1tvToken: token });
        try { await renewF1tv({ force: true }); } catch {
          saveConfig({ f1tvToken: previous });
          return sendJSON(res, 400, { error: expiredMsg });
        }
      } else saveConfig({ f1tvToken: token });
      resetRenewState();
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, authInfo());
    }

    case 'DELETE /api/auth':
      saveConfig({ f1tvToken: null });
      resetRenewState();
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, { hasToken: false });

    default:
      return sendJSON(res, 404, { error: 'Route inconnue' });
  }
}

// Serveur principal, qui n'écoute que sur cet ordinateur : seules les adresses locales sont
// acceptées (un nom de domaine extérieur pointant vers 127.0.0.1 = attaque « DNS rebinding »).
// L'accès depuis le réseau local passe par son propre serveur, protégé par une clé.
const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(settings.host);

async function handler(req, res) {
  if (loopbackOnly && req.socket.server === server && !localHost(req.headers.host)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Hôte non autorisé');
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      sendJSON(res, err instanceof HttpError ? 502 : 500, { error: err.message });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const pathname = decodePath(url.pathname);
  if (pathname === null) { res.writeHead(400); res.end('Adresse invalide'); return; }
  serveStatic(req, res, pathname);
}

const server = http.createServer(handler);
const wss = new WebSocketServer({
  server, path: '/ws', perMessageDeflate: { threshold: 4096 },
  // Connexion depuis l'interface uniquement (pas depuis la page d'un autre site)
  verifyClient: ({ req }) => (!loopbackOnly || localHost(req.headers.host)) && sameSiteRequest({ origin: req.headers.origin, host: req.headers.host }),
});
wss.on('connection', (ws, req) => hub.addClient(ws, { host: isLoopback(req.socket.remoteAddress) }));
lan = createLan({ handler, onSocket: (ws) => hub.addClient(ws, { host: false }) });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Le port ${settings.port} est déjà utilisé (F1 Dash est peut-être déjà lancé ?). Utilisez PORT=3001 par exemple.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(settings.port, settings.host, () => {
  const shown = settings.host === '0.0.0.0' ? 'localhost' : settings.host;
  console.log(`\n  F1 Dash prêt : http://${shown}:${settings.port}\n`);
  const auth = tokenInfo(getConfig().f1tvToken);
  if (!auth.hasToken) console.log('  (Sans jeton F1 TV : positions GPS estimées à partir des chronos. Voir README.)\n');
  else if (auth.expired) console.log('  Le jeton F1 TV enregistré est expiré (renouvellement automatique tenté si la session formula1.com est encore valide).\n');
});

live.start();
startAutoRenew();

// Actualités : chaque nouvelle est envoyée tout de suite aux fenêtres ouvertes
startNews();
onNews((list) => {
  const str = JSON.stringify({ type: 'news', items: list });
  for (const c of hub.clients) hub.send(c, str);
});

// Une erreur imprévue (réponse d'un site mal formée…) ne doit pas arrêter le dashboard en pleine
// séance : elle est consignée et le serveur continue
process.on('unhandledRejection', (err) => console.error('[erreur]', err));
process.on('uncaughtException', (err) => console.error('[erreur]', err));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    recorder?.close();
    lan?.stop();
    process.exit(0);
  });
}
