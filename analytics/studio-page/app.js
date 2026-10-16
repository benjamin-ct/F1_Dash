// Studio : page web du créateur, pour préparer et publier les posts quand l'appli de bureau n'est pas
// à portée (téléphone). Grosses news de la F1 et résultats des séances, mêmes visuels et mêmes textes
// que dans l'appli (code partagé), publication sur Facebook, Instagram et Threads par le serveur
// Paddock Live après confirmation, ou partage vers les autres applis (X, TikTok…) depuis le téléphone.
import { clusterNews } from '/shared/news.js';
import { feedItems, decodeBody } from '/shared/news-collect.js';
import { bigNews, newsPost, newsCaptions, newsKind } from '/shared/social-news.js';
import { postData, captions } from '/shared/social.js';
import { preraceData, champData, flashEvents, flashData, moreCaptions, FLASH_KINDS } from '/shared/social-more.js';
import { builtinNomination } from '/shared/tyres.js';
import { CHAMPIONSHIP, parseSeasons, parseDocumentList, pickEvent } from '/shared/fia-list.js';
import { gridDocument, parseStartingGrid } from '/shared/fia-grid.js';
import { slidesFor, drawSlide, SLIDE_NAMES } from '/shared/social-draw.js';
import { merge } from '/shared/merge.js';
import { gpNameFr } from '/shared/summary.js';
import { FLAG_ISO } from '/shared/flags.js';
import { postedEntry } from '/shared/post-history.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const KEY = 'studio.key';
const SIG = '@BenjyPaddock';
const TOPICS = ['SessionInfo', 'SessionStatus', 'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages', 'LapCount', 'ChampionshipPrediction', 'WeatherData'];

let key = null;
try { key = localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch { /* stockage bloqué */ }
let me = null;
const state = { tab: 'news', fmt: 'ig', noSpoiler: true, photos: true, all: false, linkComment: true };
let news = null;        // nouvelles lues (toutes sources)
let sessions = null;    // séances de la saison
let lastDrivers = {};   // liste des pilotes de la dernière séance lue (photos des news)
const frCache = new Map();
const imgCache = new Map();

// ---------- Accès ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function deriveKey(code) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim().toUpperCase()), 'PBKDF2', false, ['deriveBits']);
  return b64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('paddock-live-studio'), iterations: 200000, hash: 'SHA-256' }, base, 256));
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`/studio/api/${path}`, { method, body, headers: { 'X-Studio-Key': key || '' } });
  if (res.status === 401) { logout(); throw new Error('Code incorrect'); }
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    return res;
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j;
}

function logout() {
  key = null;
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  me = null;
  login();
}

function login(error = '') {
  app.innerHTML = `<form class="login">
      <h1>Paddock <b>Studio</b></h1>
      <p class="muted small">Posts des séances et des grosses news, publiés depuis votre téléphone.</p>
      <input type="password" id="code" autocomplete="current-password" placeholder="Code du mode créateur" required>
      <label class="check"><input type="checkbox" id="keep" checked> Rester connecté sur cet appareil</label>
      <p class="err small">${esc(error)}</p>
      <button class="accent" style="width:100%">Entrer</button>
    </form>`;
  $('#code').focus();
  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('form button');
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    key = await deriveKey($('#code').value);
    try {
      me = await api('me');
      try { ($('#keep').checked ? localStorage : sessionStorage).setItem(KEY, key); } catch { /* ignore */ }
      afterLogin();
    } catch (err) { login(err.message); }
  };
}

