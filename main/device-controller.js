const axios = require('axios');
const { WebSocket } = require('ws');
const fs = require('node:fs');
const FormData = require('form-data');

const DIRECTION_MAPPINGS = {
    'up': 'Y-',
    'down': 'Y',
    'left': 'X-',
    'right': 'X'
};

let deviceAddress;
let connected;
let websocket;
let heartbeatTimer, lastHeartbeat;
let laserDotActive = false;
let paused = false;

module.exports.setupWifi = async (credentials) => {
    try {
        const response = await axios.post('http://192.168.40.1:8080/net?action=connsta', credentials.ssid+' '+credentials.password);
        if(response.data.result == 'ok') return {result: 'ok'};
    } catch(err) {
        console.error("WiFi setup failed:", err.message);
        if(err.code == 'ENETUNREACH') return {result: 'fail_network'};
    }
    
    return {result: 'fail'};
};

module.exports.connect = async (address, wsCallback) => {
    if(connected) this.disconnect();
    deviceAddress = address;

    try {
        let res = await axios.get(`http://${deviceAddress}:8080/ping`);
        if(res.data.result != 'ok') {
            console.error('Device connect failed: Ping response invalid:', res.data);
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
            lastHeartbeat = Date.now();
            heartbeatTimer = setInterval(() => {
                websocket.ping();
                if(lastHeartbeat + 4100 < Date.now()) {
                    wsCallback('err:TIMEOUT');
                    clearInterval(heartbeatTimer);
                    websocket.terminate();
                    connected = false;
                    console.log('Connection to current device timed out.');
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

            if(data == 'ok:PAUSING') {
                paused = true;
            } else if(data == 'ok:IDLE' | data.startsWith('ok:WORKING_')) {
                paused = false;
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
    connected = false;
};

module.exports.getInfo = async () => {
    if(!connected) {
        console.error('Getting device info failed: Not connected');
        return {};
    }

    const settings = {};

    try {
        let res = await axios.get(`http://${deviceAddress}:8080/getmachinetype`);
        settings.deviceModel = res.data.type;
    
        res = await axios.get(`http://${deviceAddress}:8080/getlaserpowertype`);
        settings.laserPower = res.data.power+'W';
    
        res = await axios.get(`http://${deviceAddress}:8080/peripherystatus`);
        settings.flameAlarmMode = res.data.flameAlarmSensitivity;
        settings.tiltSwitchMode = res.data.tiltStopFlag;
        settings.limitSwitchesMode = res.data.limitStopFlag;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=get_dev_name`);
        settings.deviceName = res.data.name;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=mac`);
        settings.macAddress = res.data.mac;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=version`);
        settings.firmwareVersion = res.data.version;
        settings.serialNumber = res.data.sn;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=offset`);
        settings.crossOffsetX = res.data.x;
        settings.crossOffsetY = res.data.y;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=dotMode`);
        settings.positioningMode = res.data.dotMode;
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
                    await axios.get(`http://${deviceAddress}:8080/system?action=setFlameAlarmSensitivity&flameAlarmSensitivity=${value}`);
                    break;
    
                case 'tiltSwitchMode':
                    await axios.get(`http://${deviceAddress}:8080/system?action=setTiltStopSwitch&tiltStopSwitch=${value}`);
                    await axios.get(`http://${deviceAddress}:8080/system?action=setMovingStopSwitch&movingStopSwitch=${value}`);
                    break;
    
                case 'limitSwitchesMode':
                    await axios.get(`http://${deviceAddress}:8080/system?action=setLimitStopSwitch&limitStopSwitch=${value}`);
                    break;
    
                case 'deviceName':
                    await axios.get(`http://${deviceAddress}:8080/system?action=set_dev_name&name=${value}`);
                    break;
    
                case 'crossOffsetX':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M98 X${value}`);
                    break;
    
                case 'crossOffsetY':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M98 Y${value}`);
                    break;
                
                case 'positioningMode':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M97 S${value}`);
                    break;
            }
        }
    } catch(err) {
        console.error('Saving device settings failed:', err);
    }
};

module.exports.uploadFile = async (path, type) => {
    if(!connected) {
        console.error('Uploading GCODE failed: Not connected');
        return false;
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(path));

        console.log(`Uploading file "${path}" type ${type}`);
        await axios.post(`http://${deviceAddress}:8080/upload?filetype=${type}`, form);
        return true;
    } catch(err) {
        console.error('Uploading GCODE failed:', err);
        return false;
    }
}

module.exports.moveLaser = async (direction, distance, speed) => {
    if(!connected) {
        console.error('Moving laser failed: Not connected');
        return;
    }

    try {
        let gcode;
        if(direction == 'home') {
            gcode =
`M17 S1
M207 S0
M106 S1
M205 X424 Y400
M28
M18
`;// Disable steppers or not?
        } else {
            gcode =
`M17 S1
M207 S0
M106 S1
M205 X424 Y400
M101
G92 X0 Y0
G90
G1 ${DIRECTION_MAPPINGS[direction]+distance} F${speed*60} S0
M18
`;
        }

        await axios.post(`http://${deviceAddress}:8080/cmd`, gcode, {
            headers: {
                'Content-Type': 'text/plain'
            }
        });
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

        let gcode =
`M112 N0
M9 S${power*10} N${laserDotActive ? 1000000000000 : 0}
`;

        await axios.post(`http://${deviceAddress}:8080/cmd`, gcode, {
            headers: {
                'Content-Type': 'text/plain'
            }
        });
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
        let res = await axios.get(`http://${deviceAddress}:8080/system?action=get_dev_name`);
        state.deviceName = res.data.name;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=get_working_sta`);
        state.working = res.data.working != 0;

        res = await axios.get(`http://${deviceAddress}:8080/system?action=dotMode`);
        state.dotMode = res.data.dotMode == 1;

        state.laserDotActive = laserDotActive;
        state.paused = paused;
    } catch(err) {
        console.error('Requesting current state failed:', err);
    }
    return state;
};

module.exports.getProgress = async () => {
    if(!connected) {
        console.error('Requesting current progress failed: Not connected');
        return;
    }

    try {
        let res = await axios.get(`http://${deviceAddress}:8080/progress`);
        return Math.round(res.data.progress);
    } catch(err) {
        console.error('Requesting current progress failed:', err);
    }
    return 0;
};

module.exports.control = async (action) => {
    if(!connected) {
        console.error('Sending control message faild: Not connected');
        return;
    }

    try {
        await axios.get(`http://${deviceAddress}:8080/cnc/data?action=${action}`);
    } catch(err) {
        console.error('Sending control message faild:', err);
    }
    return 0;
};
