// Application de bureau F1 Dash : lance le serveur local dans le processus Electron
// et affiche le dashboard dans une fenêtre, sans installer Node.js.
const { app, BrowserWindow, shell, Menu, screen, ipcMain, session, components } = require('electron');
const path = require('node:path');
const APP_ICON = path.join(__dirname, 'icon.png');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  // Port fixe de préférence (le favori « jeton F1 TV » pointe vers http://127.0.0.1:3000).
  for (const p of [3000, 3001, 3002, 3010]) if (await portFree(p)) return p;
  return 0;
}

let mainWindow = null;

// Taille et position de la fenêtre principale, conservées d'un lancement à l'autre
// (au premier lancement : plein écran fenêtré / maximisée).
function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch { return {}; }
}

function writeState(patch) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch }));
  } catch { /* disque en lecture seule : tant pis */ }
}

// Fenêtre encore visible sur un des écrans actuels ?
function boundsVisible(b) {
  return !!b && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x && b.y >= a.y - 20 && b.y + 60 < a.y + a.height;
  });
}

function loadWindowState() {
  const st = readState();
  if (!st.bounds) return { bounds: null, maximized: true };
  return { bounds: boundsVisible(st.bounds) ? st.bounds : null, maximized: st.maximized !== false };
}

function saveWindowState(win) {
  writeState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() || win.isFullScreen() });
}

// ---------- Fenêtres détachées (panneaux sur le second écran) ----------
// Mémorisées à la fermeture de l'appli et rouvertes au lancement (réglable).
const isPanelUrl = (u) => /[?&](win|panel)=/.test(u || '');

function childWindows() {
  return BrowserWindow.getAllWindows().filter((w) => w !== mainWindow && w !== loginWindow && !w.isDestroyed() && isPanelUrl(w.webContents.getURL()));
}

function snapshotChildren() {
  return childWindows().map((w) => ({
    search: new URL(w.webContents.getURL()).search,
    bounds: w.getNormalBounds(),
    maximized: w.isMaximized() || w.isFullScreen(),
  }));
}

const childPrefs = () => ({ contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') });

function restoreChildren(baseUrl) {
  const st = readState();
  if (st.restoreWindows === false) return;
  for (const c of st.children || []) {
    if (!isPanelUrl(c.search)) continue;
    const win = new BrowserWindow({
      autoHideMenuBar: true,
      icon: APP_ICON,
      backgroundColor: '#000000',
      ...(boundsVisible(c.bounds) ? c.bounds : { width: 1200, height: 800 }),
      webPreferences: childPrefs(),
    });
    setupContents(win.webContents, baseUrl);
    if (c.maximized) win.maximize();
    win.loadURL(`${baseUrl}${c.search}`);
  }
}

// Écran différent de celui de la fenêtre principale (second écran), s'il existe.
function otherDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length < 2 || !mainWindow) return null;
  const current = screen.getDisplayMatching(mainWindow.getBounds());
  return displays.find((d) => d.id !== current.id) || null;
}

// ---- Connexion F1 TV ----
// Ouvre la page de connexion officielle dans une fenêtre de l'appli, puis lit le cookie
// « login-session » (y compris s'il est protégé) et l'envoie au serveur local.
const LOGIN_URL = 'https://account.formula1.com/#/fr/login?redirect=https%3A%2F%2Ff1tv.formula1.com%2F';
let loginWindow = null;

async function readLoginCookie(ses) {
  const cookies = await ses.cookies.get({ name: 'login-session' });
  return cookies.find((c) => /formula1\.com$/.test(c.domain.replace(/^\./, '')))?.value || null;
}

