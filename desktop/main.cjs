// Application de bureau F1 Dash : lance le serveur local dans le processus Electron
// et affiche le dashboard dans une fenêtre, sans installer Node.js.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

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

async function start() {
  const port = await pickPort();
  process.env.PORT = String(port || 3000);
  process.env.F1DASH_DATA_DIR = path.join(app.getPath('userData'), 'data');
  await import(pathToFileURL(path.join(__dirname, 'bundle', 'server', 'index.js')).href);

  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0c11',
    title: 'F1 Dash',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const url = `http://127.0.0.1:${process.env.PORT}/`;
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    // Panneaux détachés (mode deux écrans) : nouvelle fenêtre de l'appli ; liens externes : navigateur.
    if (target.startsWith(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#0a0c11' } };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });
  // Laisse le serveur démarrer avant de charger la page.
  const load = (tries = 0) => mainWindow.loadURL(url).catch(() => tries < 20 && setTimeout(() => load(tries + 1), 250));
  setTimeout(load, 300);
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
