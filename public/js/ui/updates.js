// Mises à jour automatiques de l'application Windows (visible uniquement dans l'appli de bureau).
import { $ } from '../util.js';
import { toast } from './delay.js';

const desk = window.f1desktop;
let dismissed = false;

function fmt(s) {
  switch (s.status) {
    case 'checking': return 'Recherche d\'une nouvelle version…';
    case 'up-to-date': return `✔ Vous avez la dernière version (${s.current}).`;
    case 'available': return `Nouvelle version ${s.latest?.version} disponible (vous avez ${s.current}).`;
    case 'downloading': return `Téléchargement de la version ${s.latest?.version}… ${Math.round((s.progress || 0) * 100)} %`;
    case 'ready': return `✅ Version ${s.latest?.version} prête : elle sera installée à la fermeture de l'appli, ou tout de suite avec « Redémarrer ».`;
    case 'error': return `⚠ ${s.error}`;
    case 'unsupported': return 'Mise à jour automatique disponible uniquement sous Windows.';
    default: return `Version ${s.current}`;
  }
}

function render(s) {
  $('#updateStatus').textContent = `${fmt(s)} ${s.kind === 'portable' ? '· version portable' : s.kind === 'installer' ? '· version installée' : ''}`;
  $('#updateAuto').checked = s.auto;
  $('#updateInstall').hidden = s.status !== 'ready';
  $('#updateCheck').hidden = s.status === 'unsupported';
  const pill = $('#updatePill');
  pill.hidden = s.status !== 'ready' || dismissed;
  $('#updatePillText').textContent = `🔄 F1 Dash ${s.latest?.version} est prête`;
}

async function install() {
  const r = await desk.installUpdate();
  if (!r?.ok) toast(r?.error || 'Installation impossible', 6000);
  else toast('Installation de la mise à jour… l\'appli va redémarrer', 6000);
}

export function initUpdates() {
  if (!desk?.version) return;
  $('#updateBlock').hidden = false;
  desk.onUpdate(render);
  desk.version().then(render);
  $('#updateCheck').addEventListener('click', async () => render(await desk.checkUpdate()));
  $('#updateInstall').addEventListener('click', install);
  $('#updatePillBtn').addEventListener('click', install);
  $('#updatePillClose').addEventListener('click', () => { dismissed = true; $('#updatePill').hidden = true; });
  $('#updateAuto').addEventListener('change', async (e) => render(await desk.setAutoUpdate(e.target.checked)));
}
