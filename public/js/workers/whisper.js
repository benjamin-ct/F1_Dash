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
import { clean, words, tidy, badReply, fixRadio } from '/shared/radio-text.js';

env.allowLocalModels = false;
// Ordinateur portable avec deux cartes graphiques : la plus puissante (mémoire suffisante pour
// Whisper large et le modèle de langage)
try { env.backends.onnx.webgpu.powerPreference = 'high-performance'; } catch { /* version sans ce réglage */ }

const MODELS = {
  asrHigh: 'onnx-community/whisper-large-v3-turbo',
  asrLight: 'onnx-community/whisper-base.en',
  llm: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
  mt: { fr: 'Xenova/opus-mt-en-fr', es: 'Xenova/opus-mt-en-es', de: 'Xenova/opus-mt-en-de', it: 'Xenova/opus-mt-en-it' },
};
const LANG_NAME = { fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', en: 'English', nl: 'Dutch', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
const LANG_FR = { en: "l'anglais", es: "l'espagnol", de: "l'allemand", it: "l'italien", nl: 'le néerlandais', pt: 'le portugais', ja: 'le japonais', zh: 'le chinois' };
// Actualités dans d'autres langues (petit modèle) : traduction directe vers le français quand le
// modèle existe, sinon en passant par l'anglais
const MT_DIRECT = { 'de-fr': 'Xenova/opus-mt-de-fr', 'es-fr': 'Xenova/opus-mt-es-fr', 'it-fr': 'Xenova/opus-mt-it-fr', 'nl-fr': 'Xenova/opus-mt-nl-fr' };
const MT_TO_EN = { de: 'Xenova/opus-mt-de-en', es: 'Xenova/opus-mt-es-en', it: 'Xenova/opus-mt-it-en', nl: 'Xenova/opus-mt-nl-en', fr: 'Xenova/opus-mt-fr-en', ja: 'Xenova/opus-mt-ja-en', zh: 'Xenova/opus-mt-zh-en', pt: 'Xenova/opus-mt-ROMANCE-en' };
const loaded = {};

// Progression globale du chargement (somme de tous les fichiers en cours). transformers.js la
// signale aussi quand il relit un modèle déjà téléchargé (cache du disque) : « cached » permet
// de l'afficher comme un simple chargement. Au plus 4 messages par seconde : chaque message
// met à jour l'interface.
const files = new Map();
const inCache = {};           // modèle -> déjà téléchargé ?
let lastProgress = 0;
async function cachedModel(model) {
  if (inCache[model] === undefined) {
    try { inCache[model] = (await (await caches.open('transformers-cache')).keys()).some((r) => r.url.includes(`/${model}/`)); } catch { inCache[model] = false; }
  }
  return inCache[model];
}
const progress = (what, model) => (p) => {
  if (p.status === 'progress' && p.total) {
    files.set(p.file, { loaded: p.loaded, total: p.total });
    const now = Date.now();
    if (now - lastProgress < 250 && p.loaded < p.total) return;
    lastProgress = now;
    let l = 0, t = 0;
    for (const f of files.values()) { l += f.loaded; t += f.total; }
    self.postMessage({ type: 'progress', what, loaded: l, total: t, cached: !!inCache[model] });
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
const prefetchBig = async (key, what) => {
  await cachedModel(MODELS[key]);
  const cb = progress(what, MODELS[key]);
  return prefetch(MODELS[key], BIG[key], (file, loaded, total) => cb(loaded == null ? { status: 'done', file } : { status: 'progress', file, loaded, total }));
};

const asrHigh = () => load('asrHigh', async () => {
  await prefetchBig('asrHigh', 'asr');
  return pipeline('automatic-speech-recognition', MODELS.asrHigh,
    { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' }, progress_callback: progress('asr', MODELS.asrHigh) });
});
const asrLight = (gpu) => load(`asrLight${gpu}`, async () => {
  await cachedModel(MODELS.asrLight);
  return pipeline('automatic-speech-recognition', MODELS.asrLight, gpu
    ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback: progress('asr', MODELS.asrLight) }
    : { device: 'wasm', dtype: 'q8', progress_callback: progress('asr', MODELS.asrLight) });
});
const llm = () => load('llm', async () => {
  await prefetchBig('llm', 'mt');
  return pipeline('text-generation', MODELS.llm, { device: 'webgpu', dtype: 'q4f16', progress_callback: progress('mt', MODELS.llm) });
});
const mt = (lang) => load(`mt-${lang}`, async () => {
  if (!MODELS.mt[lang]) throw new Error(`langue non prise en charge : ${lang}`);
  await cachedModel(MODELS.mt[lang]);
  return pipeline('translation', MODELS.mt[lang], { device: 'wasm', dtype: 'q8', progress_callback: progress('mt', MODELS.mt[lang]) });
});

const mtPair = (model) => load(`mt-${model}`, async () => {
  await cachedModel(model);
  return pipeline('translation', model, { device: 'wasm', dtype: 'q8', progress_callback: progress('mt', model) });
});


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

// Actualités de la F1 (titres et résumés), depuis n'importe quelle langue
function newsPrompt(lang, from) {
  if (lang === 'fr') {
    return `Tu traduis en français des titres et résumés d'actualité de la Formule 1, rédigés en ${LANG_FR[from] || 'langue étrangère'}.
- Style d'un journaliste sportif français : clair, naturel, fidèle.
- Ne traduis pas les noms propres (pilotes, écuries, circuits, sponsors) ; garde les chiffres, positions et dates.
- Vocabulaire : "grid penalty" = "pénalité sur la grille", "pole" = "pole position", "team principal" = "directeur d'équipe", "stewards" = "commissaires", "upgrade" = "évolution", "power unit" = "unité de puissance", "rookie" = "débutant".
- Réponds uniquement par la traduction, sans guillemets ni commentaire.`;
  }
  return `Translate this Formula 1 news headline or summary from ${LANG_NAME[from] || 'its language'} into ${LANG_NAME[lang]}, as a sports journalist would. Keep proper names, numbers and dates. Answer with the translation only.`;
}

// Petit modèle pour les actualités : modèle direct, ou deux étapes par l'anglais
async function newsLight(text, lang, from) {
  const steps = [];
  if (from === 'en') steps.push(() => mt(lang));
  else if (MT_DIRECT[`${from}-${lang}`]) steps.push(() => mtPair(MT_DIRECT[`${from}-${lang}`]));
  else if (MT_TO_EN[from]) {
    steps.push(() => mtPair(MT_TO_EN[from]));
    if (lang !== 'en') steps.push(() => mt(lang));
  } else throw new Error(`langue non prise en charge : ${from}`);
  let parts = String(text).split(/(?<=[.!?。！？])\s*/).map((x) => x.trim()).filter(Boolean);
  for (const step of steps) {
    const run = await step();
    const out = [];
    for (const part of parts) {
      const r = await run(part, { max_new_tokens: Math.min(200, 32 + part.length) });
      out.push(String(r?.[0]?.translation_text || '').trim());
    }
    parts = out;
  }
  return parts.join(' ');
}


async function translateLight(text, lang, domain, from) {
  if (domain === 'news') return newsLight(text, lang, from);
  // Phrase par phrase : plus rapide et plus fidèle (le petit modèle s'égare sur les textes longs)
  const run = await mt(lang);
  const parts = String(text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const r = await run(part, { max_new_tokens: Math.min(160, 24 + part.split(/\s+/).length * 3) });
    out.push(String(r?.[0]?.translation_text || '').trim());
  }
  const joined = out.join(' ');
  return domain === 'tech' ? fixJargon(joined, lang) : domain === 'radio' || !domain ? fixRadio(joined, lang) : joined;
}

async function translate(text, lang, quality, who, domain, from = 'en') {
  if (domain === 'news' && from === lang) return text;
  if (quality === 'high') {
    const gen = await llm();
    const sys = domain === 'tech' ? techPrompt(lang) : domain === 'news' ? newsPrompt(lang, from) : systemPrompt(lang, who);
    const ask = async (content) => {
      const out = await gen([{ role: 'system', content: sys }, { role: 'user', content }],
        { max_new_tokens: Math.min(600, 60 + words(text) * 4), do_sample: false });
      return tidy(out?.[0]?.generated_text?.at?.(-1)?.content);
    };
    let out = await ask(text);
    // Réponse inutilisable : nouvel essai avec une consigne explicite, sinon le petit modèle
    if (badReply(out, text)) out = await ask(`Translate into ${LANG_NAME[lang]}, answer with the translation only:\n${text}`);
    if (badReply(out, text)) out = await translateLight(text, lang, domain, from).catch(() => '');
    return out;
  }
  return translateLight(text, lang, domain, from);
}

// Erreur échappée au moteur (carte graphique perdue…) : la tâche en cours échoue proprement au
// lieu de faire planter le fil de calcul (qui serait relancé et rechargerait tous les modèles)
let currentId = null;
self.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  if (currentId !== null) self.postMessage({ type: 'error', id: currentId, error: e.reason?.message || String(e.reason) });
});

self.onmessage = async (e) => {
  const { id, kind, quality } = e.data;
  currentId = id;
  try {
    const text = kind === 'translate'
      ? await translate(e.data.text, e.data.lang, quality, e.data.who, e.data.domain, e.data.from)
      : await transcribe(e.data.audio, quality);
    if (kind !== 'translate') self.postMessage({ type: 'ready', device: quality === 'high' ? 'webgpu' : 'wasm' });
    self.postMessage({ type: 'result', id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err?.message || String(err) });
  } finally {
    currentId = null;
  }
};
