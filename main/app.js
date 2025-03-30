const { app, BrowserWindow, ipcMain, Notification } = require('electron/main');
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
    desktopNotifications: true,
}
const confDir = (process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"))+'/xTool-Connect';
if(!fs.existsSync(confDir)) {
    fs.mkdirSync(confDir, { recursive: true });
}
const confFile = confDir+'/config.json';
if(!fs.existsSync(confFile)) {
    fs.writeFileSync(confFile, '{}');
} else {
    Object.assign(appSettings, JSON.parse(fs.readFileSync(confFile)));
}
function saveSettings() {
    fs.writeFileSync(confFile, JSON.stringify(appSettings));
}
const gcUploadFile = confDir+'/upload.gcode';
if(!fs.existsSync(gcUploadFile)) {
    fs.writeFileSync(gcUploadFile, '');
}

function desktopNotification(msg) {
    if(!appSettings.desktopNotifications) return;
    const template = {
        title: 'xTool Connect',
        icon: path.join(__dirname, '../icon.png'),
    };
    Object.assign(template, msg);
    new Notification(template).show();
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

    window.loadFile(path.join(__dirname, '../renderer/index.html'));
    return window;
}

app.whenReady().then(() => {
    let window = createWindow();
    let firstConnect = true;

    if(process.platform === 'win32') {
        app.setAppUserModelId(app.name);
    }

    ipcMain.handle('settings:get', () => {
        return appSettings;
    });
    ipcMain.handle('settings:save', (event, settings) => {
        appSettings = {...appSettings, ...settings};
        saveSettings();
    });
    ipcMain.handle('settings:updateFirmware', (event, updatePath) => {
        return deviceController.updateFirmware(updatePath);
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
            switch(data) {
                case 'err:TIMEOUT':
                    desktopNotification({body: 'Connection to device lost. Please check your internet connection and reconnect.'});
                    window.loadFile(path.join(__dirname, '../renderer/index.html'), {
                        query: {message: 'timeout'}
                    });
                    grblBridge.stop();
                    break;
                case 'err:tiltCheck':
                case 'err:movingCheck':
                    desktopNotification({body: 'Movement detected!\nThe current job was aborted because the device was moved during operation.', urgency: 'critical'});
                    break;
                case 'err:flameCheck':
                    desktopNotification({body: 'Flame detected!\nThe current job was aborted because a flame was detected. Please check the state of the device immediately.', urgency: 'critical'});
                    break;
                case 'err:limitCheck':
                    desktopNotification({body: 'Limit reached!\nThe current job was aborted because a limit switch was activated.', urgency: 'critical'});
                    break;
            }
            window.webContents.send('websocket:message', data);
        }, appSettings);
        if(result.result == 'ok' && appSettings.grblBridgeEnabled) {
            grblBridge.start(async data => {
                switch(data.event) {
                    case 'complete':
                        if(await deviceController.uploadGcode(data.gcode, data.isProgram ? 1 : 0)) {
                            desktopNotification({body: 'LightBurn upload complete!\nou can now start the job by pressing the start button on the device.'});
                        } else {
                            desktopNotification({body: 'LightBurn upload failed!\nCheck logs for more details.'});
                        }
                        break;
                    case 'timeout':
                        desktopNotification({body: 'LightBurn upload failed!\nFile could not be sent to the device.'});
                        break;
                }
                window.webContents.send('websocket:message', 'grbl:'+data.event);
            }, appSettings, deviceController);
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

    let gcUpload = false;
    fs.watch(gcUploadFile, async (event, filename) => {
        if(gcUpload || event != 'change') return;
        gcUpload = true;
        setTimeout(() => {
            gcUpload = false;
        }, 2000);
        if(await deviceController.uploadFile(gcUploadFile, 1)) {
            desktopNotification({body: 'LightBurn upload complete!\nou can now start the job by pressing the start button on the device.'});
        } else {
            desktopNotification({body: 'LightBurn upload failed!\nCheck logs for more details.'});
        }
    });

    app.on('activate', () => {
        if(BrowserWindow.getAllWindows().length === 0) window = createWindow();
    });
});

app.on('window-all-closed', () => {
    if(process.platform !== 'darwin') app.quit();
});
