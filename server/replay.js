// Replay d'une session passée à partir des archives publiques F1 Live Timing
// (livetiming.formula1.com/static/...). Les messages sont réinjectés dans le hub
// exactement comme en live : le délai, les duels, la carte... fonctionnent pareil.
import { getText, getJSON, HttpError } from './net.js';
import { ARCHIVE_TOPICS, topicName } from '../shared/f1.js';
import { sessionLabel } from './live.js';

const STATIC = 'https://livetiming.formula1.com/static/';

function parseStream(text, topic) {
  const out = [];
  const re = /^(\d+):(\d\d):(\d\d)\.(\d+)(.*)$/;
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const off = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Math.round(+`0.${m[4]}` * 1000);
    let data;
    try { data = JSON.parse(m[5]); } catch { continue; }
    out.push({ off, topic, data });
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadArchive(path, onProgress = () => {}) {
  let done = 0;
  const parts = await mapLimit(ARCHIVE_TOPICS, 4, async (rawTopic) => {
    try {
      const text = await getText(`${STATIC}${path}${rawTopic}.jsonStream`, { timeout: 120000 });
      return parseStream(text, rawTopic);
    } catch (err) {
      if (!(err instanceof HttpError)) console.warn(`[replay] ${rawTopic}: ${err.message}`);
      return [];
    } finally {
      onProgress(++done / ARCHIVE_TOPICS.length);
    }
  });

  const events = [];
  const stream = [];
  for (const list of parts) {
    for (const e of list) {
      const topic = topicName(e.topic);
      if (e.topic.endsWith('.z')) stream.push({ off: e.off, topic, raw: e.data });
      else events.push({ off: e.off, topic, data: e.data });
    }
  }
  if (!events.length) throw new Error('Archive introuvable ou vide pour cette session (pas encore publiée ?)');
  const byOff = (a, b) => a.off - b.off;
  events.sort(byOff);
  stream.sort(byOff);
  const duration = Math.max(events[events.length - 1].off, stream.length ? stream[stream.length - 1].off : 0);

  // Début réel de la session (extinction des feux / feu vert en qualif).
  const started = events.find((e) => e.topic === 'SessionStatus' && e.data?.Status === 'Started');
  const info = events.find((e) => e.topic === 'SessionInfo')?.data;
  return { events, stream, duration, startOff: started ? started.off : 0, info };
}

export class ReplaySource {
  constructor(hub) {
    this.hub = hub;
    this.anchor = 0;
    this.duration = 0;
    this.loadId = 0;
  }

  async start(path, startOffsetMs) {
    const id = ++this.loadId;
    this.hub.reset({ mode: 'replay', label: 'Replay', path, loading: true, progress: 0 });
    let archive;
    try {
      archive = await loadArchive(path, (p) => { if (id === this.loadId) this.hub.source.progress = p; });
    } catch (err) {
      if (id === this.loadId) Object.assign(this.hub.source, { loading: false, error: err.message });
      throw err;
    }
    if (id !== this.loadId) return;

    const start = Number.isFinite(startOffsetMs) ? startOffsetMs : Math.max(0, archive.startOff - 60000);
    this.duration = archive.duration;
    this.startOff = archive.startOff;
    this.anchor = Date.now() - start;
    const events = archive.events.map((e) => ({ t: this.anchor + e.off, topic: e.topic, data: e.data }));
    const stream = archive.stream.map((s) => ({ t: this.anchor + s.off, topic: s.topic, raw: s.raw }));
    this.hub.load(events, stream);
    this.hub.source = {
      mode: 'replay',
      label: 'Replay',
      path,
      session: sessionLabel(archive.info),
      loading: false,
      connected: true,
      duration: this.duration,
      sessionStart: this.startOff,
      anchor: this.anchor,
    };
  }

  isActive() {
    return this.hub.source.mode === 'replay' && !this.hub.source.loading;
  }

  seek(toMs) {
    if (!this.isActive()) return;
    const to = Math.max(0, Math.min(this.duration, toMs));
    const newAnchor = this.hub.clock() - to;
    this.hub.shift(newAnchor - this.anchor, true);
    this.anchor = newAnchor;
    this.hub.source.anchor = this.anchor;
  }

  pause() {
    if (!this.isActive() || this.hub.pausedAt !== null) return;
    this.hub.pausedAt = Date.now();
  }

  resume() {
    if (!this.isActive() || this.hub.pausedAt === null) return;
    const delta = Date.now() - this.hub.pausedAt;
    this.hub.pausedAt = null;
    this.hub.shift(delta);
    this.anchor += delta;
    this.hub.source.anchor = this.anchor;
  }

  stop() {
    this.loadId++;
  }
}

// ---- Index des sessions archivées ----
const indexCache = new Map();

export async function seasonIndex(year) {
  const cached = indexCache.get(year);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const raw = await getJSON(`${STATIC}${year}/Index.json`);
  const data = (raw.Meetings || []).map((m) => ({
    key: m.Key,
    name: m.Name,
    location: m.Location,
    country: m.Country?.Name,
    circuitKey: m.Circuit?.Key,
    sessions: (m.Sessions || []).filter((s) => s.Path).map((s) => ({
      key: s.Key,
      name: s.Name,
      type: s.Type,
      start: s.StartDate,
      gmtOffset: s.GmtOffset,
      path: s.Path,
    })),
  }));
  indexCache.set(year, { at: Date.now(), data });
  return data;
}
