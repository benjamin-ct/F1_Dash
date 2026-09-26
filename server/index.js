// Point d'entrée : serveur HTTP (interface + API) et WebSocket vers le navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { LiveSource } from './live.js';
import { ReplaySource, seasonIndex } from './replay.js';
import { HttpError } from './net.js';
import { circuit, loops } from './circuits.js';
import { fiaDocuments } from './fia.js';
import { Recorder, listRecordings, recordingPath } from './recorder.js';
import { ROOT, settings, getConfig, saveConfig, parseF1tvToken, tokenInfo } from './config.js';

const hub = new Hub({ maxDelayMs: settings.maxDelayMs });
const recorder = process.env.NO_RECORDING ? null : new Recorder();
const live = new LiveSource(hub, () => {
  const token = getConfig().f1tvToken;
  return token && !tokenInfo(token).expired ? token : null;
}, recorder);
const replay = new ReplaySource(hub);

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

// Les routes qui modifient l'état n'acceptent que des requêtes provenant de l'interface elle-même.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (req.method !== 'GET' && !sameOrigin(req)) return sendJSON(res, 403, { error: 'Origine refusée' });

  switch (route) {
    case 'GET /api/status':
      return sendJSON(res, 200, { ...hub.statusPayload(), auth: tokenInfo(getConfig().f1tvToken) });

    case 'GET /api/circuit': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await circuit(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Tracé indisponible' });
    }

    case 'GET /api/loops': {
      const key = Number(url.searchParams.get('key'));
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      if (!key) return sendJSON(res, 400, { error: 'Paramètre key manquant' });
      const data = await loops(key, year);
      return data ? sendJSON(res, 200, data) : sendJSON(res, 404, { error: 'Calibration indisponible' });
    }

    case 'GET /api/fia-docs': {
      const year = Number(url.searchParams.get('year'));
      const name = url.searchParams.get('name');
      if (!year || !name) return sendJSON(res, 400, { error: 'Paramètres year et name requis' });
      const meeting = { name, country: url.searchParams.get('country'), location: url.searchParams.get('location') };
      return sendJSON(res, 200, await fiaDocuments(year, meeting));
    }

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
      return sendJSON(res, 200, await seasonIndex(year));
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
      return sendJSON(res, 200, tokenInfo(getConfig().f1tvToken));

    case 'POST /api/auth': {
      const body = await readBody(req);
      const token = parseF1tvToken(body.token);
      if (!token) return sendJSON(res, 400, { error: 'Jeton non reconnu. Collez la valeur du cookie "login-session" ou le jeton "subscriptionToken".' });
      const info = tokenInfo(token);
      if (info.expired) return sendJSON(res, 400, { error: 'Ce jeton est expiré : reconnectez-vous sur F1 TV et recopiez-le.' });
      saveConfig({ f1tvToken: token });
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, info);
    }

    case 'DELETE /api/auth':
      saveConfig({ f1tvToken: null });
      if (hub.source.mode === 'live') live.restart();
      return sendJSON(res, 200, { hasToken: false });

    default:
      return sendJSON(res, 404, { error: 'Route inconnue' });
  }
}

const server = http.createServer(async (req, res) => {
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
  serveStatic(req, res, decodeURIComponent(url.pathname));
});

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 4096 } });
wss.on('connection', (ws) => hub.addClient(ws));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✖ Le port ${settings.port} est déjà utilisé (F1 Dash est peut-être déjà lancé ?). Utilisez PORT=3001 par exemple.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(settings.port, settings.host, () => {
  const shown = settings.host === '0.0.0.0' ? 'localhost' : settings.host;
  console.log(`\n  🏁 F1 Dash prêt : http://${shown}:${settings.port}\n`);
  const auth = tokenInfo(getConfig().f1tvToken);
  if (!auth.hasToken) console.log('  (Sans jeton F1 TV : positions GPS estimées à partir des chronos. Voir README.)\n');
  else if (auth.expired) console.log('  ⚠ Le jeton F1 TV enregistré est expiré.\n');
});

live.start();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    recorder?.close();
    process.exit(0);
  });
}
