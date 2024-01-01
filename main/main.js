const { app, BrowserWindow, ipcMain } = require('electron/main');
const path = require('node:path');
const axios = require('axios');

function createWindow() {
    const win = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'xTool Connect',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('../renderer/index.html');
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if(BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    ipcMain.handle('wifiSetup:connect', async (event, credentials) => {
        try {
            const response = await axios.post('http://192.168.40.1:8080/net?action=connsta', credentials.ssid+' '+credentials.password);
            if(response.data.result == 'ok') return {result: 'ok'};
        } catch(err) {
            console.error(err.message);
            if(err.code == 'ENETUNREACH') return {result: 'fail_network'};
        }
        
        return {result: 'fail'};
    });
});

app.on('window-all-closed', () => {
    if(process.platform !== 'darwin') app.quit();
});