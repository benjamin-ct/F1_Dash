// Radios d'équipe, façon MultiViewer : une seule liste (plus récentes en haut) où chaque radio a
// sa couleur d'équipe, son tour, sa durée, un bouton lecture avec barre de progression et, si
// la transcription est activée, son texte et sa traduction. Un lecteur en bas de la liste
// (pilote, progression cliquable, vitesse, radio suivante) et la lecture automatique des
// nouvelles radios au rythme du délai TV.
//
// La liste est mise à jour ligne par ligne : une traduction terminée ou une radio qui démarre
// ne redessine que sa ligne (la liste ne « se recharge » plus, le défilement reste en place).
import { store, versionOf, on, utcToLocal } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { $, esc, drivers, teamColor, fmtClock, storageGet, storageSet } from '../util.js';
import { parseUtc } from '/shared/f1.js';
import { radioEntry, requestTranscripts, setTranscribe, transcribeStatus } from './transcribe.js';
import { icon } from '../icons.js';

const HEARD_KEY = 'f1dash.radioHeard';
const SPEEDS = [1, 1.25, 1.5, 2];

const list = (o) => (!o ? [] : Array.isArray(o) ? o.filter(Boolean) : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]).filter(Boolean));
const base = () => (store.state.SessionInfo?.Path ? `https://livetiming.formula1.com/static/${store.state.SessionInfo.Path}` : null);
const fmtDur = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

let heard = new Set(storageGet(HEARD_KEY, []));
const durations = new Map();          // url -> durée (s), connue après lecture ou transcription
let audio = null;                      // lecteur unique (écoute manuelle et automatique)
let cur = null;                        // radio en cours { url, num }
let speed = 1;
let textVer = 0;
let renderKey = '';
let ordered = [];                      // radios affichées, dans l'ordre : [{ url, num, utc }]
const rows = new Map();                // url -> { li, html }

export function radioAllowed(num) {
  num = String(num);
  if (prefs.radioFilter === 'fav') return isFav(num);
  if (prefs.radioFilter === 'duel') return num === store.duel.a || num === store.duel.b;
  return true;
}

function markHeard(url) {
  if (heard.has(url)) return;
  heard.add(url);
  const arr = [...heard];
  if (arr.length > 500) heard = new Set(arr.slice(-400));
  storageSet(HEARD_KEY, [...heard]);
}

// Tour du pilote au moment de la radio (tours bouclés avant + 1). Les tours sont datés à l'heure
// locale de réception, la radio à l'heure F1.
function lapAt(num, utc) {
  const laps = store.derived.laps?.[num];
  const t = Number.isFinite(utc) ? utcToLocal(utc) : null;
  if (!laps?.length || !Number.isFinite(t)) return null;
  let n = 0;
  for (const l of laps) if (l.t <= t && Number(l.lap) > n) n = Number(l.lap);
  return n + 1;
}

function textHtml(url) {
  if (!prefs.radioText) return '';
  const e = radioEntry(url);
  const lang = prefs.radioLang;
  if (!e) return '<div class="rd-text pending">transcription…</div>';
  if (!e.en) return '<div class="rd-text muted">(pas de parole reconnue)</div>';
  if (lang === 'none') return `<div class="rd-text">« ${esc(e.en)} »</div>`;
  return e.tr?.[lang] !== undefined && e.tr[lang] !== ''
    ? `<div class="rd-text">« ${esc(e.tr[lang])} »</div><div class="rd-orig">${esc(e.en)}</div>`
    : `<div class="rd-text">« ${esc(e.en)} »</div><div class="rd-orig pending">traduction…</div>`;
}

function rowHtml(c, dl) {
  const d = dl[c.num] || {};
  const lap = lapAt(c.num, c.utc);
  const dur = durations.get(c.url) ?? radioEntry(c.url)?.d;
  const playing = cur?.url === c.url;
  return `<span class="rd-team" style="background:${teamColor(d)}"></span>
    <button class="rd-play" title="${playing && !audio?.paused ? 'Pause' : 'Écouter'}">${icon(playing && !audio?.paused ? 'pause' : 'play')}</button>
    <div class="rd-main">
      <div class="rd-head"><b class="rd-tla">${esc(d.Tla || c.num)}</b><span class="rd-name">${esc(d.LastName || '')}</span>
        <span class="rd-meta">${lap ? `Tour ${lap} · ` : ''}${fmtClock(c.utc)}</span>${dur ? `<span class="rd-dur">${fmtDur(dur)}</span>` : ''}</div>
      <div class="rd-prog"><i></i></div>
      ${textHtml(c.url)}
    </div>`;
}

function rowClass(c) {
  return `rd${cur?.url === c.url ? ' playing' : ''}${heard.has(c.url) ? '' : ' unheard'}`;
}

