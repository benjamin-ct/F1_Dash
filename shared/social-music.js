// Musiques des vidéos (mode créateur) : morceaux fabriqués sur place avec Web Audio, libres de droits
// (rien d'enregistré ni d'emprunté : aucune réclamation possible sur TikTok, Instagram ou YouTube).
// Ambiances F1 : feux de départ, passages de voiture, moteur qui monte les rapports.
// Chaque morceau joue temps par temps (play(k, b, t, B) : temps n° b à l'instant t, B = durée d'un temps).

export const TRACKS = [
  { id: 'depart', name: 'Feux de départ', desc: 'Tension des feux, moteur qui hurle, puis ça part fort', bpm: 128 },
  { id: 'vitesse', name: 'Pleine vitesse', desc: 'Drum and bass rapide, passages de F1', bpm: 172 },
  { id: 'flash', name: 'Flash info', desc: 'Urgent, façon journal télévisé : pour les Breaking news', bpm: 110 },
  { id: 'victoire', name: 'Victoire', desc: 'Hymne qui monte : podium, titre, record', bpm: 124 },
  { id: 'embarque', name: 'Tour embarqué', desc: 'Techno rythmée par le moteur et les changements de rapport', bpm: 122 },
  { id: 'paddock', name: 'Paddock chill', desc: 'Lo-fi posé : coulisses, récap, horaires', bpm: 84 },
  { id: 'electro', name: 'Électro', desc: 'Électro entraînante (la musique d\'origine)', bpm: 118 },
];
export const trackOf = (id) => TRACKS.find((x) => x.id === id) || TRACKS.at(-1);

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Instruments : batterie, notes, nappes, bruitages (montée, impact), moteur et passage de F1
function kit(ac, out) {
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const curve = new Float32Array(2048).map((_, i) => Math.tanh(2.5 * (i / 1023.5 - 1)) / Math.tanh(2.5));
  // Enveloppe : montée (attack), tenue (part de la durée), puis extinction
  const env = (g, t, peak, len, attack, hold = 0) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + Math.max(attack, len * hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  };
  const tone = (t, f, { type = 'sine', peak = 0.2, len = 0.2, attack = 0.005, hold = 0, cutoff = 0, to = 0, fto = 0, q = 0.7, detune = 0 } = {}) => {
    const o = ac.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ac.createGain(); env(g, t, peak, len, attack, hold);
    let node = o;
    if (cutoff) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q;
      fl.frequency.setValueAtTime(cutoff, t);
      if (fto) fl.frequency.exponentialRampToValueAtTime(fto, t + len);
      node.connect(fl); node = fl;
    }
    node.connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
  };
  const hit = (t, { freq = 7000, type = 'highpass', peak = 0.1, len = 0.05, q = 0.7, attack = 0.002, to = 0, loop = false } = {}) => {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = loop;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(freq, t);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ac.createGain(); env(g, t, peak, len, attack);
    s.connect(fl).connect(g).connect(out); s.start(t, Math.random() * 0.4); s.stop(t + len + 0.02);
  };
  const k = {
    tone, hit,
    kick: (t, peak = 0.9, f0 = 150, len = 0.32) => tone(t, f0, { peak, len, to: 42, attack: 0.003 }),
    hat: (t, peak = 0.1, len = 0.04) => hit(t, { peak, len }),
    open: (t, peak = 0.08) => hit(t, { freq: 6000, peak, len: 0.16 }),
    snare: (t, peak = 0.32) => { hit(t, { freq: 1800, type: 'bandpass', peak, len: 0.17 }); tone(t, 190, { type: 'triangle', peak: peak * 0.5, len: 0.09 }); },
    clap: (t, peak = 0.28) => { for (const d of [0, 0.011, 0.023]) hit(t + d, { freq: 1500, type: 'bandpass', q: 1.2, peak, len: d ? 0.14 : 0.03 }); },
    // Nappe : 2 dents de scie légèrement désaccordées par note, filtrées
    pad: (t, notes, len, peak, cutoff = 1500, attack = 0.25) => {
      for (const m of notes) for (const d of [-9, 9]) tone(t, hz(m), { type: 'sawtooth', peak: peak * 0.75, len, attack: Math.min(attack, len / 2), hold: 0.75, cutoff, detune: d });
    },
    pluck: (t, m, peak = 0.07, len = 0.22, type = 'square') => tone(t, hz(m), { type, peak, len, cutoff: 2600, fto: 400 }),
    bass: (t, m, len, peak = 0.22, cutoff = 520) => tone(t, hz(m), { type: 'sawtooth', peak, len, hold: 0.6, cutoff, attack: 0.008 }),
    sub: (t, m, len, peak = 0.3) => tone(t, hz(m), { peak, len, hold: 0.6, attack: 0.01 }),
    riser: (t, len, peak = 0.1) => hit(t, { type: 'bandpass', freq: 300, to: 7000, q: 2, peak, len, attack: len * 0.95 }),
    crash: (t, peak = 0.12) => hit(t, { freq: 3500, peak, len: 1.6 }),
    boom: (t, peak = 0.5) => tone(t, 70, { peak, len: 1.3, to: 28, attack: 0.004 }),
    beep: (t, f = 880, peak = 0.12, len = 0.16) => tone(t, f, { peak, len, hold: 0.7, attack: 0.004 }),
    // Moteur : régime de f0 à f1 Hz sur len (un rapport), coupé net au passage du suivant
    engine: (t, len, f0, f1, peak = 0.15, cutoff = 2400) => {
      const ws = ac.createWaveShaper(); ws.curve = curve;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      const g = ac.createGain(); env(g, t, peak, len, 0.03, 0.9);
      for (const [mul, type, gn] of [[1, 'sawtooth', 0.5], [0.5, 'square', 0.35], [2, 'sawtooth', 0.12]]) {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0 * mul, t); o.frequency.exponentialRampToValueAtTime(f1 * mul, t + len);
        const og = ac.createGain(); og.gain.value = gn;
        o.connect(og).connect(ws); o.start(t); o.stop(t + len + 0.05);
      }
      ws.connect(lp).connect(g).connect(out);
    },
    // Passage d'une F1 : son qui enfle, note qui chute au passage (effet Doppler), souffle
    flyby: (t, len = 2.2, peak = 0.22) => {
      const ws = ac.createWaveShaper(); ws.curve = curve;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(5000, t + len * 0.5); lp.frequency.exponentialRampToValueAtTime(600, t + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + len * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      for (const [mul, type, gn] of [[1, 'sawtooth', 0.5], [0.5, 'square', 0.3], [2, 'sawtooth', 0.12]]) {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(560 * mul, t); o.frequency.setValueAtTime(560 * mul, t + len * 0.42);
        o.frequency.exponentialRampToValueAtTime(340 * mul, t + len * 0.62);
        const og = ac.createGain(); og.gain.value = gn;
        o.connect(og).connect(ws); o.start(t); o.stop(t + len + 0.05);
      }
      ws.connect(lp).connect(g).connect(out);
      hit(t, { type: 'bandpass', freq: 500, to: 2500, q: 0.8, peak: peak * 0.5, len, attack: len * 0.5 });
    },
  };
  return k;
}

