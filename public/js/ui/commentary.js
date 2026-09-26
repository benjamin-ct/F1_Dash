// Commentaires en direct F1 TV Pro : lecture de la piste audio (langue au choix) de la vidéo F1 TV
// de la séance, calée sur le délai du dashboard grâce à l'horodatage du flux (PROGRAM-DATE-TIME).
import { store, f1Now, on } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { $, esc, api } from '../util.js';

const LANG_NAMES = { ENG: 'Anglais', FRA: 'Français', DEU: 'Allemand', NLD: 'Néerlandais', SPA: 'Espagnol', POR: 'Portugais', JPN: 'Japonais', ITA: 'Italien' };
const TO_ISO = { ENG: 'en', FRA: 'fr', DEU: 'de', NLD: 'nl', SPA: 'es', POR: 'pt', JPN: 'ja', ITA: 'it' };
const FROM_ISO = Object.fromEntries(Object.entries(TO_ISO).map(([k, v]) => [v, k]));
const ALIASES = { fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', dut: 'nl', nld: 'nl', eng: 'en', spa: 'es', por: 'pt', jpn: 'ja', ita: 'it' };

let player = null;
let shakaLoading = null;
let content = null;      // vidéo F1 TV de la séance
let contentKey = '';
let playing = false;
let stream = null;       // réponse /api/f1tv/play
let syncTimer = null;

const media = () => $('#commMedia');

function status(text, cls = '') {
  const el = $('#commStatus');
  el.textContent = text;
  el.className = `comm-status small ${cls}`;
}

function iso(code) {
  const c = String(code || '').toLowerCase().split('-')[0];
  return ALIASES[c] || c;
}

function loadShaka() {
  if (window.shaka) return Promise.resolve(window.shaka);
  shakaLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/shaka/shaka-player.compiled.js';
    s.onload = () => resolve(window.shaka);
    s.onerror = () => reject(new Error('Lecteur audio introuvable'));
    document.head.appendChild(s);
  });
  return shakaLoading;
}

const proxied = (u) => `/api/f1tv/proxy?u=${encodeURIComponent(u)}`;

function sessionKeys() {
  const info = store.state.SessionInfo;
  if (!info?.Meeting?.Key || !info?.Key) return null;
  return { meeting: info.Meeting.Key, session: info.Key, label: `${info.Meeting.Name || ''} — ${info.Name || ''}` };
}

// ---------- Recherche de la vidéo F1 TV de la séance ----------
async function refreshContent(force = false) {
  const k = sessionKeys();
  const key = k ? `${k.meeting}|${k.session}` : '';
  if (!force && key === contentKey) return;
  contentKey = key;
  content = null;
  renderSelectors();
  if (!k) { $('#commInfo').textContent = 'En attente des informations de la séance…'; return; }
  $('#commInfo').textContent = `Recherche de la vidéo F1 TV (${k.label})…`;
  try {
    const r = await api(`/api/f1tv/content?meeting=${encodeURIComponent(k.meeting)}&session=${encodeURIComponent(k.session)}`);
    if (contentKey !== key) return;
    content = r.content;
    $('#commInfo').innerHTML = content
      ? `${esc(content.title || '')} <span class="muted">(${content.live ? 'en direct' : 'rediffusion'})</span>`
      : `Aucune vidéo F1 TV trouvée pour cette séance (${esc(k.label)}).`;
  } catch (err) {
    $('#commInfo').textContent = `Recherche F1 TV impossible : ${err.message}`;
  }
  renderSelectors();
}

function renderSelectors() {
  const chSel = $('#commChannel');
  const channels = content?.channels?.length ? content.channels : [{ channelId: null, title: 'INTERNATIONAL', main: true }];
  chSel.innerHTML = channels.map((c) => `<option value="${c.main ? '' : esc(c.channelId)}">${esc(c.title === 'INTERNATIONAL' ? 'International (commentaires)' : c.title === 'F1 LIVE' ? 'F1 Live (émission F1 TV)' : c.title)}</option>`).join('');
  chSel.value = prefs.commChannel && channels.some((c) => String(c.channelId) === String(prefs.commChannel) && !c.main) ? String(prefs.commChannel) : '';
  renderLanguages();
}

