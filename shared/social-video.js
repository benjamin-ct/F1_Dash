// Mode créateur (appli et page web) : vidéo verticale (TikTok) à partir des visuels au format story. Diaporama avec
// léger zoom et fondus, enregistré en temps réel (MediaRecorder), avec une musique générée sur
// place (libre de droits), un fichier audio choisi, ou sans musique.

const W = 1080;
const H = 1920;

function pickMime(withAudio) {
  const list = withAudio
    ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
  // MP4 seulement en H.264 (lu partout) ; sinon WebM, accepté aussi par TikTok
  return list.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

// Musique électro générée (118 BPM) : grosse caisse, caisse claire, charleston, basse et nappe
function generatedMusic(ac, out, duration) {
  const bpm = 118;
  const beat = 60 / bpm;
  const t0 = ac.currentTime + 0.05;
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (g, t, peak, len) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len); };
  const kick = (t) => {
    const o = ac.createOscillator(); const g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    env(g, t, 0.9, 0.32); o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
  };
  const hiss = (t, freq, peak, len, type = 'highpass') => {
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); env(g, t, peak, len);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  };
  const note = (t, freq, len, type, peak, cutoff) => {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.setValueAtTime(peak, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
  };
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const bars = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]];   // Lam, Fa, Do, Sol
  const beats = Math.ceil(duration / beat) + 1;
  for (let b = 0; b < beats; b++) {
    const t = t0 + b * beat;
    const chord = bars[Math.floor(b / 4) % 4];
    kick(t);
    hiss(t + beat / 2, 7000, 0.18, 0.05);
    if (b % 2 === 1) hiss(t, 1800, 0.35, 0.16, 'bandpass');
    note(t, hz(chord[0]), beat / 2 * 0.9, 'sawtooth', 0.22, 700);
    note(t + beat / 2, hz(chord[0] + 12), beat / 2 * 0.9, 'sawtooth', 0.16, 900);
    if (b % 4 === 0) for (const m of chord.slice(1)) note(t, hz(m), beat * 4, 'triangle', 0.05, 2400);
  }
}

// WebM de l'enregistreur du navigateur : sans durée dans l'en-tête (lecteurs et TikTok la voient
// « infinie »). On l'ajoute dans la section Info (élément Duration, en millisecondes).
export function webmWithDuration(buf, ms) {
  const b = new Uint8Array(buf);
  const vint = (p) => { let len = 1; while (len <= 8 && !(b[p] & (0x80 >> (len - 1)))) len++; let v = b[p] & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + b[p + i]; return { len, v, unknown: v === 2 ** (7 * len) - 1 }; };
  const id = (p) => { let len = 1; while (len <= 4 && !(b[p] & (0x80 >> (len - 1)))) len++; let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[p + i]; return { len, v }; };
  let p = 0;
  while (p < b.length) {
    const i = id(p); const sz = vint(p + i.len);
    const data = p + i.len + sz.len;
    if (i.v === 0x18538067) {   // Segment : on cherche Info parmi ses enfants
      let q = data;
      while (q < b.length) {
        const ci = id(q); const cs = vint(q + ci.len);
        const cdata = q + ci.len + cs.len;
        if (ci.v === 0x1549a966) {   // Info
          const dur = new Uint8Array(11);
          dur.set([0x44, 0x89, 0x88]);
          new DataView(dur.buffer).setFloat64(3, ms);
          const newSize = cs.v + 11;
          if (newSize >= 2 ** (7 * cs.len) - 1) return buf;
          const sizeBytes = new Uint8Array(cs.len);
          let v = newSize;
          for (let k = cs.len - 1; k >= 0; k--) { sizeBytes[k] = v & 0xff; v = Math.floor(v / 256); }
          sizeBytes[0] |= 0x80 >> (cs.len - 1);
          const out = new Uint8Array(b.length + 11);
          out.set(b.subarray(0, q + ci.len), 0);
          out.set(sizeBytes, q + ci.len);
          out.set(b.subarray(cdata, cdata + cs.v), cdata);
          out.set(dur, cdata + cs.v);
          out.set(b.subarray(cdata + cs.v), cdata + cs.v + 11);
          return out.buffer;
        }
        if (cs.unknown) return buf;
        q = cdata + cs.v;
      }
      return buf;
    }
    if (sz.unknown) return buf;
    p = data + sz.v;
  }
  return buf;
}

// Enregistrement d'une animation : draw(ctx, t) dessine l'image à l'instant t (secondes)
export async function makeAnimation(paint, duration, { music = 'gen', file = null, onProgress } = {}) {
  if (!window.MediaRecorder) throw new Error('Enregistrement vidéo indisponible dans ce navigateur');
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const video = out.captureStream(30);
  let ac = null;
  const tracks = [...video.getVideoTracks()];
  if (music !== 'none') {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.exponentialRampToValueAtTime(0.8, ac.currentTime + 0.6);
    master.gain.setValueAtTime(0.8, ac.currentTime + Math.max(0.7, duration - 1.2));
    master.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    master.connect(dest);
    if (music === 'file' && file) {
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = buf.duration < duration;
      src.connect(master); src.start();
    } else generatedMusic(ac, master, duration);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const mimeType = pickMime(tracks.length > 1);
  const rec = new MediaRecorder(new MediaStream(tracks), { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });

  const draw = (t) => paint(ctx, t);
  draw(0);
  rec.start(500);
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      draw(Math.min(t, duration - 0.001));
      onProgress?.(Math.min(1, t / duration));
      if (t >= duration) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  video.getTracks().forEach((tr) => tr.stop());
  await ac?.close();
  const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
  let blob = new Blob(chunks, { type });
  if (type === 'video/webm') blob = new Blob([webmWithDuration(await blob.arrayBuffer(), duration * 1000)], { type });
  return { blob, mime: type };
}

// Diaporama des visuels au format story : léger zoom et fondu enchaîné
export async function makeVideo(slides, { perSlide = 3.2, ...opts } = {}) {
  const duration = slides.length * perSlide;
  const fade = 0.45;
  const draw = (ctx, t) => {
    const i = Math.min(slides.length - 1, Math.floor(t / perSlide));
    const local = t - i * perSlide;
    const paint = (c, k, alpha, dy = 0) => {
      const s = 1 + 0.045 * k;
      ctx.globalAlpha = alpha;
      ctx.drawImage(c, (W - W * s) / 2, (H - H * s) / 2 + dy, W * s, H * s);
    };
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
    paint(slides[i], local / perSlide, 1);
    const next = slides[i + 1];
    if (next && local > perSlide - fade) {
      const p = (local - (perSlide - fade)) / fade;
      paint(next, 0, p, (1 - p) * 80);
    }
    ctx.globalAlpha = 1;
  };
  return makeAnimation(draw, duration, opts);
}