export function renderRadios(force = false) {
  const el = $('#radioList');
  if (!el) return;
  // Tours des radios revus toutes les 5 s (pas à chaque mise à jour des chronos)
  const key = `${versionOf(['TeamRadio', 'DriverList', '__reset'])}|${Math.floor(performance.now() / 5000)}|${prefs.radioFilter}|${prefs.radioText}|${prefs.radioLang}|${store.duel.a}|${store.duel.b}|${prefs.favs.join()}|${textVer}`;
  if (key === renderKey && !force) return;
  renderKey = key;
  $('#radioOpts').hidden = !prefs.radioText;
  const b = base();
  const dl = drivers(store.state);
  ordered = b ? list(store.state.TeamRadio?.Captures)
    .filter((c) => c.Path && radioAllowed(c.RacingNumber))
    .map((c) => ({ url: b + c.Path, num: String(c.RacingNumber), utc: parseUtc(c.Utc) }))
    .sort((x, y) => y.utc - x.utc) : [];
  if (!ordered.length) {
    rows.clear();
    el.innerHTML = `<li class="note">${b ? 'Aucune radio d\'équipe pour l\'instant.' : 'Pas de séance en cours.'}</li>`;
    return;
  }
  el.querySelector(':scope > .note')?.remove();
  if (prefs.radioText) {
    requestTranscripts(ordered.slice(0, 40).map((c) => {
      const d = dl[c.num] || {};
      return { url: c.url, who: [d.FullName || d.Tla, d.TeamName].filter(Boolean).join(', ') };
    }));
  }
  // Lignes : créées, mises à jour seulement si leur contenu change, puis remises dans l'ordre
  const keep = new Set();
  let prev = null;
  for (const c of ordered) {
    keep.add(c.url);
    let r = rows.get(c.url);
    const html = rowHtml(c, dl);
    if (!r) {
      const li = document.createElement('li');
      li.dataset.url = c.url;
      li.dataset.num = c.num;
      r = { li, html: '' };
      rows.set(c.url, r);
    }
    if (r.html !== html) { r.li.innerHTML = html; r.html = html; }
    r.li.className = rowClass(c);
    const want = prev ? prev.nextSibling : el.firstChild;
    if (want !== r.li) el.insertBefore(r.li, want);
    prev = r.li;
  }
  for (const [url, r] of rows) if (!keep.has(url)) { r.li.remove(); rows.delete(url); }
  paintProgress();
}

function refreshRow(url) {
  const r = rows.get(url);
  const c = ordered.find((x) => x.url === url);
  if (!r || !c) return;
  const html = rowHtml(c, drivers(store.state));
  if (r.html !== html) { r.li.innerHTML = html; r.html = html; }
  r.li.className = rowClass(c);
}

// ---------- Lecteur ----------
function player() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('loadedmetadata', () => {
    if (cur && Number.isFinite(audio.duration)) { durations.set(cur.url, audio.duration); refreshRow(cur.url); }
  });
  audio.addEventListener('play', () => { if (cur) refreshRow(cur.url); renderNow(); tick(); });
  audio.addEventListener('pause', () => { if (cur) refreshRow(cur.url); renderNow(); });
  audio.addEventListener('ended', () => {
    const done = cur;
    if (done) refreshRow(done.url);
    if (!playQueued()) { cur = null; if (done) refreshRow(done.url); renderNow(); }
  });
  audio.addEventListener('error', () => { if (cur) refreshRow(cur.url); renderNow(); });
  return audio;
}

export function playRadio(url) {
  const a = player();
  if (cur?.url === url) {
    if (a.paused) a.play().catch(() => {}); else a.pause();
    return;
  }
  const prev = cur;
  cur = { url, num: ordered.find((x) => x.url === url)?.num || rows.get(url)?.li.dataset.num };
  a.src = url;
  a.playbackRate = speed;
  markHeard(url);
  if (prev) refreshRow(prev.url);
  refreshRow(url);
  a.play().catch(() => { /* le navigateur exige une interaction préalable */ });
  renderNow();
}

function paintProgress() {
  if (!cur || !audio) return;
  const p = audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
  const bar = rows.get(cur.url)?.li.querySelector('.rd-prog i');
  if (bar) bar.style.transform = `scaleX(${p})`;
  const nb = $('#radioNowBar i');
  if (nb) nb.style.transform = `scaleX(${p})`;
  const t = $('#radioNowTime');
  if (t) t.textContent = `${fmtDur(audio.currentTime) || '0:00'} / ${fmtDur(audio.duration) || '–:––'}`;
}

let ticking = false;
function tick() {
  if (ticking) return;
  ticking = true;
  const step = () => {
    paintProgress();
    if (audio && !audio.paused && !audio.ended) requestAnimationFrame(step);
    else ticking = false;
  };
  requestAnimationFrame(step);
}

