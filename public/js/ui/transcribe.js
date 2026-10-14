// Transcription en texte des radios d'équipe (comme MultiViewer) et traduction, faites
// localement (Whisper + OPUS-MT) dans un Web Worker. Une seule fenêtre travaille (verrou
// partagé) ; les textes sont partagés entre fenêtres et conservés d'une session à l'autre.
import { storageGet, storageSet } from '../util.js';
import { emit } from '../store.js';

const KEY = 'f1dash.radioTexts';
const MAX_KEEP = 400;
let texts = storageGet(KEY, {});           // url -> { en, tr: { fr, es… } }
const queue = [];                          // tâches { url, kind: 'asr' | 'mt' } (plus récentes d'abord)
const queued = new Set();
let worker = null;
let busy = false;
let enabled = false;
let lang = 'fr';
let qualityPref = 'auto';     // 'auto' | 'high' | 'light'
// Haute qualité : carte graphique (WebGPU avec calcul FP16). Un échec d'un des deux modèles
// (reconnaissance vocale ou traduction) ne fait passer que celui-là en qualité légère, et pour
// un temps seulement : nouvel essai après quelques minutes (téléchargement interrompu, mémoire
// de la carte graphique pleine…). Avant, le premier échec faisait tout passer en qualité légère
// jusqu'au redémarrage de l'application.
let gpuInfo = null;                           // { ok, name, why }
const highFail = { asr: null, mt: null };     // { msg, at, wait }
const effective = { asr: null, mt: null };    // niveau utilisé en dernier ('high' | 'light')
const RETRY_MS = { pref: 2 * 60000, auto: 10 * 60000 };
let isTranscriber = !navigator.locks;
let status = { state: 'idle', msg: '' };
let retryAt = 0;
let current = null;   // tâche en cours {id, resolve, reject}
let nextId = 1;

navigator.locks?.request('f1dash-radio-transcriber', () => {
  isTranscriber = true;
  pump();
  return new Promise(() => {});
});

// Textes reçus d'une autre fenêtre
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { texts = JSON.parse(e.newValue) || {}; } catch { return; }
  emit('radioText');
});

export function radioEntry(url) {
  return texts[url] || null;
}

export function transcribeStatus() {
  return status;
}

function setStatus(state, msg = '') {
  status = { state, msg };
  emit('radioText');
}

function save() {
  const keys = Object.keys(texts);
  if (keys.length > MAX_KEEP) for (const k of keys.slice(0, keys.length - MAX_KEEP)) delete texts[k];
  storageSet(KEY, texts);
}

export function setTranscribe(on, language, q = 'auto') {
  enabled = !!on;
  lang = language || 'none';
  if (q !== qualityPref) {
    qualityPref = q;
    // Nouveau choix : on retente la haute qualité tout de suite
    highFail.asr = highFail.mt = null;
  }
  if (enabled) {
    // Niveau de chaque modèle connu dès le départ (pour refaire en haute qualité les radios
    // traduites en qualité légère), puis revu chaque minute (fin d'attente après un échec)
    refreshEffective();
    refreshTimer ||= setInterval(() => { if (enabled && (highFail.asr || highFail.mt)) refreshEffective(); }, 60000);
    pump();
  }
}
let refreshTimer = 0;

// Carte graphique utilisable pour les grands modèles ? (WebGPU + calcul en demi-précision)
async function gpu() {
  if (gpuInfo) return gpuInfo;
  if (!navigator.gpu) return (gpuInfo = { ok: false, why: 'WebGPU indisponible sur cet appareil' });
  const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!a) return (gpuInfo = { ok: false, why: 'aucune carte graphique utilisable (WebGPU)' });
  const name = [a.info?.vendor, a.info?.description || a.info?.architecture].filter(Boolean).join(' ');
  const f16 = a.features?.has?.('shader-f16');
  return (gpuInfo = { ok: !!f16, name, why: f16 ? '' : `carte graphique${name ? ` (${name})` : ''} sans calcul FP16, nécessaire aux grands modèles` });
}

