// Transcription et traduction des radios d'équipe, exécutées localement dans un Web Worker pour
// ne pas ralentir l'interface. Les modèles sont téléchargés une seule fois puis gardés en cache.
//
// Deux niveaux :
//  - « high » (carte graphique, WebGPU) : Whisper large-v3-turbo pour la transcription, et un
//    modèle de langage (Qwen3-4B-Instruct) pour la traduction, avec le contexte « radio F1 » : jargon
//    traduit correctement (« box » → « rentre aux stands »), erreurs d'écoute corrigées.
//  - « light » (processeur) : Whisper base.en et OPUS-MT, plus légers mais plus approximatifs.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
import { prefetch } from './hf-download.js';

env.allowLocalModels = false;

const MODELS = {
  asrHigh: 'onnx-community/whisper-large-v3-turbo',
  asrLight: 'onnx-community/whisper-base.en',
  llm: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
  mt: { fr: 'Xenova/opus-mt-en-fr', es: 'Xenova/opus-mt-en-es', de: 'Xenova/opus-mt-en-de', it: 'Xenova/opus-mt-en-it' },
};
const LANG_NAME = { fr: 'French', es: 'Spanish', de: 'German', it: 'Italian' };
const loaded = {};

// Progression globale du téléchargement (somme de tous les fichiers en cours)
const files = new Map();
const progress = (what) => (p) => {
  if (p.status === 'progress' && p.total) {
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let l = 0, t = 0;
    for (const f of files.values()) { l += f.loaded; t += f.total; }
    self.postMessage({ type: 'progress', what, loaded: l, total: t });
  } else if (p.status === 'done') {
    files.delete(p.file);
  }
};

function load(key, factory) {
  loaded[key] ||= factory().catch((err) => { delete loaded[key]; throw err; });
  return loaded[key];
}

// Gros fichiers (plus de 300 Mo) téléchargés par morceaux, avec reprise (voir hf-download.js)
const BIG = {
  asrHigh: ['onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_fp16.onnx'],
  llm: ['onnx/model_q4f16.onnx_data', 'onnx/model_q4f16.onnx_data_1'],
};
const prefetchBig = (key, what) => {
  const cb = progress(what);
  return prefetch(MODELS[key], BIG[key], (file, loaded, total) => cb(loaded == null ? { status: 'done', file } : { status: 'progress', file, loaded, total }));
};