async function sendToken(value) {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function loginF1TV() {
  if (loginWindow) { loginWindow.focus(); return Promise.resolve({ pending: true }); }
  const ses = session.fromPartition('persist:f1tv');
  return new Promise((resolve) => {
    loginWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      parent: mainWindow || undefined,
      title: 'Connexion F1 TV',
      autoHideMenuBar: true,
      icon: APP_ICON,
      webPreferences: { partition: 'persist:f1tv', contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      loginWindow = null;
      resolve(result);
    };
    // Cookie d'une ancienne connexion dont la session est finie : refusé par le serveur, on
    // attend que l'utilisateur se reconnecte (le cookie change) au lieu de fermer la fenêtre
    let refused = null;
    const check = async () => {
      try {
        const value = await readLoginCookie(ses);
        if (!value || value === refused) return;
        const info = await sendToken(value);
        finish({ ok: true, info });
      } catch (err) {
        if (/expir/i.test(err.message)) { refused = (await readLoginCookie(ses).catch(() => null)); return; }
        finish({ ok: false, error: err.message });
      }
    };
    // Déjà connecté (session mémorisée) ? Sinon on surveille jusqu'à la connexion.
    const timer = setInterval(check, 1500);
    loginWindow.on('closed', () => finish({ ok: false, error: 'Fenêtre fermée avant la connexion' }));
    // User-agent de Chrome standard (sans la mention Electron) pour la page de connexion.
    const ua = loginWindow.webContents.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ f1-dash-desktop\/\S+/i, '');
    loginWindow.loadURL(LOGIN_URL, { userAgent: ua });
  });
}

ipcMain.handle('f1tv-login', () => loginF1TV());
ipcMain.handle('f1tv-logout', async () => {
  await session.fromPartition('persist:f1tv').clearStorageData();
  return { ok: true };
});

// Electron castlabs : module Widevine (DRM) nécessaire aux commentaires F1 TV. Il est téléchargé
// au premier lancement ; on ne bloque jamais l'ouverture de l'appli plus de 15 s pour lui.
async function widevineReady() {
  if (!components?.whenReady) return;
  try {
    await Promise.race([components.whenReady(), new Promise((r) => setTimeout(r, 15000))]);
    console.log('[widevine]', JSON.stringify(components.status()));
  } catch (err) {
    console.warn('[widevine]', err.message);
  }
}

// Ouverture de fenêtres depuis une page de l'appli : panneaux détachés = nouvelle fenêtre de l'appli
// (directement sur le second écran s'il existe) ; tout le reste (liens, dashboard dans le
// navigateur pour les flux DRM) s'ouvre dans le navigateur.
function setupContents(wc, url) {
  wc.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url) && isPanelUrl(target)) {
      const other = otherDisplay();
      const area = other ? other.workArea : null;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          icon: APP_ICON,
          backgroundColor: '#000000',
          ...(area ? { x: area.x + 40, y: area.y + 40, width: Math.min(1400, area.width - 80), height: Math.min(900, area.height - 80) } : {}),
          webPreferences: childPrefs(),
        },
      };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (win) => {
    setupContents(win.webContents, url);
    if (otherDisplay()) win.maximize();
  });
}

// ---------- Écran de démarrage : recherche et installation des mises à jour ----------
function createSplash() {
  const win = new BrowserWindow({
    width: 440,
    height: 330,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    backgroundColor: '#0b0b0f',
    title: 'F1 Dash',
    icon: APP_ICON,
    webPreferences: { contextIsolation: true, sandbox: true, javascript: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (!mainWindow && !splashDone) app.quit(); });
  win.loadFile(path.join(__dirname, 'splash.html'));
  return win;
}

let splashDone = false;

// Met à jour le texte de l'écran de démarrage (progress : null = activité, 0…1, false = sans barre)
function splashSay(win, title, detail = '', progress = null) {
  if (!win || win.isDestroyed()) return;
  const run = () => win.webContents.executeJavaScript(`setStatus(${JSON.stringify(title)}, ${JSON.stringify(detail)}, ${JSON.stringify(progress)})`).catch(() => {});
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run); else run();
}

const mo = (b) => `${Math.round(b / 1048576)} Mo`;

// Avancement de la mise à jour affiché sur l'écran de démarrage
function splashUpdate(win, st) {
  if (st.status === 'checking') splashSay(win, 'Recherche de mise à jour…');
  else if (st.status === 'downloading') {
    const size = st.asset?.size;
    splashSay(win, `Téléchargement de la version ${st.latest?.version}…`,
      size ? `${mo(size * (st.progress || 0))} / ${mo(size)} · l'appli s'ouvrira sur la nouvelle version` : 'l\'appli s\'ouvrira sur la nouvelle version', st.progress || 0);
  } else if (st.status === 'ready') splashSay(win, `Installation de la version ${st.latest?.version}…`, 'L\'appli va redémarrer toute seule dans quelques secondes.');
}

