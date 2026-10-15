// Petit serveur des statistiques d'utilisation de Paddock Live (Cloudflare Worker + base D1).
// - POST /e : lot de compteurs anonymes envoyé par l'appli (avec l'accord de l'utilisateur).
//   Seuls le jour (pris ici, pas chez l'utilisateur), la version, le système, le type d'appareil,
//   le nom de la fonction et un nombre sont gardés : ni adresse IP, ni identifiant, ni contenu.
// - GET /stats?key=… : page des statistiques (clé STATS_KEY, secret du Worker).
// - GET /stats.json?key=… : les mêmes chiffres en JSON.
import { cleanBatch, LABELS } from '../shared/stats.js';

const MAX_BODY = 32 * 1024;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function ingest(req, env) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: 'Trop volumineux' }, 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'Trop volumineux' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
  const batch = cleanBatch(body);
  if (!batch) return json({ error: 'Lot invalide' }, 400);
  const day = new Date().toISOString().slice(0, 10);
  const stmt = env.DB.prepare('INSERT INTO counts (day, event, device, version, os, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (day, event, device, version, os) DO UPDATE SET n = n + excluded.n');
  await env.DB.batch(batch.items.map(([event, device, n]) => stmt.bind(day, event, device, batch.version, batch.os, n)));
  return new Response(null, { status: 204 });
}

