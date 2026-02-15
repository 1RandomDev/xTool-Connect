const { WebSocket } = require('ws');
const fs = require('node:fs');
const FormData = require('form-data');

const DIRECTION_MAPPINGS = {
    'up': 'Y-',
    'down': 'Y',
    'left': 'X-',
    'right': 'X'
};

let config;
let deviceAddress;
let connected;
let websocket;
let wsCallback;
let heartbeatTimer, lastHeartbeat;
let laserDotActive = false;
let paused = false;
let framing = false;

module.exports.setupWifi = async (credentials) => {
    try {
        const res = await fetchJson('http://192.168.40.1:8080/net?action=connsta', {
            method: 'POST',
            headers: new Headers({'Content-Type': 'text/plain'}),
            body: credentials.ssid+' '+credentials.password
        });
        if(res.result == 'ok') return {result: 'ok'};
    } catch(err) {
        console.error("WiFi setup failed:", err.message);
        if(err.code == 'ENETUNREACH') return {result: 'fail_network'};
    }
    
    return {result: 'fail'};
};

module.exports.connect = async (address, callback, config_) => {
    if(connected) this.disconnect();
    deviceAddress = address;
    wsCallback = callback;
    config = config_;

    try {
        let res = await fetchJson(`http://${deviceAddress}:8080/ping`);
        if(res.result != 'ok') {
            console.error('Device connect failed: Ping response invalid:', res);
            return {result: 'fail'}
        }
    } catch(err) {
        console.error('Device connect failed:', err.message);
        return {result: 'fail'}
    }

    return new Promise(resolve => {
        websocket = new WebSocket(`ws://${deviceAddress}:8081`);
        websocket.on('error', err => {
            console.error('WebSocket connection failed:', err);
            resolve({result: 'fail'});
        });
        websocket.on('open', () => {
            connected = true;
            laserDotActive = false;
            paused = false;
            framing = false;
            lastHeartbeat = Date.now();
            heartbeatTimer = setInterval(() => {
                websocket.ping();
                if(lastHeartbeat + 6100 < Date.now()) {
                    wsCallback('err:TIMEOUT');
                    console.log('Connection to device timed out.');
                    websocket.terminate();
                    this.disconnect();
                }
            }, 2000);
            console.log('Successfully connected to device '+deviceAddress);
            resolve({result: 'ok'});
        });
        websocket.on('pong', () => {
            lastHeartbeat = Date.now();
        });
        websocket.on('message', data => {
            data = data.toString();
            data = data.substring(0, data.length-1);
            console.log('WebSocket message: '+data);

            if(data.startsWith('ok:WORKING_')) {
                paused = false;
            }
            switch(data) {
                case 'ok:PAUSING':
                    paused = true;
                    break;
                case 'ok:IDLE':
                    paused = false;
                    framing = false;
                    laserDotActive = false;
                    break;
                case 'ok:WORKING_OFFLINE':
                    framing = false;
                    laserDotActive = false;
                    break;
                case 'ok:WORKING_FRAMING':
                    framing = true;
                    break;
            }

            wsCallback(data);
        });
    });
};

module.exports.disconnect = () => {
    if(!connected) return;

    console.log('Disconnected from '+deviceAddress);
    clearInterval(heartbeatTimer);
    websocket.close();
    websocket = null;
    deviceAddress = null;
    laserDotActive = false;
    paused = false;
    framing = false;
    connected = false;
};