// ---------- Outils ----------
async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}
const ago = (ts) => { const m = Math.max(1, Math.round((Date.now() - ts) / 60e3)); return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`; };

// Textes en français (traduction partagée du serveur Paddock Live, gardée en mémoire)
async function toFrench(list) {
  const todo = list.filter((x) => x.text && x.from !== 'fr' && !frCache.has(`${x.from}|${x.text}`));
  for (let i = 0; i < todo.length; i += 30) {
    const part = todo.slice(i, i + 30).map((x) => ({ text: x.text.slice(0, 1500), from: x.from }));
    const res = await fetch('/t', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'fr', items: part }) }).then((r) => r.json()).catch(() => ({}));
    todo.slice(i, i + 30).forEach((x, j) => { if (res.out?.[j]) frCache.set(`${x.from}|${x.text}`, res.out[j]); });
  }
  return list.map((x) => (!x.text || x.from === 'fr' ? x.text : frCache.get(`${x.from}|${x.text}`) ?? null));
}

// Images (photos des pilotes, drapeaux) par le relais du serveur : utilisables dans les visuels
function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, api(`img?u=${encodeURIComponent(url)}`, { raw: true }).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null));
  }
  return imgCache.get(url);
}
async function headshot(url) {
  if (!url) return null;
  const big = url.replace(/\.transform\/\dcol\//, '.transform/4col/');
  return (big !== url && await loadImage(big)) || loadImage(url);
}
async function assets(d) {
  await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '600 30px "Titillium Web"', '400 30px "Titillium Web"', '700 30px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => {})));
  const photos = {};
  if (state.photos) await Promise.all((d.rows || []).slice(0, 3).map(async (r) => { photos[r.num] = await headshot(r.headshot); }));
  const iso = FLAG_ISO[String(d.country || '').toUpperCase()];
  return { photos, flag: iso ? await loadImage(`https://flagcdn.com/w160/${iso}.png`) : null, signature: SIG };
}

// ---------- News ----------
async function loadNews() {
  const now = Date.now();
  const items = [];
  await mapLimit(me.sources, 6, async (s) => {
    try { items.push(...feedItems(s, await decodeBody(await api(`feed?id=${encodeURIComponent(s.id)}`, { raw: true })), now)); } catch { /* source indisponible */ }
  });
  items.sort((a, b) => a.t - b.t);
  clusterNews(items);
  const sizes = new Map();
  for (const it of items) { if (!sizes.has(it.cluster)) sizes.set(it.cluster, new Set()); sizes.get(it.cluster).add(it.src); }
  for (const it of items) it.sources = sizes.get(it.cluster).size;
  return items;
}

async function newsTab(body) {
  body.innerHTML = '<p class="muted">Lecture des sources d\'actu…</p>';
  news ||= await loadNews();
  const list = bigNews(news, { all: state.all }).slice(0, 40);
  const history = (await api('history').catch(() => ({}))).items || [];
  const posted = list.map((it) => postedEntry(it, history));
  const titles = await toFrench(list.map((it) => ({ text: it.title, from: it.lang })));
  body.innerHTML = `<div id="alerts" class="alerts"></div>
    <div class="row"><label class="check"><input type="checkbox" id="all" ${state.all ? 'checked' : ''}> Toutes les actus (48 h)</label><span class="spacer"></span><button id="reload">Actualiser</button></div>
    ${list.length ? '' : '<p class="muted">Aucune grosse news ces dernières 48 heures.</p>'}
    <div class="list">${list.map((it, i) => { const k = newsKind(it); return `<button class="card" data-i="${i}"><span class="badge" style="background:${k.color}">${esc(k.label)}</span>${posted[i] ? ' <span class="badge" style="background:#8E97A6">PUBLIÉE ✓</span>' : ''}
      <div class="t">${esc(titles[i] || it.title)}</div><div class="small muted">${esc(it.srcName)} · il y a ${ago(it.t)}${it.sources > 1 ? ` · ${it.sources} médias` : ''}</div></button>`; }).join('')}</div>`;
  $('#all').onchange = (e) => { state.all = e.target.checked; newsTab(body); };
  $('#reload').onclick = () => { news = null; newsTab(body); };
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => newsEditor(list[Number(b.dataset.i)], posted[Number(b.dataset.i)]); });
  alertsBlock($('#alerts'));
}

// ---------- Alertes des grosses news sur ce téléphone (notifications) ----------
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushReady = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function currentSub() {
  if (!pushReady()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/studio/');
  return reg ? reg.pushManager.getSubscription() : null;
}

async function enableAlerts() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées : autorisez-les pour cette page dans les réglages du téléphone');
  const { key: server } = await api('push');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Abonnement fait avec une autre clé du serveur : refait
  const same = sub?.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === server;
  if (sub && !same) { await sub.unsubscribe(); sub = null; }
  try {
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server) });
  } catch (err) { throw new Error(`Abonnement refusé par le navigateur (${err.message}). Navigation privée : les notifications n'y fonctionnent pas.`); }
  await api('push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
}

