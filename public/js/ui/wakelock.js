// Écran toujours allumé pendant une séance (téléphone posé à côté de la TV, ordinateur sans
// clavier touché pendant 2 h). On utilise l'API Wake Lock quand elle existe. Sinon, pour une
// page ouverte en http:// depuis le réseau local, on lit en boucle une vidéo muette minuscule.
// Le navigateur exige alors un premier appui sur l'écran.
import { store, on } from '../store.js';
import { prefs } from '../prefs.js';
import { webm, mp4 } from '../../vendor/nosleep/media.js';

const native = 'wakeLock' in navigator;
let lock = null;
let video = null;
let pending = false;

// Séance en cours (ou sur le point de commencer) : pas après l'arrivée validée
const sessionRunning = () => {
  const st = store.state.SessionStatus?.Status || store.state.SessionInfo?.SessionStatus;
  return !!store.state.SessionInfo && !['Finalised', 'Ends'].includes(st);
};

const wanted = () => prefs.keepAwake && !document.hidden && sessionRunning();

function makeVideo() {
  const v = document.createElement('video');
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.muted = true;
  v.setAttribute('title', 'F1 Dash');
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
  for (const [type, src] of [['webm', webm], ['mp4', mp4]]) {
    const s = document.createElement('source');
    s.src = src;
    s.type = `video/${type}`;
    v.appendChild(s);
  }
  v.addEventListener('loadedmetadata', () => {
    if (v.duration <= 1) v.loop = true;
    else v.addEventListener('timeupdate', () => { if (v.currentTime > 0.5) v.currentTime = Math.random(); });
  });
  document.body.appendChild(v);
  return v;
}

async function acquire() {
  if (native) {
    if (lock || pending) return;
    pending = true;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { /* refusé (économie d'énergie…) : on réessaiera */ } finally { pending = false; }
  } else {
    video ||= makeVideo();
    if (video.paused) video.play().catch(() => { /* attend un appui sur l'écran */ });
  }
}

function release() {
  if (lock) { lock.release().catch(() => {}); lock = null; }
  if (video && !video.paused) video.pause();
}

export function updateWakeLock() {
  if (wanted()) acquire();
  else release();
}

export function initWakeLock() {
  document.addEventListener('visibilitychange', updateWakeLock);
  // Lecture vidéo et Wake Lock demandent parfois un geste de l'utilisateur
  window.addEventListener('pointerdown', updateWakeLock, { passive: true });
  on('reset', updateWakeLock);
  on('prefs', (k) => { if (k === 'keepAwake') updateWakeLock(); });
  on('events', (events) => { if (events.some(([t]) => t === 'SessionStatus' || t === 'SessionInfo')) updateWakeLock(); });
  updateWakeLock();
}
