// Circuits du calendrier (identifiant de l'API des résultats) : clé du tracé (API MultiViewer, la
// même que la F1), longueur officielle et nombre de tours de la course. Couleurs des drapeaux des
// pays, pour donner à chaque Grand Prix son propre visuel (post « Race Week »).

export const CIRCUITS = {
  bahrain: { key: 63, km: 5.412, laps: 57 }, jeddah: { key: 149, km: 6.174, laps: 50 }, albert_park: { key: 10, km: 5.278, laps: 58 },
  suzuka: { key: 46, km: 5.807, laps: 53 }, shanghai: { key: 49, km: 5.451, laps: 56 }, miami: { key: 151, km: 5.412, laps: 57 },
  imola: { key: 6, km: 4.909, laps: 63 }, monaco: { key: 22, km: 3.337, laps: 78 }, catalunya: { key: 15, km: 4.657, laps: 66 },
  villeneuve: { key: 23, km: 4.361, laps: 70 }, red_bull_ring: { key: 19, km: 4.318, laps: 71 }, silverstone: { key: 2, km: 5.891, laps: 52 },
  hungaroring: { key: 4, km: 4.381, laps: 70 }, spa: { key: 7, km: 7.004, laps: 44 }, zandvoort: { key: 55, km: 4.259, laps: 72 },
  monza: { key: 39, km: 5.793, laps: 53 }, baku: { key: 144, km: 6.003, laps: 51 }, marina_bay: { key: 61, km: 4.94, laps: 62 },
  americas: { key: 9, km: 5.513, laps: 56 }, rodriguez: { key: 65, km: 4.304, laps: 71 }, interlagos: { key: 14, km: 4.309, laps: 71 },
  vegas: { key: 152, km: 6.201, laps: 50 }, losail: { key: 150, km: 5.419, laps: 57 }, yas_marina: { key: 70, km: 5.281, laps: 58 },
};
export const circuitInfo = (id) => CIRCUITS[id] || null;

// Couleurs des drapeaux (code ISO) : la première sert d'accent, la deuxième de complément
export const FLAG_COLORS = {
  au: ['#E4002B', '#1D4ED8'], cn: ['#EE1C25', '#FFDE00'], jp: ['#BC002D', '#F5F5F5'], bh: ['#CE1126', '#F5F5F5'], sa: ['#00A651', '#F5F5F5'],
  us: ['#B22234', '#3C6EDB'], it: ['#009246', '#CE2B37'], mc: ['#CE1126', '#F5F5F5'], es: ['#C60B1E', '#FFC400'], ca: ['#D80621', '#F5F5F5'],
  at: ['#ED2939', '#F5F5F5'], gb: ['#C8102E', '#2F5BD3'], be: ['#FAE042', '#ED2939'], hu: ['#CE2939', '#477050'], nl: ['#FF6B00', '#21468B'],
  az: ['#00B5E2', '#E4002B'], sg: ['#EF3340', '#F5F5F5'], mx: ['#00A35C', '#CE1126'], br: ['#00A651', '#FFDF00'], qa: ['#A0154A', '#F5F5F5'],
  ae: ['#00A651', '#FF0000'], my: ['#CC0001', '#FFCC00'], pt: ['#00A651', '#FF0000'], fr: ['#3361E8', '#EF4135'], de: ['#FFCE00', '#DD0000'],
  tr: ['#E30A17', '#F5F5F5'], ru: ['#D52B1E', '#3A6BD6'], ar: ['#74ACDF', '#F6B40E'], za: ['#007A4D', '#FFB612'], kr: ['#CD2E3A', '#2F5FCF'],
  in: ['#FF9933', '#138808'], vn: ['#DA251D', '#FFFF00'], th: ['#ED1C24', '#3A4DB8'], ma: ['#C1272D', '#00A651'],
};
export const flagColors = (iso) => FLAG_COLORS[iso] || ['#e10600', '#f3f5f9'];

// Tracé (x, y et rotation de l'API MultiViewer) -> points tournés comme sur les cartes officielles,
// ramenés dans un carré de côté 1 (proportions gardées), et position des virages
export function trackShape(raw) {
  if (!raw?.x?.length) return null;
  const a = ((Number(raw.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const rot = (x, y) => [x * cos - y * sin, -(x * sin + y * cos)];
  const pts = raw.x.map((x, i) => rot(x, raw.y[i]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const norm = ([x, y]) => [(x - minX) / size, (y - minY) / size];
  return {
    pts: pts.map(norm), w: (maxX - minX) / size, h: (maxY - minY) / size,
    corners: (raw.corners || []).map((c) => ({ n: c.number, p: norm(rot(c.trackPosition?.x ?? 0, c.trackPosition?.y ?? 0)) })),
  };
}
