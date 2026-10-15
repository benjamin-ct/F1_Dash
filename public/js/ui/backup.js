// Sauvegarde des réglages dans un fichier et restauration (Réglages → Application).
import { makeBackup, readBackup, UI_KEYS, PREFIX } from '/shared/backup.js';
import { $, storageGet } from '../util.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';

const RESTORED = `${PREFIX}restored`;

async function serverPart(method, body) {
  const res = await fetch('/api/backup', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 403) return null;   // téléphone : seuls les réglages de l'interface
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
  return res.json();
}

async function exportFile() {
  const ui = {};
  for (const k of UI_KEYS) {
    const v = storageGet(PREFIX + k, undefined);
    if (v !== undefined) ui[k] = v;
  }
  let server = null;
  try { server = await serverPart('GET'); } catch { /* serveur injoignable : interface seule */ }
  const blob = new Blob([JSON.stringify(makeBackup(ui, server), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paddock-live-reglages-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function importFile(file) {
  let data;
  try { data = readBackup(await file.text()); } catch (err) { toast(t(err.message), 5000, 'warning'); return; }
  const when = data.date ? new Date(data.date).toLocaleString() : '?';
  if (!window.confirm(t('Restaurer les réglages de cette sauvegarde ({}) ?\n\nVos réglages actuels seront remplacés et l\'application va se recharger.', when))) return;
  try {
    for (const [k, v] of Object.entries(data.ui)) localStorage.setItem(PREFIX + k, JSON.stringify(v));
  } catch { toast(t('Stockage du navigateur indisponible : restauration impossible'), 5000, 'warning'); return; }
  let partial = false;
  if (data.server) {
    try { if (!(await serverPart('POST', data.server))) partial = true; } catch { partial = true; }
  }
  toast(partial ? t('Réglages de l\'affichage restaurés (sources d\'actualités et lumières : à restaurer depuis l\'ordinateur)') : t('Réglages restaurés'), 3000, 'check');
  // Les autres fenêtres ouvertes se rechargent aussi
  try { localStorage.setItem(RESTORED, String(Date.now())); } catch { /* stockage indisponible */ }
  setTimeout(() => location.reload(), 1200);
}

export function initBackup() {
  window.addEventListener('storage', (e) => { if (e.key === RESTORED && e.newValue) location.reload(); });
  const input = $('#backupFile');
  if (!input) return;
  $('#backupExport').addEventListener('click', () => exportFile().catch((err) => toast(err.message, 5000, 'warning')));
  $('#backupImport').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) importFile(f);
  });
}