// Niveau à utiliser pour la reconnaissance vocale ('asr') ou la traduction ('mt')
async function qualityFor(use) {
  if (qualityPref === 'light') return 'light';
  if (!(await gpu()).ok) return 'light';
  const f = highFail[use];
  if (f && Date.now() - f.at < f.wait) return 'light';
  return 'high';
}

async function refreshEffective() {
  effective.asr = await qualityFor('asr');
  effective.mt = await qualityFor('mt');
  if (status.state !== 'loading') setStatus(status.state === 'idle' ? 'idle' : 'ready', describe());
  else emit('radioText');
}

// Échec d'un grand modèle : qualité légère pour ce modèle, nouvel essai plus tard
function markHighFailed(use, err) {
  highFail[use] = { msg: err.message, at: Date.now(), wait: qualityPref === 'high' ? RETRY_MS.pref : RETRY_MS.auto };
  effective[use] = 'light';
  console.warn(`[transcription] ${use === 'asr' ? 'reconnaissance vocale' : 'traduction'} en haute qualité impossible :`, err.message);
}

// Texte d'état : niveau de chaque modèle et, s'il est léger, pourquoi
function describe() {
  const why = (use) => {
    if (qualityPref === 'light') return 'choisie dans les réglages';
    if (gpuInfo && !gpuInfo.ok) return gpuInfo.why;
    const f = highFail[use];
    if (f) {
      const min = Math.max(1, Math.ceil((f.at + f.wait - Date.now()) / 60000));
      return `haute qualité en échec (${f.msg}) · nouvel essai dans ${min} min`;
    }
    return '';
  };
  const part = (label, use, hi) => {
    const q = effective[use];
    if (!q) return '';
    if (q === 'high') return `${label} : haute qualité (${hi})`;
    const w = why(use);
    return `${label} : qualité légère${w ? ` — ${w}` : ''}`;
  };
  const txt = [part('Transcription', 'asr', 'Whisper large'), lang === 'none' ? '' : part('Traduction', 'mt', 'modèle de langage F1')].filter(Boolean).join(' · ');
  return txt ? `Actif · ${txt}` : 'Actif';
}

export function currentQuality() {
  return effective.asr;
}

// Radios à transcrire / traduire (les plus récentes d'abord) : [{ url, who }]
export function requestTranscripts(items) {
  if (!enabled) return;
  for (const { url, who } of items) {
    const t = texts[url];
    // Haute qualité disponible : les radios faites en qualité légère sont refaites (transcription,
    // ou seulement la traduction si la transcription est déjà en haute qualité)
    const redoAsr = t && effective.asr === 'high' && t.q !== 'high';
    const redoMt = t && t.en && lang !== 'none' && effective.mt === 'high' && t.tr?.[lang] !== undefined && t.tq?.[lang] !== 'high';
    const kind = !t || redoAsr ? 'asr' : (lang !== 'none' && t.en && (t.tr?.[lang] === undefined || redoMt) ? 'mt' : null);
    if (!kind) continue;
    const k = `${kind}|${url}|${lang}`;
    if (queued.has(k)) continue;
    queued.add(k);
    queue.push({ url, who, kind, lang, k });
  }
  pump();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/whisper.js', import.meta.url), { type: 'module' });
  // Échec du chargement (pas de connexion pour télécharger le moteur / le modèle…)
  worker.onerror = (e) => {
    e.preventDefault?.();
    worker = null;
    current?.reject(new Error(e.message || 'moteur de transcription indisponible (connexion ?)'));
  };
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      const what = m.what === 'mt' ? 'traduction' : 'reconnaissance vocale';
      const mb = (x) => Math.round(x / 1e6);
      setStatus('loading', `Téléchargement du modèle de ${what} (première fois) : ${mb(m.loaded)} / ${mb(m.total)} Mo`);
      return;
    }
    if (m.type === 'ready') { setStatus('ready', describe()); return; }
    if (!current || m.id !== current.id) return;
    if (m.type === 'result') current.resolve(m.text); else current.reject(new Error(m.error));
  };
  return worker;
}

function run(msg, transfer = []) {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    current = { id: nextId++, resolve, reject };
    w.postMessage({ ...msg, id: current.id }, transfer);
  }).finally(() => { current = null; });
}