// Langues : celles du flux en cours de lecture (sinon celles annoncées par F1 TV).
function renderLanguages() {
  const sel = $('#commLang');
  let langs = [];
  if (player && playing) {
    langs = [...new Set(player.getAudioTracks().map((l) => iso(l.language)))].map((l) => ({ value: FROM_ISO[l] || l.toUpperCase(), label: LANG_NAMES[FROM_ISO[l]] || l }));
  }
  if (!langs.length) langs = (content?.languages || ['ENG', 'FRA', 'DEU', 'NLD', 'SPA', 'POR']).map((c) => ({ value: c, label: LANG_NAMES[c] || c }));
  if (!langs.some((l) => l.value === prefs.commLang)) langs.push({ value: prefs.commLang, label: `${LANG_NAMES[prefs.commLang] || prefs.commLang} (indisponible ?)` });
  sel.innerHTML = langs.map((l) => `<option value="${esc(l.value)}">${esc(l.label)}</option>`).join('');
  sel.value = prefs.commLang;
}

// ---------- Lecture ----------
async function widevineAvailable() {
  if (!navigator.requestMediaKeySystemAccess) return false;
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]);
    return true;
  } catch { return false; }
}

async function start() {
  await refreshContent();
  if (!content) { status('Pas de vidéo F1 TV pour cette séance : impossible de lancer les commentaires.', 'err'); return; }
  playing = true;
  renderButtons();
  status('Demande du flux à F1 TV…');
  try {
    const q = new URLSearchParams({ contentId: content.contentId });
    if (prefs.commChannel) q.set('channelId', prefs.commChannel);
    stream = await api(`/api/f1tv/play?${q}`);
    if (!stream.ok) {
      const tried = stream.tried || [];
      const acc = stream.account || {};
      const who = [acc.product && `offre « ${acc.product} »`, acc.country && `pays ${acc.country}`].filter(Boolean).join(', ');
      const t = tried.map((x) => `${x.format} → HTTP ${x.status}${x.message ? ` (${x.message})` : ''}`).join('\n');
      if (tried.some((x) => /technical package not available/i.test(x.message || ''))) {
        throw new Error(`F1 TV refuse la vidéo : elle n'est pas incluse dans votre abonnement${who ? ` (${who})` : ''}. Le son et la vidéo des séances font partie de l'offre F1 TV Pro ; l'offre F1 TV Access (la seule proposée dans certains pays, dont la France) ne les inclut pas.\n\nDétail :\n${t}`);
      }
      throw new Error(`F1 TV a refusé le flux${who ? ` (${who})` : ''}. Vérifiez que votre abonnement est « Pro » et que le jeton est valide.\n${t}`);
    }
    if (stream.drm && !(await widevineAvailable())) {
      throw new Error(`Ce flux est protégé par DRM (${stream.drm}, ${stream.streamType || stream.format}) et cette version ne contient pas le module Widevine nécessaire pour le lire.\nDans l'application Windows, il faut une version d'Electron avec Widevine (prochaine étape) ; en attendant, essayez dans Chrome ou Edge : http://127.0.0.1:${location.port || 3000}`);
    }
    const shaka = await loadShaka();
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) throw new Error('Navigateur non compatible avec le lecteur audio.');
    if (!player) {
      player = new shaka.Player();
      await player.attach(media());
      const net = player.getNetworkingEngine();
      net.registerRequestFilter((type, req) => {
        req.uris = req.uris.map((u) => (/^https?:/i.test(u) ? proxied(u) : u));
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && stream?.drmToken) req.headers['x-f1tv-entitlement'] = stream.drmToken;
      });
      // Les adresses relatives des manifestes se résolvent par rapport à l'adresse d'origine.
      net.registerResponseFilter((type, res) => {
        const up = res.headers?.['x-upstream-url'];
        if (up) res.uri = up;
      });
      player.addEventListener('error', (e) => fail(e.detail));
      player.addEventListener('adaptation', renderLanguages);
      player.addEventListener('trackschanged', renderLanguages);
    }
    player.configure({
      manifest: { disableVideo: true },
      preferredAudio: [{ language: TO_ISO[prefs.commLang] || 'en' }],
      streaming: { bufferingGoal: 20, rebufferingGoal: 2, bufferBehind: 30 },
      drm: stream.drm && stream.laURL ? { servers: { 'com.widevine.alpha': stream.laURL } } : { servers: {} },
    });
    status(`Chargement du flux (${stream.streamType || stream.format}${stream.drm ? `, DRM ${stream.drm}` : ''})…`);
    await player.load(stream.url);
    applyVolume();
    selectLanguage();
    await media().play().catch(() => {});
    status(`Lecture en cours · ${stream.streamType || stream.format}${stream.drm ? ` · DRM ${stream.drm}` : ''}`, 'ok');
    renderLanguages();
    startSync();
  } catch (err) {
    fail(err);
  }
}