const asrHigh = () => load('asrHigh', async () => {
  await prefetchBig('asrHigh', 'asr');
  return pipeline('automatic-speech-recognition', MODELS.asrHigh,
    { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' }, progress_callback: progress('asr') });
});
const asrLight = (gpu) => load(`asrLight${gpu}`, () => pipeline('automatic-speech-recognition', MODELS.asrLight, gpu
  ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback: progress('asr') }
  : { device: 'wasm', dtype: 'q8', progress_callback: progress('asr') }));
const llm = () => load('llm', async () => {
  await prefetchBig('llm', 'mt');
  return pipeline('text-generation', MODELS.llm, { device: 'webgpu', dtype: 'q4f16', progress_callback: progress('mt') });
});
const mt = (lang) => load(`mt-${lang}`, () => {
  if (!MODELS.mt[lang]) throw new Error(`langue non prise en charge : ${lang}`);
  return pipeline('translation', MODELS.mt[lang], { device: 'wasm', dtype: 'q8', progress_callback: progress('mt') });
});

const clean = (t) => String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => (t.match(/[A-Za-z']+/g) || []).length;

async function transcribe(audio, quality) {
  const secs = audio.length / 16000;
  const opts = secs > 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {};
  if (quality !== 'high') return clean((await (await asrLight(false))(audio, opts)).text);
  const big = clean((await (await asrHigh())(audio, { ...opts, language: 'english', task: 'transcribe' })).text);
  // Whisper large-v3 saute parfois une partie d'une radio bruitée : si le texte est anormalement
  // court pour la durée, on compare avec le petit modèle et on garde le plus complet.
  if (secs > 5 && words(big) < secs * 0.8) {
    const small = clean((await (await asrLight(true))(audio, opts)).text);
    if (words(small) > words(big) * 1.5) return small;
  }
  return big;
}

function systemPrompt(lang, who) {
  const ctx = who ? ` The speaker is on ${who}'s radio channel (driver or race engineer).` : '';
  if (lang === 'fr') {
    return `Tu traduis des radios d'équipe de Formule 1 (échanges pilote ↔ ingénieur de course), de l'anglais vers le français.${who ? ` Canal radio de ${who}.` : ''}
- Traduction naturelle, comme un commentateur F1 français ; garde le ton oral et bref, tutoiement entre pilote et ingénieur.
- Jargon : "box, box" = "rentre aux stands", "copy" = "reçu", "push" = "attaque", "deg" = "dégradation", "undercut"/"overcut" restent tels quels, "DRS" reste "DRS", "lift and coast" = "lever le pied", "tyres/tires" = "pneus", "hards/mediums/softs" = "durs/médiums/tendres", "inters" = "intermédiaires", "brakes" = "freins", "pace" = "rythme", "gap" = "écart", "lap" = "tour", "every lap" = "à chaque tour", "turn 5" / "turn five" = "virage 5", "deployment" = "déploiement (de l'énergie électrique)", "boost"/"overtake mode" = "boost"/"mode dépassement", "safety car" reste "safety car", "P4" reste "P4", "stopped/pitted" = "on s'est arrêté aux stands".
- Traduis le sens de chaque phrase, pas mot à mot, et n'omets aucune information (positions, écarts, noms, numéros de virage).
- La transcription automatique peut contenir des erreurs d'écoute : si le contexte F1 rend la bonne formulation évidente, corrige-la (ex. "breaks" → "brakes" → "freins").
- Garde les jurons atténués tels quels (ex. "f***").
- Réponds uniquement par la phrase traduite en français, sans guillemets, sans préfixe, sans commentaire. Ne recopie jamais l'anglais.`;
  }
  return `You translate Formula 1 team radio (driver ↔ race engineer) from English into ${LANG_NAME[lang]}.${ctx}
- Natural, spoken and brief, as an F1 commentator would say it in ${LANG_NAME[lang]}.
- Translate F1 jargon by meaning ("box, box" = come into the pits, "copy" = understood/received, "push" = attack, "deg" = tyre degradation, "lift and coast" = lift off early to save fuel/energy); keep "DRS", "undercut", "safety car", "P4" as is.
- The automatic transcript may contain mishearings: when the F1 context makes the intended wording obvious, fix it (e.g. "breaks" → "brakes").
- Answer with the ${LANG_NAME[lang]} translation only: no quotes, no prefix, no comment, never the English text.`;
}

// Textes techniques des écuries (évolutions déclarées à la FIA)
function techPrompt(lang) {
  if (lang === 'fr') {
    return `Tu traduis en français des descriptions techniques d'évolutions de monoplaces de Formule 1, rédigées par les écuries pour la FIA.
- Style clair et précis, comme un journaliste technique F1 français.
- Vocabulaire : "floor" = "fond plat", "floor edge" = "bord du fond plat", "floor fences" = "déflecteurs du fond plat", "diffuser" = "diffuseur", "front/rear wing" = "aileron avant/arrière", "beam wing" reste "beam wing", "endplate" = "dérive", "flap" = "volet", "mainplane" = "plan principal", "nose" = "museau", "sidepod" = "ponton", "coke" / "coke panel" = "carrosserie arrière (coke)", "engine cover" = "capot moteur", "louvres" = "ouïes", "inlet" = "entrée d'air", "corner" (front/rear) = "coin de roue (avant/arrière)", "brake duct" = "écope de frein", "suspension fairing" = "carénage de suspension", "local load" = "appui local", "downforce" = "appui", "drag" = "traînée", "flow conditioning" = "conditionnement de l'écoulement", "outwash" reste "outwash", "vortex" = "tourbillon", "wake" = "sillage", "straight mode" = "mode ligne droite", "halo" reste "halo", "tailpipe" = "sortie d'échappement".
- Traduis tout le sens, sans rien omettre ni ajouter.
- Réponds uniquement par la traduction, sans guillemets ni commentaire.`;
  }
  return `Translate into ${LANG_NAME[lang]} this technical description of a Formula 1 car update, written by the team for the FIA. Use the usual F1 technical vocabulary in ${LANG_NAME[lang]}, keep the full meaning, and answer with the translation only.`;
}

// Petit modèle : corrections du jargon qu'il traduit mal
const FIX_FR = [
  [/\b(aile|aileron)s? (de|du|à) (faisceau|poutre)/gi, 'beam wing'], [/\baile(s?) (avant|arrière)/gi, 'aileron$1 $2'],
  [/\bcoca(-cola)?\b/gi, 'coke'], [/\bpersiennes?\b/gi, 'ouïes'], [/\bplancher\b/gi, 'fond plat'],
  [/\bplaque(s?) d'extrémité\b/gi, 'dérive$1'], [/\bcharge locale\b/gi, 'appui local'], [/\bforce d'appui\b/gi, 'appui'],
  [/\b(la|une) veille\b/gi, (m, a) => (a.toLowerCase() === 'la' ? 'le sillage' : 'un sillage')], [/\bveille\b/gi, 'sillage'], [/\baccords\b/gi, 'cordes'], [/\b(duct|conduite)(s?) de frein/gi, 'écope$2 de frein'], [/\bduct\b/gi, 'conduit'],
  [/\blavage du sol\b/gi, 'downwash'], [/\b(la|le) appui\b/gi, "l'appui"], [/\breprogramm(é|ée|és|ées)\b/gi, 'reprofil$1'],
];
const fixJargon = (t, lang) => {
  if (lang !== 'fr') return t;
  const out = FIX_FR.reduce((x, [re, by]) => x.replace(re, by), t);
  return out.charAt(0).toUpperCase() + out.slice(1);
};

async function translate(text, lang, quality, who, domain) {
  if (quality === 'high') {
    const gen = await llm();
    const out = await gen([{ role: 'system', content: domain === 'tech' ? techPrompt(lang) : systemPrompt(lang, who) }, { role: 'user', content: text }],
      { max_new_tokens: Math.min(600, 60 + words(text) * 4), do_sample: false });
    const reply = out?.[0]?.generated_text?.at?.(-1)?.content ?? '';
    return String(reply).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^["«»\s]+|["«»\s]+$/g, '').trim();
  }
  // Phrase par phrase : plus rapide et plus fidèle (le petit modèle s'égare sur les textes longs)
  const run = await mt(lang);
  const parts = String(text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const r = await run(part, { max_new_tokens: Math.min(160, 24 + part.split(/\s+/).length * 3) });
    out.push(String(r?.[0]?.translation_text || '').trim());
  }
  return domain === 'tech' ? fixJargon(out.join(' '), lang) : out.join(' ');
}

self.onmessage = async (e) => {
  const { id, kind, quality } = e.data;
  try {
    const text = kind === 'translate'
      ? await translate(e.data.text, e.data.lang, quality, e.data.who, e.data.domain)
      : await transcribe(e.data.audio, quality);
    if (kind !== 'translate') self.postMessage({ type: 'ready', device: quality === 'high' ? 'webgpu' : 'wasm' });
    self.postMessage({ type: 'result', id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err?.message || String(err) });
  }
};
