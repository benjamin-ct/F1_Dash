// Textes des radios d'équipe : nettoyage de la transcription, contrôle de la traduction rendue par
// le modèle de langage, et corrections du jargon F1 que le petit modèle de traduction rend mot à mot.
// (Utilisé par le moteur de transcription, public/js/workers/whisper.js.)

// Texte reconnu : annotations retirées (« (bruit) », « [musique] ») ; un texte sans aucun mot
// (« - », « ... » sur une radio sans parole audible) compte comme vide
export const clean = (t) => {
  const s = String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/>>+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-–—]+\s*/, '');
  return /[A-Za-z]{2}|\d/.test(s) ? s : '';
};

export const words = (t) => (t.match(/[A-Za-z']+/g) || []).length;

// Réponse du modèle de langage nettoyée : réflexion, préfixe (« Traduction : »), guillemets
export function tidy(reply) {
  return String(reply || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/^\s*(traduction|translation|traducción|übersetzung|traduzione|réponse|answer)\s*(\([^)]*\))?\s*:\s*/i, '')
    .replace(/^["«»“”\s]+|["«»“”\s]+$/g, '').trim();
}

// Réponse inutilisable : vide, anglais recopié, ou bien plus longue que l'original (explication,
// variantes…)
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function badReply(out, text) {
  if (!out) return true;
  if (norm(out) === norm(text) && words(text) > 2) return true;
  return out.length > text.length * 3 + 60;
}

// Petit modèle, radios : jargon F1 traduit mot à mot
const FIX_RADIO_FR = [
  [/\b(la |une )?bo[iî]te,? (la |une )?bo[iî]te\b/gi, 'rentre aux stands, rentre aux stands'],
  [/^(copie|copier|copié)\s*[.!]?$/i, 'Reçu.'], [/^(copie|copier|copié)( ça| cela)?\b/i, 'Reçu'],
  [/\bsoulever et (la )?c[ôo]te\b/gi, 'lever le pied'], [/\bdégager et (la )?c[ôo]te\b/gi, 'lever le pied'],
  [/\bvoiture de sécurité virtuelle\b/gi, 'VSC'], [/\bpneus? (difficiles?|durs?)\b/gi, (m) => (/s\b/.test(m) ? 'pneus durs' : 'pneu dur')],
  [/\b(les|des|pneus) doux\b/gi, '$1 tendres'], [/\b(le|un) deg\b/gi, 'la dégradation'], [/\bdeg\b/gi, 'dégradation'],
];
export const fixRadio = (t, lang) => {
  if (lang !== 'fr') return t;
  const out = FIX_RADIO_FR.reduce((x, [re, by]) => x.replace(re, by), t);
  return out.charAt(0).toUpperCase() + out.slice(1);
};

// Son des caméras embarquées : sur le bruit du moteur, la reconnaissance vocale « entend » parfois
// des phrases toutes faites ou répète un mot en boucle. Ces textes-là sont écartés.
const PHANTOM = new Set(['you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching', 'bye', 'bye bye',
  'the end', 'please subscribe', 'subscribe', 'music', 'applause', 'laughter', 'oh', 'ah', 'uh', 'hmm', 'mm', 'so']);
export function isPhantom(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || PHANTOM.has(t)) return true;
  if (/^(subtitles|transcribed|captions?) by\b/.test(t)) return true;
  const w = t.split(' ');
  // Même mot répété (« go go go go go go ») ou texte sans variété
  let run = 1;
  for (let i = 1; i < w.length; i++) { run = w[i] === w[i - 1] ? run + 1 : 1; if (run >= 5) return true; }
  return w.length >= 8 && new Set(w).size / w.length < 0.25;
}

// Segments horodatés d'une fenêtre d'écoute (secondes depuis le début de la fenêtre) gardés une
// seule fois : les fenêtres se chevauchent, un segment déjà donné par la fenêtre précédente (même
// instant absolu) est ignoré. `from` : instant absolu (ms) de la fin du dernier segment gardé.
// Les phrases séparées de moins de GAP_MS forment un seul message radio.
const GAP_MS = 1500;
export function newSegments(chunks, windowStartMs, fromMs) {
  const out = [];
  let last = fromMs ?? -Infinity;
  for (const c of chunks || []) {
    const [a, b] = c.timestamp || [];
    if (!Number.isFinite(a)) continue;
    const start = windowStartMs + a * 1000;
    const end = windowStartMs + (Number.isFinite(b) ? b : a + 2) * 1000;
    const text = clean(c.text);
    if (start < last - 500 || !text || isPhantom(text)) continue;
    const prev = out.at(-1);
    if (prev && start - prev.end < GAP_MS) { prev.text = `${prev.text} ${text}`; prev.end = end; } else out.push({ start, end, text });
    last = end;
  }
  return out;
}
