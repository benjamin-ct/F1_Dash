// Pont sécurisé entre l'interface et l'application de bureau.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('f1desktop', {
  isDesktop: true,
  loginF1TV: () => ipcRenderer.invoke('f1tv-login'),
  logoutF1TV: () => ipcRenderer.invoke('f1tv-logout'),
  version: () => ipcRenderer.invoke('update-get'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  setAutoUpdate: (v) => ipcRenderer.invoke('update-auto', v),
  onUpdate: (fn) => ipcRenderer.on('update-state', (_e, s) => fn(s)),
  getRestoreWindows: () => ipcRenderer.invoke('restore-windows-get'),
  setRestoreWindows: (v) => ipcRenderer.invoke('restore-windows-set', v),
  // Emplacement des fenêtres : enregistrer, revenir, choix au lancement ('last' | 'saved' | 'none')
  getWindowsStart: () => ipcRenderer.invoke('windows-start-get'),
  setWindowsStart: (v) => ipcRenderer.invoke('windows-start-set', v),
  saveWindows: (layouts) => ipcRenderer.invoke('windows-save', layouts),
  restoreWindows: () => ipcRenderer.invoke('windows-restore'),
  // Dispositions enregistrées à appliquer au lancement (une seule fois, fenêtre principale)
  startupLayouts: () => ipcRenderer.sendSync('windows-startup-layouts'),
  focusWindow: () => ipcRenderer.invoke('window-focus'),
});