// Nouvelle version qui ne s'installe pas toute seule (.deb, appli lancée depuis l'image disque) :
// « Télécharger » ouvre la page de la version, « Continuer » ouvre l'appli actuelle
function splashAsk(win, version) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) { resolve('continue'); return; }
    splashSay(win, `Nouvelle version ${version} disponible`, 'Elle s\'installe à la main pour cette installation.', false);
    win.webContents.executeJavaScript('ask(true)').catch(() => {});
    const onNav = (e, target) => {
      e.preventDefault();
      if (!/^f1dash:/.test(target)) return;
      win.webContents.removeListener('will-navigate', onNav);
      win.webContents.executeJavaScript('ask(false)').catch(() => {});
      resolve(target.includes('download') ? 'download' : 'continue');
    };
    win.webContents.on('will-navigate', onNav);
    win.once('closed', () => resolve('continue'));
  });
}

ipcMain.handle('restore-windows-get', () => readState().restoreWindows !== false);
ipcMain.handle('restore-windows-set', (_e, v) => { writeState({ restoreWindows: !!v }); return !!v; });

async function start() {
  const updater = require('./updater.cjs');
  updater.init(ipcMain);
  const splash = createSplash();
  splash.webContents.once('did-finish-load', () => splash.webContents.executeJavaScript(`setVersion(${JSON.stringify(app.getVersion())})`).catch(() => {}));
  const res = await updater.startup((st) => splashUpdate(splash, st));
  console.log('[mise à jour]', JSON.stringify(res));
  if (res.action === 'installing') { splashDone = true; return; }   // l'appli se ferme puis redémarre
  if (res.action === 'notify' && await splashAsk(splash, res.version) === 'download') shell.openExternal(res.url);
  splashSay(splash, 'Démarrage…', res.reason ? `Mise à jour impossible : ${res.reason}` : '');
  await widevineReady();
  const port = await pickPort();
  process.env.PORT = String(port || 3000);
  process.env.F1DASH_DATA_DIR = path.join(app.getPath('userData'), 'data');
  await import(pathToFileURL(path.join(__dirname, 'bundle', 'server', 'index.js')).href);

  // Pas de barre de menus sous Windows / Linux. Sous macOS, le menu système reste nécessaire pour
  // les raccourcis (Cmd+C / Cmd+V dans les champs, Cmd+Q, Cmd+M, plein écran).
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }])
    : null);
  const ws = loadWindowState();
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    // Premier lancement : toute la zone utile de l'écran (en plus de maximize(), selon le système)
    ...(ws.bounds || screen.getPrimaryDisplay().workArea),
    show: false,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'F1 Dash',
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  const url = `http://127.0.0.1:${process.env.PORT}/`;
  setupContents(mainWindow.webContents, url);
  // Fenêtres détachées de la dernière session, une fois la page principale prête
  mainWindow.webContents.once('did-finish-load', () => setTimeout(() => restoreChildren(url), 800));
  // Laisse le serveur démarrer avant de charger la page.
  const load = (tries = 0) => mainWindow.loadURL(url).catch(() => tries < 20 && setTimeout(() => load(tries + 1), 250));
  setTimeout(load, 300);
  // Fenêtre affichée une fois la page chargée (au plus tard après 10 s), puis fin de l'écran de démarrage
  let shown = false;
  const showMain = () => {
    if (shown || !mainWindow) return;
    shown = true;
    if (ws.maximized) mainWindow.maximize();
    mainWindow.show();
    splashDone = true;
    if (!splash.isDestroyed()) splash.destroy();
  };
  mainWindow.webContents.once('did-finish-load', showMain);
  setTimeout(showMain, 10000);
  // Sauvegarde à chaque changement de taille / position (et à la fermeture)
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 800); };
  for (const evt of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(evt, saveSoon);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(mainWindow);
    // Fenêtres détachées : mémorisées puis fermées avec la fenêtre principale
    writeState({ children: snapshotChildren() });
    for (const w of childWindows()) w.destroy();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}