async function alertsBlock(el) {
  if (!el) return;
  if (!pushReady()) {
    el.innerHTML = `<p class="note small">${IOS && !installed() ? 'Alertes des grosses news : sur iPhone, ajoutez d\'abord cette page à l\'écran d\'accueil (bouton Partager → « Sur l\'écran d\'accueil »), puis ouvrez-la depuis l\'icône.' : 'Alertes indisponibles dans ce navigateur.'}</p>`;
    return;
  }
  const sub = await currentSub().catch(() => null);
  const on = !!sub && Notification.permission === 'granted';
  el.innerHTML = `<div class="row small"><span>${on ? 'Alertes des grosses news actives sur ce téléphone' : 'Recevoir une alerte à chaque grosse news (transfert, pénalité, annonce officielle…)'}</span><span class="spacer"></span>
    ${on ? '<button id="alerttest">Tester</button><button id="alertoff">Couper</button>' : '<button class="accent" id="alerton">Activer</button>'}</div><p class="small err" id="alerterr"></p>`;
  const fail = (err) => { $('#alerterr').textContent = err.message; };
  if ($('#alerton')) $('#alerton').onclick = () => enableAlerts().then(() => alertsBlock(el)).catch(fail);
  if ($('#alerttest')) $('#alerttest').onclick = () => api('push/test', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).then(() => { $('#alerterr').textContent = 'Envoyée : elle arrive dans quelques secondes.'; }).catch(fail);
  if ($('#alertoff')) $('#alertoff').onclick = async () => { try { await api('push/off', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); alertsBlock(el); } catch (err) { fail(err); } };
}

// Notification touchée : post de la news prêt à relire
async function openAlert(id) {
  if (!id) return;
  try {
    const it = ((await api('alerts')).items || []).find((a) => a.id === id);
    if (!it) return;
    const history = (await api('history').catch(() => ({}))).items || [];
    state.tab = 'news';
    newsEditor(it, postedEntry(it, history));
  } catch { /* alerte introuvable : liste des news */ }
}

async function latestDrivers() {
  if (Object.keys(lastDrivers).length) return lastDrivers;
  try {
    const list = await seasonSessions();
    const s = list[0];
    if (s) lastDrivers = (await loadState(s.path, ['DriverList'])).DriverList || {};
  } catch { /* archives indisponibles : pas de photo */ }
  return lastDrivers;
}

const NET_NAMES = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', x: 'X', bluesky: 'Bluesky', tiktok: 'TikTok' };

async function newsEditor(it, done = null) {
  const [title, summary] = await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const failed = title === null || summary === null;
  const make = async (t, s) => newsPost(it, { title: t, summary: s, driverList: await latestDrivers(), sourceName: it.srcName });
  let d = await make(title ?? it.title, summary ?? it.summary);
  editor({
    back: () => home(),
    head: `<span class="badge" style="background:${d.badge.color}">${esc(d.badge.label)}</span>
      ${done ? `<p class="note">✓ Déjà publiée le ${esc(new Date(done.at).toLocaleString('fr-FR'))} sur ${esc(Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', '))}</p>` : ''}
      <p class="small muted">${esc(it.srcName)} · il y a ${ago(it.t)} · <a class="muted" href="${esc(it.link)}" target="_blank" rel="noopener">lire l'article</a></p>
      <label>Titre</label><input type="text" id="ntitle" maxlength="160" value="${esc(d.title)}">
      <label>Résumé</label><textarea id="nsum" rows="4" maxlength="400">${esc(d.summary)}</textarea>
      <label class="check"><input type="checkbox" id="linkcomment" ${state.linkComment ? 'checked' : ''}> Lien de l'article en premier commentaire (Facebook, Threads, Bluesky, X)</label>
      <p class="note">${failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : 'Titre et résumé traduits automatiquement : relisez-les et corrigez-les si besoin. Ni photo ni texte de l\'article repris, la source est citée.'}</p>`,
    data: () => d,
    caps: () => newsCaptions(d, SIG, { linkInComment: state.linkComment }),
    record: () => ({ key: `news:${it.id}`, kind: 'news', title: d.title, srcTitle: it.title, link: it.link || '', summary: String(it.summary || '').slice(0, 300) }),
    bind: (redraw) => {
      let tm = null;
      const upd = () => { clearTimeout(tm); tm = setTimeout(async () => { d = await make($('#ntitle').value, $('#nsum').value); redraw(true); }, 400); };
      $('#ntitle').oninput = upd;
      $('#linkcomment').onchange = (e) => { state.linkComment = e.target.checked; redraw(true); };
      $('#nsum').oninput = upd;
    },
  });
}

