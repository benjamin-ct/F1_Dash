// Synchro TV par le son : retrouver une radio d'équipe (fichier publié par la F1) dans le son
// capté par le micro de l'ordinateur pendant que la TV la diffuse. L'heure de publication de la
// radio est connue : l'instant où on l'entend donne le délai de la TV.
//
// Méthode : corrélation croisée par transformée de Fourier, pondérée « PHAT » (on garde surtout la
// phase, ce qui rend le pic net malgré l'écho de la pièce, le haut-parleur de la TV et les
// commentateurs qui parlent par-dessus), limitée à la bande des radios (300-3400 Hz).

export const RATE = 8000; // fréquence de travail (Hz) : la bande des radios tient dedans

// FFT complexe en place (taille puissance de 2)
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

// Rééchantillonnage en continu (micro à 44,1 / 48 kHz -> 8 kHz) : filtre passe-bas sinc fenêtré,
// sans coupure entre deux morceaux successifs.
export class Resampler {
  constructor(from, to = RATE, zeros = 8) {
    this.step = from / to;                            // échantillons d'entrée par échantillon de sortie
    this.fc = 0.5 * Math.min(1, to / from) * 0.92;    // coupure (cycles par échantillon d'entrée)
    this.half = Math.ceil(zeros / (2 * this.fc));     // demi-largeur du filtre (échantillons d'entrée)
    this.buf = new Float32Array(0);
    this.base = 0;    // indice absolu du premier échantillon gardé
    this.pos = 0;     // position (absolue, fractionnaire) du prochain échantillon de sortie
  }

  push(chunk) {
    const merged = new Float32Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    const out = [];
    const { half, fc, buf, base } = this;
    const end = base + buf.length;
    while (this.pos + half < end) {
      const p = this.pos;
      let s = 0, w = 0;
      const i0 = Math.max(base, Math.ceil(p - half)), i1 = Math.floor(p + half);
      for (let i = i0; i <= i1; i++) {
        const d = i - p;
        const x = 2 * fc * d;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const win = 0.5 + 0.5 * Math.cos(Math.PI * d / half);
        const h = sinc * win;
        s += buf[i - base] * h;
        w += h;
      }
      out.push(w ? s / w : 0);
      this.pos += this.step;
    }
    const keep = Math.max(base, Math.floor(this.pos - half) - 1);
    this.buf = buf.slice(keep - base);
    this.base = keep;
    return Float32Array.from(out);
  }
}

export function resample(x, from, to = RATE) {
  if (from === to) return Float32Array.from(x);
  const r = new Resampler(from, to);
  const pad = new Float32Array(r.half + 2);
  const a = r.push(x), b = r.push(pad);
  const out = new Float32Array(Math.round(x.length * to / from));
  out.set(a.subarray(0, out.length));
  if (a.length < out.length) out.set(b.subarray(0, out.length - a.length), a.length);
  return out;
}

// Corrélation croisée pondérée (PHAT partielle) entre mic et clip, limitée à la bande des radios.
// r[k] (k < n/2) : ressemblance si la radio commence à l'indice k de mic ; r[n + k] pour k < 0.
function gcc(mic, clip, rate, { lo = 300, hi = 3400, beta = 0.85 } = {}) {
  const n = nextPow2(mic.length + clip.length);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  const br = new Float64Array(n), bi = new Float64Array(n);
  for (let i = 0; i < mic.length; i++) ar[i] = mic[i];
  for (let i = 0; i < clip.length; i++) br[i] = clip[i];
  fft(ar, ai);
  fft(br, bi);
  const k0 = Math.ceil(lo * n / rate), k1 = Math.min(n / 2 - 1, Math.floor(hi * n / rate));
  for (let k = 0; k < n; k++) {
    const kk = k <= n / 2 ? k : n - k;
    if (kk < k0 || kk > k1) { ar[k] = 0; ai[k] = 0; continue; }
    // A · conj(B), puis normalisation de l'amplitude
    const gr = ar[k] * br[k] + ai[k] * bi[k];
    const gi = ai[k] * br[k] - ar[k] * bi[k];
    const mag = Math.hypot(gr, gi);
    const w = mag > 0 ? mag ** -beta : 0;
    ar[k] = gr * w;
    ai[k] = gi * w;
  }
  fft(ar, ai, true);
  return { r: ar, n };
}

