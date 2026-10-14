// Prise de son du micro pour la synchro TV par le son : transmet les échantillons par paquets,
// avec l'heure audio du premier échantillon (le fil de calcul s'en sert pour dater ce qu'il entend).
class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.n = 0;
    this.t0 = 0;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    const len = ch ? ch.length : 128;
    if (this.n === 0) this.t0 = currentTime;
    // Micro coupé ou absent : on garde la continuité du temps avec du silence
    if (ch) this.buf.set(ch, this.n);
    else this.buf.fill(0, this.n, this.n + len);
    this.n += len;
    if (this.n + 128 > this.buf.length) {
      const out = this.buf.slice(0, this.n);
      this.port.postMessage({ t0: this.t0, samples: out }, [out.buffer]);
      this.n = 0;
    }
    return true;
  }
}

registerProcessor('mic-tap', MicTap);
