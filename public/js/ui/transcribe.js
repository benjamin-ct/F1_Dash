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
let quality = null;           // niveau effectif (résolu au premier usage)
let highFailed = false;
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
  if (q !== qualityPref) { qualityPref = q; quality = null; }
  if (enabled) pump();
}

// Niveau de qualité effectif : « high » si une carte graphique est utilisable (WebGPU).
async function resolveQuality() {
  if (quality) return quality;
  if (qualityPref === 'light' || highFailed) quality = 'light';
  else {
    const adapter = await navigator.gpu?.requestAdapter?.().catch(() => null);
    quality = adapter ? 'high' : 'light';
  }
  return quality;
}

export function currentQuality() {
  return quality;
}

// Radios à transcrire / traduire (les plus récentes d'abord) : [{ url, who }]
export function requestTranscripts(items) {
  if (!enabled) return;
  for (const { url, who } of items) {
    const t = texts[url];
    // En qualité haute, les radios déjà faites en qualité légère sont refaites
    const redo = t && quality === 'high' && t.q !== 'high';
    const kind = !t || redo ? 'asr' : (lang !== 'none' && t.en && t.tr?.[lang] === undefined ? 'mt' : null);
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
    if (m.type === 'ready') { setStatus('ready', m.device === 'webgpu' ? 'Actif · haute qualité (carte graphique)' : 'Actif · qualité légère (processeur)'); return; }
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
export function translateText(text, language, domain) {
  return new Promise((resolve, reject) => {
    queue.push({ kind: 'text', text, lang: language, domain, resolve, reject, k: `text|${text}` });
    pump();
  });
}

async function textQuality() {
  if (qualityPref === 'light' || highFailed) return 'light';
  if (!navigator.gpu) return 'light';
  try {
    const keys = await (await caches.open('transformers-cache')).keys();
    if (!keys.some((r) => r.url.includes('Qwen3-4B'))) return 'light';
  } catch { return 'light'; }
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  return adapter ? 'high' : 'light';
}

async function runText(task) {
  const q = await textQuality();
  try {
    task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: q, domain: task.domain }), q });
  } catch (err) {
    if (q === 'high') {
      highFailed = true;
      task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: 'light', domain: task.domain }), q: 'light' });
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
      const q = await resolveQuality();
      const audio = await decode(task.url);
      if (status.state !== 'ready') setStatus('loading', 'Préparation de la transcription…');
      const en = await run({ kind: 'asr', audio, quality: q }, [audio.buffer]);
      texts[task.url] = { en, tr: {}, q };
      // Traduction juste après, avant les radios plus anciennes
      if (en && task.lang !== 'none') {
        const k = `mt|${task.url}|${task.lang}`;
        if (!queued.has(k)) { queued.add(k); queue.unshift({ url: task.url, who: task.who, kind: 'mt', lang: task.lang, k }); }
      }
    } else {
      const t = texts[task.url];
      if (t?.en) {
        const q = await resolveQuality();
        const tr = await run({ kind: 'translate', text: t.en, lang: task.lang, quality: q, who: task.who });
        t.tr = { ...(t.tr || {}), [task.lang]: tr };
      }
    }
    save();
    if (status.state !== 'ready') setStatus('ready', 'Actif');
    emit('radioText');
    queued.delete(task.k);
  } catch (err) {
    console.warn('[transcription]', err.message);
    if (/^audio/.test(err.message)) {
      texts[task.url] = { en: '', tr: {} };
      queued.delete(task.k);
    } else if (quality === 'high' && !highFailed) {
      // Carte graphique inutilisable (pilote, mémoire…) : bascule sur les modèles légers
      highFailed = true;
      quality = null;
      queue.unshift(task);
    } else {
      // Moteur ou modèle indisponible : nouvel essai dans une minute (la tâche reste en file)
      queue.unshift(task);
      retryAt = Date.now() + 60000;
      setTimeout(pump, 60500);
    }
    setStatus('error', `Impossible : ${err.message}`);
  } finally {
    busy = false;
    setTimeout(pump, 50);
  }
}