// Niveau du « bruit » de corrélation : médiane des valeurs absolues (robuste au pic)
function noiseLevel(r, n, from, to) {
  const sample = [];
  for (let lag = from; lag < to; lag += 5) sample.push(Math.abs(r[lag < 0 ? lag + n : lag]));
  sample.sort((a, b) => a - b);
  return (sample[Math.floor(sample.length / 2)] || 0) * 1.4826;
}

/**
 * Cherche le passage où `clip` est diffusé dans `mic` (même fréquence `rate`).
 * Renvoie { pos, score } : pos = indice dans mic où commence la radio (peut être négatif si elle
 * avait commencé avant l'enregistrement), score = netteté du pic (écarts types au-dessus du bruit).
 * Le score seul ne suffit pas (voir confirmClip) : il sert à écarter les pics trop faibles.
 */
export function findClip(mic, clip, rate = RATE, opts = {}) {
  const { r, n } = gcc(mic, clip, rate, opts);
  // Décalages possibles : de -moitié de la radio (commencée avant l'écoute) à la fin de l'écoute
  const from = -Math.floor(clip.length / 2), to = mic.length - Math.ceil(clip.length / 2);
  if (to <= from) return { pos: 0, score: 0 };
  let best = from, peak = -1;
  for (let lag = from; lag < to; lag++) {
    const v = Math.abs(r[lag < 0 ? lag + n : lag]);
    if (v > peak) { peak = v; best = lag; }
  }
  const sigma = noiseLevel(r, n, from, to);
  return { pos: best, score: sigma > 0 ? peak / sigma : 0 };
}

/**
 * Vérification d'un pic : les radios commencent souvent par le même « bip », qui peut donner un
 * pic avec une autre radio. On découpe donc la radio en morceaux et on vérifie que chacun ressort
 * nettement à sa place (±15 ms) par rapport au reste de son voisinage (±0,6 s). Renvoie la part des
 * morceaux confirmés (0 à 1), ou 0 si moins de deux morceaux le sont.
 */
export function confirmClip(mic, clip, pos, rate = RATE, { seg = 1.2, margin = 0.6, tol = 0.015, minZ = 4.5 } = {}) {
  const L = Math.round(seg * rate), M = Math.round(margin * rate), T = Math.round(tol * rate);
  let ok = 0, total = 0;
  for (let s = 0; s + L <= clip.length; s += L) {
    const piece = clip.subarray(s, s + L);
    let e = 0;
    for (let i = 0; i < piece.length; i++) e += piece[i] * piece[i];
    if (e / piece.length < 1e-6) continue;          // silence : rien à vérifier
    const want = pos + s;                            // début attendu du morceau dans mic
    const a = Math.max(0, want - M), b = Math.min(mic.length, want + L + M);
    if (b - a < L + 2 * T) continue;                 // hors de l'enregistrement
    total++;
    const { r, n } = gcc(mic.subarray(a, b), piece, rate);
    const to = b - a - L;
    const sigma = noiseLevel(r, n, 0, to + 1);
    let here = 0;
    for (let lag = Math.max(0, want - a - T); lag <= Math.min(to, want - a + T); lag++) here = Math.max(here, Math.abs(r[lag]));
    if (sigma > 0 && here / sigma >= minZ) ok++;
  }
  return total >= 2 && ok >= 2 ? ok / total : 0;
}

// Toutes les radios publiées commencent par le même préambule (~1,4 s, à peine audible) : il ne
// distingue pas une radio d'une autre, on ne cherche que la suite.
export const INTRO_S = 1.45;

