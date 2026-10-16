// Pages du serveur des statistiques : connexion (mot de passe) et tableau de bord. Les graphiques
// sont dessinés dans le navigateur à partir des chiffres intégrés à la page (aucune bibliothèque).

const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2a1a"/><stop offset=".55" stop-color="#d40500"/><stop offset="1" stop-color="#8e0300"/></linearGradient></defs><rect width="512" height="512" rx="114" fill="url(#lg)"/><g transform="translate(256 256) skewX(-14) translate(-256 -256)" fill="#fff" fill-rule="evenodd"><g transform="translate(234 168) scale(0.6) translate(-241 -256)"><path d="M118 150 H262 V202 H180 V240 H248 V290 H180 V362 H118 Z"/><path d="M300 150 H364 V362 H302 V214 L276 230 V178 Z"/></g><g transform="translate(278 344) scale(0.6) translate(-256 -256)"><path d="M108 150 H200 A68 68 0 0 1 200 286 H170 V362 H108 Z M170 200 H194 A18 18 0 0 1 194 236 H170 Z"/><path d="M262 150 H324 V306 H404 V362 H262 Z"/></g></g></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Couleurs : palette de référence validée (3 appareils : bleu, orange, turquoise), rouge réservé à la marque
const CSS = `
:root{color-scheme:light;--page:#f6f6f4;--card:#fff;--ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;--grid:#e9e8e3;--axis:#c3c2b7;--ring:rgba(11,11,11,.08);
--s1:#2a78d6;--s1-wash:rgba(42,120,214,.10);--s2:#eb6834;--s3:#1baf7a;--brand:#e10600;--brand-ink:#fff;--good:#006300;--bad:#d03b3b;--chip:#efeeea;--shadow:0 1px 2px rgba(0,0,0,.04),0 4px 16px rgba(0,0,0,.04)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#0d0e11;--card:#16181d;--ink:#f0efec;--ink-2:#c3c2b7;--muted:#8e8c86;--grid:#24262c;--axis:#383a40;--ring:rgba(255,255,255,.08);
--s1:#3987e5;--s1-wash:rgba(57,135,229,.14);--s2:#d95926;--s3:#199e70;--good:#0ca30c;--bad:#e5534b;--chip:#202329;--shadow:none}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--page);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}button,input{font:inherit;color:inherit}
.logo{width:36px;height:36px;flex:none}.logo svg{width:100%;height:100%;display:block}
`;