// ---------- Séances (archives de la F1) ----------
const parseStream = (text, topic) => {
  const out = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^(\d+):(\d\d):(\d\d)\.(\d+)(.*)$/.exec(line);
    if (!m) continue;
    try { out.push({ off: ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Math.round(+`0.${m[4]}` * 1000), topic, data: JSON.parse(m[5]) }); } catch { /* ligne illisible */ }
  }
  return out;
};

async function loadState(path, topics = TOPICS) {
  const parts = await mapLimit(topics, 4, async (t) => {
    try { return parseStream(await (await api(`archive?p=${encodeURIComponent(`${path}${t}.jsonStream`)}`, { raw: true })).text(), t); } catch { return []; }
  });
  const events = parts.flat().sort((a, b) => a.off - b.off);
  if (!events.length) throw new Error('Archive de la séance indisponible (pas encore publiée, ou connexion F1 TV à renouveler dans l\'appli)');
  const st = {};
  for (const e of events) st[e.topic] = merge(st[e.topic], e.data);
  return st;
}

async function seasonSessions() {
  if (sessions) return sessions;
  const year = new Date().getUTCFullYear();
  const out = [];
  for (const y of [year, year - 1]) {
    try {
      const idx = JSON.parse((await (await api(`archive?p=${y}/Index.json`, { raw: true })).text()).replace(/^﻿/, ''));
      for (const m of idx.Meetings || []) {
        for (const s of m.Sessions || []) {
          if (!s.Path || !s.EndDate) continue;
          const end = Date.parse(`${s.EndDate}Z`) - (parseOffset(s.GmtOffset) || 0);
          if (!(end < Date.now())) continue;
          out.push({ path: s.Path, name: s.Name, type: s.Type, end, gp: m.Name, country: m.Country?.Code });
        }
      }
      if (out.length) break;
    } catch { /* année absente */ }
  }
  sessions = out.sort((a, b) => b.end - a.end).slice(0, 30);
  return sessions;
}
function parseOffset(v) {
  const m = /^\s*([+-])?(\d{1,2}):(\d{2})/.exec(String(v || ''));
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60e3 : 0;
}
const SESSION_FR = (n) => String(n).replace(/^Practice (\d)$/, 'Essais libres $1').replace('Sprint Qualifying', 'Qualifications sprint').replace('Sprint Shootout', 'Qualifications sprint').replace(/^Qualifying$/, 'Qualifications').replace(/^Race$/, 'Course');

async function sessionsTab(body) {
  body.innerHTML = '<p class="muted">Lecture du calendrier…</p>';
  let list;
  try { list = await seasonSessions(); } catch (err) { body.innerHTML = `<p class="err">${esc(err.message)}</p>`; return; }
  if (!list.length) {
    body.innerHTML = `<p class="note">${me.f1tv ? 'Archives indisponibles pour le moment.' : 'Les archives de la F1 sont réservées aux abonnés F1 TV : connectez F1 TV dans l\'appli (Réglages → Compte F1 TV), puis réactivez la page (Posts → Publier… → Comptes…).'}</p>`;
    return;
  }
  body.innerHTML = `<div class="list">${list.map((s, i) => `<button class="card" data-i="${i}"><div class="t">${esc(SESSION_FR(s.name))}</div><div class="small muted">${esc(gpNameFr(s.gp).replace(/^le /, ''))} · il y a ${ago(s.end)}</div></button>`).join('')}</div>`;
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => sessionEditor(list[Number(b.dataset.i)], b); });
}

