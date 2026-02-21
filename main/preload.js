const { contextBridge, ipcRenderer, webUtils } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  onWebsocketMessage: (callback) => ipcRenderer.on('websocket:message', (event, message) => callback(message)),
  connectDevice: () => ipcRenderer.invoke('deviceMenu:connect'),
  disconnectDevice: () => ipcRenderer.invoke('deviceMenu:disconnect'),
  firstConnect: () => ipcRenderer.invoke('deviceMenu:firstConnect'),
  setupWifi: (credentials) => ipcRenderer.invoke('wifiSetup:connect', credentials),
  getDeviceInfo: () => ipcRenderer.invoke('deviceSettings:get'),
  saveDeviceSettings: (settings) => ipcRenderer.invoke('deviceSettings:save', settings),
  scanDevices: () => ipcRenderer.invoke('deviceMenu:discover'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  updateFirmware: (updatePath) => ipcRenderer.invoke('settings:updateFirmware', updatePath),
  uploadGcode: (path, type) => ipcRenderer.invoke('control:uploadGcode', path, type),
  moveLaser: (direction) => ipcRenderer.invoke('control:moveLaser', direction),
  setLaserDot: (active) => ipcRenderer.invoke('control:setLaserDot', active),
  getCurrentState: () => ipcRenderer.invoke('control:currentState'),
  getProgress: () => ipcRenderer.invoke('control:getProgress'),
  control: (action) => ipcRenderer.invoke('control:control', action),
  getFilePath: (file) => webUtils.getPathForFile(file)
});
