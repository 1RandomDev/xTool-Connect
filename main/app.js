const { app, BrowserWindow, ipcMain } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');
const discovery = require('./discovery.js');
const deviceController = require('./device-controller.js');
const grblBridge = require('./grbl-bridge.js');

let appSettings = {
    deviceAddress: '',
    autoConnect: false,
    moveSpeed: 50,
    moveDistance: 10,
    laserSpotIntensity: 3,
    grblBridgeEnabled: true,
}
const confDir = (process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"))+'/xTool-Connect';
if(!fs.existsSync(confDir)) {
    fs.mkdirSync(confDir, { recursive: true });
}
const confFile = confDir+'/config.json';
if(!fs.existsSync(confFile)) {
    fs.writeFileSync(confFile, '{}');
} else {
    appSettings = {...appSettings, ...JSON.parse(fs.readFileSync(confFile))};
}
function saveSettings() {
    fs.writeFileSync(confFile, JSON.stringify(appSettings));
}
function createWindow() {
    const window = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'xTool Connect',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../icon.png')
    });
    if(!process.env.DEBUG_MODE) {
        window.removeMenu();
        window.setResizable(false);
    }

    window.loadFile('../renderer/index.html');
    return window;
}

app.whenReady().then(() => {
    let window = createWindow();
    let firstConnect = true;

    app.on('activate', () => {
        if(BrowserWindow.getAllWindows().length === 0) window = createWindow();
    });

    ipcMain.handle('settings:get', () => {
        return appSettings;
    });
    ipcMain.handle('settings:save', (event, settings) => {
        appSettings = {...appSettings, ...settings};
        saveSettings();
    });

    ipcMain.handle('wifiSetup:connect', (event, credentials) => {
        return deviceController.setupWifi(credentials);
    });

    ipcMain.handle('deviceSettings:get', () => {
        return deviceController.getInfo();
    });
    ipcMain.handle('deviceSettings:save', (event, settings) => {
        return deviceController.saveSettings(settings);
    });

    ipcMain.handle('deviceMenu:firstConnect', () => {
        return firstConnect;
    });
    ipcMain.handle('deviceMenu:discover', () => {
        return discovery.scanDevices();
    });
    ipcMain.handle('deviceMenu:connect', async () => {
        firstConnect = false;
        const result = await deviceController.connect(appSettings.deviceAddress, data => {
            if(data == 'err:TIMEOUT') {
                window.loadFile('../renderer/index.html', {
                    query: {message: 'timeout'}
                });
            }
            window.webContents.send('websocket:message', data);
        });
        if(result.result == 'ok' && appSettings.grblBridgeEnabled) {
            grblBridge.start(async data => {
                if(data.event == 'complete') {
                    await deviceController.uploadGcode(data.gcode, data.isProgram ? 1 : 0);
                }
                window.webContents.send('websocket:message', 'grbl:'+data.event);
            });
        }
        return result;
    });
    ipcMain.handle('deviceMenu:disconnect', () => {
        deviceController.disconnect();
        grblBridge.stop();
    });

    ipcMain.handle('control:uploadGcode', (event, path, type) => {
        return deviceController.uploadFile(path, type);
    });
    ipcMain.handle('control:moveLaser', (event, direction) => {
        return deviceController.moveLaser(direction, appSettings.moveDistance, appSettings.moveSpeed);
    });
    ipcMain.handle('control:setLaserDot', (event, active) => {
        deviceController.setLaserDot(active, appSettings.laserSpotIntensity);
    });
    ipcMain.handle('control:currentState', () => {
        return deviceController.getCurrentState();
    });
    ipcMain.handle('control:getProgress', () => {
        return deviceController.getProgress();
    });
    ipcMain.handle('control:control', (event, action) => {
        return deviceController.control(action);
    });
});

app.on('window-all-closed', () => {
    if(process.platform !== 'darwin') app.quit();
});
