// Studio : page web du créateur, pour préparer et publier les posts quand l'appli de bureau n'est pas
// à portée (téléphone). Grosses news de la F1 et résultats des séances, mêmes visuels et mêmes textes
// que dans l'appli (code partagé), publication sur Facebook, Instagram et Threads par le serveur
// Paddock Live après confirmation, ou partage vers les autres applis (X, TikTok…) depuis le téléphone.
import { clusterNews } from '/shared/news.js';
import { feedItems, decodeBody } from '/shared/news-collect.js';
import { bigNews, newsPost, newsCaptions, newsKind, OTHER_SERIES } from '/shared/social-news.js';
import { postData, captions } from '/shared/social.js';
import { preraceData, champData, flashEvents, flashData, moreCaptions, FLASH_KINDS } from '/shared/social-more.js';
import { builtinNomination } from '/shared/tyres.js';
import { CHAMPIONSHIP, parseSeasons, parseDocumentList, pickEvent } from '/shared/fia-list.js';
import { gridDocument, parseStartingGrid } from '/shared/fia-grid.js';
import { pullToRefresh } from '/shared/pull-refresh.js';
import { slidesFor, drawSlide, slideName } from '/shared/social-draw.js';
import { followCaptions, questionCaptions } from '/shared/social-follow.js';
import { raceWeekData, weekendData, recordsData, ratingsData, teamDuelsData, raceLapsData, recapData, seasonCaptions } from '/shared/social-season.js';
import { raceFrame, raceVideoTiming } from '/shared/social-draw-season.js';
import { summarize } from '/shared/season-data.js';
import { parseRaceLaps } from '/shared/race-laps.js';
import { circuitInfo } from '/shared/circuits-info.js';
import { editionOf, recordsOf, recordYears } from '/shared/circuit-records.js';
import { parseRaceControl, raceSessionPath } from '/shared/race-story.js';
import { makeAnimation } from '/shared/social-video.js';
import { extractArticle } from '/shared/article.js';
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
const state = { tab: 'news', fmt: 'ig', noSpoiler: true, photos: true, all: false, linkComment: true, follow: true, question: true, stype: 'raceweek', round: null };
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
  const iso = d.iso || FLAG_ISO[String(d.country || '').toUpperCase()];
  return { photos, flag: iso ? await loadImage(`https://flagcdn.com/${d.post === 'raceweek' ? 'w1280' : 'w160'}/${iso}.png`) : null, signature: SIG };
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
    <div class="row"><label class="check"><input type="checkbox" id="all" ${state.all ? 'checked' : ''}> Toutes les actus (48 h)</label><span class="spacer"></span><button id="recap">Récap de la semaine</button><button id="reload">Actualiser</button></div>
    ${list.length ? '' : '<p class="muted">Aucune grosse news ces dernières 48 heures.</p>'}
    <div class="list">${list.map((it, i) => { const k = newsKind(it); return `<button class="card" data-i="${i}"><span class="badge" style="background:${k.color}">${esc(k.label)}</span>${posted[i] ? ' <span class="badge" style="background:#8E97A6">PUBLIÉE ✓</span>' : ''}
      <div class="t">${esc(titles[i] || it.title)}</div><div class="small muted">${esc(it.srcName)} · il y a ${ago(it.t)}${it.sources > 1 ? ` · ${it.sources} médias` : ''}</div></button>`; }).join('')}</div>`;
  $('#all').onchange = (e) => { state.all = e.target.checked; newsTab(body); };
  $('#reload').onclick = () => { news = null; newsTab(body); };
  $('#recap').onclick = () => recapEditor().catch((err) => alert(err.message));
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

// Résumé détaillé : page de l'article lue par le serveur, texte extrait ici, points clés rédigés par
// l'IA du serveur (reformulés, jamais recopiés)
async function detailedSummary(it) {
  const html = await decodeBody(await api(`page?u=${encodeURIComponent(it.link)}`, { raw: true }));
  const a = extractArticle(html, it.link);
  const text = a.blocks.map((b) => b.h || b.p || '').filter(Boolean).join('\n\n').slice(0, 12000);
  if (text.length < 400) throw new Error('Pas de texte lisible sur cette page (vidéo, accès réservé…)');
  const res = await fetch('/s', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: it.title || a.title, text }) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error('Plafond du jour atteint, réessayez demain');
  if (!res.ok || !Array.isArray(j.points)) throw new Error(j.error || 'Résumé indisponible pour le moment');
  return j.points;
}

async function newsEditor(it, done = null) {
  const [title, summary] = await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const failed = title === null || summary === null;
  const make = async (t, s, p = '') => newsPost(it, { title: t, summary: s, points: p, driverList: await latestDrivers(), sourceName: it.srcName });
  let d = await make(title ?? it.title, summary ?? it.summary);
  editor({
    back: () => home(),
    head: `<span class="badge" style="background:${d.badge.color}">${esc(d.badge.label)}</span>
      ${done ? `<p class="note">✓ Déjà publiée le ${esc(new Date(done.at).toLocaleString('fr-FR'))} sur ${esc(Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', '))}</p>` : ''}
      <p class="small muted">${esc(it.srcName)} · il y a ${ago(it.t)} · <a class="muted" href="${esc(it.link)}" target="_blank" rel="noopener">lire l'article</a></p>
      <label>Titre</label><input type="text" id="ntitle" maxlength="160" value="${esc(d.title)}">
      <label>Résumé</label><textarea id="nsum" rows="4" maxlength="400">${esc(d.summary)}</textarea>
      <label>Points clés, un par ligne (images suivantes du carrousel)</label><textarea id="npoints" rows="5" maxlength="1600" placeholder="Facultatif : « Résumé détaillé » ou à écrire soi-même"></textarea>
      ${it.link ? '<div class="row"><button id="nsummary">Résumé détaillé</button><span class="small muted" id="nsumst"></span></div>' : ''}
      <label class="check"><input type="checkbox" id="linkcomment" ${state.linkComment ? 'checked' : ''}> Lien de l'article en premier commentaire (Facebook, Threads, Bluesky, X)</label>
      <p class="note">${failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : 'Titre et résumé traduits automatiquement : relisez-les et corrigez-les si besoin. Ni photo ni texte de l\'article repris, la source est citée.'}</p>`,
    data: () => d,
    caps: () => newsCaptions(d, SIG, { linkInComment: state.linkComment }),
    record: () => ({ key: `news:${it.id}`, kind: 'news', title: d.title, srcTitle: it.title, link: it.link || '', summary: String(it.summary || '').slice(0, 300) }),
    bind: (redraw) => {
      let tm = null;
      const upd = () => { clearTimeout(tm); tm = setTimeout(async () => { d = await make($('#ntitle').value, $('#nsum').value, $('#npoints').value); redraw(true); }, 400); };
      $('#ntitle').oninput = upd;
      $('#npoints').oninput = upd;
      if ($('#nsummary')) $('#nsummary').onclick = async () => {
        const btn = $('#nsummary');
        btn.disabled = true;
        $('#nsumst').textContent = 'Lecture de l\'article et résumé…';
        try {
          $('#npoints').value = (await detailedSummary(it)).join('\n');
          $('#nsumst').textContent = 'Points clés reformulés par l\'IA : relisez-les avant de publier.';
          upd();
        } catch (err) { $('#nsumst').textContent = err.message; } finally { btn.disabled = false; }
      };
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
    <label class="check"><input type="checkbox" id="follow" ${state.follow ? 'checked' : ''}> Image « Abonnez-vous » à la fin des carrousels (et une ligne dans les textes)</label>
    <label class="check"><input type="checkbox" id="question" ${state.question ? 'checked' : ''}> Question en fin de texte (pour faire réagir en commentaire)</label>
    <div id="main"></div>`;
  // changed : données modifiées (titre d'une news, texte sans spoiler) -> textes régénérés
  const redraw = async (changed = false) => {
    if (changed) edited = {};
    const d = data();
    let base = caps();
    if (state.question) base = questionCaptions(base, d, SIG);
    if (state.follow) base = followCaptions(base, d, SIG);
    const c = { ...base, ...edited };
    const slides = slidesFor(d, { fmt: state.fmt, follow: state.follow });
    const main = $('#main');
    main.innerHTML = `<div class="slides ${state.fmt}">${slides.map((sl) => `<canvas data-slide="${sl}" title="${esc(slideName(sl))}"></canvas>`).join('')}</div>
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
      <div class="row sticky"><button class="accent" id="go">Publier…</button><button id="plan">Programmer…</button><button id="share">Partager</button><button id="dl">Télécharger</button></div>
      <div id="schedbox" hidden></div><div id="schedlist"></div>`;
    for (const k of ['instagram', 'facebook', 'threads', 'x', 'bsky', 'comment'].filter((x) => $(`#cap-${x}`))) $(`#cap-${k}`).oninput = (e) => { edited[k] = e.target.value; };
    const o = await assets(d);
    canvases = [...main.querySelectorAll('canvas')];
    for (const cv of canvases) drawSlide(cv, cv.dataset.slide, state.fmt, d, o);
    $('#go').onclick = () => publishAll(d, o, record?.());
    $('#plan').onclick = () => schedulePanel(d, o, record?.());
    schedList($('#schedlist'));
    $('#share').onclick = () => share(canvases, state.fmt === 'x' ? $('#cap-x').value : state.fmt === 'ig' ? $('#cap-instagram').value : '');
    $('#dl').onclick = () => download(canvases, d);
    if ($('#copycomment')) $('#copycomment').onclick = async () => { try { await navigator.clipboard.writeText($('#cap-comment').value); $('#copycomment').textContent = 'Copié ✓'; } catch { /* presse-papiers refusé */ } };
  };
  $('#back').onclick = back;
  app.querySelectorAll('[data-fmt]').forEach((b) => { b.onclick = () => { state.fmt = b.dataset.fmt; app.querySelectorAll('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b)); redraw(); }; });
  $('#photos').onchange = (e) => { state.photos = e.target.checked; redraw(); };
  $('#follow').onchange = (e) => { state.follow = e.target.checked; redraw(true); };
  $('#question').onchange = (e) => { state.question = e.target.checked; redraw(true); };
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

// Réseaux cochés, texte et premier commentaire de chacun
const checkedNets = () => [...app.querySelectorAll('[data-net]:checked')].map((i) => i.dataset.net);
const textOf = (n) => $(`#cap-${n === 'threads' ? 'threads' : n === 'bluesky' ? 'bsky' : n === 'facebook' && $('#cap-facebook') ? 'facebook' : 'instagram'}`).value;
const commentOf = (n) => (n !== 'instagram' && $('#cap-comment')?.value.trim()) || '';
// JPEG de moins de max octets (qualité baissée au besoin)
async function fitJpeg(cv, max) {
  let b = null;
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) { b = await toBlob(cv, 'image/jpeg', q); if (b.size <= max) break; }
  return b;
}
// Visuels : format Instagram (Instagram, Facebook, Threads) ; Bluesky : 4 au format X, moins de 1 Mo
async function postImages(d, o, nets, maxIg = Infinity) {
  const draw = (fmt, max, n = 99) => Promise.all(slidesFor(d, { fmt, follow: state.follow }).slice(0, n).map((sl) => fitJpeg(drawSlide(document.createElement('canvas'), sl, fmt, d, o), max)));
  return { ig: nets.some((n) => n !== 'bluesky') ? await draw('ig', maxIg) : [], x: nets.includes('bluesky') ? await draw('x', 950 * 1024, 4) : [] };
}

// Publication programmée : envoyée au serveur, publiée à l'heure même page fermée
const localValue = (t) => new Date(t - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
function schedulePanel(d, o, record = null) {
  const box = $('#schedbox');
  box.hidden = !box.hidden;
  if (box.hidden) return;
  const t = new Date(Date.now() + 3600e3);
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  box.innerHTML = `<label>Date et heure de publication</label>
    <div class="row"><input type="datetime-local" id="when" value="${localValue(t)}"><button class="accent" id="dosched">Programmer</button></div>
    <p class="small muted">Sur les réseaux cochés, avec les textes et visuels ci-dessus. Le serveur publie à l'heure choisie, même page fermée, un réseau par minute (7 jours à l'avance au plus).</p>
    <p class="small" id="schedst"></p>`;
  $('#dosched').onclick = async () => {
    const nets = checkedNets();
    const at = new Date($('#when').value).getTime();
    const st = $('#schedst');
    if (!nets.length) { alert('Cochez au moins un réseau'); return; }
    if (!Number.isFinite(at) || at < Date.now() - 60e3) { st.className = 'small err'; st.textContent = 'Choisissez une heure à venir'; return; }
    if (!confirm(`Programmer pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} sur : ${nets.map((n) => NET_NAMES[n]).join(', ')} ?\n\nLes posts seront publics à cette heure-là.`)) return;
    const btn = $('#dosched');
    btn.disabled = true;
    st.className = 'small';
    st.textContent = 'Envoi des visuels…';
    try {
      const imgs = await postImages(d, o, nets, 1.3e6);
      const form = new FormData();
      form.append('at', String(at));
      form.append('title', record?.title || d.title || d.gp || 'Post');
      form.append('record', JSON.stringify(record));
      form.append('posts', JSON.stringify(nets.map((n) => ({ network: n, text: textOf(n), comment: commentOf(n) }))));
      imgs.ig.forEach((b, i) => form.append('ig', b, `image-${i + 1}.jpg`));
      imgs.x.forEach((b, i) => form.append('x', b, `x-${i + 1}.jpg`));
      await api('schedule', { method: 'POST', body: form });
      st.className = 'small ok';
      st.textContent = `Programmé ✓ (${new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })})`;
      schedList($('#schedlist'));
    } catch (err) {
      st.className = 'small err';
      st.textContent = err.message;
    } finally { btn.disabled = false; }
  };
}

// Publications programmées : état de chaque réseau, annulation tant que rien n'est parti
const SCHED_ST = { pending: 'à venir', running: 'en cours…', done: 'publié', error: 'erreur', expired: 'abandonné (plus de 24 h de retard)' };
async function schedList(el) {
  if (!el) return;
  const r = await api('schedule').catch(() => ({ items: [] }));
  const items = (r.items || []).filter((j) => j.at > Date.now() - 2 * 86400e3);
  el.innerHTML = items.length ? `<h3>Publications programmées</h3><div class="list">${items.map((j) => {
    const states = Object.values(j.nets);
    const cancel = states.some((x) => x.status === 'pending') && !states.some((x) => x.status === 'running' || x.status === 'done');
    return `<div class="card" style="cursor:default"><div class="t">${esc(j.title || 'Post')}</div><div class="small muted">${esc(new Date(j.at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }))}</div>
      ${Object.entries(j.nets).map(([n, x]) => `<div class="small">${esc(NET_NAMES[n] || n)} : ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${SCHED_ST[x.status]} ✓</a>` : esc(SCHED_ST[x.status] || x.status)}`
        + (x.error ? ` <span class="err">${esc(x.error)}</span>` : '')
        + (x.commentError ? ` <span class="err">· commentaire refusé : ${esc(x.commentError)}</span>` : '')
        + (x.visible === false ? ' <span class="err">· pas visible publiquement sur Threads : vérifiez le post (compte ou post masqué)</span>' : '') + '</div>').join('')}
      ${cancel ? `<div class="row" style="margin-top:6px"><button data-cancel="${esc(j.id)}">Annuler</button></div>` : ''}</div>`;
  }).join('')}</div>` : '';
  el.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Annuler cette publication programmée ?')) return;
      b.disabled = true;
      try { await api('schedule/cancel', { method: 'POST', body: JSON.stringify({ id: b.dataset.cancel }) }); } catch (err) { alert(err.message); }
      schedList(el);
    };
  });
}

// Publication : visuels au format Instagram (JPEG), un réseau après l'autre, progression affichée
async function publishAll(d, o, record = null) {
  const nets = checkedNets();
  if (!nets.length) { alert('Cochez au moins un réseau'); return; }
  if (!confirm(`Publier maintenant sur : ${nets.map((n) => NET_NAMES[n]).join(', ')} ?\n\nLes posts seront publics.`)) return;
  const go = $('#go');
  go.disabled = true;
  const { ig: blobs, x: bsky } = await postImages(d, o, nets);
  for (const n of nets) {
    const st = $(`[data-st="${n}"]`);
    st.className = 'st';
    const t0 = Date.now();
    const tick = setInterval(() => { st.textContent = `Envoi… ${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
    st.textContent = 'Envoi…';
    try {
      const form = new FormData();
      form.append('network', n);
      form.append('text', textOf(n));
      (n === 'bluesky' ? bsky : blobs).forEach((b, i) => form.append('images', b, `image-${i + 1}.jpg`));
      if (commentOf(n)) form.append('comment', commentOf(n));
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
        + (result.comment ? ' · commentaire ajouté' : result.commentError ? ` <span class="err">· commentaire refusé : ${esc(result.commentError)}</span>` : '')
        + (result.visible === false ? ' <span class="err">· pas visible publiquement sur Threads : vérifiez le post (compte ou post masqué)</span>' : '');
    } catch (err) {
      st.className = 'st err';
      st.textContent = err.message;
    } finally { clearInterval(tick); }
  }
  go.disabled = false;
}

// ---------- Récap de la semaine (News) ----------
async function recapEditor() {
  news ||= await loadNews();
  const f1 = (l) => l.filter((it) => !OTHER_SERIES.test(`${it.title} ${it.summary || ''}`));
  let list = f1(bigNews(news, { hours: 7 * 24 })).slice(0, 5);
  if (list.length < 3) list = f1(bigNews(news, { hours: 7 * 24, all: true })).slice(0, 5);
  if (!list.length) throw new Error('Pas assez d\'actus ces 7 derniers jours');
  const fr = await toFrench(list.flatMap((it) => [{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]));
  const drivers = await latestDrivers();
  const d = recapData(list.map((it, i) => newsPost(it, { title: fr[2 * i] ?? it.title, summary: fr[2 * i + 1] ?? it.summary, driverList: drivers, sourceName: it.srcName })));
  editor({
    back: () => home(),
    head: `<p class="note">Les ${d.items.length} plus grosses news des 7 derniers jours, titres et résumés traduits automatiquement : relisez les visuels avant de publier.</p>`,
    data: () => d, caps: () => seasonCaptions(d, SIG), bind: () => {},
    record: () => ({ key: `recap:${d.date}`, kind: 'recap', title: `La semaine en F1 · ${d.date}` }),
  });
}

// ---------- Saison : programme, notes, duels, course tour par tour (API publique Jolpica) ----------
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
let jolpicaAt = 0;
async function jolpica(pathname) {
  const out = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    let j = null;
    for (let attempt = 0; attempt < 3 && !j; attempt++) {
      const wait = jolpicaAt + 300 * (attempt + 1) - Date.now();   // 4 demandes par seconde au plus
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      jolpicaAt = Date.now();
      const r = await fetch(`${JOLPICA}/${pathname}.json?limit=100&offset=${offset}`).catch(() => null);
      if (r?.ok) j = await r.json();
      else if (r && r.status !== 429 && r.status < 500) throw new Error(`Résultats indisponibles (erreur ${r.status})`);
    }
    if (!j) throw new Error('Serveur des résultats (Jolpica) injoignable, réessayez dans un instant');
    total = Number(j.MRData?.total) || 0;
    out.push(j.MRData);
    if (!total) break;
  }
  return out;
}
// Gardées sur le téléphone (saison : 30 min ; tours d'une course terminée : toujours)
const seasonMemo = new Map();
const memoOf = (k, fn, ttl = Infinity) => {
  if (!seasonMemo.has(k)) {
    let hit = null;
    try { hit = JSON.parse(localStorage.getItem(`studio.${k}`) || 'null'); } catch { /* stockage indisponible */ }
    seasonMemo.set(k, hit && Date.now() - hit.at < ttl ? Promise.resolve(hit.v) : fn().then((v) => {
      try { localStorage.setItem(`studio.${k}`, JSON.stringify({ at: Date.now(), v })); } catch { /* stockage plein */ }
      return v;
    }).catch((err) => { seasonMemo.delete(k); throw err; }));
  }
  return seasonMemo.get(k);
};
const seasonOf = (year) => memoOf(`s3-${year}`, async () => {
  const races = (pages) => pages.flatMap((m) => m?.RaceTable?.Races || []);
  const [schedule, ds, cs, results, quali, sprint] = [
    races(await jolpica(`${year}`)), await jolpica(`${year}/driverstandings`), await jolpica(`${year}/constructorstandings`),
    races(await jolpica(`${year}/results`)), races(await jolpica(`${year}/qualifying`)), races(await jolpica(`${year}/sprint`)),
  ];
  return summarize({ schedule, driverStandings: ds[0]?.StandingsTable?.StandingsLists?.[0]?.DriverStandings, constructorStandings: cs[0]?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings, results, quali, sprint });
}, 30 * 60e3);
// Records du circuit : éditions précédentes lues dans les archives de la F1 (gardées sur le
// téléphone, définitives ; une archive pas encore publiée sera relue la fois suivante)
const readArchive = async (p) => JSON.parse((await (await api(`archive?p=${encodeURIComponent(p)}`, { raw: true })).text()).replace(/^\uFEFF/, ''));
async function recordsFor(year, key) {
  let failed = null;
  const editions = await Promise.all(recordYears(year).map((y) => memoOf(`r${key}-${y}`, async () => {
    const e = await editionOf(y, key, readArchive);
    if (e?.pending) throw new Error('Archive pas encore publiée');
    return e;
  }).catch((err) => { failed ||= err; return null; })));
  const rec = recordsOf(key, editions);
  if (!rec.editions.length && failed) throw new Error(me.f1tv ? 'Archives de la F1 indisponibles pour le moment' : 'Archives réservées aux abonnés F1 TV : connectez F1 TV dans l\'appli, puis réactivez la page');
  return rec;
}
const lapsOf = (year, round) => memoOf(`l2${year}-${round}`, async () => {
  const pages = (await jolpica(`${year}/${round}/laps`)).flatMap((m) => m?.RaceTable?.Races || []);
  const res = (await jolpica(`${year}/${round}/results`)).flatMap((m) => m?.RaceTable?.Races || []).flatMap((r) => r.Results || []);
  const pits = (await jolpica(`${year}/${round}/pitstops`).catch(() => [])).flatMap((m) => m?.RaceTable?.Races || []);
  return parseRaceLaps(pages, res, pits);
});
// Tracé du circuit (API MultiViewer) et direction de course (archives de la F1 : safety car, VSC, drapeaux)
const trackOf = (year, key) => memoOf(`c${key}-${year}`, async () => {
  for (const y of [year, year - 1]) {
    const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`).catch(() => null);
    if (r?.ok) return r.json();
  }
  return null;
});
const raceControlOf = (year, race) => memoOf(`rc${year}-${race.round}`, async () => {
  const p = raceSessionPath(await readArchive(`${year}/Index.json`), { name: race.name, circuitKey: circuitInfo(race.circuitId)?.key });
  if (!p) throw new Error('Course introuvable dans les archives');
  return parseRaceControl(await readArchive(`${p}RaceControlMessages.json`));
});
async function forecastOf(lat, lon) {
  const q = new URLSearchParams({ latitude: Number(lat).toFixed(4), longitude: Number(lon).toFixed(4), daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '16' });
  const j = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json()).catch(() => null);
  const d = j?.daily || {};
  return (d.time || []).map((date, i) => ({ date, tmax: d.temperature_2m_max?.[i] ?? null, tmin: d.temperature_2m_min?.[i] ?? null, rain: d.precipitation_probability_max?.[i] ?? null })).filter((x) => x.tmax !== null);
}
const STYPES = [['raceweek', 'Race Week'], ['weekend', 'Programme'], ['records', 'Le saviez-vous'], ['ratings', 'Notes'], ['teamduels', 'Duels'], ['racelaps', 'Tour par tour']];
// Grands Prix de la Saison : le prochain (ou la dernière course) en tête et mis en avant, puis les
// suivants dans l'ordre du calendrier, et les courses passées de la plus récente à la plus ancienne
function raceList(races, def, upcoming) {
  const card = (r, hl = false) => `<button class="card${hl ? ' next' : ''}" data-r="${r.round}">${hl ? `<span class="badge">${upcoming ? 'PROCHAIN GRAND PRIX' : 'DERNIÈRE COURSE'}</span>` : ''}<div class="t">${esc(r.name)}</div><div class="small muted">Manche ${r.round} · ${esc(new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}</div></button>`;
  const later = races.filter((r) => r.round > def.round);
  const before = races.filter((r) => r.round < def.round).reverse();
  return `<div class="list">${card(def, true)}</div>
    ${upcoming && later.length ? `<h3>Ensuite</h3><div class="list">${later.map((r) => card(r)).join('')}</div>` : ''}
    ${before.length ? `<h3>${upcoming ? 'Déjà courus' : 'Courses précédentes'}</h3><div class="list">${before.map((r) => card(r)).join('')}</div>` : ''}`;
}
async function seasonTab(body) {
  body.innerHTML = '<p class="muted">Lecture de la saison (jusqu\'à une minute la première fois)…</p>';
  const year = new Date().getUTCFullYear();
  const data = await seasonOf(year);
  const upcoming = ['raceweek', 'weekend', 'records'].includes(state.stype);
  const races = upcoming ? data.races : data.races.filter((r) => r.results.length);
  const def = upcoming ? (races.find((r) => Date.parse(r.date) > Date.now() - 12 * 3600e3) || races.at(-1)) : races.at(-1);
  body.innerHTML = `<div class="seg" id="stypes">${STYPES.map(([k, v]) => `<button data-st="${k}" class="${state.stype === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${def ? raceList(races, def, upcoming) : '<p class="muted">Aucune course terminée pour le moment.</p>'}`;
  // Type choisi visible dans la barre (qui défile sur téléphone)
  const on = $('#stypes .on');
  if (on) $('#stypes').scrollLeft = on.offsetLeft - ($('#stypes').clientWidth - on.offsetWidth) / 2;
  body.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { state.stype = b.dataset.st; state.round = null; seasonTab(body); }; });
  body.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { state.round = Number(b.dataset.r); seasonEditor(year, data, races.find((r) => r.round === state.round)).catch((err) => alert(err.message)); }; });
}
async function seasonEditor(year, data, race) {
  const live = Object.fromEntries(Object.values(await latestDrivers()).filter((x) => x?.Tla && x.TeamColour).map((x) => [x.Tla, `#${String(x.TeamColour).replace('#', '')}`]));
  let d;
  let note = '';
  if (state.stype === 'raceweek') {
    const info = circuitInfo(race.circuitId);
    const [fc, track, winners] = await Promise.all([
      Number.isFinite(race.lat) ? forecastOf(race.lat, race.lon) : [],
      info ? trackOf(year, info.key).catch(() => null) : null,
      memoOf(`w${year - 1}`, async () => (await jolpica(`${year - 1}/results/1`)).flatMap((m) => m?.RaceTable?.Races || [])).catch(() => []),
    ]);
    const w = winners.find((r) => r.Circuit?.circuitId === race.circuitId || r.raceName === race.name)?.Results?.[0];
    const prev = w ? { name: `${w.Driver?.givenName || ''} ${w.Driver?.familyName || ''}`.trim(), team: w.Constructor?.name || '', teamId: w.Constructor?.constructorId || '', laps: Number(w.laps) || null } : null;
    d = raceWeekData(race, { year, rounds: data.races.length, tyres: builtinNomination(year, { name: race.name, location: race.locality, country: race.country }), forecast: fc, track, prev });
    if (!track) note = 'Tracé du circuit indisponible pour ce Grand Prix : visuel sans le circuit.';
  } else if (state.stype === 'weekend') {
    const fc = Number.isFinite(race.lat) ? await forecastOf(race.lat, race.lon) : [];
    d = weekendData(race, { year, tyres: builtinNomination(year, { name: race.name, location: race.locality, country: race.country }), forecast: fc });
    if (!d.forecast.length) note = 'Météo prévue disponible environ 2 semaines avant le week-end.';
  } else if (state.stype === 'records') {
    const key = circuitInfo(race.circuitId)?.key;
    if (!key) throw new Error('Circuit inconnu : records indisponibles pour ce Grand Prix');
    d = recordsData(race, await recordsFor(year, key), { year, names: Object.fromEntries((data.drivers || []).map((x) => [x.code, x.name])) });
    if (!d.facts.length) throw new Error('Pas encore de records connus pour ce circuit (archives de la F1 depuis 2018).');
  } else if (state.stype === 'ratings') {
    const laps = await lapsOf(year, race.round).catch(() => null);
    d = ratingsData(race, { year, laps, live });
    note = `Note sur 10 calculée par Paddock Live : résultat, ${d.withPace ? 'rythme en course, ' : ''}places gagnées et duel avec le coéquipier.`;
  } else if (state.stype === 'teamduels') {
    d = teamDuelsData(data, { year, upTo: race.round, live });
  } else {
    const info = circuitInfo(race.circuitId);
    const [laps, track, rcm] = await Promise.all([
      lapsOf(year, race.round),
      info ? trackOf(year, info.key).catch(() => null) : null,
      raceControlOf(year, race).catch(() => null),
    ]);
    if (!laps.total) throw new Error('Tours de cette course pas encore publiés');
    d = raceLapsData(race, laps, { year, live, track, rcm: rcm?.length ? rcm : null });
    if (d.story.estimated) note = 'Direction de course indisponible (archives de la F1) : neutralisations estimées d\'après les temps au tour.';
  }
  const video = state.stype === 'racelaps';
  let clip = null;
  editor({
    back: () => home(),
    head: `<p class="small muted">${esc(d.gp)} · manche ${race.round}</p>${note ? `<p class="note">${esc(note)}</p>` : ''}
      ${video ? `<div class="row"><button id="mkvid">Créer la vidéo animée (${Math.round(raceVideoTiming(d).duration)} s)</button><button id="sharevid" disabled>Partager la vidéo</button></div>
        <p class="small muted" id="vidst">Vidéo verticale pour TikTok, Reels ou une story : les voitures sur le circuit, safety cars, drapeaux et moments forts. Garder l'écran allumé pendant l'enregistrement.</p>
        <video id="vid" controls playsinline hidden style="width:100%;border-radius:12px"></video>` : ''}`,
    data: () => d, caps: () => seasonCaptions(d, SIG),
    record: () => ({ key: `${state.stype}:${year}-${race.round}`, kind: state.stype, title: `${STYPES.find(([k]) => k === state.stype)[1]} · ${d.gp}` }),
    bind: () => {
      if (!video) return;
      $('#mkvid').onclick = async () => {
        $('#mkvid').disabled = true;
        try {
          const o = await assets(d);
          clip = await makeAnimation((ctx, t) => raceFrame(ctx, 1080, 1920, d, o, t), raceVideoTiming(d).duration, { music: 'gen', onProgress: (p) => { $('#vidst').textContent = `Enregistrement… ${Math.round(p * 100)} %`; } });
          $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
          $('#sharevid').disabled = false;
          $('#vidst').textContent = `Vidéo prête (${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo)`;
        } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
      };
      $('#sharevid').onclick = async () => {
        if (!clip) return;
        const file = new File([clip.blob], `course-${race.round}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: clip.mime });
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch { /* annulé */ } return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
      };
    },
  });
}

// ---------- Statistiques des posts ----------
const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR'));
const STAT_LABELS = [['views', 'Vues'], ['reach', 'Portée'], ['likes', "J'aime"], ['comments', 'Comm.'], ['shares', 'Partages'], ['saves', 'Enreg.']];
async function statsTab(body) {
  body.innerHTML = '<p class="muted">Lecture des statistiques…</p>';
  const r = await api('stats');
  const f = Object.entries(r.followers || {});
  body.innerHTML = `<div id="schedlist"></div>${f.length ? `<div class="row" style="margin-top:12px">${f.map(([n, v]) => `<div class="card" style="width:auto;cursor:default"><div class="t">${fmtN(v)}</div><div class="small muted">abonnés ${esc(NET_NAMES[n] || n)}</div></div>`).join('')}</div>` : ''}
    <div class="list">${(r.posts || []).map((p) => `<div class="card" style="cursor:default"><div class="row"><div class="t">${esc(p.title || 'Post')}</div><span class="spacer"></span><button data-statsremove="${esc(p.key)}">Retirer</button></div><div class="small muted">${esc(new Date(p.at).toLocaleString('fr-FR'))}</div>
      ${Object.entries(p.nets).map(([n, x]) => { const s = p.stats?.[n]; const vals = s && !s.error ? STAT_LABELS.filter(([k]) => s[k] != null).map(([k, l]) => `${l} <b>${fmtN(s[k])}</b>`).join(' · ') : s?.error ? `statistiques indisponibles <span class="muted">(${esc(s.error)})</span>` : 'statistiques indisponibles'; return `<div class="small">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:var(--text)">${esc(NET_NAMES[n] || n)}</a>` : esc(NET_NAMES[n] || n)} : ${vals}</div>`; }).join('')}</div>`).join('') || '<p class="muted">Aucun post publié pour le moment.</p>'}</div>`;
  schedList($('#schedlist'));
  // Post supprimé sur les réseaux : retiré des statistiques (ici et dans l'appli)
  body.querySelectorAll('[data-statsremove]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Retirer ce post des statistiques ?\n\nÀ faire si vous l\'avez supprimé sur les réseaux : rien n\'est supprimé chez eux.')) return;
      b.disabled = true;
      try { await api('history/remove', { method: 'POST', body: JSON.stringify({ key: b.dataset.statsremove }) }); b.closest('.card').remove(); } catch (err) { b.disabled = false; alert(err.message); }
    };
  });
}

// ---------- Accueil ----------
function home() {
  const acc = [me.instagram && `Instagram ${me.instagram}`, me.facebook && `Facebook ${me.facebook}`, me.threads && `Threads ${me.threads}`, me.bluesky && `Bluesky ${me.bluesky}`].filter(Boolean).join(' · ');
  app.innerHTML = `<div class="top"><h1>Paddock <b>Studio</b></h1><span class="spacer"></span><button id="out">Quitter</button></div>
    <p class="small muted">${esc(acc || 'Aucun compte : activez la page depuis l\'appli (Posts → Publier… → Comptes…)')}</p>
    <div class="seg"><button data-tab="news" class="${state.tab === 'news' ? 'on' : ''}">News</button><button data-tab="sessions" class="${state.tab === 'sessions' ? 'on' : ''}">Séances</button><button data-tab="season" class="${state.tab === 'season' ? 'on' : ''}">Saison</button><button data-tab="stats" class="${state.tab === 'stats' ? 'on' : ''}">Stats</button></div>
    <div id="body"></div>`;
  $('#out').onclick = logout;
  app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; home(); }; });
  const body = $('#body');
  (state.tab === 'news' ? newsTab(body) : state.tab === 'stats' ? statsTab(body) : state.tab === 'season' ? seasonTab(body) : sessionsTab(body)).catch((err) => { body.innerHTML = `<p class="err">${esc(err.message)}</p>`; });
}

const startAlert = new URLSearchParams(location.search).get('alert');
if (startAlert) history.replaceState(null, '', '/studio/');
const afterLogin = () => { home(); openAlert(startAlert); };
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/studio/sw.js', { scope: '/studio/' }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (me && e.data?.alert) openAlert(e.data.alert); });
}

// Tirer vers le bas sur l'accueil (News, Séances, Stats) : listes relues ; pas dans un éditeur
// (textes en cours de saisie)
pullToRefresh(async () => {
  news = null;
  sessions = null;
  me = await api('me').catch(() => me);
  home();
  await new Promise((r) => setTimeout(r, 400));
}, { enabled: () => !!me && !!$('#body') });

(async () => {
  if (!key) { login(); return; }
  try { me = await api('me'); afterLogin(); } catch (err) { login(err.message === 'Code incorrect' ? '' : err.message); }
})();
