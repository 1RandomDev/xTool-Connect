const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  onWebsocketMessage: (callback) => ipcRenderer.on('websocket:message', (event, message) => callback(message)),
  connectDevice: () => ipcRenderer.invoke('deviceMenu:connect'),
  firstConnect: () => ipcRenderer.invoke('deviceMenu:firstConnect'),
  setupWifi: (credentials) => ipcRenderer.invoke('wifiSetup:connect', credentials),
  getDeviceInfo: () => ipcRenderer.invoke('deviceSettings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('deviceSettings:save', settings),
  scanDevices: () => ipcRenderer.invoke('deviceMenu:discover'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