function describe(err) {
  if (!err) return 'erreur inconnue';
  if (err.code && window.shaka) {
    const name = Object.entries(window.shaka.util.Error.Code).find(([, v]) => v === err.code)?.[0] || err.code;
    const http = err.data?.find?.((d) => typeof d === 'number' && d >= 400);
    return `Erreur du lecteur ${name}${http ? ` (HTTP ${http})` : ''}`;
  }
  return err.message || String(err);
}

function fail(err) {
  console.warn('[commentaires]', err);
  status(describe(err), 'err');
  stop(false);
}

async function stop(clearStatus = true) {
  playing = false;
  clearInterval(syncTimer);
  syncTimer = null;
  try { await player?.unload(); } catch { /* ignore */ }
  if (clearStatus) status('');
  renderButtons();
}

function selectLanguage() {
  if (!player) return;
  const want = TO_ISO[prefs.commLang] || 'en';
  const avail = player.getAudioTracks();
  // Plusieurs pistes dans la langue : on garde la stéréo (la plus légère) plutôt que le 5.1
  const match = avail.filter((l) => iso(l.language) === want).sort((a, b) => (a.channelsCount || 2) - (b.channelsCount || 2))[0];
  if (match) { if (!match.active) player.selectAudioTrack(match); }
  else if (avail.length) status(`Langue « ${LANG_NAMES[prefs.commLang] || prefs.commLang} » absente de ce flux : ${avail.map((l) => LANG_NAMES[FROM_ISO[iso(l.language)]] || l.language).join(', ')}.`, 'err');
}

function applyVolume() {
  const m = media();
  m.volume = prefs.commVolume;
  m.muted = prefs.commMuted;
  $('#commVol').value = prefs.commVolume;
  $('#commVolVal').textContent = `${Math.round(prefs.commVolume * 100)} %`;
  renderButtons();
}

function renderButtons() {
  $('#commPlay').textContent = playing ? '⏹ Arrêter' : '▶ Écouter';
  $('#commPlay').classList.toggle('btn-accent', !playing);
  $('#commMute').textContent = prefs.commMuted ? '🔇' : '🔊';
  $('#commBtn').classList.toggle('on', playing);
  $('#commBtn').classList.toggle('muted', playing && prefs.commMuted);
  $('#commOffset').textContent = `${prefs.commOffset >= 0 ? '+' : ''}${prefs.commOffset.toFixed(1).replace('.', ',')} s`;
  $('#commSync').checked = prefs.commSync;
}

// ---------- Synchronisation avec le délai du dashboard ----------
// L'horodatage du flux (heure réelle de l'image) est comparé à l'heure F1 affichée par le dashboard.
function startSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(syncStep, 1000);
}