module.exports.getInfo = async () => {
    if(!connected) {
        console.error('Getting device info failed: Not connected');
        return {};
    }

    const settings = { ipAddress: deviceAddress };

    try {
        let res = await fetchJson(`http://${deviceAddress}:8080/getmachinetype`);
        settings.deviceModel = res.type;
    
        res = await fetchJson(`http://${deviceAddress}:8080/getlaserpowertype`);
        settings.laserPower = res.power+'W';
    
        res = await fetchJson(`http://${deviceAddress}:8080/peripherystatus`);
        settings.flameAlarmMode = res.flameAlarmSensitivity;
        settings.tiltSwitchMode = res.tiltStopFlag;
        settings.limitSwitchesMode = res.limitStopFlag;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=get_dev_name`);
        settings.deviceName = res.name;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=mac`);
        settings.macAddress = res.mac;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=version`);
        settings.firmwareVersion = res.version;
        settings.serialNumber = res.sn;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=offset`);
        settings.crossOffsetX = res.x;
        settings.crossOffsetY = res.y;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=dotMode`);
        settings.positioningMode = res.dotMode;
    } catch(err) {
        console.error('Getting device info failed:', err);
    }

    return settings;
};

module.exports.saveSettings = async (settings) => {
    if(!connected) {
        console.error('Saving device settings failed: Not connected');
        return;
    }

    try {
        for([name, value] of Object.entries(settings)) {
            switch(name) {
                case 'flameAlarmMode':
                    await fetchText(`http://${deviceAddress}:8080/system?action=setFlameAlarmSensitivity&flameAlarmSensitivity=${value}`);
                    break;
    
                case 'tiltSwitchMode':
                    await fetchText(`http://${deviceAddress}:8080/system?action=setTiltStopSwitch&tiltStopSwitch=${value}`);
                    await fetchText(`http://${deviceAddress}:8080/system?action=setMovingStopSwitch&movingStopSwitch=${value}`);
                    break;
    
                case 'limitSwitchesMode':
                    await fetchText(`http://${deviceAddress}:8080/system?action=setLimitStopSwitch&limitStopSwitch=${value}`);
                    break;
    
                case 'deviceName':
                    await fetchText(`http://${deviceAddress}:8080/system?action=set_dev_name&name=${value}`);
                    break;
    
                case 'crossOffsetX':
                    await fetchText(`http://${deviceAddress}:8080/cmd?cmd=M98 X${value}`);
                    break;
    
                case 'crossOffsetY':
                    await fetchText(`http://${deviceAddress}:8080/cmd?cmd=M98 Y${value}`);
                    break;
                
                case 'positioningMode':
                    await fetchText(`http://${deviceAddress}:8080/cmd?cmd=M97 S${value}`);
                    break;
            }
        }
    } catch(err) {
        console.error('Saving device settings failed:', err);
    }
};

module.exports.uploadFile = (path, type) => {
    return this.uploadGcode(fs.createReadStream(path), type);
};
module.exports.uploadGcode = async (content, type) => {
    if(!connected) {
        console.error('Uploading GCODE failed: Not connected');
        return false;
    }

    try {
        const form = new FormData();
        form.append('file', content, 'export.gcode');

        console.log(`Uploading file GCODE type ${type}`);
        await fetchText(`http://${deviceAddress}:8080/upload?filetype=${type}`, {
            method: 'POST',
            body: form
        });

        if(type == 0) {
            wsCallback('ok:WORKING_FRAMING');
            framing = true;
        }
        return true;
    } catch(err) {
        console.error('Uploading GCODE failed:', err);
        return false;
    }
}

module.exports.executeGcode = async (gcode) => {
    if(!connected) {
        console.error('Executing GCODE failed: Not connected');
        return;
    }

    try {
        await fetchText(`http://${deviceAddress}:8080/cmd`, {
            method: 'POST',
            headers: new Headers({'Content-Type': 'text/plain'}),
            body: gcode
        });
    } catch(err) {
        console.error('Executing GCODE failed:', err);
        return;
    }
};