async function decode(url) {
  const res = await fetch(`/api/f1tv/proxy?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const buf = await res.arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(buf);
  // Mono 16 kHz pour Whisper
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

// Traduction d'un texte quelconque (évolutions techniques de la FIA…) avec le même moteur que
// les radios : un seul modèle en mémoire, une tâche à la fois. Le modèle de langage (carte
// graphique) n'est utilisé que s'il est déjà téléchargé, pour ne pas imposer 2,5 Go.
export function translateText(text, language, domain, from = 'en') {
  return new Promise((resolve, reject) => {
    queue.push({ kind: 'text', text, lang: language, domain, from, resolve, reject, k: `text|${text}` });
    pump();
  });
}

async function textQuality() {
  if ((await qualityFor('mt')) !== 'high') return 'light';
  try {
    const keys = await (await caches.open('transformers-cache')).keys();
    if (!keys.some((r) => r.url.includes('Qwen3-4B'))) return 'light';
  } catch { return 'light'; }
  return 'high';
}

async function runText(task) {
  const q = await textQuality();
  try {
    task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: q, domain: task.domain, from: task.from }), q });
  } catch (err) {
    if (q === 'high') {
      markHighFailed('mt', err);
      task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: 'light', domain: task.domain, from: task.from }), q: 'light' });
    } else throw err;
  }
}

async function pump() {
  if (busy || !queue.length || Date.now() < retryAt) return;
  // Radios : seulement si la transcription est activée, dans la fenêtre qui en est chargée
  const radios = enabled && isTranscriber;
  const i = queue.findIndex((t) => t.kind === 'text' || radios);
  if (i < 0) return;
  busy = true;
  const task = queue.splice(i, 1)[0];
  if (task.kind === 'text') {
    try { await runText(task); } catch (err) { task.reject(err); }
    busy = false;
    setTimeout(pump, 50);
    return;
  }
  try {
    if (task.kind === 'asr') {
      const q = task.q = await qualityFor('asr');
      effective.asr = q;
      const audio = await decode(task.url);
      if (status.state !== 'ready') setStatus('loading', 'Préparation de la transcription…');
      const en = await run({ kind: 'asr', audio, quality: q }, [audio.buffer]);
      texts[task.url] = { en, tr: {}, tq: {}, q };
      // Traduction juste après, avant les radios plus anciennes
      if (en && task.lang !== 'none') {
        const k = `mt|${task.url}|${task.lang}`;
        if (!queued.has(k)) { queued.add(k); queue.unshift({ url: task.url, who: task.who, kind: 'mt', lang: task.lang, k }); }
      }
    } else {
      const t = texts[task.url];
      if (t?.en) {
        const q = task.q = await qualityFor('mt');
        effective.mt = q;
        const tr = await run({ kind: 'translate', text: t.en, lang: task.lang, quality: q, who: task.who });
        t.tr = { ...(t.tr || {}), [task.lang]: tr };
        t.tq = { ...(t.tq || {}), [task.lang]: q };
      }
    }
    save();
    setStatus('ready', describe());
    emit('radioText');
    queued.delete(task.k);
  } catch (err) {
    console.warn('[transcription]', err.message);
    if (/^audio/.test(err.message)) {
      texts[task.url] = { en: '', tr: {} };
      queued.delete(task.k);
    } else if (task.q === 'high') {
      // Grand modèle inutilisable pour l'instant (téléchargement, mémoire de la carte graphique…) :
      // ce modèle seul passe en qualité légère, nouvel essai plus tard
      markHighFailed(task.kind === 'asr' ? 'asr' : 'mt', err);
      queue.unshift(task);
    } else {
      // Moteur ou modèle indisponible : nouvel essai dans une minute (la tâche reste en file)
      queue.unshift(task);
      retryAt = Date.now() + 60000;
      setTimeout(pump, 60500);
    }
    setStatus(task.q === 'high' ? 'ready' : 'error', task.q === 'high' ? describe() : `Impossible : ${err.message}`);
  } finally {
    busy = false;
    setTimeout(pump, 50);
  }
}