function syncStep() {
  const m = media();
  if (!player || !playing || m.paused && m.readyState < 2) return;
  if (!prefs.commSync) { m.playbackRate = 1; return; }
  const date = player.getPlayheadTimeAsDate?.();
  // Sans PROGRAM-DATE-TIME, shaka renvoie une date fictive (1970) : pas de calage possible.
  if (!date || date.getTime() < Date.UTC(2000, 0, 1)) {
    m.playbackRate = 1;
    // Direct sans horodatage : position = bord du direct − décalage manuel
    if (player.isLive?.()) {
      const r = player.seekRange();
      const want = Math.max(r.start, r.end - 3 - Math.max(0, prefs.commOffset));
      if (Math.abs(m.currentTime - want) > 1.5) m.currentTime = want;
      status('Lecture en cours · flux sans horodatage : calé sur le direct, ajustez le « décalage du son » à l\'oreille.', 'ok');
      return;
    } status('Lecture en cours · pas d\'horodatage dans ce flux : calage automatique impossible (réglez le décalage à la main).', 'ok'); return; }
  const target = f1Now() - prefs.commOffset * 1000;
  const diff = (date.getTime() - target) / 1000; // > 0 : le son est en avance sur le dashboard
  const range = player.seekRange();
  if (Math.abs(diff) > 2) {
    const want = m.currentTime - diff;
    const t = Math.max(range.start, Math.min(range.end, want));
    m.currentTime = t;
    m.playbackRate = 1;
    if (want > range.end + 1) status(`Le flux F1 TV a ${(want - range.end).toFixed(0)} s de retard sur le dashboard : augmentez le délai du dashboard (ou réduisez le décalage du son) pour les caler.`, 'err');
    else if (want < range.start - 1) status('Le moment affiché est trop ancien pour ce flux (hors de la fenêtre disponible).', 'err');
  } else {
    // Petits écarts : on accélère ou ralentit légèrement, sans coupure
    m.playbackRate = Math.abs(diff) < 0.25 ? 1 : diff > 0 ? 0.97 : 1.03;
    if ($('#commStatus').classList.contains('err') && Math.abs(diff) < 1) status(`Lecture en cours · calé sur le dashboard`, 'ok');
  }
}

// ---------- Initialisation ----------
export function initCommentary() {
  const panel = $('#commPanel');
  $('#commBtn').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) refreshContent();
  });
  $('#commClose').addEventListener('click', () => { panel.hidden = true; });
  $('#commPlay').addEventListener('click', () => (playing ? stop() : start()));
  $('#commMute').addEventListener('click', () => setPref('commMuted', !prefs.commMuted));
  $('#commVol').addEventListener('input', (e) => {
    setPref('commVolume', Number(e.target.value));
    if (prefs.commMuted && prefs.commVolume > 0) setPref('commMuted', false);
  });
  $('#commLang').addEventListener('change', (e) => { setPref('commLang', e.target.value); selectLanguage(); });
  $('#commChannel').addEventListener('change', async (e) => {
    setPref('commChannel', e.target.value || null);
    if (playing) { await stop(); start(); }
  });
  $('#commSync').addEventListener('change', (e) => setPref('commSync', e.target.checked));
  panel.querySelector('.comm-offset').addEventListener('click', (e) => {
    const b = e.target.closest('[data-coff]');
    if (b) setPref('commOffset', Math.round((prefs.commOffset + Number(b.dataset.coff)) * 10) / 10);
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, select, textarea') && playing) setPref('commMuted', !prefs.commMuted);
  });
  on('prefs', (k) => {
    if (k === 'commVolume' || k === 'commMuted') applyVolume();
    if (k === 'commOffset' || k === 'commSync') renderButtons();
  });
  on('status', () => { if (!panel.hidden) refreshContent(); });
  applyVolume();
  renderSelectors();
}

export const _test = { iso, TO_ISO };