/**
 * Bruit de fond commun : toutes les radios d'une séance contiennent, sous la voix, exactement le
 * même bruit de fond très faible (même suite d'échantillons, calée sur le début du fichier). Il ferait
 * « reconnaître » n'importe quelle radio à la place d'une autre ; on l'estime échantillon par
 * échantillon (médiane des radios muettes à cet instant, pour ne pas y mêler leurs voix) et on le
 * retire.
 */
export function commonNoise(clips) {
  if (clips.length < 3) return new Float32Array(Math.max(0, ...clips.map((c) => c.length)));
  // Instants où chaque radio est « muette » (pas de voix) : seul le bruit de fond y est présent.
  // Le niveau du bruit de fond se mesure dans le préambule (sans voix).
  const quiet = clips.map((c) => {
    const W = 80;
    let bed = 0;
    const a = Math.round(0.2 * RATE), b = Math.min(c.length, Math.round(1.3 * RATE));
    for (let i = a; i < b; i++) bed += c[i] * c[i];
    bed = b > a ? bed / (b - a) : 0;
    const q = new Uint8Array(c.length);
    let acc = 0;
    for (let i = 0; i < c.length + W; i++) {
      if (i < c.length) acc += c[i] * c[i];
      if (i >= 2 * W) acc -= c[i - 2 * W] * c[i - 2 * W];
      const k = i - W;                       // fenêtre centrée de 20 ms
      if (k >= 0 && k < c.length) q[k] = acc / (2 * W) <= 4 * bed ? 1 : 0;
    }
    return q;
  });
  const len = Math.max(...clips.map((c) => c.length));
  const out = new Float32Array(len);
  const vals = [];
  for (let i = 0; i < len; i++) {
    vals.length = 0;
    for (let k = 0; k < clips.length; k++) if (i < clips[k].length && quiet[k][i]) vals.push(clips[k][i]);
    if (vals.length < 2) continue;           // toutes les radios parlent ici : on n'y touche pas
    vals.sort((x, y) => x - y);
    const m = vals.length >> 1;
    out[i] = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }
  return out;
}

export function removeNoise(clip, noise) {
  if (!noise) return clip;
  const out = Float32Array.from(clip);
  for (let i = 0; i < Math.min(out.length, noise.length); i++) out[i] -= noise[i];
  return out;
}

/**
 * Recherche complète d'une radio : préambule écarté, pic puis vérification par morceaux.
 * Renvoie { start, score, confirm, ok } ; start = indice dans mic où commence la radio entière.
 */
export function matchClip(mic, clip, rate = RATE) {
  const skip = Math.round(INTRO_S * rate);
  const body = clip.length > skip + rate ? clip.subarray(skip) : clip;
  const off = clip.length - body.length;
  const r = findClip(mic, body, rate);
  const confirm = r.score >= MIN_SCORE ? confirmClip(mic, body, r.pos, rate) : 0;
  return { start: r.pos - off, score: r.score, confirm, ok: r.score >= MIN_SCORE && confirm >= MIN_CONFIRM };
}

// Seuils pour accepter une radio comme entendue. Réglés sur des sons de salon simulés à partir de
// vraies radios (commentaires par-dessus, moteurs, écho, haut-parleur) : avec au moins 6 radios pour
// estimer le bruit de fond, aucune radio absente reconnue à tort sur 336 essais, et 21 à 23 radios
// diffusées sur 24 retrouvées.
export const MIN_SCORE = 8;
export const MIN_CONFIRM = 0.5;

/**
 * Nouveau délai TV (ms) d'après une radio reconnue.
 * shownF1 : heure F1 affichée par le dashboard à l'instant où la radio a commencé à la TV ;
 * clipUtc : heure de diffusion de la radio (flux F1) ; adjust : correction (ms) réglée par
 * l'utilisateur, ajoutée au résultat. Pour que le dashboard affiche clipUtc à cet instant, le délai
 * doit augmenter de shownF1 - clipUtc.
 */
export function delayFromMatch(delay, shownF1, clipUtc, adjust = 0) {
  return delay + (shownF1 - clipUtc) + adjust;
}
