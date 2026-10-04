// Transcription (Whisper) et traduction (Marian / OPUS-MT) des radios d'équipe, exécutées
// localement dans un Web Worker pour ne pas ralentir l'interface. Les modèles sont téléchargés
// une seule fois puis gardés en cache par le navigateur / l'application.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

const ASR_MODEL = 'onnx-community/whisper-base.en';
const MT_MODELS = { fr: 'Xenova/opus-mt-en-fr', es: 'Xenova/opus-mt-en-es', de: 'Xenova/opus-mt-en-de', it: 'Xenova/opus-mt-en-it' };
let asr = null;
const mt = {};
let gpu = null;

async function hasGpu() {
  if (gpu === null) gpu = !!(self.navigator?.gpu && await self.navigator.gpu.requestAdapter().catch(() => null));
  return gpu;
}

const progress = (what) => (p) => {
  if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', what, loaded: p.loaded, total: p.total });
};

async function loadAsr() {
  if (asr) return asr;
  const g = await hasGpu();
  asr = await pipeline('automatic-speech-recognition', ASR_MODEL, g
    ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback: progress('asr') }
    : { device: 'wasm', dtype: 'q8', progress_callback: progress('asr') });
  self.postMessage({ type: 'ready', device: g ? 'webgpu' : 'wasm' });
  return asr;
}

async function loadMt(lang) {
  if (!MT_MODELS[lang]) throw new Error(`langue non prise en charge : ${lang}`);
  mt[lang] ||= pipeline('translation', MT_MODELS[lang], { device: 'wasm', dtype: 'q8', progress_callback: progress('mt') });
  return mt[lang];
}

self.onmessage = async (e) => {
  const { id, kind } = e.data;
  try {
    if (kind === 'translate') {
      const run = await loadMt(e.data.lang);
      // Phrase par phrase : plus rapide et plus fidèle (le modèle s'égare sur les textes longs)
      const parts = String(e.data.text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
      const out = [];
      for (const part of parts) {
        const r = await run(part, { max_new_tokens: Math.min(160, 24 + part.split(/\s+/).length * 3) });
        out.push(String(r?.[0]?.translation_text || '').trim());
      }
      self.postMessage({ type: 'result', id, text: out.join(' ') });
      return;
    }
    const run = await loadAsr();
    const out = await run(e.data.audio, { chunk_length_s: 30, stride_length_s: 5 });
    // Annotations sans parole (« (bell ringing) », « [BLANK_AUDIO] ») retirées
    const text = String(out?.text || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    self.postMessage({ type: 'result', id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err?.message || String(err) });
  }
};
