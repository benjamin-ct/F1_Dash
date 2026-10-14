// Espace « Actu » : toute l'actualité de la F1 au même endroit (F1, FIA, écuries, pilotes, médias
// du monde entier), traduite en français sur l'ordinateur, avec des alertes pour ce qui compte.
import { $, $$, esc, api, storageGet, storageSet, drivers, teamColor } from '../util.js';
import { store, on } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { NEWS_TEAMS, newsTags } from '/shared/news.js';
import { translateText } from './transcribe.js';
import { notifyNews } from './alerts.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';

const LANG = 'fr';
const CAT_LABEL = { official: 'Officiel', team: 'Écurie', driver: 'Pilote', media: 'Média' };
const LANG_LABEL = { en: 'Anglais', fr: 'Français', es: 'Espagnol', it: 'Italien', de: 'Allemand', nl: 'Néerlandais', pt: 'Portugais', ja: 'Japonais', zh: 'Chinois' };
const TEAM_NAME = Object.fromEntries(NEWS_TEAMS.map(([k, name]) => [k, name]));
const SEEN_KEY = 'f1dash.newsSeen';
const ALERTED_KEY = 'f1dash.newsAlerted';
const PAGE = 60;

let items = [];                // du plus récent au plus ancien
let sources = [];
let srcById = {};
let section = 'all';
let lang = 'all';
let query = '';
let tagFilter = null;          // étiquette choisie dans la colonne de droite (pilote ou écurie)
let limit = PAGE;
let loaded = null;
// Première ouverture : tout ce qui existe déjà est considéré comme lu
let lastSeen = storageGet(SEEN_KEY, null) ?? (storageSet(SEEN_KEY, Date.now()), Date.now());
let revealSpoilers = false;
let cascadeUntil = 0;          // cartes en cascade juste après l'ouverture ou un changement de rubrique
const justArrived = new Set();  // nouvelles reçues pendant que l'espace est ouvert
let alertOwner = !navigator.locks;   // une seule fenêtre par appareil donne les alertes
const open = () => !$('#newsView').hidden;

navigator.locks?.request('f1dash-news-alerts', () => { alertOwner = true; return new Promise(() => {}); });

// ---- Traductions (gardées par le serveur, partagées avec le téléphone) ----
let cache = {};
let cacheLoaded = null;
const queue = [];
const queued = new Set();
const failed = new Set();
let translating = false;
let pendingSave = [];
let saveTimer = null;

function loadTranslations(force = false) {
  if (force) cacheLoaded = null;
  cacheLoaded ||= api(`/api/translations?lang=${LANG}`).then((d) => { cache = { ...cache, ...(d || {}) }; }).catch(() => {});
  return cacheLoaded;
}

const tr = (text) => cache[text]?.t || null;
const needs = (text, from) => text && from !== LANG && !cache[text] && !failed.has(text);

function saveTranslation(item) {
  pendingSave.push(item);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = pendingSave;
    pendingSave = [];
    api('/api/translations', { method: 'POST', body: { lang: LANG, items: list } }).catch(() => {});
  }, 1500);
}

// Une seule traduction d'actualité à la fois : les radios en direct restent prioritaires
async function pumpTranslations() {
  if (translating || !queue.length) return;
  translating = true;
  const { text, from, resolve } = queue.shift();
  try {
    const { text: out, q } = await translateText(text, LANG, 'news', from);
    if (out) {
      cache[text] = { t: out, q };
      saveTranslation({ en: text, t: out, q });
    }
    else failed.add(text);
  } catch { failed.add(text); /* moteur indisponible : texte d'origine */ }
  queued.delete(text);
  resolve?.();
  translating = false;
  scheduleRender();
  setTimeout(pumpTranslations, 30);
}

// urgent : en tête de file (alerte à traduire avant de l'afficher)
function translate(text, from, urgent = false) {
  if (!prefs.newsTranslate || !needs(text, from) || queued.has(text)) return Promise.resolve();
  if (store.isHost === false) {
    // Téléphone : l'ordinateur traduit ; on relit son cache un peu plus tard
    clearTimeout(translate.reload);
    translate.reload = setTimeout(() => loadTranslations(true).then(scheduleRender), 20000);
    return Promise.resolve();
  }
  queued.add(text);
  return new Promise((resolve) => {
    queue[urgent ? 'unshift' : 'push']({ text, from, resolve });
    pumpTranslations();
  });
}