export async function summary(env, days) {
  const since = new Date(Date.now() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const q = (sql) => env.DB.prepare(sql).bind(since).all().then((r) => r.results || []);
  const [daily, events, versions, systems, devices] = await Promise.all([
    q("SELECT day, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY day ORDER BY day"),
    q('SELECT event, device, SUM(n) AS n FROM counts WHERE day >= ?1 GROUP BY event, device'),
    q("SELECT version, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY version ORDER BY n DESC"),
    q("SELECT os, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.active' GROUP BY os ORDER BY n DESC"),
    q("SELECT device, SUM(n) AS n FROM counts WHERE day >= ?1 AND event = 'app.open' GROUP BY device ORDER BY n DESC"),
  ]);
  const byEvent = new Map();
  for (const r of events) {
    const e = byEvent.get(r.event) || { event: r.event, total: 0, desktop: 0, phone: 0, browser: 0 };
    e.total += r.n;
    if (r.device in e) e[r.device] += r.n;
    byEvent.set(r.event, e);
  }
  return { since, days, daily, events: [...byEvent.values()].sort((a, b) => b.total - a.total), versions, systems, devices };
}

const GROUPS = [
  ['Navigation (barre latérale)', (e) => e.startsWith('rail.')],
  ['Onglets des panneaux', (e) => e.startsWith('tab.')],
  ['Fonctions', (e) => e.startsWith('feature.') || e.startsWith('session.')],
  ['Réglages consultés', (e) => e.startsWith('settings.')],
  ['Saison', (e) => e.startsWith('season.')],
  ['Langue', (e) => e.startsWith('lang.')],
  ['Erreurs', (e) => e.startsWith('error.')],
];

function bars(rows, key, label) {
  const max = Math.max(1, ...rows.map((r) => r[key]));
  return rows.map((r) => `<tr><td>${label(r)}</td><td class="num">${r[key]}</td><td class="bar"><i style="width:${(100 * r[key] / max).toFixed(1)}%"></i></td></tr>`).join('');
}

function page(s, key) {
  const get = (ev) => s.events.find((e) => e.event === ev)?.total || 0;
  const avg = s.daily.length ? Math.round(s.daily.reduce((a, r) => a + r.n, 0) / s.daily.length) : 0;
  const max = Math.max(1, ...s.daily.map((r) => r.n));
  const chart = s.daily.map((r, i) => {
    const h = 120 * r.n / max;
    const w = 600 / Math.max(1, s.daily.length);
    return `<rect x="${(i * w + 1).toFixed(1)}" y="${(130 - h).toFixed(1)}" width="${Math.max(1, w - 2).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(r.day)} : ${r.n}</title></rect>`;
  }).join('');
  const name = (e) => `${esc(LABELS[e.event] || e.event)}${LABELS[e.event] ? ` <small>${esc(e.event)}</small>` : ''}`;
  const split = (e) => `<small>${e.desktop} ordi · ${e.phone} tél. · ${e.browser} navig.</small>`;
  const groups = GROUPS.map(([title, test]) => {
    const rows = s.events.filter((e) => test(e.event));
    if (!rows.length) return '';
    const m = Math.max(1, ...rows.map((r) => r.total));
    return `<section><h2>${esc(title)}</h2><table>${rows.map((e) => `<tr><td>${name(e)}</td><td class="num">${e.total}</td><td class="bar"><i style="width:${(100 * e.total / m).toFixed(1)}%"></i></td><td>${split(e)}</td></tr>`).join('')}</table></section>`;
  }).join('');
  const k = encodeURIComponent(key);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paddock Live · statistiques</title><meta name="robots" content="noindex">
<style>
:root{--bg:#0b0d12;--card:#151922;--line:#262c38;--txt:#e8ebf1;--mut:#8b93a5;--acc:#e10600}
@media (prefers-color-scheme: light){:root{--bg:#f4f5f8;--card:#fff;--line:#e2e5eb;--txt:#151922;--mut:#5b6476}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 60px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
nav a{color:var(--txt);margin-right:6px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:13px}nav a.on{background:var(--acc);border-color:var(--acc);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.kpi b{display:block;font-size:26px}.kpi span{color:var(--mut);font-size:13px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:12px 0;overflow-x:auto}
table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-top:1px solid var(--line);vertical-align:middle}tr:first-child td{border-top:0}
td.num{text-align:right;font-variant-numeric:tabular-nums;width:70px}td.bar{width:30%;min-width:80px}td.bar i{display:block;height:8px;border-radius:4px;background:var(--acc)}
small{color:var(--mut)}svg rect{fill:var(--acc)}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.cols section{margin:0}
p.note{color:var(--mut);font-size:13px}
</style></head><body><main>
<h1>Paddock Live · statistiques d'utilisation</h1>
<p class="note">Depuis le ${esc(s.since)} (UTC). Compteurs anonymes, envoyés uniquement par les utilisateurs qui ont accepté.</p>
<nav>${[7, 30, 90, 365].map((d) => `<a href="?key=${k}&days=${d}" class="${d === s.days ? 'on' : ''}">${d} jours</a>`).join('')}</nav>
<div class="kpis">
<div class="kpi"><b>${s.daily.at(-1)?.n || 0}</b><span>installations actives (dernier jour)</span></div>
<div class="kpi"><b>${avg}</b><span>actives par jour en moyenne</span></div>
<div class="kpi"><b>${get('app.install')}</b><span>nouvelles installations</span></div>
<div class="kpi"><b>${get('session.live')}</b><span>séances suivies en direct</span></div>
<div class="kpi"><b>${get('session.replay')}</b><span>replays lancés</span></div>
<div class="kpi"><b>${s.events.filter((e) => e.event.startsWith('error.')).reduce((a, e) => a + e.total, 0)}</b><span>erreurs</span></div>
</div>
<section><h2>Installations actives par jour</h2>${s.daily.length ? `<svg viewBox="0 0 600 132" width="100%" preserveAspectRatio="none" style="height:140px">${chart}</svg>` : '<p class="note">Pas encore de données.</p>'}</section>
<div class="cols">
<section><h2>Versions</h2><table>${bars(s.versions, 'n', (r) => esc(r.version))}</table></section>
<section><h2>Systèmes</h2><table>${bars(s.systems, 'n', (r) => esc({ win: 'Windows', mac: 'macOS', linux: 'Linux' }[r.os] || r.os))}</table></section>
<section><h2>Appareils (ouvertures)</h2><table>${bars(s.devices, 'n', (r) => esc({ desktop: 'Ordinateur (appli)', phone: 'Téléphone / tablette', browser: 'Navigateur' }[r.device] || r.device))}</table></section>
</div>
${groups || '<section><p class="note">Pas encore de données.</p></section>'}
<p class="note">Lecture : chaque ligne est classée de la plus utilisée à la moins utilisée ; une fonction absente n'a pas été utilisée sur la période.</p>
</main></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/e') {
      try { return await ingest(req, env); } catch { return json({ error: 'Erreur' }, 500); }
    }
    if (req.method === 'GET' && (url.pathname === '/stats' || url.pathname === '/stats.json')) {
      if (!env.STATS_KEY) return json({ error: 'Clé STATS_KEY non configurée' }, 503);
      const key = url.searchParams.get('key') || '';
      if (!sameKey(key, env.STATS_KEY)) return json({ error: 'Clé incorrecte' }, 403);
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const s = await summary(env, days);
      if (url.pathname === '/stats.json') return json(s);
      return new Response(page(s, key), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } });
    }
    if (url.pathname === '/') return new Response('Paddock Live · statistiques anonymes', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return json({ error: 'Introuvable' }, 404);
  },
};
