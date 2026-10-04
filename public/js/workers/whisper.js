// Transcription des radios d'équipe (Whisper, exécuté localement dans un Web Worker pour ne pas
// ralentir l'interface). Le modèle est téléchargé une seule fois puis gardé en cache par le
// navigateur / l'application.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

const MODEL = 'onnx-community/whisper-base.en';
let asr = null;

async function load() {
  if (asr) return asr;
  const gpu = !!(self.navigator?.gpu && await self.navigator.gpu.requestAdapter().catch(() => null));
  const progress = (p) => {
    if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  asr = await pipeline('automatic-speech-recognition', MODEL, gpu
    ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback: progress }
    : { device: 'wasm', dtype: 'q8', progress_callback: progress });
  self.postMessage({ type: 'ready', device: gpu ? 'webgpu' : 'wasm' });
  return asr;
}

self.onmessage = async (e) => {
  const { id, audio } = e.data;
  try {
    const run = await load();
    const out = await run(audio, { chunk_length_s: 30, stride_length_s: 5 });
    // Annotations sans parole (« (bell ringing) », « [BLANK_AUDIO] ») retirées
    const text = String(out?.text || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    self.postMessage({ type: 'result', id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err?.message || String(err) });
  }
};