const page = (title, body, nonce, extraCss = '', script = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/stats.webmanifest"><meta name="apple-mobile-web-app-title" content="Statistiques"><meta name="theme-color" content="#07080A"><style>${CSS}${extraCss}</style></head><body>${body}${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;

export function loginPage({ error = '', nonce }) {
  const css = `
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.box{width:100%;max-width:380px;background:var(--card);border:1px solid var(--ring);border-radius:18px;padding:32px 28px;box-shadow:var(--shadow);text-align:center}
.box .logo{width:64px;height:64px;margin:0 auto 18px}
h1{font-size:21px;margin:0 0 4px;letter-spacing:-.01em}p.sub{margin:0 0 24px;color:var(--ink-2);font-size:14px}
label{display:block;text-align:left;font-size:13px;color:var(--ink-2);margin:0 0 6px}
.pw{position:relative}
input[type=password],input[type=text]{width:100%;padding:12px 44px 12px 14px;border:1px solid var(--axis);border-radius:10px;background:var(--page);outline:none;font-size:16px}
input:focus{border-color:var(--s1);box-shadow:0 0 0 3px var(--s1-wash)}
.eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;padding:8px;cursor:pointer;color:var(--muted);border-radius:8px}
.eye:hover{color:var(--ink)}.eye svg{width:18px;height:18px;display:block}
button.go{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:var(--brand);color:var(--brand-ink);font-weight:600;cursor:pointer}
button.go:hover{filter:brightness(1.08)}
.err{margin:14px 0 0;color:var(--bad);font-size:14px;display:flex;gap:6px;justify-content:center;align-items:center}
.foot{margin-top:22px;font-size:12px;color:var(--muted)}`;
  const body = `<main><form class="box" method="post" action="/login">
<div class="logo">${LOGO}</div>
<h1>Statistiques Paddock Live</h1>
<p class="sub">Accès réservé : entrez le mot de passe.</p>
<label for="key">Mot de passe</label>
<div class="pw"><input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
<button class="eye" type="button" aria-label="Afficher le mot de passe"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
<button class="go" type="submit">Ouvrir les statistiques</button>
${error ? `<p class="err" role="alert"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/></svg>${esc(error)}</p>` : ''}
<p class="foot">Vous restez connecté 30 jours sur cet appareil.</p>
</form></main>`;
  const script = `const i=document.getElementById('key');document.querySelector('.eye').addEventListener('click',()=>{i.type=i.type==='password'?'text':'password';i.focus();});`;
  return page('Statistiques · Paddock Live', body, nonce, css, script);
}

export function dashboardPage(data, { nonce }) {
  const css = `
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--page) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--ring)}
.top .in{max-width:1180px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;margin-right:auto}.brand b{display:block;font-size:16px;letter-spacing:-.01em}.brand small{display:block;color:var(--muted);font-size:12px}
.seg{display:flex;background:var(--chip);border-radius:10px;padding:3px;gap:2px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.seg a,.seg button{border:0;background:none;padding:6px 12px;border-radius:8px;text-decoration:none;font-size:13px;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.seg a:hover,.seg button:hover{color:var(--ink)}.seg .on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.out{font-size:13px;color:var(--ink-2);text-decoration:none;padding:6px 10px;border-radius:8px}.out:hover{background:var(--chip);color:var(--ink)}
main{max-width:1180px;margin:0 auto;padding:20px 20px 60px}
.range{color:var(--muted);font-size:13px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--ring);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow);min-width:0}
.card h2{font-size:14px;font-weight:600;margin:0 0 2px}.card .hint{color:var(--muted);font-size:12.5px;margin:0 0 14px}
.grid{display:grid;gap:14px}
.hero{display:grid;grid-template-columns:minmax(200px,260px) 1fr;gap:20px;align-items:stretch}
.hero .big{font-size:52px;font-weight:650;letter-spacing:-.03em;line-height:1;margin:14px 0 8px}
.hero .lbl{color:var(--ink-2);font-size:14px}
.delta{display:inline-flex;align-items:baseline;flex-wrap:wrap;column-gap:4px;font-size:13px;font-weight:600}.delta small{white-space:nowrap}.delta.up{color:var(--good)}.delta.down{color:var(--bad)}.delta.flat{color:var(--muted)}
.delta small{font-weight:400;color:var(--muted)}
.hero .side{display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid var(--grid);padding-right:20px}
.hero .side .meta{color:var(--muted);font-size:12.5px;margin-top:16px;line-height:1.6}
.kpis{grid-template-columns:repeat(5,minmax(0,1fr))}
.kpi .lbl{font-size:13px;color:var(--ink-2)}.kpi .val{font-size:28px;font-weight:650;letter-spacing:-.02em;margin:6px 0 2px}
.kpi svg{display:block;width:100%;height:34px;margin-top:10px}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto;overflow:visible}
.tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--ring);box-shadow:0 6px 24px rgba(0,0,0,.14);border-radius:10px;padding:8px 10px;font-size:12.5px;white-space:nowrap;opacity:0;transition:opacity .08s;z-index:3}
.tip b{display:block;font-size:15px}.tip .k{display:flex;align-items:center;gap:6px;color:var(--ink-2)}.tip .k i{width:10px;height:2px;border-radius:1px;display:inline-block}
.tip .row{display:flex;justify-content:space-between;gap:14px}.tip .row b{font-size:13px;display:inline}
.feat .head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}.feat .head>div:first-child{margin-right:auto}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);margin:0 0 12px}.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.bars{display:grid;gap:7px}
.bar{display:grid;grid-template-columns:minmax(120px,240px) 1fr 56px;align-items:center;gap:12px;font-size:13.5px;padding:2px 4px;margin:0 -4px;border-radius:8px;outline:none}
.bar:hover,.bar:focus-visible{background:var(--chip)}
.bar .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar .track{display:flex;gap:2px;height:14px;align-items:stretch}
.bar .track i{display:block;min-width:2px}.bar .track i:last-child{border-radius:0 4px 4px 0}
.bar .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.bar.small,.bar.stack{grid-template-columns:1fr auto;row-gap:5px}.bar.small .track-w,.bar.stack .track-w{grid-column:1/-1;grid-row:2}
.bar.small .track{height:10px}
.more{margin-top:10px;border:0;background:none;color:var(--s1);font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}.more:hover{text-decoration:underline}
.c-desktop{background:var(--s1)}.c-phone{background:var(--s2)}.c-browser{background:var(--s3)}.c-one{background:var(--s1)}
.dist{grid-template-columns:repeat(4,minmax(0,1fr))}
.two{grid-template-columns:1fr 1fr}
.pills{display:flex;flex-wrap:wrap;gap:6px}.pills span{background:var(--chip);border-radius:999px;padding:4px 10px;font-size:12.5px;color:var(--ink-2)}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;padding:6px 8px;border-bottom:1px solid var(--grid)}
td{padding:7px 8px;border-bottom:1px solid var(--grid)}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}
td code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace}
.errs td{vertical-align:top}.errs .where{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.kind{font-size:11px;font-weight:600;border-radius:999px;padding:1px 8px;background:var(--chip);color:var(--ink-2)}.kind.server{color:var(--s2)}.kind.promise{color:var(--s1)}
.errs .msg{margin-top:4px;color:var(--ink);font-size:13px;word-break:break-word}.errs .msg.none{color:var(--muted);font-style:italic}
.errs .stack{margin-top:3px;color:var(--muted);font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}
.vers{display:flex;flex-wrap:wrap;gap:4px}.vers span{background:var(--chip);border-radius:999px;padding:1px 8px;font-size:12px;white-space:nowrap;color:var(--ink-2)}
.errs-wrap{overflow-x:auto}
.errs .mob{display:none;margin-top:6px;color:var(--muted);font-size:12px}
@media (max-width:720px){.errs .devcol,.errs .vcol{display:none}.errs .mob{display:block}}
details{margin-top:14px}summary{cursor:pointer;color:var(--ink-2);font-size:13px}details table{margin-top:8px}
.empty{color:var(--muted);font-size:13.5px;padding:18px 0;text-align:center}
.badge{display:inline-flex;align-items:center;gap:5px;color:var(--bad);font-weight:600}
@media (max-width:980px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.dist{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){.hero{grid-template-columns:1fr}.hero .side{border-right:0;padding-right:0;border-bottom:1px solid var(--grid);padding-bottom:14px}.two{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.top .in{padding:10px 16px}main{padding:16px 16px 48px}.bar{grid-template-columns:1fr auto;row-gap:5px}.bar .track-w{grid-column:1/-1;grid-row:2}.hero .big{font-size:44px}.feat .head .seg{width:100%}}
@media (max-width:420px){.dist{grid-template-columns:1fr}.seg a{padding:6px 8px}}`;
  const periods = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [365, '1 an']];
  const body = `<header class="top"><div class="in">
<div class="brand"><div class="logo">${LOGO}</div><div><b>Paddock Live</b><small>Statistiques d'utilisation</small></div></div>
<nav class="seg" aria-label="Période">${periods.map(([d, l]) => `<a href="?days=${d}" class="${d === data.days ? 'on' : ''}"${d === data.days ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
<a class="out" href="/logout">Se déconnecter</a>
</div></header>
<main>
<p class="range" id="range"></p>
<div class="grid">
<section class="card hero"><div class="side"><div><h2>Installations actives</h2><div class="lbl">en moyenne par jour</div><div class="big" id="heroVal">–</div><div id="heroDelta"></div></div><div class="meta" id="heroMeta"></div></div>
<div class="chart" id="activeChart"></div></section>
<section class="grid kpis" id="kpis"></section>
<section class="card feat"><div class="head"><div><h2>Fonctions utilisées</h2><p class="hint">De la plus utilisée à la moins utilisée, par type d'appareil</p></div><div class="seg" id="groups" role="tablist"></div></div>
<div class="legend"><span><i class="c-desktop"></i>Ordinateur</span><span><i class="c-phone"></i>Téléphone / tablette</span><span><i class="c-browser"></i>Navigateur</span></div>
<div class="bars" id="features"></div>
<details><summary>Voir en tableau</summary><table id="featTable"><thead><tr><th>Fonction</th><th class="num">Ordinateur</th><th class="num">Téléphone</th><th class="num">Navigateur</th><th class="num">Total</th></tr></thead><tbody></tbody></table></details></section>
<section class="grid dist">
<div class="card"><h2>Versions</h2><p class="hint">installations actives</p><div class="bars" id="versions"></div></div>
<div class="card"><h2>Systèmes</h2><p class="hint">installations actives</p><div class="bars" id="systems"></div></div>
<div class="card"><h2>Appareils</h2><p class="hint">ouvertures de l'interface</p><div class="bars" id="devices"></div></div>
<div class="card"><h2>Langue</h2><p class="hint">ouvertures de l'interface</p><div class="bars" id="langs"></div></div>
</section>
<section class="grid">
<div class="card"><h2>Erreurs</h2><p class="hint">Endroit (fichier:ligne), type, message technique (adresses, dossiers et nombres retirés), chemin d'appel, versions concernées</p><div id="errors"></div></div>
</section>
<section class="grid">
<div class="card"><h2>Jamais utilisées sur la période</h2><p class="hint">Fonctions connues sans aucune utilisation</p><div class="pills" id="unused"></div></div>
</section>
</div></main>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  // Tirer vers le bas pour recharger (page ouverte depuis l'écran d'accueil) : fichier à part
  // (site/stats-refresh.js, non transformé par la compilation du Worker), sans lien avec le reste du script
  return page('Statistiques · Paddock Live', `${body}<script nonce="${nonce}" src="/stats-refresh.js" defer></script>`, nonce, css, CLIENT);
}

// Script du tableau de bord (exécuté dans le navigateur). Textes insérés avec textContent.
const CLIENT = String.raw`
const D = JSON.parse(document.getElementById('data').textContent);
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const nf = new Intl.NumberFormat('fr-FR');
const fmt = (n) => (n >= 10000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : nf.format(Math.round(n * 10) / 10));
const dfmt = (d, o) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', o || { day: 'numeric', month: 'short' });
const sum = (a) => a.reduce((x, y) => x + y, 0);
const ARROW = { up: '↑', down: '↓', flat: '→' };
const DEV = [['desktop', 'Ordinateur'], ['phone', 'Téléphone / tablette'], ['browser', 'Navigateur']];

$('#range').textContent = 'Du ' + dfmt(D.since, { day: 'numeric', month: 'long', year: 'numeric' }) + ' au ' + dfmt(D.until, { day: 'numeric', month: 'long', year: 'numeric' }) + ' (UTC) · compteurs anonymes, envoyés seulement par les utilisateurs qui ont accepté' + (sum(D.series.active) || D.features.length ? '' : ' · aucune donnée reçue pour l\'instant');

// Tooltip partagé
const tip = el('div', 'tip'); tip.setAttribute('role', 'status');
function showTip(host, x, y, build) {
  if (tip.parentNode !== host) host.appendChild(tip);
  tip.replaceChildren(); build(tip); tip.style.opacity = 1;
  const w = tip.offsetWidth, hw = host.clientWidth;
  tip.style.left = Math.max(0, Math.min(hw - w, x - w / 2)) + 'px';
  tip.style.top = Math.max(-8, y - tip.offsetHeight - 12) + 'px';
}
const hideTip = () => { tip.style.opacity = 0; };

// Évolution vs période précédente : flèche + texte (jamais la couleur seule)
function delta(cur, prev, upIsGood = true) {
  const box = el('span', 'delta');
  if (!prev && !cur) { box.classList.add('flat'); box.textContent = '—'; return box; }
  if (!prev) { box.classList.add(upIsGood ? 'up' : 'down'); box.append(ARROW.up + ' nouveau '); box.append(el('small', '', 'vs période précédente')); return box; }
  const p = (cur - prev) / prev * 100;
  const dir = Math.abs(p) < 0.5 ? 'flat' : p > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? 'flat' : (dir === 'up') === upIsGood ? 'up' : 'down';
  box.classList.add(good);
  box.append(ARROW[dir] + ' ' + (p > 0 ? '+' : '') + nf.format(Math.round(p)) + ' % ');
  box.append(el('small', '', 'vs ' + D.days + ' j précédents'));
  return box;
}

// Héros : installations actives par jour (courbe + aire, réticule)
const act = D.series.active;
const avg = act.length ? sum(act) / act.length : 0;
$('#heroVal').textContent = fmt(avg);
$('#heroDelta').append(delta(avg, D.prev.activeAvg));
$('#heroMeta').textContent = 'Dernier jour : ' + nf.format(act.at(-1) || 0) + ' · max : ' + nf.format(Math.max(0, ...act)) + ' · nouvelles installations : ' + nf.format(sum(D.series.install));
function lineChart(host, dates, vals) {
  host.replaceChildren();
  const W = Math.max(260, host.clientWidth || 760), H = W < 500 ? 190 : 240, L = 36, R = 12, T = 12, B = 26;
  const max = Math.max(1, ...vals);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => max / s <= 5) || step * 10;
  const top = Math.ceil(max / nice) * nice;
  const x = (i) => L + (dates.length < 2 ? (W - L - R) / 2 : i * (W - L - R) / (dates.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Installations actives par jour' });
  for (let v = 0; v <= top + 1e-9; v += nice) {
    svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--grid)', 'stroke-width': 1 }));
    const t = sv('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }); t.textContent = fmt(v); svg.append(t);
  }
  const ticks = Math.min(W < 500 ? 3 : 6, dates.length);
  for (let k = 0; k < ticks; k++) {
    const i = Math.round(k * (dates.length - 1) / Math.max(1, ticks - 1));
    const t = sv('text', { x: x(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle', fill: 'var(--muted)', 'font-size': 11 }); t.textContent = dfmt(dates[i]); svg.append(t);
  }
  const pts = vals.map((v, i) => x(i) + ',' + y(v));
  svg.append(sv('polygon', { points: x(0) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(vals.length - 1) + ',' + y(0), fill: 'var(--s1-wash)' }));
  svg.append(sv('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--s1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
  const last = vals.length - 1;
  svg.append(sv('circle', { cx: x(last), cy: y(vals[last] || 0), r: 4, fill: 'var(--s1)', stroke: 'var(--card)', 'stroke-width': 2 }));
  const cross = sv('line', { y1: T, y2: H - B, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 });
  const dot = sv('circle', { r: 5, fill: 'var(--s1)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0 });
  svg.append(cross, dot);
  const hit = sv('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent', tabindex: 0 });
  svg.append(hit);
  host.append(svg);
  const at = (i) => {
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i])); dot.setAttribute('opacity', 1);
    const r = svg.getBoundingClientRect(), sc = r.width / W;
    showTip(host, x(i) * sc, y(vals[i]) * sc, (t) => { t.append(el('b', '', nf.format(vals[i]) + ' installation' + (vals[i] > 1 ? 's' : ''))); t.append(el('span', 'k', dfmt(dates[i], { weekday: 'short', day: 'numeric', month: 'long' }))); });
  };
  let cur = last;
  hit.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W; cur = Math.max(0, Math.min(last, Math.round((px - L) / ((W - L - R) / Math.max(1, last))))); at(cur); });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
  hit.addEventListener('focus', () => at(cur));
  hit.addEventListener('blur', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
  hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') at(cur = Math.max(0, cur - 1)); if (e.key === 'ArrowRight') at(cur = Math.min(last, cur + 1)); });
}
const drawActive = () => lineChart($('#activeChart'), D.series.dates, act);
drawActive();
let rz = 0, lastW = $('#activeChart').clientWidth;
new ResizeObserver(() => { const w = $('#activeChart').clientWidth; if (w === lastW) return; lastW = w; clearTimeout(rz); rz = setTimeout(drawActive, 80); }).observe($('#activeChart'));

// Tuiles : total, évolution, mini-courbe
const KPIS = [['install', 'Nouvelles installations', true], ['open', 'Ouvertures de l\'interface', true], ['live', 'Séances suivies en direct', true], ['replay', 'Replays lancés', true], ['errors', 'Erreurs', false]];
function spark(vals, color) {
  const n = vals.length, b = Math.max(1, Math.ceil(n / 30));
  const pts = []; for (let i = 0; i < n; i += b) pts.push(sum(vals.slice(i, i + b)));
  const max = Math.max(1, ...pts), W = 120, H = 34;
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const xy = pts.map((v, i) => (pts.length < 2 ? W / 2 : i * W / (pts.length - 1)) + ',' + (H - 2 - (H - 4) * v / max));
  svg.append(sv('polyline', { points: xy.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', opacity: 0.85 }));
  return svg;
}
for (const [k, label, upGood] of KPIS) {
  const total = sum(D.series[k]);
  const card = el('div', 'card kpi');
  card.append(el('div', 'lbl', label), el('div', 'val', fmt(total)), delta(total, D.prev[k], upGood), spark(D.series[k], k === 'errors' ? 'var(--bad)' : 'var(--s1)'));
  $('#kpis').append(card);
}

// Fonctions : barres empilées par appareil, filtre par rubrique
const GROUPS = [['all', 'Tout']].concat(Object.entries(D.groups));
let group = 'all', expanded = false;
const TOP = 12;
const tabs = $('#groups');
for (const [g, label] of GROUPS) {
  const b = el('button', g === group ? 'on' : '', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', g === group);
  b.addEventListener('click', () => { group = g; expanded = false; for (const x of tabs.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); } renderFeatures(); });
  tabs.append(b);
}
function devTip(t, name, row) {
  t.append(el('b', '', nf.format(row.total) + ' utilisation' + (row.total > 1 ? 's' : '')));
  t.append(el('span', 'k', name));
  for (const [d, l] of DEV) { const r = el('div', 'row'); const k = el('span', 'k'); const i = el('i', 'c-' + d); k.append(i, l); r.append(k, el('b', '', nf.format(row[d] || 0))); t.append(r); }
}
function barRow(host, name, segs, total, max, small, onTip) {
  const row = el('div', 'bar' + (small ? ' small' : '')); row.tabIndex = 0;
  const track = el('div', 'track');
  track.style.width = Math.max(1, total / max * 100) + '%';
  for (const [cls, v] of segs) if (v > 0) { const i = el('i', cls); i.style.flex = v + ' 1 0'; track.append(i); }
  row.append(el('div', 'name', name), (() => { const w = el('div', 'track-w'); w.append(track); return w; })(), el('div', 'n', fmt(total)));
  row.title = '';
  if (onTip) {
    const show = () => { const r = row.getBoundingClientRect(), hr = host.getBoundingClientRect(); showTip(host, r.left - hr.left + Math.min(r.width - 60, 140 + track.offsetWidth), r.top - hr.top, (t) => onTip(t)); };
    row.addEventListener('pointerenter', show); row.addEventListener('focus', show);
    row.addEventListener('pointerleave', hideTip); row.addEventListener('blur', hideTip);
  }
  host.append(row);
}
function renderFeatures() {
  const host = $('#features'); host.replaceChildren(); host.style.position = 'relative';
  const rows = D.features.filter((f) => group === 'all' || f.group === group);
  const tb = $('#featTable tbody'); tb.replaceChildren();
  if (!rows.length) { host.append(el('div', 'empty', 'Aucune utilisation sur la période.')); return; }
  const max = Math.max(...rows.map((r) => r.total));
  rows.forEach((f, i) => {
    if (expanded || i < TOP || rows.length <= TOP + 3) barRow(host, f.label, DEV.map(([d]) => ['c-' + d, f[d]]), f.total, max, false, (t) => devTip(t, f.label, f));
    const tr = el('tr'); tr.append(el('td', '', f.label)); for (const [d] of DEV) tr.append(el('td', 'num', nf.format(f[d]))); tr.append(el('td', 'num', nf.format(f.total))); tb.append(tr);
  });
  if (rows.length > TOP + 3) {
    const b = el('button', 'more', expanded ? 'Afficher seulement les ' + TOP + ' premières' : 'Afficher les ' + (rows.length - TOP) + ' autres, jusqu\'aux moins utilisées');
    b.type = 'button'; b.addEventListener('click', () => { expanded = !expanded; renderFeatures(); }); host.append(b);
  }
}
renderFeatures();

// Répartitions (une seule série : une couleur, la valeur au bout de la barre)
function dist(id, rows) {
  const host = $(id); host.style.position = 'relative';
  if (!rows.length) { host.append(el('div', 'empty', 'Pas encore de données.')); return; }
  const tot = sum(rows.map((r) => r.n)), max = Math.max(...rows.map((r) => r.n));
  for (const r of rows.slice(0, 8)) barRow(host, r.label, [['c-one', r.n]], r.n, max, true, (t) => { t.append(el('b', '', nf.format(Math.round(r.n / tot * 100)) + ' %')); t.append(el('span', 'k', r.label + ' · ' + nf.format(r.n))); });
}
dist('#versions', D.versions); dist('#systems', D.systems); dist('#devices', D.devices); dist('#langs', D.langs);

// Jamais utilisées
const un = $('#unused');
if (!D.unused.length) un.append(el('div', 'empty', 'Toutes les fonctions suivies ont servi au moins une fois.'));
for (const u of D.unused) un.append(el('span', '', u));

// Erreurs
const eh = $('#errors');
const KIND = { js: 'Interface', promise: 'Interface (tâche de fond)', server: 'Serveur de l\'appli' };
if (!D.errors.length) eh.append(el('div', 'empty', 'Aucune erreur signalée sur la période.'));
else {
  const wrap = el('div', 'errs-wrap'); const t = el('table', 'errs'); const h = el('tr');
  h.append(el('th', '', 'Erreur'), el('th', 'vcol', 'Versions'), el('th', 'vcol', 'Dernière'));
  for (const [, l] of [['desktop', 'Ordi.'], ['phone', 'Tél.'], ['browser', 'Navig.']]) h.append(el('th', 'num devcol', l));
  h.append(el('th', 'num', 'Total'));
  const th = el('thead'); th.append(h); t.append(th); const tb = el('tbody');
  for (const e of D.errors) {
    const tr = el('tr'); const c = el('td');
    const w = el('div', 'where'); w.append(el('code', '', e.place === 'other' ? 'endroit inconnu' : e.place));
    if (e.kind) w.append(el('span', 'kind ' + e.kind, KIND[e.kind] || e.kind));
    c.append(w);
    if (e.legacy) c.append(el('div', 'msg none', 'Pas de détail : version d\'avant le détail des erreurs (1.27.4 ou avant)'));
    else { c.append(el('div', 'msg' + (e.msg ? '' : ' none'), e.msg || 'Pas de message')); if (e.stack) c.append(el('div', 'stack', e.stack)); }
    const vname = (x) => (x.v === 'dev' ? 'dev' : 'v' + x.v);
    const vs = el('div', 'vers'); for (const x of e.versions) vs.append(el('span', '', vname(x) + ' · ' + nf.format(x.n)));
    const vt = el('td', 'vcol'); vt.append(vs);
    c.append(el('div', 'mob', e.versions.map(vname).join(', ') + (e.last ? ' · ' + dfmt(e.last) : '')));
    tr.append(c, vt, el('td', 'vcol', e.last ? dfmt(e.last) : ''));
    for (const [d] of DEV) tr.append(el('td', 'num devcol', nf.format(e[d])));
    tr.append(el('td', 'num', nf.format(e.total))); tb.append(tr);
  }
  t.append(tb); wrap.append(t); eh.append(wrap);
}
`;