// ---------- Grille de départ officielle (document de la FIA, lu dans le navigateur) ----------
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
const fiaGet = (p) => api(`fia?p=${encodeURIComponent(p)}`, { raw: true });
async function pdfItems(buf) {
  const lib = await import(`${PDFJS}/pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  const pdf = await lib.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
  }
  return pages;
}
async function fiaGrid(year, meeting, sprint) {
  const { bySeason, events } = parseSeasons(await (await fiaGet(CHAMPIONSHIP)).text());
  const event = bySeason[year] && pickEvent(events, meeting);
  if (!event) return null;
  const doc = gridDocument(parseDocumentList(await (await fiaGet(`${bySeason[year]}/event/${encodeURIComponent(event)}`)).text()), { sprint });
  if (!doc) return null;
  const grid = parseStartingGrid(await pdfItems(await (await fiaGet(new URL(doc.url).pathname)).arrayBuffer()));
  return grid && { ...grid, title: doc.title };
}

// Types de posts d'une séance : résultats, avant-course (grille, météo, pneus), championnat, flash
const POST_TYPES = [['results', 'Résultats'], ['prerace', 'Avant-course'], ['champ', 'Championnat'], ['flash', 'Flash']];
async function sessionEditor(s, btn) {
  if (btn) btn.innerHTML += '<div class="small muted">Chargement de la séance…</div>';
  let st;
  try { st = await loadState(s.path); } catch (err) { if (btn) btn.innerHTML += `<div class="small err">${esc(err.message)}</div>`; return; }
  lastDrivers = st.DriverList || lastDrivers;
  const meet = st.SessionInfo?.Meeting || {};
  const tyres = builtinNomination(Number(String(s.path).slice(0, 4)), { name: meet.Name, location: meet.Location, country: meet.Country?.Name });
  const events = flashEvents(st);
  const results = postData(st);
  const champ = champData(st);
  let type = 'results';
  let ev = events[0] || null;
  let grid;   // grille officielle de la FIA : undefined = pas encore lue
  let gridNote = '';
  const avail = (k) => k === 'results' || k === 'prerace' || (k === 'champ' && champ) || (k === 'flash' && ev);
  const data = () => (type === 'prerace' ? preraceData(st, { tyres, grid }) : type === 'champ' ? champ : type === 'flash' ? flashData(st, ev) : results);
  const typeName = () => POST_TYPES.find(([k]) => k === type)[1];
  const loadGrid = async (redraw) => {
    if (grid !== undefined) return;
    grid = null;
    $('#gridnote').textContent = 'Lecture de la grille officielle de la FIA…';
    try {
      grid = await fiaGrid(Number(String(s.path).slice(0, 4)), { name: meet.Name, country: meet.Country?.Name, location: meet.Location }, results.sprint);
      gridNote = !grid ? 'Grille pas encore publiée par la FIA : ordre des qualifications, sans les pénalités.'
        : grid.final ? 'Grille officielle de la FIA, pénalités comprises.' : 'Grille provisoire de la FIA : la définitive peut encore changer.';
    } catch (err) { gridNote = `Grille de la FIA indisponible (${err.message}) : ordre des qualifications, sans les pénalités.`; }
    if ($('#gridnote')) $('#gridnote').textContent = type === 'prerace' ? gridNote : '';
    if (type === 'prerace') redraw(true);
  };
  editor({
    back: () => home(),
    head: `<div class="t" style="font-weight:700">${esc(SESSION_FR(s.name))} · ${esc(results.gp)}</div>
      <div class="seg" id="ptype">${POST_TYPES.map(([k, v]) => `<button data-ptype="${k}" class="${k === type ? 'on' : ''}" ${avail(k) ? '' : 'disabled'}>${v}</button>`).join('')}</div>
      <p class="small note" id="gridnote" hidden></p>
      <select id="flashpick" hidden>${events.map((x, i) => `<option value="${i}">${esc(FLASH_KINDS[x.kind].label)} · ${esc(x.title)}${x.lap ? ` · tour ${x.lap}` : ''}</option>`).join('')}</select>
      <label class="check" id="nospoilrow"><input type="checkbox" id="nospoil" ${state.noSpoiler ? 'checked' : ''}> Texte sans spoiler (vainqueur absent du début du texte)</label>`,
    data,
    caps: () => (type === 'results' ? captions(results, SIG, { spoiler: !state.noSpoiler }) : moreCaptions(data(), SIG)),
    record: () => (type === 'results' ? { key: `session:${s.path}`, kind: 'session', title: `${SESSION_FR(s.name)} · ${results.gp}` }
      : { key: `${type}:${s.path}${type === 'flash' ? `:${ev.id}` : ''}`, kind: type, title: `${type === 'flash' ? ev.title : typeName()} · ${results.gp}` }),
    bind: (redraw) => {
      $('#nospoil').onchange = (e) => { state.noSpoiler = e.target.checked; redraw(true); };
      $('#flashpick').onchange = (e) => { ev = events[Number(e.target.value)]; redraw(true); };
      app.querySelectorAll('[data-ptype]').forEach((b) => {
        b.onclick = () => {
          type = b.dataset.ptype;
          app.querySelectorAll('[data-ptype]').forEach((x) => x.classList.toggle('on', x === b));
          $('#flashpick').hidden = type !== 'flash';
          $('#gridnote').hidden = type !== 'prerace';
          if (type === 'prerace') { $('#gridnote').textContent = gridNote; loadGrid(redraw); }
          $('#nospoilrow').hidden = type !== 'results';
          redraw(true);
        };
      });
    },
  });
}

// ---------- Éditeur : visuels, textes, publication, partage ----------
function editor({ back, head, data, caps, bind, record }) {
  let canvases = [];
  let edited = {};   // textes retouchés à la main : gardés en changeant de format
  app.innerHTML = `<div class="top"><button id="back">← Retour</button><span class="spacer"></span>
      <div class="seg">${[['ig', 'Instagram'], ['story', 'Story'], ['x', 'X']].map(([k, v]) => `<button data-fmt="${k}" class="${state.fmt === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    ${head}
    <label class="check"><input type="checkbox" id="photos" ${state.photos ? 'checked' : ''}> Photos des pilotes</label>
    <div id="main"></div>`;
  // changed : données modifiées (titre d'une news, texte sans spoiler) -> textes régénérés
  const redraw = async (changed = false) => {
    if (changed) edited = {};
    const d = data();
    const c = { ...caps(), ...edited };
    const slides = slidesFor(d);
    const main = $('#main');
    main.innerHTML = `<div class="slides ${state.fmt}">${slides.map((sl) => `<canvas data-slide="${sl}" title="${esc(SLIDE_NAMES[sl] || sl)}"></canvas>`).join('')}</div>
      <label>${c.facebook ? 'Légende Instagram' : 'Légende Instagram / Facebook'}</label><textarea id="cap-instagram" rows="8">${esc(c.instagram)}</textarea>
      ${c.facebook ? `<label>Texte Facebook (avec le lien de l'article)</label><textarea id="cap-facebook" rows="8">${esc(c.facebook)}</textarea>` : ''}
      <label>Texte Threads (500 caractères max.)</label><textarea id="cap-threads" rows="4" maxlength="500">${esc(c.threads)}</textarea>
      <label>Texte X (280 caractères max., lien = 23)</label><textarea id="cap-x" rows="3">${esc(c.x)}</textarea>
      <label>Texte Bluesky (300 caractères max.)</label><textarea id="cap-bsky" rows="3">${esc(c.bsky || c.x)}</textarea>
      ${c.comment ? `<label>Premier commentaire (Facebook, Threads, Bluesky ; X : à coller en réponse)</label><textarea id="cap-comment" rows="2">${esc(c.comment)}</textarea>
        <div class="row"><button id="copycomment">Copier le commentaire</button></div>` : ''}
      <hr>
      <div class="nets">${[['instagram', 'Instagram', me.instagram], ['facebook', 'Facebook', me.facebook], ['threads', 'Threads', me.threads], ['bluesky', 'Bluesky', me.bluesky]].map(([k, v, acc]) => `<label class="check"><input type="checkbox" data-net="${k}" ${acc ? 'checked' : 'disabled'}> <b>${v}</b> <span class="muted small">${esc(acc || 'non connecté')}</span><span class="st" data-st="${k}"></span></label>`).join('')}</div>
      <p class="small muted">Instagram, Facebook et Threads reçoivent les visuels au format Instagram, Bluesky les 4 premiers au format X. Pour X, TikTok ou une story : « Partager » ouvre les applis du téléphone avec les visuels du format choisi.</p>
      <div class="row sticky"><button class="accent" id="go">Publier…</button><button id="share">Partager</button><button id="dl">Télécharger</button></div>`;
    for (const k of ['instagram', 'facebook', 'threads', 'x', 'bsky', 'comment'].filter((x) => $(`#cap-${x}`))) $(`#cap-${k}`).oninput = (e) => { edited[k] = e.target.value; };
    const o = await assets(d);
    canvases = [...main.querySelectorAll('canvas')];
    for (const cv of canvases) drawSlide(cv, cv.dataset.slide, state.fmt, d, o);
    $('#go').onclick = () => publishAll(d, o, slides, record?.());
    $('#share').onclick = () => share(canvases, state.fmt === 'x' ? $('#cap-x').value : state.fmt === 'ig' ? $('#cap-instagram').value : '');
    $('#dl').onclick = () => download(canvases, d);
    if ($('#copycomment')) $('#copycomment').onclick = async () => { try { await navigator.clipboard.writeText($('#cap-comment').value); $('#copycomment').textContent = 'Copié ✓'; } catch { /* presse-papiers refusé */ } };
  };
  $('#back').onclick = back;
  app.querySelectorAll('[data-fmt]').forEach((b) => { b.onclick = () => { state.fmt = b.dataset.fmt; app.querySelectorAll('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b)); redraw(); }; });
  $('#photos').onchange = (e) => { state.photos = e.target.checked; redraw(); };
  bind(redraw);
  redraw();
}

const toBlob = (cv, type = 'image/png', q) => new Promise((r) => cv.toBlob(r, type, q));

async function share(canvases, text) {
  const files = await Promise.all(canvases.map(async (cv, i) => new File([await toBlob(cv)], `post-${i + 1}.png`, { type: 'image/png' })));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text: text || undefined }); } catch { /* partage annulé */ }
    return;
  }
  download(canvases);
}

async function download(canvases) {
  for (const [i, cv] of canvases.entries()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await toBlob(cv));
    a.download = `post-${state.fmt}-${i + 1}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

// Publication : visuels au format Instagram (JPEG), un réseau après l'autre, progression affichée
async function publishAll(d, o, slides, record = null) {
  const nets = [...app.querySelectorAll('[data-net]:checked')].map((i) => i.dataset.net);
  if (!nets.length) { alert('Cochez au moins un réseau'); return; }
  const names = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', bluesky: 'Bluesky' };
  if (!confirm(`Publier maintenant sur : ${nets.map((n) => names[n]).join(', ')} ?\n\nLes posts seront publics.`)) return;
  const go = $('#go');
  go.disabled = true;
  const blobs = await Promise.all(slides.map((sl) => toBlob(drawSlide(document.createElement('canvas'), sl, 'ig', d, o), 'image/jpeg', 0.92)));
  // Bluesky : 4 visuels au format X, moins de 1 Mo chacun
  const small = async (cv) => { let b = null; for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) { b = await toBlob(cv, 'image/jpeg', q); if (b.size <= 950 * 1024) break; } return b; };
  const bsky = nets.includes('bluesky') ? await Promise.all(slides.slice(0, 4).map((sl) => small(drawSlide(document.createElement('canvas'), sl, 'x', d, o)))) : [];
  for (const n of nets) {
    const st = $(`[data-st="${n}"]`);
    st.className = 'st';
    const t0 = Date.now();
    const tick = setInterval(() => { st.textContent = `Envoi… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    st.textContent = 'Envoi…';
    try {
      const form = new FormData();
      form.append('network', n);
      form.append('text', $(`#cap-${n === 'threads' ? 'threads' : n === 'bluesky' ? 'bsky' : n === 'facebook' && $('#cap-facebook') ? 'facebook' : 'instagram'}`).value);
      (n === 'bluesky' ? bsky : blobs).forEach((b, i) => form.append('images', b, `image-${i + 1}.jpg`));
      if (n !== 'instagram' && $('#cap-comment')?.value.trim()) form.append('comment', $('#cap-comment').value.trim());
      const res = await api('publish', { method: 'POST', body: form, raw: true });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let result = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl) || '{}');
          buf = buf.slice(nl + 1);
          if (msg.error) throw new Error(msg.error);
          if (msg.done) result = msg;
        }
      }
      if (!result) throw new Error('Réponse interrompue : vérifiez sur le réseau avant de réessayer');
      st.className = 'st ok';
      if (record) api('history', { method: 'POST', body: JSON.stringify({ entry: { ...record, at: Date.now(), nets: { [n]: { id: result.id ?? null, url: result.url || null } } } }) }).catch(() => {});
      st.innerHTML = (result.url ? `<a href="${esc(result.url)}" target="_blank" rel="noopener">Publié ✓</a>` : 'Publié ✓')
        + (result.comment ? ' · commentaire ajouté' : result.commentError ? ` <span class="err">· commentaire refusé : ${esc(result.commentError)}</span>` : '');
    } catch (err) {
      st.className = 'st err';
      st.textContent = err.message;
    } finally { clearInterval(tick); }
  }
  go.disabled = false;
}

