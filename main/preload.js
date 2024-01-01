const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  setupWifi: (credentials) => ipcRenderer.invoke('wifiSetup:connect', credentials)
});
