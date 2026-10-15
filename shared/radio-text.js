// Textes des radios d'équipe : nettoyage de la transcription, contrôle de la traduction rendue par
// le modèle de langage, et corrections du jargon F1 que le petit modèle de traduction rend mot à mot.
// (Utilisé par le moteur de transcription, public/js/workers/whisper.js.)

// Texte reconnu : annotations retirées (« (bruit) », « [musique] ») ; un texte sans aucun mot
// (« - », « ... » sur une radio sans parole audible) compte comme vide
export const clean = (t) => {
  const s = String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
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
