// Transcription en texte des radios d'équipe (comme MultiViewer), faite localement par Whisper
// dans un Web Worker. Une seule fenêtre transcrit (verrou partagé) ; les textes sont partagés
// entre fenêtres et conservés d'une session à l'autre.
import { storageGet, storageSet } from '../util.js';
import { emit } from '../store.js';

const KEY = 'f1dash.radioText';
const MAX_KEEP = 400;
let texts = storageGet(KEY, {});           // url -> texte
const queue = [];                          // urls à transcrire (plus récentes d'abord)
const pending = new Set();
let worker = null;
let busy = false;
let enabled = false;
let isTranscriber = !navigator.locks;
let status = { state: 'idle', msg: '' };

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

export function radioText(url) {
  return texts[url] ?? null;
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

export function setTranscribe(on) {
  enabled = !!on;
  if (enabled) pump();
}

// Radios à transcrire (les plus récentes d'abord)
export function requestTranscripts(urls) {
  if (!enabled) return;
  for (const u of urls) {
    if (u in texts || pending.has(u)) continue;
    pending.add(u);
    queue.push(u);
  }
  pump();
}

let current = null;   // transcription en cours {id, resolve, reject}

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
      setStatus('loading', `Téléchargement du modèle (première fois) : ${Math.round((m.loaded / m.total) * 100)} %`);
      return;
    }
    if (m.type === 'ready') { setStatus('ready', m.device === 'webgpu' ? 'Transcription active (carte graphique)' : 'Transcription active (processeur)'); return; }
    if (!current || m.id !== current.id) return;
    if (m.type === 'result') current.resolve(m.text); else current.reject(new Error(m.error));
  };
  return worker;
}

async function decode(url) {
  const res = await fetch(`/api/f1tv/proxy?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const buf = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const audio = await ctx.decodeAudioData(buf);
  // Mono 16 kHz pour Whisper
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

let nextId = 1;

let retryAt = 0;

async function pump() {
  if (!enabled || !isTranscriber || busy || !queue.length || Date.now() < retryAt) return;
  busy = true;
  const url = queue.shift();
  try {
    const audio = await decode(url);
    const w = getWorker();
    if (status.state !== 'ready') setStatus('loading', 'Préparation du modèle de transcription…');
    const text = await new Promise((resolve, reject) => {
      current = { id: nextId++, resolve, reject };
      w.postMessage({ id: current.id, audio }, [audio.buffer]);
    }).finally(() => { current = null; });
    texts[url] = text || '';
    save();
    if (status.state !== 'ready') setStatus('ready', 'Transcription active');
    emit('radioText');
  } catch (err) {
    console.warn('[transcription]', err.message);
    if (/^audio/.test(err.message)) texts[url] = '';
    else {
      // Moteur indisponible : nouvel essai dans une minute (la radio reste en file)
      queue.unshift(url);
      retryAt = Date.now() + 60000;
      setTimeout(pump, 60500);
    }
    setStatus('error', `Transcription impossible : ${err.message}`);
  } finally {
    if (!queue.includes(url)) pending.delete(url);
    busy = false;
    setTimeout(pump, 50);
  }
}
