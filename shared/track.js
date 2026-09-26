// Géométrie du circuit : tracé (API MultiViewer), projection d'une position GPS sur le tracé,
// conversion "temps de référence du tour" <-> point (x, y). Partagé serveur / navigateur.

export class Track {
  constructor(data) {
    this.raw = data;
    this.rotation = Number(data.rotation) || 0;
    const xs = data.x, ys = data.y;
    const times = Array.isArray(data.trackPositionTime) && data.trackPositionTime.length === xs.length
      ? data.trackPositionTime : null;
    this.pts = xs.map((x, i) => ({ x, y: ys[i] }));

    // Temps de référence cumulé (s) à chaque point ; à défaut, distance normalisée.
    const cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const closing = Math.hypot(this.pts[0].x - this.pts.at(-1).x, this.pts[0].y - this.pts.at(-1).y);
    const totalDist = cum.at(-1) + closing;
    if (times) {
      const t0 = times[0];
      this.t = times.map((v) => v - t0);
      const lapTime = Number(data.candidateLap?.lapTime) || null;
      const last = this.t.at(-1);
      // Temps du dernier segment (retour à la ligne) estimé à la vitesse moyenne.
      this.L = lapTime && lapTime > last ? lapTime : last + (closing / (cum.at(-1) || 1)) * last;
    } else {
      // Pas de temps de référence : répartition proportionnelle à la distance.
      this.L = Number(data.candidateLap?.lapTime) || 90;
      this.t = cum.map((d) => (d / totalDist) * this.L);
    }

    this.corners = (data.corners || []).map((c) => ({ number: c.number, x: c.trackPosition.x, y: c.trackPosition.y, angle: c.angle }));
    this.marshal = (data.marshalSectors || []).map((m) => ({ number: m.number, idx: this.nearestIndex(m.trackPosition.x, m.trackPosition.y) }))
      .sort((a, b) => a.idx - b.idx);
  }

  nearestIndex(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const d = (this.pts[i].x - x) ** 2 + (this.pts[i].y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Projette (x, y) sur le tracé -> temps de référence r ∈ [0, L) et distance au tracé.
  project(x, y, hint = -1) {
    const n = this.pts.length;
    let best = { r: 0, d2: Infinity };
    const test = (i) => {
      const a = this.pts[i], b = this.pts[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let u = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = a.x + u * dx, py = a.y + u * dy;
      const d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 < best.d2) {
        const t0 = this.t[i], t1 = i + 1 < n ? this.t[i + 1] : this.L;
        best = { r: t0 + u * (t1 - t0), d2, i };
      }
    };
    if (hint >= 0) {
      for (let k = -25; k <= 25; k++) test((hint + k + n) % n);
      if (best.d2 < 250 ** 2) return best;
    }
    for (let i = 0; i < n; i++) test(i);
    return best;
  }

  // Point du tracé correspondant au temps de référence r (modulo L).
  pointAt(r) {
    const L = this.L;
    r = ((r % L) + L) % L;
    const t = this.t, n = t.length;
    let lo = 0, hi = n - 1;
    if (r >= t[n - 1]) {
      const a = this.pts[n - 1], b = this.pts[0];
      const u = (r - t[n - 1]) / (L - t[n - 1] || 1);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= r) lo = mid; else hi = mid;
    }
    const u = (r - t[lo]) / (t[hi] - t[lo] || 1);
    const a = this.pts[lo], b = this.pts[hi];
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }

  // Plages d'indices du tracé pour chaque secteur de commissaires (drapeaux par secteur).
  marshalRanges() {
    const m = this.marshal;
    return m.map((s, i) => ({ number: s.number, from: s.idx, to: m[(i + 1) % m.length].idx }));
  }
}