function renderNow() {
  const box = $('#radioNow');
  if (!box) return;
  box.hidden = !cur;
  if (!cur) return;
  const d = drivers(store.state)[cur.num] || {};
  $('#radioNowPlay').innerHTML = icon(audio && !audio.paused ? 'pause' : 'play');
  $('#radioNowWho').innerHTML = `<span class="drv-bar" style="background:${teamColor(d)}"></span><b>${esc(d.Tla || cur.num || '')}</b> <span class="muted">${esc(d.LastName || '')}</span>`;
  $('#radioNowSpeed').textContent = `${String(speed).replace('.', ',')}×`;
  paintProgress();
}

// ---------- Lecture automatique des nouvelles radios ----------
// Une seule fenêtre joue les radios (sinon chaque fenêtre ouverte les lit aussi et le son est
// en double) : verrou partagé, repris par une autre fenêtre si celle qui le détient se ferme.
const queue = [];
const seen = new Set();
let isRadioPlayer = !navigator.locks;
navigator.locks?.request('f1dash-radio-player', () => {
  isRadioPlayer = true;
  return new Promise(() => {});
});

function playQueued() {
  const next = queue.shift();
  if (!next) return false;
  playRadio(next);
  return true;
}

// ---------- Initialisation ----------
export function initRadios() {
  $('#radioFilter').value = prefs.radioFilter;
  $('#radioAuto').checked = prefs.radioAuto;
  $('#radioText').checked = prefs.radioText;
  $('#radioLang').value = prefs.radioLang;
  $('#radioQuality').value = prefs.radioQuality;
  setTranscribe(prefs.radioText, prefs.radioLang, prefs.radioQuality);
  $('#radioFilter').addEventListener('change', (e) => setPref('radioFilter', e.target.value));
  $('#radioAuto').addEventListener('change', (e) => setPref('radioAuto', e.target.checked));
  $('#radioText').addEventListener('change', (e) => setPref('radioText', e.target.checked));
  $('#radioLang').addEventListener('change', (e) => setPref('radioLang', e.target.value));
  $('#radioQuality').addEventListener('change', (e) => setPref('radioQuality', e.target.value));
  on('prefs', (k) => {
    if (k === 'radioAuto') $('#radioAuto').checked = prefs.radioAuto;
    if (k === 'radioFilter') $('#radioFilter').value = prefs.radioFilter;
    if (!['radioText', 'radioLang', 'radioQuality'].includes(k)) return;
    $('#radioText').checked = prefs.radioText;
    $('#radioLang').value = prefs.radioLang;
    $('#radioQuality').value = prefs.radioQuality;
    setTranscribe(prefs.radioText, prefs.radioLang, prefs.radioQuality);
    showStatus();
  });
  const showStatus = () => { $('#radioTextStatus').textContent = prefs.radioText ? transcribeStatus().msg : ''; };
  on('radioStatus', showStatus);
  showStatus();
  on('radioText', () => { textVer++; });

  $('#radioList').addEventListener('click', (e) => {
    const li = e.target.closest('li.rd');
    if (!li || e.target.closest('a')) return;
    // Clic sur la barre de progression de la radio en cours : saut à cet endroit
    const bar = e.target.closest('.rd-prog');
    if (bar && cur?.url === li.dataset.url && audio?.duration > 0) {
      const r = bar.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      paintProgress();
      return;
    }
    playRadio(li.dataset.url);
  });
  $('#radioNowPlay').addEventListener('click', () => { if (cur) playRadio(cur.url); });
  $('#radioNowBar').addEventListener('click', (e) => {
    if (!audio?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
    paintProgress();
  });
  $('#radioNowSpeed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    if (audio) audio.playbackRate = speed;
    renderNow();
  });
  $('#radioNowNext').addEventListener('click', () => {
    if (playQueued()) return;
    const i = ordered.findIndex((x) => x.url === cur?.url);
    const next = ordered[i + 1];
    if (next) playRadio(next.url);
  });

  // Nouvelles radios (au rythme du délai TV) : lecture automatique, l'une après l'autre
  on('events', (events) => {
    const b = base();
    if (!b) return;
    for (const [topic, data] of events) {
      if (topic !== 'TeamRadio' || !data?.Captures) continue;
      for (const c of list(data.Captures)) {
        if (!c?.Path || seen.has(c.Path)) continue;
        seen.add(c.Path);
        if (prefs.radioAuto && isRadioPlayer && radioAllowed(c.RacingNumber)) queue.push(b + c.Path);
      }
    }
    if (queue.length && (!audio || audio.paused || audio.ended)) playQueued();
  });
  on('reset', () => { queue.length = 0; });
}