// Accords (notes MIDI, basse en premier), une mesure (4 temps) chacun
const chordAt = (list, b) => list[Math.floor(b / 4) % list.length];

const PLAY = {
  // 2 mesures de tension (nappe, montée, 5 feux, moteur qui monte), puis départ : électro qui pousse
  depart(k, b, t, B) {
    const ch = chordAt([[38, 50, 53, 57], [34, 46, 50, 53], [41, 53, 57, 60], [36, 48, 52, 55]], b - 8);
    if (b === 0) { k.pad(t, [50, 53, 57], 8 * B, 0.05, 900, 1.5); k.riser(t, 8 * B, 0.1); k.boom(t, 0.4); }
    if (b >= 1 && b <= 5) k.beep(t, 660, 0.1);
    if (b === 6) k.engine(t, 2 * B, 150, 470, 0.16);
    if (b < 8) return;
    if (b === 8) { k.crash(t, 0.14); k.boom(t, 0.45); }
    k.kick(t);
    k.hat(t + B / 4, 0.04); k.hat(t + B / 2, 0.1); k.hat(t + 3 * B / 4, 0.04);
    if (b % 2) k.clap(t);
    k.sub(t, ch[0] - 12, B * 0.45, 0.18);
    k.bass(t + B / 2, ch[0], B * 0.45);
    if (b % 4 === 0) k.pad(t, ch.slice(1).map((m) => m + 12), 4 * B, 0.03, 1600);
    if (b >= 24) [1, 2, 3, 2].forEach((n, i) => k.pluck(t + i * B / 4, ch[n] + 12, 0.05));
    if (b % 16 === 12) k.riser(t, 4 * B, 0.07);
    if (b % 32 === 30) k.engine(t, 2 * B, 220, 420, 0.1);
  },
  // Drum and bass : grosse caisse en 1 et 3+, caisse claire en 2 et 4, basse grave, passages de F1
  vitesse(k, b, t, B) {
    const ch = chordAt([[40, 52, 55, 59], [36, 48, 52, 55], [43, 55, 59, 62], [38, 50, 54, 57]], b);
    const pos = b % 4;
    if (b % 32 === 0) k.flyby(t, 2.2, 0.22);
    if (pos === 0) k.pad(t, ch.slice(1), 4 * B, 0.03, 1300);
    if (b < 4) { if (b === 0) k.riser(t, 4 * B, 0.08); return; }
    if (pos === 0) { k.kick(t); k.bass(t, ch[0] - 12, 2 * B, 0.2, 320); }
    if (pos === 2) { k.kick(t + B / 2, 0.8); k.bass(t + B / 2, ch[0] - 12, 1.5 * B, 0.18, 320); }
    if (pos === 1 || pos === 3) k.snare(t, 0.34);
    if (pos === 3) k.snare(t + 0.75 * B, 0.08);
    k.hat(t, 0.06); k.hat(t + B / 2, 0.09);
    if (b % 8 === 7) k.crash(t + B, 0.08);
  },
  // Journal télévisé : impacts, tic-tac, motifs serrés, basse qui pulse
  flash(k, b, t, B) {
    const ch = chordAt([[45, 57, 60, 64], [45, 57, 60, 64], [41, 53, 57, 60], [40, 52, 56, 59]], b);
    const r = ch[0];
    const pos = b % 4;
    if (b % 16 === 0) { k.boom(t, 0.5); k.crash(t, 0.1); }
    if (pos === 0) k.pad(t, ch.slice(1), 4 * B, 0.03, 1100);
    k.tone(t, 2400, { type: 'square', peak: 0.03, len: 0.02 }); k.tone(t + B / 2, 1800, { type: 'square', peak: 0.02, len: 0.02 });
    if (b < 4) return;
    if (pos === 0 || pos === 2) { k.kick(t, 0.7); k.sub(t, r - 12, B * 0.9, 0.28); k.tone(t, 110, { peak: 0.25, len: 0.35, to: 55 }); }
    if (pos === 1 || pos === 3) k.snare(t, 0.2);
    [1, 2, 3, 2].forEach((n, i) => k.pluck(t + i * B / 4, ch[n] + 12, 0.045, 0.12));
  },
  // Hymne : accords majeurs qui « pompent », arpège, grosse caisse à chaque temps
  victoire(k, b, t, B) {
    const ch = chordAt([[48, 60, 64, 67], [43, 55, 59, 62], [45, 57, 60, 64], [41, 53, 57, 60]], b);
    if (b === 0) k.riser(t, 4 * B, 0.08);
    k.pad(t, ch.slice(1).map((m) => m + 12), B * 0.95, b < 4 ? 0.03 : 0.04, 3000, b < 4 ? 0.2 : 0.07);
    [0, 1, 2, 1].forEach((n, i) => k.pluck(t + i * B / 4, ch[1 + n] + 12, 0.045, 0.18, 'triangle'));
    if (b < 4) return;
    if (b % 32 === 4) k.crash(t, 0.12);
    k.kick(t);
    k.open(t + B / 2, 0.07);
    if (b % 2) k.clap(t);
    k.bass(t + B / 2, ch[0] - 12, B * 0.45, 0.2, 650);
    if (b % 32 === 28) k.riser(t, 4 * B, 0.07);
  },
  // Techno minimale : le moteur monte un rapport par mesure, rétrogradages, passages de F1
  embarque(k, b, t, B) {
    const pos = b % 4;
    if (b === 0) { k.engine(t, 4 * B, 95, 125, 0.11, 1200); k.riser(t, 4 * B, 0.07); }
    if (b < 4) return;
    k.kick(t, 0.85);
    k.hat(t + B / 2, 0.09);
    if (pos === 1 || pos === 3) k.clap(t, 0.2);
    [1, 0, 1, 1].forEach((on, i) => { if (on) k.sub(t + i * B / 4, 33, B / 4 * 0.8, 0.16); });
    if (pos === 0) k.engine(t, 3.6 * B, 230, 360, 0.11);
    if (b % 8 === 7) { k.engine(t + 0.6 * B, 0.12, 380, 300, 0.08); k.engine(t + 0.8 * B, 0.12, 360, 280, 0.08); }
    if (b % 32 === 20) k.flyby(t, 2.2, 0.18);
    if (b % 16 === 0) k.pad(t, [57, 60, 64], 16 * B, 0.02, 900, 2);
  },
  // Lo-fi : batterie douce et décalée (swing), piano électrique, basse ronde, craquements du vinyle
  paddock(k, b, t, B) {
    const ch = chordAt([[41, 53, 57, 60, 64], [40, 52, 55, 59, 62], [38, 50, 53, 57, 60], [36, 48, 52, 55, 59]], b);
    const pos = b % 4;
    const sw = B * 0.62;   // croche « swing »
    if (b === 0) k.hit(t, { freq: 2500, type: 'lowpass', peak: 0.012, len: 600, attack: 0.5, loop: true });
    k.hit(t + Math.random() * B, { freq: 3000, peak: 0.04, len: 0.006 });
    if (pos === 0 || pos === 2) for (const m of ch.slice(1)) {
      k.tone(t, hz(m), { peak: pos ? 0.03 : 0.045, len: pos ? 1.5 * B : 3.5 * B, attack: 0.01 });
      k.tone(t, hz(m + 12), { type: 'triangle', peak: 0.008, len: B, attack: 0.01 });
    }
    if (pos === 0) k.sub(t, ch[0] - 12, B * 1.2, 0.26);
    if (pos === 2) k.sub(t + sw, ch[0] - 5, B * 0.9, 0.2);
    if (b < 2) return;
    if (pos === 0) k.kick(t, 0.55, 110, 0.28);
    if (pos === 2) k.kick(t + sw, 0.45, 110, 0.25);
    if (pos === 1 || pos === 3) k.hit(t, { freq: 2200, type: 'bandpass', q: 0.5, peak: 0.13, len: 0.22 });
    k.hat(t, 0.04); k.hat(t + sw, 0.03);
  },
  // Électro d'origine (118 BPM) : la mineur, fa, do, sol
  electro(k, b, t, B) {
    const ch = chordAt([[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]], b);
    k.kick(t);
    k.hat(t + B / 2, 0.18, 0.05);
    if (b % 2) k.hit(t, { freq: 1800, type: 'bandpass', peak: 0.35, len: 0.16 });
    k.tone(t, hz(ch[0]), { type: 'sawtooth', peak: 0.22, len: B / 2 * 0.9, attack: 0.02, hold: 0.7, cutoff: 700 });
    k.tone(t + B / 2, hz(ch[0] + 12), { type: 'sawtooth', peak: 0.16, len: B / 2 * 0.9, attack: 0.02, hold: 0.7, cutoff: 900 });
    if (b % 4 === 0) for (const m of ch.slice(1)) k.tone(t, hz(m), { type: 'triangle', peak: 0.05, len: 4 * B, attack: 0.02, hold: 0.7, cutoff: 2400 });
  },
};

// Joue un morceau sur `out` pendant `duration` secondes (contexte audio en direct ou calculé d'avance)
export function playTrack(ac, out, id, duration, t0 = ac.currentTime + 0.05) {
  const tr = trackOf(id);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
  comp.connect(out);
  const k = kit(ac, comp);
  const B = 60 / tr.bpm;
  for (let b = 0; b * B < duration; b++) PLAY[tr.id](k, b, t0 + b * B, B);
}

// Écoute d'un morceau avant de le choisir : renvoie de quoi l'arrêter
export function previewTrack(id, seconds = 15) {
  const ac = new AudioContext();
  const g = ac.createGain();
  g.gain.setValueAtTime(0.8, 0); g.gain.setValueAtTime(0.8, seconds - 0.8); g.gain.linearRampToValueAtTime(0, seconds);
  g.connect(ac.destination);
  playTrack(ac, g, id, seconds);
  const stop = () => { ac.close().catch(() => {}); };
  setTimeout(stop, seconds * 1000 + 200);
  return stop;
}
