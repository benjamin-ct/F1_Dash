// Mise à jour automatique de l'application Windows (installateur et version portable).
// Les versions sont lues sur les Releases du dépôt public (package.json → f1dash.updateRepo),
// téléchargées en arrière-plan, vérifiées (empreinte SHA-256 fournie par GitHub), puis installées :
// - installateur : exécution silencieuse du nouvel installateur, puis relance de l'appli ;
// - portable : remplacement du fichier .exe (l'ancien est renommé puis supprimé au démarrage suivant).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const pkg = require('./package.json');
const REPO = process.env.F1DASH_UPDATE_REPO || pkg.f1dash?.updateRepo || 'benjamin-ct/F1_Dash';
const CHECK_EVERY_MS = 6 * 3600 * 1000;

const state = {
  current: app.getVersion(),
  kind: process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : (process.platform === 'win32' ? 'installer' : 'unsupported'),
  status: 'idle', // idle | checking | up-to-date | downloading | ready | error | unsupported
  latest: null,
  progress: 0,
  error: null,
  file: null,
  checkedAt: null,
  auto: true,
};

let settingsFile = null;

function loadSettings() {
  try { Object.assign(state, { auto: JSON.parse(fs.readFileSync(settingsFile, 'utf8')).auto !== false }); } catch { /* défaut */ }
}

function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify({ auto: state.auto })); } catch { /* ignore */ }
}

function broadcast() {
  const payload = publicState();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update-state', payload);
  }
}

function publicState() {
  const { file, ...rest } = state;
  return { ...rest, repo: REPO };
}

function set(patch) {
  Object.assign(state, patch);
  broadcast();
}

// "1.2.10" > "1.2.9"
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

function pickAsset(release) {
  const re = state.kind === 'portable' ? /-portable\.exe$/i : /-x64-win\.exe$/i;
  return (release.assets || []).find((a) => re.test(a.name));
}

async function download(asset, dest) {
  // Lien public direct, sinon l'API GitHub (qui redirige vers le même fichier).
  let res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'F1-Dash-updater' } });
  if (!res.ok && asset.url) {
    res = await fetch(asset.url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'F1-Dash-updater' } });
  }
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = crypto.createHash('sha256');
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  let received = 0;
  let lastBroadcast = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    received += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (total && Date.now() - lastBroadcast > 500) {
      lastBroadcast = Date.now();
      set({ progress: received / total });
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  const digest = `sha256:${hash.digest('hex')}`;
  if (asset.digest && asset.digest !== digest) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Fichier téléchargé corrompu (empreinte SHA-256 différente)');
  }
  fs.renameSync(tmp, dest);
}

let running = null;

async function check({ manual = false } = {}) {
  if (state.kind === 'unsupported') { set({ status: 'unsupported' }); return publicState(); }
  if (running) return running;
  running = (async () => {
    set({ status: state.status === 'ready' ? 'ready' : 'checking', error: null });
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'F1-Dash-updater' },
      });
      if (res.status === 404) throw new Error(`Aucune version publiée sur ${REPO}`);
      if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
      const release = await res.json();
      const version = String(release.tag_name || '').replace(/^v/, '');
      set({ checkedAt: Date.now(), latest: { version, notes: release.body || '', url: release.html_url } });
      if (!newer(version, state.current)) { set({ status: 'up-to-date' }); return; }
      if (state.status === 'ready' && state.latest?.version === version && state.file) return;
      const asset = pickAsset(release);
      if (!asset) throw new Error('Fichier de mise à jour introuvable dans la version publiée');
      if (!state.auto && !manual) { set({ status: 'available' }); return; }
      const dir = path.join(app.getPath('userData'), 'updates');
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, asset.name);
      set({ status: 'downloading', progress: 0 });
      if (!fs.existsSync(dest)) await download(asset, dest);
      set({ status: 'ready', progress: 1, file: dest });
    } catch (err) {
      set({ status: 'error', error: err.message });
    }
  })().finally(() => { running = null; });
  await running;
  return publicState();
}

// Installe la mise à jour téléchargée puis relance l'application (relaunch = false : à la fermeture).
function install(relaunch = true) {
  if (state.status !== 'ready' || !state.file) return { ok: false, error: 'Aucune mise à jour prête' };
  try {
    if (state.kind === 'installer') {
      // Installateur NSIS : /S = silencieux (même dossier d'installation), --force-run = relance ensuite.
      spawn(state.file, ['/S', '--updated', ...(relaunch ? ['--force-run'] : [])], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    } else {
      const exe = process.env.PORTABLE_EXECUTABLE_FILE;
      const old = `${exe}.old`;
      fs.rmSync(old, { force: true });
      // Un .exe en cours d'exécution ne peut pas être supprimé, mais il peut être renommé.
      fs.renameSync(exe, old);
      try {
        fs.copyFileSync(state.file, exe);
      } catch (err) {
        fs.renameSync(old, exe);
        throw err;
      }
      if (relaunch) spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).on('error', () => {}).unref();
    }
    state.installing = true;
    if (relaunch) setTimeout(() => app.exit(0), 300);
    return { ok: true };
  } catch (err) {
    set({ status: 'error', error: `Installation impossible : ${err.message}` });
    return { ok: false, error: err.message };
  }
}

function setAuto(value) {
  set({ auto: !!value });
  saveSettings();
  if (state.auto && state.status === 'available') check();
}

function init(ipcMain) {
  settingsFile = path.join(app.getPath('userData'), 'updater.json');
  loadSettings();
  // Nettoyage après une mise à jour de la version portable.
  if (state.kind === 'portable') {
    try { fs.rmSync(`${process.env.PORTABLE_EXECUTABLE_FILE}.old`, { force: true }); } catch { /* encore verrouillé */ }
  }
  // Anciens téléchargements
  try {
    const dir = path.join(app.getPath('userData'), 'updates');
    for (const f of fs.readdirSync(dir)) if (!f.includes(state.current)) fs.rmSync(path.join(dir, f), { force: true });
  } catch { /* pas de dossier */ }

  ipcMain.handle('update-get', () => publicState());
  ipcMain.handle('update-check', () => check({ manual: true }));
  ipcMain.handle('update-install', () => install());
  ipcMain.handle('update-auto', (_e, v) => { setAuto(v); return publicState(); });

  // Mise à jour prête et installation automatique activée : appliquée à la fermeture de l'appli.
  app.on('will-quit', () => {
    if (state.auto && state.status === 'ready' && !state.installing) install(false);
  });

  if (state.kind === 'unsupported') { state.status = 'unsupported'; return; }
  setTimeout(() => check(), 15000);
  setInterval(() => check(), CHECK_EVERY_MS);
}

module.exports = { init, check, install, state, newer };