// ---------- Statistiques des posts ----------
const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR'));
const STAT_LABELS = [['views', 'Vues'], ['reach', 'Portée'], ['likes', "J'aime"], ['comments', 'Comm.'], ['shares', 'Partages'], ['saves', 'Enreg.']];
async function statsTab(body) {
  body.innerHTML = '<p class="muted">Lecture des statistiques…</p>';
  const r = await api('stats');
  const f = Object.entries(r.followers || {});
  body.innerHTML = `${f.length ? `<div class="row" style="margin-top:12px">${f.map(([n, v]) => `<div class="card" style="width:auto;cursor:default"><div class="t">${fmtN(v)}</div><div class="small muted">abonnés ${esc(NET_NAMES[n] || n)}</div></div>`).join('')}</div>` : ''}
    <div class="list">${(r.posts || []).map((p) => `<div class="card" style="cursor:default"><div class="t">${esc(p.title || 'Post')}</div><div class="small muted">${esc(new Date(p.at).toLocaleString('fr-FR'))}</div>
      ${Object.entries(p.nets).map(([n, x]) => { const s = p.stats?.[n]; const vals = s ? STAT_LABELS.filter(([k]) => s[k] != null).map(([k, l]) => `${l} <b>${fmtN(s[k])}</b>`).join(' · ') : 'statistiques indisponibles'; return `<div class="small">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(NET_NAMES[n] || n)}</a>` : esc(NET_NAMES[n] || n)} : ${vals}</div>`; }).join('')}</div>`).join('') || '<p class="muted">Aucun post publié pour le moment.</p>'}</div>
    <p class="note">Les 8 derniers posts. Vues et portée : autorisations instagram_manage_insights, read_insights et threads_manage_insights du jeton. X : lecture payante, non utilisée.</p>`;
}

// ---------- Accueil ----------
function home() {
  const acc = [me.instagram && `Instagram ${me.instagram}`, me.facebook && `Facebook ${me.facebook}`, me.threads && `Threads ${me.threads}`, me.bluesky && `Bluesky ${me.bluesky}`].filter(Boolean).join(' · ');
  app.innerHTML = `<div class="top"><h1>Paddock <b>Studio</b></h1><span class="spacer"></span><button id="out">Quitter</button></div>
    <p class="small muted">${esc(acc || 'Aucun compte : activez la page depuis l\'appli (Posts → Publier… → Comptes…)')}</p>
    <div class="seg"><button data-tab="news" class="${state.tab === 'news' ? 'on' : ''}">News</button><button data-tab="sessions" class="${state.tab === 'sessions' ? 'on' : ''}">Séances</button><button data-tab="stats" class="${state.tab === 'stats' ? 'on' : ''}">Stats</button></div>
    <div id="body"></div>`;
  $('#out').onclick = logout;
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; home(); }; });
  const body = $('#body');
  (state.tab === 'news' ? newsTab(body) : state.tab === 'stats' ? statsTab(body) : sessionsTab(body)).catch((err) => { body.innerHTML = `<p class="err">${esc(err.message)}</p>`; });
}

const startAlert = new URLSearchParams(location.search).get('alert');
if (startAlert) history.replaceState(null, '', '/studio/');
const afterLogin = () => { home(); openAlert(startAlert); };
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/studio/sw.js', { scope: '/studio/' }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (me && e.data?.alert) openAlert(e.data.alert); });
}

(async () => {
  if (!key) { login(); return; }
  try { me = await api('me'); afterLogin(); } catch (err) { login(err.message === 'Code incorrect' ? '' : err.message); }
})();
