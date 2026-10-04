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

export function setTranscribe(on, language) {
  enabled = !!on;
  lang = language || 'none';
  if (enabled) pump();
}

// Radios à transcrire / traduire (les plus récentes d'abord)
export function requestTranscripts(urls) {
  if (!enabled) return;
  for (const url of urls) {
    const t = texts[url];
    const kind = !t ? 'asr' : (lang !== 'none' && t.en && t.tr?.[lang] === undefined ? 'mt' : null);
    if (!kind) continue;
    const k = `${kind}|${url}|${lang}`;
    if (queued.has(k)) continue;
    queued.add(k);
    queue.push({ url, kind, lang, k });
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
      setStatus('loading', `Téléchargement du modèle de ${what} (première fois) : ${Math.round((m.loaded / m.total) * 100)} %`);
      return;
    }
    if (m.type === 'ready') { setStatus('ready', m.device === 'webgpu' ? 'Actif (carte graphique)' : 'Actif (processeur)'); return; }
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

async function pump() {
  if (!enabled || !isTranscriber || busy || !queue.length || Date.now() < retryAt) return;
  busy = true;
  const task = queue.shift();
  try {
    if (task.kind === 'asr') {
      const audio = await decode(task.url);
      if (status.state !== 'ready') setStatus('loading', 'Préparation de la transcription…');
      const en = await run({ kind: 'asr', audio }, [audio.buffer]);
      texts[task.url] = { en, tr: {} };
      // Traduction juste après, avant les radios plus anciennes
      if (en && task.lang !== 'none') {
        const k = `mt|${task.url}|${task.lang}`;
        if (!queued.has(k)) { queued.add(k); queue.unshift({ url: task.url, kind: 'mt', lang: task.lang, k }); }
      }
    } else {
      const t = texts[task.url];
      if (t?.en) {
        const tr = await run({ kind: 'translate', text: t.en, lang: task.lang });
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
