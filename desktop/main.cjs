// Application de bureau F1 Dash : lance le serveur local dans le processus Electron
// et affiche le dashboard dans une fenêtre, sans installer Node.js.
const { app, BrowserWindow, shell, Menu, screen, ipcMain, session } = require('electron');
const path = require('node:path');
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

function loadWindowState() {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const b = st.bounds;
    // Fenêtre encore visible sur un des écrans actuels ?
    const visible = b && screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x && b.y >= a.y - 20 && b.y + 60 < a.y + a.height;
    });
    return { bounds: visible ? b : null, maximized: st.maximized !== false };
  } catch {
    return { bounds: null, maximized: true };
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ bounds: win.getNormalBounds(), maximized: win.isMaximized() || win.isFullScreen() }));
  } catch { /* disque en lecture seule : tant pis */ }
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
    const check = async () => {
      try {
        const value = await readLoginCookie(ses);
        if (!value) return;
        const info = await sendToken(value);
        finish({ ok: true, info });
      } catch (err) {
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
app.whenReady().then(() => require('./updater.cjs').init(ipcMain));
ipcMain.handle('f1tv-logout', async () => {
  await session.fromPartition('persist:f1tv').clearStorageData();
  return { ok: true };
});

async function start() {
  const port = await pickPort();
  process.env.PORT = String(port || 3000);
  process.env.F1DASH_DATA_DIR = path.join(app.getPath('userData'), 'data');
  await import(pathToFileURL(path.join(__dirname, 'bundle', 'server', 'index.js')).href);

  Menu.setApplicationMenu(null);
  const ws = loadWindowState();
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    // Premier lancement : toute la zone utile de l'écran (en plus de maximize(), selon le système)
    ...(ws.bounds || screen.getPrimaryDisplay().workArea),
    show: false,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0c11',
    title: 'F1 Dash',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  const url = `http://127.0.0.1:${process.env.PORT}/`;
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    // Panneaux détachés (mode deux écrans) : nouvelle fenêtre de l'appli ; liens externes : navigateur.
    if (target.startsWith(url)) {
      // Panneau détaché : directement sur le second écran s'il existe.
      const other = otherDisplay();
      const area = other ? other.workArea : null;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: '#0a0c11',
          ...(area ? { x: area.x + 40, y: area.y + 40, width: Math.min(1400, area.width - 80), height: Math.min(900, area.height - 80) } : {}),
          webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
        },
      };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-create-window', (win) => {
    if (otherDisplay()) win.maximize();
  });
  // Laisse le serveur démarrer avant de charger la page.
  const load = (tries = 0) => mainWindow.loadURL(url).catch(() => tries < 20 && setTimeout(() => load(tries + 1), 250));
  setTimeout(load, 300);
  if (ws.maximized) mainWindow.maximize();
  mainWindow.show();
  // Sauvegarde à chaque changement de taille / position (et à la fermeture)
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 800); };
  for (const evt of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(evt, saveSoon);
  mainWindow.on('close', () => { clearTimeout(saveTimer); saveWindowState(mainWindow); });
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
