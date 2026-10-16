// Appel à s'abonner au compte : phrase adaptée au post (dernière image des carrousels) et ligne
// ajoutée aux textes des réseaux, dans la limite de longueur de chacun.

import { xLength } from './social.js';

export function followReason(d) {
  if (d.news) return 'pour ne rater aucune actu de la Formule 1';
  if (d.post === 'prerace') return `pour suivre ${d.sprint ? 'le sprint' : 'la course'} et avoir les résultats dès l'arrivée`;
  if (d.post === 'champ') return 'pour suivre la lutte pour le titre';
  if (d.post === 'flash') return 'pour suivre la course en direct';
  if (d.kind === 'quali') return `pour ne rien rater ${d.sprint ? 'du sprint' : 'de la course'}`;
  if (d.kind === 'practice') return 'pour suivre tout le week-end de Formule 1';
  return "pour suivre toute l'actualité de la Formule 1";
}

// Ligne placée à la place de la signature seule, sinon juste avant les hashtags
function insert(text, line, handle) {
  if (!text) return text;
  if (handle && text.includes(`\n\n${handle}\n\n`)) return text.replace(`\n\n${handle}\n\n`, `\n\n${line}\n\n`);
  if (handle && text.endsWith(`\n\n${handle}`)) return `${text.slice(0, -handle.length)}${line}`;
  const parts = text.split('\n\n');
  if (parts.length > 1 && /^#/.test(parts[parts.length - 1])) return [...parts.slice(0, -1), line, parts[parts.length - 1]].join('\n\n');
  return `${text}\n\n${line}`;
}

// caps : textes des réseaux (instagram, facebook, threads, x, bsky…) ; handle : compte (@…)
export function followCaptions(caps, d, handle = '') {
  const h = String(handle || '').trim();
  const long = `${h ? `Abonnez-vous à ${h}` : 'Abonnez-vous'} ${followReason(d)}.`;
  const short = h ? `Suivez ${h} pour toute l'actu F1.` : '';
  const out = { ...caps };
  for (const k of ['instagram', 'facebook']) if (out[k]) out[k] = insert(out[k], long, h);
  if (out.threads) { const t = insert(out.threads, long, h); if (t.length <= 500) out.threads = t; }
  // X et Bluesky : ligne courte, seulement si le post reste dans la limite
  if (short && out.x) { const t = insert(out.x, short, h); if (xLength(t) <= 280) out.x = t; }
  if (short && out.bsky) { const t = insert(out.bsky, short, h); if ([...t].length <= 300) out.bsky = t; }
  return out;
}