// ---- Données ----
async function load() {
  loaded ||= api('/api/news').then((d) => {
    items = d.items || [];
    setSources(d.sources || []);
  }).catch(() => { loaded = null; });
  await Promise.all([loaded, loadTranslations()]);
}

function setSources(list) {
  sources = list;
  srcById = Object.fromEntries(list.map((s) => [s.id, s]));
}

async function reload() {
  loaded = null;
  await load();
  render();
}

// Écuries et pilotes favoris (étoile du classement) → étiquettes des actualités
function favTags() {
  const out = new Set();
  for (const [num, d] of Object.entries(drivers(store.state))) {
    if (!isFav(num)) continue;
    if (d.Tla) out.add(d.Tla);
    for (const t of newsTags(d.TeamName || '')) out.add(t);
  }
  return out;
}

// Anti-spoiler : pendant un replay ou une séance en cours, les titres sont masqués et les alertes
// suspendues (ils pourraient révéler un résultat pas encore vu)
function spoilerRisk() {
  if (prefs.spoilers || prefs.newsSpoilers === false) return false;
  if (store.status?.source?.mode === 'replay') return true;
  const st = store.state.SessionStatus?.Status;
  return st === 'Started' || st === 'Aborted';
}

// Articles regroupés par sujet : on montre le plus important (officiel d'abord), les autres en « repris par »
function groups(list) {
  const map = new Map();
  for (const it of list) {
    const k = it.cluster || it.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  const rank = (it) => (it.cat === 'official' ? 10 : 0) + (it.imp || 0) * 2 + (it.lang === LANG ? 1 : 0);
  return [...map.values()].map((g) => {
    g.sort((a, b) => rank(b) - rank(a) || a.t - b.t);
    const t = Math.max(...g.map((x) => x.t));
    return { lead: g[0], others: g.slice(1), t, imp: Math.max(...g.map((x) => x.imp || 0)), sources: new Set(g.map((x) => x.src)).size };
  }).sort((a, b) => b.t - a.t);
}

function matches(it, favs) {
  if (lang !== 'all' && it.lang !== lang) return false;
  if (srcById[it.src]?.enabled === false) return false;
  switch (section) {
    case 'important': if ((it.imp || 0) < 2 && (it.sources || 1) < 4) return false; break;
    case 'favs': if (!(it.tags || []).some((t) => favs.has(t))) return false; break;
    case 'video': if (it.kind !== 'video') return false; break;
    case 'official': case 'team': case 'driver': case 'media': if (it.cat !== section) return false; break;
    default: break;
  }
  if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
  if (query) {
    const q = query.toLowerCase();
    const hay = `${it.title} ${it.summary} ${tr(it.title) || ''} ${srcById[it.src]?.name || ''} ${(it.tags || []).map((t) => TEAM_NAME[t] || t).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Nouveau : publié et arrivé depuis la dernière visite de l'espace Actu
const isUnread = (it) => it.seen > lastSeen && it.t > lastSeen;

// ---- Affichage ----
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = new Date(t);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

function tagChips(tags) {
  const dl = Object.values(drivers(store.state));
  return (tags || []).slice(0, 5).map((t) => {
    const d = dl.find((x) => x.Tla === t);
    const color = d ? teamColor(d) : t === 'fia' ? '#3b82f6' : 'var(--muted)';
    return `<span class="nw-tag" style="--tc:${color}">${esc(TEAM_NAME[t] || t)}</span>`;
  }).join('');
}

function titleOf(it) {
  const t = prefs.newsTranslate && it.lang !== LANG ? tr(it.title) : null;
  return { text: t || it.title, translated: !!t, pending: !t && queued.has(it.title) };
}

function card(g, favs) {
  const it = g.lead;
  const src = srcById[it.src] || { name: it.src };
  const title = titleOf(it);
  const sum = prefs.newsTranslate && it.lang !== LANG ? tr(it.summary) : null;
  const unread = isUnread(it);
  const fav = (it.tags || []).some((t) => favs.has(t));
  const level = g.imp >= 3 ? '<span class="nw-imp major">Majeur</span>' : g.imp >= 2 ? '<span class="nw-imp">Important</span>' : '';
  const hot = g.sources >= 3 ? `<span class="nw-hot" title="Sujet repris par ${g.sources} sources">${icon('fire')} ${g.sources} sources</span>` : '';
  const img = it.img ? `<img class="nw-img" src="${esc(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.nw-thumb').remove()">` : '';
  const others = g.others.length ? `<details class="nw-others"><summary>Repris par ${g.others.length} autre${g.others.length > 1 ? 's' : ''} source${g.others.length > 1 ? 's' : ''}</summary>
    ${g.others.map((o) => `<a href="${esc(o.link)}" target="_blank" rel="noopener"><b>${esc(srcById[o.src]?.name || o.src)}</b> <span class="nw-lang">${esc(o.lang.toUpperCase())}</span> ${esc(titleOf(o).text)} <span class="muted">· ${ago(o.t)}</span></a>`).join('')}</details>` : '';
  return `<article class="nw-card${justArrived.has(it.id) ? ' arrived' : ''}${unread ? ' unread' : ''}${g.imp >= 2 ? ' imp' : ''}${fav ? ' fav' : ''}${it.kind === 'video' ? ' video' : ''}">
    ${img ? `<a class="nw-thumb" href="${esc(it.link)}" target="_blank" rel="noopener">${img}${it.kind === 'video' ? `<span class="nw-play">${icon('play')}</span>` : ''}</a>` : ''}
    <div class="nw-body">
      <div class="nw-meta"><span class="nw-src nw-c-${esc(it.cat)}">${esc(src.name)}</span><span class="nw-cat">${CAT_LABEL[it.cat] || ''}</span>
        <span class="nw-lang" title="Langue d'origine : ${esc(LANG_LABEL[it.lang] || it.lang)}">${esc(it.lang.toUpperCase())}</span><span class="nw-time" title="${esc(new Date(it.t).toLocaleString('fr-FR'))}">${ago(it.t)}</span>${level}${hot}${fav ? `<span class="nw-favmark" title="Concerne un de vos favoris">${icon('star-fill')}</span>` : ''}</div>
      <a class="nw-title" href="${esc(it.link)}" target="_blank" rel="noopener" ${title.translated ? `title="${esc(it.title)}"` : ''}>${esc(title.text)}</a>
      ${title.pending ? '<div class="nw-trans muted">Traduction en cours…</div>' : title.translated ? '<div class="nw-trans muted" title="Traduit automatiquement sur cet ordinateur">Traduit · <button class="nw-vo" data-vo>VO</button></div>' : ''}
      <div class="nw-vo-text" hidden>${esc(it.title)}</div>
      ${it.summary ? `<p class="nw-sum">${esc(sum || it.summary)}</p>` : ''}
      <div class="nw-tags">${tagChips(it.tags)}</div>
      ${others}
    </div>
  </article>`;
}

function sourcesView() {
  const by = { official: [], team: [], driver: [], media: [] };
  for (const s of sources) (by[s.cat] || by.media).push(s);
  const row = (s) => {
    const state = !s.enabled ? '<span class="muted">désactivée</span>' : s.ok === false ? `<span class="nw-err" title="${esc(s.error || '')}">${icon('warning')} indisponible</span>` : s.ok ? `<span class="nw-ok">${icon('check')} ${s.count} article${s.count > 1 ? 's' : ''}</span>` : '<span class="muted">en attente…</span>';
    const kind = s.kind === 'youtube' ? 'YouTube' : s.kind === 'bsky' ? 'Bluesky' : 'Flux RSS';
    return `<tr><td><label class="toggle"><input type="checkbox" data-src-toggle="${esc(s.id)}" ${s.enabled ? 'checked' : ''}> ${esc(s.name)}</label></td>
      <td class="muted">${kind}</td><td>${esc((s.lang || '').toUpperCase())}</td><td>${state}</td>
      <td>${s.custom ? `<button class="btn small" data-src-del="${esc(s.id)}" title="Retirer cette source">${icon('close')}</button>` : ''}</td></tr>`;
  };
  const block = (cat, title) => (by[cat].length ? `<div class="sz-box"><h3>${title}</h3><table class="sz-table nw-src-table">${by[cat].map(row).join('')}</table></div>` : '');
  return `<div class="sz-box"><h3>${icon('plus')} Ajouter une source</h3>
      <p class="muted small">Adresse d'un site ou de son flux RSS, d'une chaîne YouTube (ex. https://www.youtube.com/@Formula1) ou d'un compte Bluesky (ex. @compte.bsky.social).</p>
      <form class="nw-add" id="nwAdd"><input type="text" id="nwAddUrl" placeholder="https://… ou @compte.bsky.social" required>
        <select id="nwAddCat"><option value="media">Média</option><option value="team">Écurie</option><option value="driver">Pilote</option><option value="official">Officiel</option></select>
        <button class="btn" type="submit">Ajouter</button></form>
      <p class="muted small">X (Twitter), Instagram et TikTok ne sont pas proposés : ces réseaux n'offrent pas d'accès gratuit à leurs publications. Les annonces officielles qui y paraissent sont reprises par la F1, les écuries et les médias ci-dessous.</p></div>
    ${block('official', `${icon('landmark')} Officiel : F1 et FIA`)}${block('team', `${icon('car')} Écuries (chaînes officielles)`)}${block('driver', `${icon('user')} Pilotes (chaînes officielles)`)}${block('media', `${icon('globe')} Médias`)}`;
}

// Nom affiché d'une étiquette : pilote (nom de famille du classement si connu) ou écurie
function tagName(t) {
  if (TEAM_NAME[t]) return TEAM_NAME[t];
  const d = Object.values(drivers(store.state)).find((x) => x.Tla === t);
  return d?.LastName ? `${d.LastName}` : t;
}

function tagColor(t) {
  const d = Object.values(drivers(store.state)).find((x) => x.Tla === t);
  return d ? teamColor(d) : t === 'fia' ? '#3b82f6' : 'var(--muted)';
}

// Colonne de droite : sujets à la une, qui fait l'actu, dernières vidéos
function asideView(all) {
  const now = Date.now();
  const recent = all.filter((it) => it.t > now - 48 * 3600e3);
  const top = groups(recent).filter((g) => g.sources >= 2 || g.imp >= 2)
    .sort((a, b) => b.sources - a.sources || b.imp - a.imp || b.t - a.t).slice(0, 6);
  const day = groups(all.filter((it) => it.t > now - 24 * 3600e3));
  const counts = new Map();
  for (const g of day) for (const t of new Set(g.lead.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  const who = [...counts].filter(([t]) => t !== 'fia').sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = who[0]?.[1] || 1;
  const videos = all.filter((it) => it.kind === 'video' && it.img).slice(0, 4);
  // Titres de la colonne traduits comme ceux du fil
  for (const it of [...top.map((g) => g.lead), ...videos]) translate(it.title, it.lang);
  const topHtml = top.length ? top.map((g, i) => `<a class="nwa-top" href="${esc(g.lead.link)}" target="_blank" rel="noopener">
      <span class="nwa-rank">${i + 1}</span><span class="nwa-txt"><b>${esc(titleOf(g.lead).text)}</b>
      <span class="muted small">${g.sources} source${g.sources > 1 ? 's' : ''} · ${ago(g.t)}</span></span></a>`).join('')
    : '<div class="muted small">Pas encore de sujet repris par plusieurs sources.</div>';
  const whoHtml = who.length ? who.map(([t, n]) => `<button class="nwa-who${tagFilter === t ? ' on' : ''}" data-tag="${esc(t)}" style="--tc:${tagColor(t)}" title="Afficher seulement les sujets qui citent ${esc(tagName(t))}">
      <span class="nwa-who-name">${esc(tagName(t))}</span><span class="nwa-bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span><span class="nwa-n">${n}</span></button>`).join('')
    : '<div class="muted small">Rien sur les dernières 24 heures.</div>';
  const vidHtml = videos.length ? `<div class="nwa-vids">${videos.map((v) => `<a href="${esc(v.link)}" target="_blank" rel="noopener" title="${esc(v.title)}">
      <span class="nwa-vthumb"><img src="${esc(v.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${icon('play')}</span>
      <span class="nwa-vtitle">${esc(titleOf(v).text)}</span><span class="muted small">${esc(srcById[v.src]?.name || '')}</span></a>`).join('')}</div>` : '<div class="muted small">Aucune vidéo récente.</div>';
  return `<aside class="nw-aside">
    <section class="nwa-box"><h3>${icon('fire')} À la une <span class="muted small">48 h</span></h3>${topHtml}</section>
    <section class="nwa-box"><h3>${icon('chart')} Qui fait l'actu <span class="muted small">24 h</span></h3>${whoHtml}</section>
    <section class="nwa-box"><h3>${icon('video')} Dernières vidéos</h3>${vidHtml}</section>
  </aside>`;
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; if (open()) render(); });
}

function render() {
  updateBadge();
  if (!open()) return;
  $$('#nwNav [data-nw]').forEach((b) => b.classList.toggle('active', b.dataset.nw === section));
  const el = $('#nwContent');
  if (section === 'sources') { el.innerHTML = sourcesView(); return; }
  const favs = favTags();
  const list = groups(items.filter((it) => matches(it, favs)));
  const shown = list.slice(0, limit);
  const guard = spoilerRisk() && !revealSpoilers;
  const okSources = sources.filter((s) => s.enabled && s.ok !== false).length;
  const head = `<div class="nw-head"><div><h2>${$(`#nwNav [data-nw="${section}"]`)?.innerHTML.trim() || 'Actualités'}</h2>
      <div class="muted small">${tagFilter ? `<button class="nw-filter" data-tag-clear style="--tc:${tagColor(tagFilter)}">${esc(tagName(tagFilter))} ${icon('close')}</button> ` : ''}${okSources} sources suivies · ${list.length} sujet${list.length > 1 ? 's' : ''}${section === 'favs' && !favTags().size ? ' · aucun favori : ajoutez-en avec l\'étoile du classement' : ''}</div></div>
      <div class="nw-actions"><button class="btn small" id="nwRefresh" title="Relire toutes les sources maintenant">${icon('refresh')} Actualiser</button>
      <button class="btn small" id="nwMarkRead" title="Plus de pastille « nouveau » sur les articles déjà là">${icon('check')} Tout marquer comme lu</button></div></div>`;
  const banner = guard ? `<div class="nw-guard">${icon('eye-off')} <b>Anti-spoiler</b> : ${store.status?.source?.mode === 'replay' ? 'replay' : 'séance'} en cours, les titres sont masqués et les alertes d'actualité suspendues.
      <button class="btn small" id="nwReveal">Afficher quand même</button></div>` : '';
  const body = shown.length
    ? `<div class="nw-list${guard ? ' guarded' : ''}${Date.now() < cascadeUntil ? ' cascade' : ''}">${shown.map((g) => card(g, favs)).join('')}</div>${list.length > limit ? '<button class="btn nw-more" id="nwMore">Voir plus</button>' : ''}`
    : `<div class="sz-box muted">${loaded ? 'Aucune actualité pour ces filtres.' : 'Chargement des actualités…'}</div>`;
  const keep = el.scrollTop;
  const visible = items.filter((it) => srcById[it.src]?.enabled !== false);
  el.innerHTML = `<div class="nw-layout${guard ? ' guarded' : ''}"><div class="nw-feed">${head}${banner}${body}</div>${asideView(visible)}</div>`;
  el.scrollTop = keep;
  justArrived.clear();
  // Titres affichés traduits en priorité, puis les résumés des premiers sujets
  for (const g of shown.slice(0, 40)) translate(g.lead.title, g.lead.lang);
  for (const g of shown.slice(0, 12)) if (g.lead.summary) translate(g.lead.summary, g.lead.lang);
}

function updateBadge() {
  const n = items.filter((it) => isUnread(it) && srcById[it.src]?.enabled !== false).length;
  for (const b of [$('#newsBtn'), $('#rail [data-rail="news"]')]) {
    if (!b) continue;
    const v = n > 99 ? '99+' : String(n);
    if (n && b.dataset.count !== v) {
      if (Number(v) > Number(b.dataset.count || 0) || v === '99+') { b.classList.remove('count-pop'); void b.offsetWidth; b.classList.add('count-pop'); }
      b.dataset.count = v;
    } else if (!n) delete b.dataset.count;
  }
}

function markRead() {
  lastSeen = Date.now();
  storageSet(SEEN_KEY, lastSeen);
  render();
}

// ---- Alertes ----
function alerted() { return new Set(storageGet(ALERTED_KEY, [])); }
function rememberAlert(k) {
  const list = [...alerted(), k].slice(-400);
  storageSet(ALERTED_KEY, list);
}

function wantsAlert(it, favs) {
  const level = prefs.newsAlerts || 'important';
  if (level === 'off' || !it.fresh) return false;
  if (srcById[it.src]?.enabled === false) return false;
  const important = (it.imp || 0) >= 2 || (it.sources || 1) >= 4;
  const fav = (it.tags || []).some((t) => favs.has(t));
  if (level === 'all') return true;
  if (level === 'favs') return fav;
  return important || (fav && (it.imp || 0) >= 1);
}

async function onFresh(list) {
  if (!alertOwner || spoilerRisk()) return;
  const favs = favTags();
  const done = alerted();
  for (const it of list) {
    const key = it.cluster || it.id;
    if (done.has(key) || !wantsAlert(it, favs)) continue;
    done.add(key);
    rememberAlert(key);
    // Traduit avant l'alerte (15 s au plus), sinon texte d'origine
    await Promise.race([translate(it.title, it.lang, true), new Promise((r) => setTimeout(r, 15000))]);
    const src = srcById[it.src]?.name || it.src;
    const title = titleOf(it).text;
    notifyNews(`${src}${it.sources >= 4 ? ` · ${it.sources} sources` : ''}`, title, (it.imp || 0) >= 2 ? 'info' : 'fav', () => { openNews(); });
  }
}

on('news', (list) => {
  if (!Array.isArray(list) || !list.length) return;
  const known = new Set(items.map((x) => x.id));
  const sizes = {};
  for (const it of list) sizes[it.cluster] = it.sources;
  for (const it of items) if (sizes[it.cluster]) it.sources = sizes[it.cluster];
  const fresh = list.filter((x) => !known.has(x.id));
  items = [...fresh.map(({ fresh: f, ...x }) => x), ...items].sort((a, b) => b.t - a.t);
  for (const it of fresh) justArrived.add(it.id);
  // L'ordinateur traduit tout de suite les titres des nouvelles (servent aussi au téléphone)
  if (store.isHost !== false && alertOwner) for (const it of fresh) translate(it.title, it.lang);
  onFresh(fresh);
  scheduleRender();
  updateBadge();
  // Une nouvelle source a répondu : on rafraîchit leur état si la page Sources est ouverte
  if (section === 'sources') reloadSources();
});

on('prefs', (k) => { if (k === 'favs' && open()) scheduleRender(); });

async function reloadSources() {
  try { setSources((await api('/api/news')).sources || []); } catch { /* ignore */ }
  if (open()) render();
}

// ---- Ouverture / fermeture ----
export function openNews(sec) {
  if (sec) section = sec;
  import('./season.js').then((m) => m.closeSeason());
  $('#newsView').style.top = `${Math.round(document.querySelector('.topbar').getBoundingClientRect().bottom)}px`;
  $('#newsView').hidden = false;
  $('#newsBtn')?.classList.add('on');
  limit = PAGE;
  cascadeUntil = Date.now() + 400;
  load().then(render);
  render();
  clearInterval(openNews.timer);
  openNews.timer = setInterval(() => { if (open()) scheduleRender(); }, 60000);
}

export function closeNews() {
  if ($('#newsView').hidden) return;
  $('#newsView').hidden = true;
  $('#newsBtn')?.classList.remove('on');
  clearInterval(openNews.timer);
  // Ce qui a été vu est marqué comme lu
  markRead();
}

export const isNewsOpen = open;

export function initNews() {
  const alertsSel = $('#nwAlerts');
  alertsSel.value = prefs.newsAlerts || 'important';
  alertsSel.addEventListener('change', () => setPref('newsAlerts', alertsSel.value));
  $('#nwTranslate').checked = prefs.newsTranslate !== false;
  $('#nwTranslate').addEventListener('change', (e) => { setPref('newsTranslate', e.target.checked); render(); });
  $('#nwSpoilers').checked = prefs.newsSpoilers !== false;
  $('#nwSpoilers').addEventListener('change', (e) => { setPref('newsSpoilers', e.target.checked); render(); });
  $('#nwLang').addEventListener('change', (e) => { lang = e.target.value; limit = PAGE; render(); });
  let t = null;
  $('#nwSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); limit = PAGE; render(); }, 200); });
  $('#newsBtn')?.addEventListener('click', () => (open() ? closeNews() : openNews()));
  $('#nwClose').addEventListener('click', closeNews);
  $('#nwNav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nw]');
    if (!b) return;
    section = b.dataset.nw;
    limit = PAGE;
    cascadeUntil = Date.now() + 400;
    if (section === 'sources') reloadSources();
    render();
    $('#nwContent').scrollTop = 0;
  });
  $('#nwContent').addEventListener('click', async (e) => {
    if (e.target.closest('#nwMore')) { limit += PAGE; render(); return; }
    if (e.target.closest('#nwRefresh')) { api('/api/news/refresh', { method: 'POST' }).catch(() => {}); toast('Lecture de toutes les sources…'); setTimeout(reload, 15000); return; }
    if (e.target.closest('#nwMarkRead')) { markRead(); return; }
    if (e.target.closest('#nwReveal')) { revealSpoilers = true; render(); return; }
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) { tagFilter = tagFilter === tagBtn.dataset.tag ? null : tagBtn.dataset.tag; limit = PAGE; render(); $('#nwContent').scrollTop = 0; return; }
    if (e.target.closest('[data-tag-clear]')) { tagFilter = null; render(); return; }
    const vo = e.target.closest('[data-vo]');
    if (vo) {
      const card = vo.closest('.nw-card');
      const box = card.querySelector('.nw-vo-text');
      box.hidden = !box.hidden;
      return;
    }
    const del = e.target.closest('[data-src-del]');
    if (del) {
      await api('/api/news/sources', { method: 'POST', body: { remove: del.dataset.srcDel } }).catch(() => {});
      items = items.filter((it) => it.src !== del.dataset.srcDel);
      reloadSources();
    }
  });
  $('#nwContent').addEventListener('change', async (e) => {
    const tg = e.target.closest('[data-src-toggle]');
    if (!tg) return;
    await api('/api/news/sources', { method: 'POST', body: { toggle: tg.dataset.srcToggle, on: tg.checked } }).catch(() => {});
    reloadSources();
  });
  $('#nwContent').addEventListener('submit', async (e) => {
    if (e.target.id !== 'nwAdd') return;
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    try {
      const r = await api('/api/news/sources', { method: 'POST', body: { add: $('#nwAddUrl').value, cat: $('#nwAddCat').value } });
      toast(`Source ajoutée : ${r.source?.name || ''}`, 4000);
      setTimeout(reload, 8000);
      await reloadSources();
    } catch (err) {
      toast(`Impossible d'ajouter cette source : ${err.message}`, 6000);
      btn.disabled = false;
      btn.textContent = 'Ajouter';
    }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open() && !document.querySelector('dialog[open]')) closeNews(); });
  // Liste chargée au démarrage : pastille du nombre de nouveautés
  load().then(updateBadge);
}