module.exports.moveLaser = async (direction, distance, speed) => {
    if(!connected) {
        console.error('Moving laser failed: Not connected');
        return;
    }

    try {
        let laserDotPower = config.laserSpotIntensity;
        if(laserDotPower > 10) laserDotPower = 10;

        let gcode;
        if(direction == 'home') {
            gcode =
`M17 S1
M207 S0
M28
M18
`;
        } else {
            gcode =
`M17 S1
M207 S0
M101
G92 X0 Y0
G90
G1 ${DIRECTION_MAPPINGS[direction]+distance} F${speed*60} S${laserDotActive ? laserDotPower*10 : 0}
M18
`;
        }

        if(laserDotActive) {
            let power = config.laserSpotIntensity;
            if(power > 10) power = 10;
            gcode += `M9 S${power*10} N1000000000000\n`;
        }

        await this.executeGcode(gcode);
    } catch(err) {
        console.error('Moving laser failed failed:', err);
    }
};

module.exports.isLaserDotActive = () => laserDotActive;
module.exports.setLaserDot = async (active, power) => {
    laserDotActive = active;
    if(!connected) {
        console.error('Toggel laser dot failed: Not connected');
        return;
    }

    try {
        if(!laserDotActive) power = 0;
        if(power > 10) power = 10; // Limit to 10% for safety

        let gcode = `M112 N0\nM9 S${power*10} N${laserDotActive ? 1000000000000 : 0}\n`;

        await this.executeGcode(gcode);
    } catch(err) {
        console.error('Toggel laser dot failed:', err);
    }
}

module.exports.getCurrentState = async () => {
    if(!connected) {
        console.error('Requesting current state failed: Not connected');
        return;
    }

    const state = {};
    try {
        let res = await fetchJson(`http://${deviceAddress}:8080/system?action=get_dev_name`);
        state.deviceName = res.name;
    
        res = await fetchJson(`http://${deviceAddress}:8080/system?action=get_working_sta`);
        state.working = res.working != 0;

        res = await fetchJson(`http://${deviceAddress}:8080/system?action=dotMode`);
        state.dotMode = res.dotMode == 1;

        state.laserDotActive = laserDotActive;
        state.paused = paused;
        state.framing = framing;
    } catch(err) {
        console.error('Requesting current state failed:', err);
    }
    return state;
};

module.exports.dotModeActive = async () => {
    if(!connected) {
        console.error('Requesting current dot mode state failed: Not connected');
        return;
    }

    try {
        let res = await fetchJson(`http://${deviceAddress}:8080/system?action=dotMode`);
        return res.dotMode == 1;
    } catch(err) {
        console.error('Requesting current state failed:', err);
    }
    return false;
}

module.exports.getProgress = async () => {
    if(!connected) {
        console.error('Requesting current progress failed: Not connected');
        return;
    }

    try {
        let res = await fetchJson(`http://${deviceAddress}:8080/progress`);
        return Math.round(res.progress);
    } catch(err) {
        console.error('Requesting current progress failed:', err);
    }
    return 0;
};

module.exports.control = async (action) => {
    if(!connected) {
        console.error('Sending control message failed: Not connected');
        return;
    }

    try {
        await fetchText(`http://${deviceAddress}:8080/cnc/data?action=${action}`);
        if(action == 'stop') await this.executeGcode('M108\nM112 N0\nM9 S0 N0\n');
    } catch(err) {
        console.error('Sending control message failed:', err);
    }
    return;
};

module.exports.updateFirmware = async (updatePath) => {
    if(!connected) {
        console.error('Firmware update failed: Not connected');
        return false;
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(updatePath), 'update.bin');

        const res = await fetchJson(`http://${deviceAddress}:8080/upgrade`, {
            method: 'POST',
            body: form
        });
        console.log(res);
        return res == 'OK';
    } catch(err) {
        console.error('Firmware update failed:', err);
        return false;
    }
}

async function fetchJson(input, init) {
    let res = await fetch(input, init);
    if(!res.ok) throw new Error('Request failed with status: '+res.status);
    return res.json();
}

async function fetchText(input, init) {
    let res = await fetch(input, init);
    if(!res.ok) throw new Error('Request failed with status: '+res.status);
    return res.text();
}
