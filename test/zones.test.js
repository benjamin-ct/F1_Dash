import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../shared/track.js';
import { estimateZones } from '../shared/zones.js';

// Circuit « stade » : deux lignes droites de 1 km reliées par deux virages en demi-cercle.
function stadium() {
  const pts = [];
  const R = 2000, S = 10000; // dixièmes de mètre
  for (let x = 0; x < S; x += 100) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += 100 / R) pts.push([S + R * Math.cos(a), R + R * Math.sin(a)]);
  for (let x = S; x > 0; x -= 100) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < 1.5 * Math.PI; a += 100 / R) pts.push([R * Math.cos(a), R + R * Math.sin(a)]);
  return { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), rotation: 0 };
}

test('zones ligne droite et détection estimées depuis la télémétrie', () => {
  const track = new Track(stadium());
  const pts = track.pts;
  const positions = [], carData = [];
  const t0 = Date.parse('2026-05-01T12:00:00Z');
  for (let car = 1; car <= 4; car++) {
    let i = car * 7, frac = 0, t = t0 + car * 333;
    for (let step = 0; step < 4000; step++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const curve = Math.abs(a.y - b.y) > 1;
      const speed = curve ? 150 : 300;
      let x = a.x + (b.x - a.x) * frac, y = a.y + (b.y - a.y) * frac;
      let v = speed, throttle = curve ? 40 : 100;
      // Voiture 1 : deux passages aux stands (hors piste, au limiteur) sur la 2e ligne droite
      const pitting = car === 1 && ((step > 1400 && step < 1700) || (step > 2900 && step < 3200)) && !curve && a.y > 1000;
      if (pitting) { y += 300; v = 80; throttle = 20; }
      const utc = new Date(t).toISOString();
      positions.push({ data: { Position: [{ Timestamp: utc, Entries: { [car]: { Status: 'OnTrack', X: x, Y: y, Z: 0 } } }] } });
      carData.push({ data: { Entries: [{ Utc: utc, Cars: { [car]: { Channels: { 0: 11000, 2: v, 3: 7, 4: throttle, 5: 0 } } } }] } });
      // avance de 250 ms
      frac += ((v / 3.6) * 0.25 * 10) / Math.hypot(b.x - a.x, b.y - a.y);
      while (frac >= 1) { frac -= 1; i = (i + 1) % pts.length; }
      t += 250;
    }
  }
  const res = estimateZones(track, carData, positions);
  assert.ok(res, 'résultat attendu');
  assert.equal(res.zones.length, 2, JSON.stringify(res.zones));
  for (const z of res.zones) assert.ok(z.length > 700 && z.length <= 1100, `longueur ${z.length}`);
  assert.ok(res.detection, 'ligne de détection attendue');
  // La sortie de piste de la voiture 1 a lieu sur la ligne droite du haut (y = 4000)
  assert.ok(pts[res.detection.idx].y > 3000, `détection en y=${pts[res.detection.idx].y}`);
});
