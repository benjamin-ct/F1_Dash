// Point d'entrée de l'interface.
import { store, on } from './store.js';
import { $$ } from './util.js';
import { connect } from './conn.js';
import { renderHeader, renderSource } from './ui/header.js';
import { initDelay } from './ui/delay.js';
import { initTower, renderTower } from './ui/tower.js';
import { initMap } from './ui/map.js';
import { initDuel, renderDuel } from './ui/duel.js';
import { renderRcm, renderRadio, renderPits, renderTranscripts } from './ui/feed.js';
import { renderTelemetry, renderStrategy, renderWeather, renderChampionship } from './ui/extra.js';
import { initSettings } from './ui/settings.js';
import { renderPitSim, renderBattles, initRaceTools } from './ui/race-tools.js';
import { initAlerts } from './ui/alerts.js';
import { initWakeLock } from './ui/wakelock.js';
import { initSelects } from './ui/select.js';
import { initLegends, legendsToggle } from './ui/legends.js';
import { initRadio, initStewards, renderStewards, initRcmFilters } from './ui/feed.js';
import { initLayout } from './ui/layout.js';
import { initUpdates } from './ui/updates.js';
import { initCommentary } from './ui/commentary.js';
import { initAnalysis, renderAnalysis } from './ui/analysis.js';
import { initSeason } from './ui/season.js';
import { initRail } from './ui/rail.js';
import { initTyres, renderTyres } from './ui/tyres.js';

function initTabs() {
  for (const head of $$('[data-tabs]')) {
    const panel = head.closest('.panel');
    head.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      for (const t of head.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === b);
      for (const p of panel.querySelectorAll('[data-pane]')) p.classList.toggle('active', p.dataset.pane === b.dataset.tab);
    });
  }
}

function safe(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// Pendant un clic (bouton de souris enfoncé), on ne reconstruit pas l'interface : sinon le
// bouton visé (A/B du classement, onglets…) peut être remplacé entre l'appui et le relâchement
// et le clic est perdu. Sécurité : reprise au bout de 1,5 s.
let pressedAt = 0;
window.addEventListener('pointerdown', () => { pressedAt = performance.now(); }, true);
for (const evt of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(evt, () => { pressedAt = 0; }, true);
window.addEventListener('click', () => { pressedAt = 0; }, true);

function loop() {
  if (pressedAt && performance.now() - pressedAt < 1500) { setTimeout(loop, 50); return; }
  safe(renderHeader);
  safe(renderTower);
  safe(renderDuel);
  safe(renderRcm);
  safe(renderRadio);
  safe(renderTranscripts);
  safe(renderPits);
  safe(renderTelemetry);
  safe(renderStrategy);
  safe(renderTyres);
  safe(renderWeather);
  safe(renderChampionship);
  safe(renderPitSim);
  safe(renderBattles);
  safe(renderStewards);
  safe(renderAnalysis);
  setTimeout(loop, 100);
}

initTabs();
initDelay();
initTower();
initMap();
initDuel();
initSettings();
initRaceTools();
initAlerts();
initWakeLock();
initSelects();
initLegends();
legendsToggle(document.querySelector('#legendsOn'));
initRadio();
initRcmFilters();
initStewards();
initLayout();
initUpdates();
initCommentary();
initAnalysis();
initSeason();
initRail();
initTyres();
on('status', renderSource);
on('connection', renderSource);
on('focus', () => renderTower(true));
on('duel', () => renderTower(true));
connect();
loop();

// Accès debug depuis la console : window.f1dash
window.f1dash = store;
