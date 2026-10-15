// Couleurs lisibles quelle que soit l'apparence (sombre ou claire).

// Apparence claire : une couleur trop pâle pour le fond blanc (turquoise de Mercedes, bleu ciel,
// jaune…) est assombrie, en gardant sa teinte, jusqu'à un contraste d'au moins 3:1 (lisible pour
// un trait de graphique ou un texte en gras).
const lightCache = new Map();
function luminance(r, g, b) {
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function onLight(hex, min = 3) {
  const key = `${hex}|${min}`;
  if (lightCache.has(key)) return lightCache.get(key);
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  let out = hex;
  if (m) {
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    for (let i = 0; i < 20 && 1.05 / (luminance(r, g, b) + 0.05) < min; i++) [r, g, b] = [r, g, b].map((v) => Math.round(v * 0.9));
    out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  lightCache.set(key, out);
  return out;
}
